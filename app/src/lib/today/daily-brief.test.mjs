import { test } from "node:test";
import assert from "node:assert/strict";

import { buildDailyBrief, gameSignals, numericPercentile } from "./daily-brief.ts";

const TODAY = "2026-07-23";
const FORBIDDEN = /\b(edge|lock|best bet|guaranteed|sure thing|value play|smash|high confidence|likely winner|pick of the day)\b/i;

/** A distribution with `n` bins spanning outcomes lo..hi (uniform-ish mass). */
function dist(n, lo, hi, label) {
  const bins = [];
  for (let i = 0; i < n; i++) bins.push({ lowerEdge: lo + i, upperEdge: lo + i + 1, probability: 1 / n });
  return { label, bins };
}
/** A game with `markets` simulated distributions; the first spans lo..hi (the widest). */
function simGame(over = {}) {
  const markets = over.markets ?? 3;
  const distributions = {};
  distributions["m0"] = dist((over.hi ?? 5) - (over.lo ?? 0), over.lo ?? 0, over.hi ?? 5, "Pitcher Strikeouts");
  for (let i = 1; i < markets; i++) distributions[`m${i}`] = dist(2, 0, 2, "Batter Hits");
  return {
    sport: "mlb",
    slug: over.slug ?? "away-vs-home-2026-07-23",
    date: TODAY,
    homeTeam: over.homeTeam ?? "Home",
    awayTeam: over.awayTeam ?? "Away",
    homeLogo: null,
    awayLogo: null,
    gameLabSimulation: { status: "ready", generatedAt: over.generatedAt ?? "2026-07-23T20:00:00Z", distributions },
    gameCenter: { firstPitch: over.firstPitch ?? "2026-07-23T23:05:00Z" },
    reconciled: { ok: true, reason: "ok" },
    ...(over.detail ?? {}),
  };
}

test("numericPercentile finds the outcome at a cumulative probability", () => {
  const bins = [{ lowerEdge: 0, probability: 0.5 }, { lowerEdge: 1, probability: 0.4 }, { lowerEdge: 2, probability: 0.1 }];
  assert.equal(numericPercentile(bins, 0.1), 0);
  assert.equal(numericPercentile(bins, 0.9), 1);
  assert.equal(numericPercentile([], 0.5), null);
  assert.equal(numericPercentile([{ lowerEdge: 0, probability: 0 }], 0.5), null);
});

test("gameSignals = market count + widest simulated p10–p90 range (factual, not a pick)", () => {
  const sig = gameSignals(simGame({ markets: 4, lo: 0, hi: 12 }).gameLabSimulation.distributions);
  assert.equal(sig.marketsSimulated, 4);
  assert.equal(sig.widestRangeMarket, "Pitcher Strikeouts");
  assert.ok(Array.isArray(sig.widestRange) && sig.widestRange[1] > sig.widestRange[0], "widest range is a real band");
  assert.equal(gameSignals(null), null);
  assert.equal(gameSignals({}), null);
});

test("overview reuses the availability contract: games / sims ready / awaiting inputs", () => {
  const details = [
    simGame({ slug: "s1-2026-07-23" }),
    simGame({ slug: "s2-2026-07-23" }),
    // a non-sim game (report tier) — awaiting inputs
    { sport: "mlb", slug: "r1-2026-07-23", date: TODAY, homeTeam: "H", awayTeam: "A", gameLabSimulation: null, gameCenter: null, reconciled: null },
  ];
  const b = buildDailyBrief(details, TODAY);
  assert.equal(b.overview.games, 3);
  assert.equal(b.overview.simulationsReady, 2);
  assert.equal(b.overview.awaitingInputs, 1);
});

test("spotlight = richest analysis (most markets simulated); attention = the next games", () => {
  const details = [
    simGame({ slug: "rich-2026-07-23", markets: 9, lo: 0, hi: 10 }),
    simGame({ slug: "mid-2026-07-23", markets: 5, lo: 0, hi: 4 }),
    simGame({ slug: "lean-2026-07-23", markets: 2, lo: 0, hi: 2 }),
  ];
  const b = buildDailyBrief(details, TODAY);
  assert.equal(b.spotlight.slug, "rich-2026-07-23");
  assert.equal(b.spotlight.marketsSimulated, 9);
  assert.equal(b.spotlight.href, "/games/mlb/rich-2026-07-23");
  assert.deepEqual(b.attention.map((g) => g.slug), ["mid-2026-07-23", "lean-2026-07-23"]);
});

test("ties on market count break by widest simulated range, then slug — a display sort, never by edge", () => {
  const details = [
    simGame({ slug: "narrow-2026-07-23", markets: 4, lo: 0, hi: 3 }),
    simGame({ slug: "wide-2026-07-23", markets: 4, lo: 0, hi: 12 }),
  ];
  const b = buildDailyBrief(details, TODAY);
  assert.equal(b.spotlight.slug, "wide-2026-07-23", "widest range wins the tie");
});

test("the brief never surfaces forbidden certainty / edge vocabulary", () => {
  const details = [simGame({ slug: "s-2026-07-23", markets: 6 }), simGame({ slug: "t-2026-07-23", markets: 4 })];
  const b = buildDailyBrief(details, TODAY);
  for (const g of [b.spotlight, ...b.attention]) {
    assert.doesNotMatch(g.note, FORBIDDEN);
    assert.doesNotMatch(g.widestRangeMarket ?? "", FORBIDDEN);
  }
});

test("no-sim day → spotlight null, attention empty, overview honest", () => {
  const details = [{ sport: "mlb", slug: "r-2026-07-23", date: TODAY, homeTeam: "H", awayTeam: "A", gameLabSimulation: null, gameCenter: { firstPitch: "2026-07-23T23:05:00Z" }, reconciled: null }];
  const b = buildDailyBrief(details, TODAY);
  assert.equal(b.spotlight, null);
  assert.deepEqual(b.attention, []);
  assert.equal(b.overview.simulationsReady, 0);
  assert.equal(b.overview.awaitingInputs, 1);
});

test("a ready sim with no real distributions contributes no signal (never fabricated)", () => {
  const details = [{ ...simGame({ slug: "empty-2026-07-23" }), gameLabSimulation: { status: "ready", generatedAt: "2026-07-23T20:00:00Z", distributions: {} } }];
  const b = buildDailyBrief(details, TODAY);
  assert.equal(b.spotlight, null, "no distributions → not a spotlight");
});

test("lastUpdatedIso is the freshest sim generatedAt across today's ready sims", () => {
  const details = [
    simGame({ slug: "a-2026-07-23", generatedAt: "2026-07-23T18:00:00Z" }),
    simGame({ slug: "b-2026-07-23", generatedAt: "2026-07-23T20:30:00Z" }),
  ];
  const b = buildDailyBrief(details, TODAY);
  assert.equal(b.lastUpdatedIso, "2026-07-23T20:30:00Z");
});

test("brief is start-aware: a game underway reads 'Review simulation' + counts as in-progress", () => {
  const details = [simGame({ slug: "s-2026-07-23", markets: 9, firstPitch: "2026-07-23T17:05:00Z" })];
  const started = buildDailyBrief(details, TODAY, { nowMs: Date.parse("2026-07-23T20:00:00Z") }); // after first pitch
  assert.equal(started.spotlight.started, true);
  assert.equal(started.spotlight.actionLabel, "Review simulation →");
  assert.equal(started.gamesInProgress, 1);
  const pregame = buildDailyBrief(details, TODAY, { nowMs: Date.parse("2026-07-23T16:00:00Z") }); // before first pitch
  assert.equal(pregame.spotlight.started, false);
  assert.equal(pregame.spotlight.actionLabel, "Open simulation →");
  assert.equal(pregame.gamesInProgress, 0);
});

test("no clock → the brief never guesses 'started' (honest default, no live prediction implied)", () => {
  const b = buildDailyBrief([simGame({ slug: "s-2026-07-23", markets: 5 })], TODAY);
  assert.equal(b.spotlight.started, false);
  assert.equal(b.spotlight.actionLabel, "Open simulation →");
  assert.equal(b.gamesInProgress, 0);
});

test("only the presented slate contributes (stale days ignored)", () => {
  const details = [
    simGame({ slug: "today-2026-07-23", markets: 5 }),
    { ...simGame({ slug: "stale-2026-07-11", markets: 9 }), date: "2026-07-11" },
  ];
  const b = buildDailyBrief(details, TODAY);
  assert.equal(b.overview.games, 1);
  assert.equal(b.spotlight.slug, "today-2026-07-23");
});
