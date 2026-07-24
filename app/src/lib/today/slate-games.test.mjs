import { test } from "node:test";
import assert from "node:assert/strict";

import { slateGames, slateReadinessNote } from "./slate-games.ts";

const TODAY = "2026-07-23";

/** A minimal MLB game detail on today's slate. Overrides tune the attached artifacts. */
function game(over = {}) {
  return {
    sport: "mlb",
    sportLabel: "MLB",
    slug: "away-vs-home-2026-07-23",
    date: TODAY,
    homeTeam: "Home Nine",
    awayTeam: "Away Nine",
    homeLogo: "https://img/home.png",
    awayLogo: "https://img/away.png",
    gameLabSimulation: null,
    gameLabMlb: null,
    gameCenter: null,
    reconciled: null,
    dataStatus: null,
    ...over,
  };
}
const sim = (o = {}) => ({ gameLabSimulation: { status: "ready" }, reconciled: { ok: true, reason: "ok" }, ...o });
const model = (o = {}) => ({ gameLabMlb: { leanCount: 3 }, ...o });
const market = (o = {}) => ({ gameCenter: { firstPitch: "2026-07-23T23:05:00Z" }, ...o });

test("every rendered game gets a working per-game action (the headline invariant)", () => {
  const details = [
    game({ slug: "a-2026-07-23", ...sim() }),
    game({ slug: "c-2026-07-23", ...model() }),
    game({ slug: "e-2026-07-23", ...market() }),
    game({ slug: "g-2026-07-23" }), // report only — still actionable
  ];
  const { games, total } = slateGames(details, TODAY);
  assert.equal(total, 4);
  for (const r of games) {
    assert.ok(r.href.startsWith("/games/mlb/"), `href canonical: ${r.href}`);
    assert.ok(r.actionLabel.length > 0, `action present: ${r.slug}`);
    assert.ok(r.label.length > 0 && r.explanation.length > 0, `label+explanation present: ${r.slug}`);
  }
});

test("board is GROUPED by readiness tier, richest first; empty groups omitted", () => {
  const details = [
    game({ slug: "sim1-2026-07-23", ...sim(market()) }),
    game({ slug: "mod1-2026-07-23", ...model() }),
    game({ slug: "rep1-2026-07-23" }),
  ];
  const { groups } = slateGames(details, TODAY);
  // no market-read group here (the sim game outranks its own market), so 3 non-empty groups in order
  assert.deepEqual(groups.map((g) => g.level), ["simulation", "model-read", "report"]);
  assert.equal(groups[0].heading, "Simulations ready");
  assert.equal(groups[0].games[0].slug, "sim1-2026-07-23");
});

test("factual summary counts each tier, never a performance claim", () => {
  const details = [
    game({ slug: "s1-2026-07-23", ...sim() }),
    game({ slug: "s2-2026-07-23", ...sim() }),
    game({ slug: "s3-2026-07-23", ...sim() }),
    game({ slug: "m1-2026-07-23", ...model() }),
    game({ slug: "r1-2026-07-23" }),
  ];
  const { summary } = slateGames(details, TODAY);
  assert.equal(summary.text, "5 games today · 3 simulations ready · 1 model read · 1 awaiting inputs");
  assert.equal(summary.counts.simulation, 3);
  assert.doesNotMatch(summary.text, /\b(edge|best|lock|top|value|confidence)\b/i);
});

test("flat games order == group order then chronological within group", () => {
  const details = [
    game({ slug: "sim-late-2026-07-23", ...sim(market({ gameCenter: { firstPitch: "2026-07-24T00:40:00Z" } })) }),
    game({ slug: "sim-early-2026-07-23", ...sim(market({ gameCenter: { firstPitch: "2026-07-23T17:05:00Z" } })) }),
    game({ slug: "report-2026-07-23" }),
  ];
  const { games } = slateGames(details, TODAY);
  // both sims first (early before late), then the report
  assert.deepEqual(games.map((g) => g.slug), ["sim-early-2026-07-23", "sim-late-2026-07-23", "report-2026-07-23"]);
});

test("only the presented slate is returned — stale days are dropped", () => {
  const details = [
    game({ slug: "today-2026-07-23", date: TODAY, ...sim() }),
    game({ slug: "stale-2026-07-11", date: "2026-07-11", ...sim() }),
  ];
  const { total, games } = slateGames(details, TODAY);
  assert.equal(total, 1);
  assert.equal(games[0].slug, "today-2026-07-23");
});

test("11 · doubleheader mixed tiers: G1 simulation-ready, G2 model-only — both actionable, distinct", () => {
  const details = [
    game({ slug: "sox-vs-jays-2026-07-23-777001", ...sim(market({ gameCenter: { firstPitch: "2026-07-23T21:07:00Z" } })) }),
    game({ slug: "sox-vs-jays-2026-07-23-777002", ...model() }),
  ];
  const { games, groups, total } = slateGames(details, TODAY);
  assert.equal(total, 2);
  assert.equal(new Set(games.map((g) => g.href)).size, 2, "each DH game has its own distinct href");
  assert.equal(groups.find((x) => x.level === "simulation").games[0].slug, "sox-vs-jays-2026-07-23-777001");
  assert.equal(groups.find((x) => x.level === "model-read").games[0].slug, "sox-vs-jays-2026-07-23-777002");
});

test("12 · doubleheader both available → two distinct canonical routes, no cross-game fallback", () => {
  const details = [
    game({ slug: "a-vs-b-2026-07-23-1", ...sim() }),
    game({ slug: "a-vs-b-2026-07-23-2", ...sim() }),
  ];
  const { games } = slateGames(details, TODAY);
  assert.deepEqual(games.map((g) => g.href).sort(), ["/games/mlb/a-vs-b-2026-07-23-1", "/games/mlb/a-vs-b-2026-07-23-2"]);
});

test("13 · game with no supported public analysis but a known route → report only (never dropped silently)", () => {
  const { total, games } = slateGames([game({ slug: "known-2026-07-23" })], TODAY);
  assert.equal(total, 1);
  assert.equal(games[0].level, "report");
});

test("13b · game with no honest matchup (missing team) is dropped, not rendered without an action", () => {
  const { total } = slateGames([game({ slug: "noteam-2026-07-23", awayTeam: null, ...sim() })], TODAY);
  assert.equal(total, 0);
});

test("14 · no-games day → empty board, honest zero summary, no groups", () => {
  const r = slateGames([], TODAY);
  assert.equal(r.total, 0);
  assert.equal(r.groups.length, 0);
  assert.equal(r.summary.text, "0 games today");
});

test("15 · pre-slate generation (today has no matching details) → empty, never shows another day", () => {
  const details = [game({ slug: "yesterday-2026-07-22", date: "2026-07-22", ...sim() })];
  const r = slateGames(details, TODAY);
  assert.equal(r.total, 0);
  assert.equal(r.groups.length, 0);
});

test("16 · partial slate: mix of ready + awaiting groups correctly with an honest summary", () => {
  const details = [
    game({ slug: "s1-2026-07-23", ...sim() }),
    game({ slug: "s2-2026-07-23", ...sim() }),
    game({ slug: "pend-2026-07-23", dataStatus: [{ status: "pending", label: "Player props" }] }),
  ];
  const { groups, summary } = slateGames(details, TODAY);
  assert.deepEqual(groups.map((g) => g.level), ["simulation", "report"]);
  assert.equal(summary.text, "3 games today · 2 simulations ready · 1 awaiting inputs");
  assert.match(groups.find((g) => g.level === "report").games[0].explanation, /Awaiting inputs/);
});

test("started game (clock past first pitch) is not presented as upcoming", () => {
  const details = [game({ slug: "started-2026-07-23", ...sim(market({ gameCenter: { firstPitch: "2026-07-23T17:05:00Z" } })) })];
  const nowMs = Date.parse("2026-07-23T20:00:00Z"); // after first pitch
  const { games } = slateGames(details, TODAY, { nowMs });
  assert.equal(games[0].startState, "started");
  assert.equal(games[0].actionLabel, "Review simulation →");
});

test("slate readiness: fresh+complete vs fresh+partial states are explicit", () => {
  const complete = slateGames([game({ slug: "s1-2026-07-23", ...sim() }), game({ slug: "s2-2026-07-23", ...model() })], TODAY);
  assert.match(slateReadinessNote(complete.summary, true), /Today's slate is ready/);
  const partial = slateGames([game({ slug: "s1-2026-07-23", ...sim() }), game({ slug: "p1-2026-07-23" })], TODAY);
  assert.equal(slateReadinessNote(partial.summary, true), "Today's slate is still filling in — 1 game awaiting inputs.");
});

test("slate readiness: stale slate + no-games day defer to the liveness banner (null, no double-speak)", () => {
  const s = slateGames([game({ slug: "s1-2026-07-23", ...sim() })], TODAY);
  assert.equal(slateReadinessNote(s.summary, false), null, "stale slate → null (banner speaks)");
  assert.equal(slateReadinessNote(slateGames([], TODAY).summary, true), null, "no games → null (banner speaks)");
});

test("simReadyCount (back-compat) counts only genuine ready simulations", () => {
  const details = [
    game({ slug: "r1-2026-07-23", ...sim() }),
    game({ slug: "r2-2026-07-23", ...sim() }),
    game({ slug: "s1-2026-07-23", gameLabSimulation: { status: "stale" } }),
    game({ slug: "m1-2026-07-23", ...model() }),
  ];
  const r = slateGames(details, TODAY);
  assert.equal(r.total, 4);
  assert.equal(r.simReadyCount, 2);
});
