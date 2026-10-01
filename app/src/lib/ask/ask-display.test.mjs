/**
 * Session 3 · Phase A — the Ask ANSWER DISPLAY (display.mjs), its view model (answer-view.mjs) and the follow-up
 * allowlist (prompts.mjs).
 *
 * What is pinned is the FIREWALL, not the layout: a typed card is a projection of the same envelopes the evidence is
 * built from, it computes nothing, keeps PAUSED / PENDING / missing exactly what they are, shows only links the
 * evidence issued — and anything it cannot classify falls back to the generic renderer, never to "no answer".
 */
import assert from "node:assert/strict";
import test from "node:test";

import { buildAnswerDisplay } from "./display.mjs";
import { answerRenderer, enumLabel, gradeBadge, laneBadge, liveStateLabel, remainingLinks } from "./answer-view.mjs";
import { ASK_OFFERED_QUESTIONS, supportedFollowUps } from "./prompts.mjs";
import { buildEvidence } from "./evidence.mjs";
import { writerUserMessage } from "./writer.mjs";
import { runAskTurn } from "./engine.mjs";
import { createFakeProvider } from "./provider-fake.mjs";
import { makeAskLoader, fixtureFetchText } from "./loader.mjs";
import { makeExecutor } from "./executor.mjs";
import { ASK_INTENTS } from "./contract.mjs";

/* The real Production rows of 2026-09-30 (data/ask/v1/forecasts.json), trimmed to the fields the tool reads. */
const MLB = {
  forecastId: "mlb-849842", sport: "MLB", gameId: "849842", away: "CHC", home: "SD", awayName: "Chicago Cubs", homeName: "San Diego Padres",
  date: "2031-10-03", startUtc: "2031-10-04T02:00:00Z", experimental: false, predictedWinner: "SD",
  markets: [
    { market: "moneyline", label: "Moneyline", status: "PUBLISHED", pick: "SD", line: null, modelProbability: 0.528, marketImpliedProbability: 0.566, confidence: "LEAN" },
    { market: "run_line", label: "Run line", status: "PUBLISHED", pick: "CHC +1.5", line: 1.5, modelProbability: 0.637, marketImpliedProbability: null, confidence: "STRONG SIMULATION" },
    { market: "total", label: "Over/Under", status: "PAUSED", pick: null, line: 7, modelProbability: null, marketImpliedProbability: 0.531, confidence: null,
      pausedReason: "Paused: over its graded record, this over/under call has done worse than a coin flip." },
  ],
  why: ["CHC confirmed batting order used; 1 of 9 have no posted prop line and are priced at replacement level."],
  links: [{ id: "report", label: "Open the MLB game report", href: "/games/mlb/chc-vs-sd-2031-10-03/" }],
};
const NFL = {
  forecastId: "nfl-401872964", sport: "NFL", gameId: "401872964", away: "PIT", home: "CLE", awayName: "Pittsburgh Steelers", homeName: "Cleveland Browns",
  matchup: "PIT @ CLE", startUtc: "2031-10-04T00:15Z", experimental: true, probabilities: { away: 0.5438, home: 0.4254, tie: 0.0308 }, markets: [],
  players: [{ name: "Jaylen Warren", team: "PIT", markets: [{ key: "player_rush_yds", label: "Rushing yards", median: 58.6, p10: 15.2, p90: 151 }] }],
  links: [{ id: "report", label: "Open the NFL game report", href: "/nfl/game/401872964/" }],
};
const FORECASTS = { schemaVersion: 1, eligibleSports: ["MLB", "NFL"], forecasts: [MLB, NFL] };
const NOW = () => new Date("2031-10-03T16:00:00Z");

const executor = (fixtures) => makeExecutor({ turn: makeAskLoader(fixtureFetchText(fixtures)).beginTurn(), now: NOW });
async function forecastEnvelopes(args = {}) {
  return [await executor({ "/data/ask/v1/forecasts.json": FORECASTS }).run({ name: "getPublishedForecasts", arguments: args })];
}
const displayOf = (envs) => buildAnswerDisplay(envs, buildEvidence(envs).links);

/* ─────────────────  forecasts  ───────────────── */

test("🔴 a forecast answer gets one card per game, every value copied from the owner with the evidence's rounding", async () => {
  const d = displayOf(await forecastEnvelopes({ gameId: "849842" }));
  assert.equal(answerRenderer(d), "forecasts");
  const [g] = d.games;
  assert.equal(g.matchup, "CHC @ SD");
  assert.deepEqual(g.markets.map((m) => [m.label, m.pick, m.modelProbability, m.marketImpliedProbability, m.confidence]), [
    ["Moneyline", "SD", "52.8%", "56.6%", "LEAN"],
    ["Run line", "CHC +1.5", "63.7%", null, "STRONG SIMULATION"],
  ]);
  assert.equal(g.markets[1].line, null, "'CHC +1.5' already carries its line — not 'CHC +1.5 at 1.5'");
  assert.equal(g.href, "/games/mlb/chc-vs-sd-2031-10-03/");
});

test("🔴 every number on a forecast card is a number the evidence already states (the card computes nothing)", async () => {
  const envs = await forecastEnvelopes({});
  assert.equal(envs[0].data.forecasts.length, 2, "both of today's games");
  const evidence = buildEvidence(envs);
  const d = buildAnswerDisplay(envs, evidence.links);
  assert.ok(d, "a display is built");
  const evidenceText = evidence.facts.map((f) => f.text).join("\n");
  /* Every printed VALUE (keys are not reader text; `share` is the aria-hidden bar width; dates/hrefs are not claims). */
  const values = [];
  const walk = (v, k) => {
    if (["href", "startUtc", "date", "share"].includes(k)) return;
    if (v && typeof v === "object") for (const [kk, vv] of Object.entries(v)) walk(vv, kk);
    else if (v != null) values.push(String(v));
  };
  walk(d.games, "games");
  for (const v of values) {
    for (const n of v.match(/\d+(?:\.\d+)?%?/g) ?? []) assert.ok(evidenceText.includes(n), `card value ${n} (in "${v}") is not in the evidence`);
  }
});

test("🔴 a PAUSED market shows its label and the owner's reason — never a pick, line or probability", async () => {
  const d = displayOf([await executor({ "/data/ask/v1/forecasts.json": FORECASTS }).run({ name: "getPublishedForecasts", arguments: { gameId: "849842" } })]);
  const [paused] = d.games[0].paused;
  assert.deepEqual(Object.keys(paused).sort(), ["label", "reason"]);
  assert.equal(paused.label, "Over/Under");
  assert.match(paused.reason, /worse than a coin flip/);
  assert.ok(!JSON.stringify(d).includes("53.1%"), "the paused market's market-implied 0.531 never reaches the card");
  assert.ok(!d.games[0].markets.some((m) => m.label === "Over/Under"), "a paused market is never listed as a published one");
});

test("🔴 a probability-only forecast is not a pick: no market rows, probabilities in the evidence's own order", async () => {
  const d = displayOf([await executor({ "/data/ask/v1/forecasts.json": FORECASTS }).run({ name: "getPublishedForecasts", arguments: { gameId: "401872964" } })]);
  const [g] = d.games;
  assert.equal(g.experimental, true);
  assert.deepEqual(g.markets, []);
  assert.deepEqual(g.winProbability.map((r) => [r.label, r.value]), [["PIT", "54.4%"], ["CLE", "42.5%"], ["Tie", "3.1%"]]);
  assert.equal(g.players[0].median, 58.6);
  assert.ok(!("predictedWinner" in g), "an owner field the evidence never states is not carried to the card");
});

test("🔴 an absent probability stays absent — never 0%, never 'not published' in a number slot", async () => {
  const doc = { ...FORECASTS, forecasts: [{ ...MLB, markets: [{ ...MLB.markets[0], modelProbability: null, marketImpliedProbability: undefined }] }] };
  const d = displayOf([await executor({ "/data/ask/v1/forecasts.json": doc }).run({ name: "getPublishedForecasts", arguments: { gameId: "849842" } })]);
  assert.equal(d.games[0].markets[0].modelProbability, null);
  assert.equal(d.games[0].markets[0].marketImpliedProbability, null);
});

test("🔴 a link the evidence did not issue never becomes a card action", async () => {
  const envs = [await executor({ "/data/ask/v1/forecasts.json": FORECASTS }).run({ name: "getPublishedForecasts", arguments: { gameId: "849842" } })];
  assert.equal(buildAnswerDisplay(envs, []).games[0].href, null, "no issued links → no href");
  const tampered = structuredClone(envs);
  tampered[0].data.forecasts[0].links = [{ href: "https://evil.example/" }];
  assert.equal(buildAnswerDisplay(tampered, [{ href: "https://evil.example/" }]).games[0].href, null, "only site paths");
});

test("line de-duplication is by number, not substring — 'OVER 7.5' does not hide a line of 7", async () => {
  const doc = { ...FORECASTS, forecasts: [{ ...MLB, markets: [{ ...MLB.markets[0], label: "Total", pick: "OVER 7.5", line: 7 }] }] };
  const d = displayOf([await executor({ "/data/ask/v1/forecasts.json": doc }).run({ name: "getPublishedForecasts", arguments: { gameId: "849842" } })]);
  assert.equal(d.games[0].markets[0].line, 7);
});

/* ─────────────────  the generic fallback  ───────────────── */

test("🔴 unknown, mixed, partial or malformed → GENERIC (progressive enhancement, never a gate)", async () => {
  // an answer type with no card (Game Finder)
  assert.equal(buildAnswerDisplay([{ tool: "runGameFinder", status: "OK", data: { rows: [] } }]), null);
  // two primary tools in one answer
  const fc = await forecastEnvelopes({ gameId: "849842" });
  assert.equal(buildAnswerDisplay([...fc, { tool: "getResultsDay", status: "OK", data: { date: "2031-10-02" } }], buildEvidence(fc).links), null);
  // the clock and an identity never decide the shape
  assert.notEqual(buildAnswerDisplay([{ tool: "getGameTimeNow", status: "OK", data: {} }, ...fc], buildEvidence(fc).links), null);
  // partial / refused
  assert.equal(buildAnswerDisplay([{ ...fc[0], status: "PARTIAL" }]), null);
  assert.equal(buildAnswerDisplay([{ tool: "getPublishedForecasts", status: "UNSUPPORTED", error: "NOT_PUBLISHED" }]), null);
  // malformed: a forecast with no matchup at all does not throw, it falls back
  assert.equal(buildAnswerDisplay([{ tool: "getPublishedForecasts", status: "OK", data: { forecasts: [{ sport: "MLB" }] } }]), null);
  // and the browser side agrees
  for (const d of [null, undefined, {}, { kind: "nope" }, { kind: "forecasts", games: [] }, { kind: "teamCompare", a: "A", b: "B", rows: [] }, "x"]) {
    assert.equal(answerRenderer(d), "generic", JSON.stringify(d));
  }
});

/* ─────────────────  live  ───────────────── */

test("🔴 live: a game that has not started carries NO score even if the feed zero-filled one; counts are the owner's", () => {
  const d = buildAnswerDisplay([{ tool: "getLiveSlate", status: "OK", data: {
    sport: "MLB", total: 2, liveCount: 1, preCount: 1, finalCount: 0, fetchedAt: "2031-10-04T03:04:50Z",
    events: [
      { away: "BOS", home: "NYY", awayScore: 2, homeScore: 9, period: "Top 9th", state: "LIVE", stateDetail: "In Progress" },
      { away: "CHC", home: "SD", awayScore: 0, homeScore: 0, period: null, state: "PRE", stateDetail: "Pre-Game" },
    ], links: [{ id: "live", href: "/live/" }] } }], [{ href: "/live/" }]);
  assert.equal(answerRenderer(d), "live");
  assert.deepEqual([d.games[1].awayScore, d.games[1].homeScore], [null, null]);
  assert.deepEqual([d.liveCount, d.preCount, d.finalCount, d.total], [1, 1, 0, 2]);
  assert.equal(d.href, "/live/");
  assert.equal(liveStateLabel("FINAL", "Final"), "Final", "no 'FINAL (Final)'");
  assert.equal(liveStateLabel("LIVE", "In Progress"), "Live · In Progress");
  assert.equal(liveStateLabel(null, null), "State not reported");
});

/* ─────────────────  results day  ───────────────── */

const DAY = {
  date: "2031-10-02", isYesterday: true,
  lanes: [
    { product: "bank-builder", lane: "A", result: "lost", legs: [{ selection: "BAL to win", matchup: "TOR @ BAL", official: "TOR 5 – 3 BAL", result: "lost" }, { selection: "NYY to win", result: "pending" }] },
    { product: "moonshot", lane: "A", result: "pending", legs: [] },
  ],
  events: { mlb: [{ title: "PHI @ ATL", final: "PHI 3 – 5 ATL", propsNotShown: 35, calls: [
    { market: "Winner", pick: "ATL (home)", outcome: "WIN" }, { market: "Run line", pick: "PHI +1.5", outcome: "LOSS" },
    { market: "Total runs", pick: "OVER 6.5", outcome: null }, { market: "Odd", pick: "X", outcome: "SOMETHING_NEW" },
  ] }], nfl: [] },
  sportsWithout: ["nfl", "epl", "ufc"],
  links: [{ id: "day", href: "/results/date/2031-10-02/" }],
};

test("🔴 results day: each call keeps its own grade; no grade (or an unknown one) is PENDING, never a loss; nothing is totalled", () => {
  const d = buildAnswerDisplay([{ tool: "getResultsDay", status: "OK", data: DAY }], [{ href: "/results/date/2031-10-02/" }]);
  assert.equal(answerRenderer(d), "resultsDay");
  const calls = d.sports[0].games[0].calls;
  assert.deepEqual(calls.map((c) => [c.pick, c.grade]), [["ATL", "WIN"], ["PHI +1.5", "LOSS"], ["OVER 6.5", "PENDING"], ["X", "PENDING"]]);
  assert.equal(d.sports[0].propsGraded, 35);
  assert.deepEqual(d.lanes.map((l) => [l.product, l.lane, l.result, l.legs.map((g) => g.result)]), [
    ["Bank Builder", "A", "lost", ["lost", "pending"]],
    ["Moonshot", "A", "pending", []],
  ]);
  const keys = [];
  const walk = (v) => { if (v && typeof v === "object") for (const [k, vv] of Object.entries(v)) { keys.push(k); walk(vv); } };
  walk(d);
  for (const forbidden of ["record", "hitRate", "percent", "pct", "wins", "losses", "total", "net"]) assert.ok(!keys.includes(forbidden), `no combined ${forbidden} field`);
  assert.equal(gradeBadge("PENDING").label, "Pending");
  assert.equal(gradeBadge(undefined).label, "Pending", "an unknown grade badge is pending, not a loss");
  assert.equal(laneBadge("active").label, "Open");
});

/* ─────────────────  team comparison  ───────────────── */

test("🔴 team compare: recorded rows only, no winner, and a missing W–L is 'not recorded' — never 0", () => {
  const data = {
    sport: "MLB", a: { label: "New York Yankees" }, b: { label: "Boston Red Sox" },
    season: { id: "MLB-2026", a: { w: 41, l: 26, finals: 67 }, b: { finals: 68 } },
    headToHead: { allTime: { record: { meetings: 44, aWins: 19, bWins: 25, ties: 0 } } },
    links: [{ id: "compare", href: "/compare/teams/mlb/?a=nyy&b=bos" }],
  };
  const d = buildAnswerDisplay([{ tool: "resolveEntity", status: "OK", data: {} }, { tool: "getTeamComparison", status: "OK", data }], [{ href: "/compare/teams/mlb/?a=nyy&b=bos" }]);
  assert.equal(answerRenderer(d), "teamCompare");
  assert.deepEqual(d.rows.map((r) => [r.label, r.a, r.b]), [
    ["Head-to-head wins", 19, 25],
    ["MLB-2026 record", "41–26", null],
    ["Recorded finals", 67, 68],
  ]);
  assert.ok(!/winner"|better|leads/i.test(JSON.stringify(d.rows)), "no winner is named");
  assert.match(d.note, /names no winner/);
});

/* ─────────────────  links, labels, follow-ups  ───────────────── */

test("🔴 the founder's duplicate: a card's own action is not repeated as a chip, and chips are de-duplicated by href", () => {
  const display = { kind: "forecasts", games: [{ matchup: "A @ B", href: "/g/1/" }, { matchup: "C @ D", href: "/g/2/" }] };
  const links = [
    { id: "E1:report", label: "Open the MLB game report", href: "/g/1/" },
    { id: "E1:report", label: "Open the MLB game report", href: "/g/2/" },
    { id: "E2:today", label: "See today's slate", href: "/today/" },
    { id: "E3:today", label: "Today", href: "/today/" },
  ];
  assert.deepEqual(remainingLinks(links, display).map((l) => l.href), ["/today/"]);
  assert.deepEqual(remainingLinks(links, null).map((l) => l.href), ["/g/1/", "/g/2/", "/today/"], "generic: de-duplicated, nothing hidden");
});

test("labels are case mappings of the owner's words, nothing more", () => {
  assert.equal(enumLabel("STRONG SIMULATION"), "Strong simulation");
  assert.equal(enumLabel("LEAN"), "Lean");
  assert.equal(enumLabel("Lean"), "Lean");
  assert.equal(enumLabel(null), null);
});

test("🔴 follow-ups come only from the verified starter list, and never repeat the question just asked", () => {
  for (const intent of [...ASK_INTENTS, undefined, "SOMETHING_NEW"]) {
    const f = supportedFollowUps(intent, "What are today's GameTime forecasts?");
    assert.ok(f.length >= 1 && f.length <= 2, intent);
    for (const q of f) assert.ok(ASK_OFFERED_QUESTIONS.includes(q), `${intent}: "${q}" is not a starter`);
    assert.ok(!f.includes("What are today's GameTime forecasts?"), "the question just asked is not offered back");
  }
});

test("🔴 the engine ignores the writer's own follow-ups and ships the display beside a verified answer", async () => {
  const writer = JSON.stringify({ answerMarkdown: "GameTime's moneyline pick for CHC @ SD is SD.", citations: [], followUps: ["Open the MLB game report", "results for MLB player-prop leans"], linkIds: [] });
  const r = await runAskTurn({ messages: [{ role: "user", text: "What are today's GameTime forecasts?" }] }, {
    provider: createFakeProvider({ script: [JSON.stringify({ intent: "PUBLISHED_FORECAST", calls: [{ id: "c0", name: "getPublishedForecasts", arguments: { gameId: "849842" } }] }), writer] }),
    turn: makeAskLoader(fixtureFetchText({ "/data/ask/v1/forecasts.json": FORECASTS })).beginTurn(),
    now: NOW,
  });
  assert.equal(r.verified, true);
  assert.equal(r.answer.answerMarkdown, "GameTime's moneyline pick for CHC @ SD is SD.", "the verified text is untouched");
  assert.deepEqual(r.answer.followUps, ["Which MLB games are live right now?", "How did GameTimePicks do yesterday?"]);
  assert.equal(r.display.kind, "forecasts");
  assert.equal(r.display.games[0].matchup, "CHC @ SD");
});

test("🔴 the deterministic fallback keeps its display and allowlisted follow-ups too", async () => {
  const bad = JSON.stringify({ answerMarkdown: "GameTimePicks favors Pittsburgh.", citations: [], followUps: [], linkIds: [] });
  const r = await runAskTurn({ messages: [{ role: "user", text: "What does GameTime think about PIT @ CLE?" }] }, {
    provider: createFakeProvider({ script: [JSON.stringify({ intent: "PUBLISHED_FORECAST", calls: [{ id: "c0", name: "getPublishedForecasts", arguments: { gameId: "401872964" } }] }), bad, bad] }),
    turn: makeAskLoader(fixtureFetchText({ "/data/ask/v1/forecasts.json": FORECASTS })).beginTurn(),
    now: NOW,
  });
  assert.equal(r.verified, false);
  assert.equal(r.display.kind, "forecasts");
  assert.ok(r.answer.followUps.every((q) => ASK_OFFERED_QUESTIONS.includes(q)));
});

test("the writer is told about the cards ONLY when there are cards (a length instruction, nothing else)", async () => {
  const envs = await forecastEnvelopes({ gameId: "849842" });
  const evidence = buildEvidence(envs);
  const withCards = writerUserMessage({ question: "q", evidence, state: {}, display: buildAnswerDisplay(envs, evidence.links) });
  const without = writerUserMessage({ question: "q", evidence, state: {} });
  assert.match(withCards, /THE READER ALSO SEES each published forecast as cards/);
  assert.doesNotMatch(without, /THE READER ALSO SEES/);
  assert.equal(withCards.replace(/\n\nTHE READER ALSO SEES[^\n]*$/, ""), without, "the evidence and every other line are unchanged");
});

test("🔴 player form evidence names a stat by the owner's LABEL, never the raw key ('hitsRunsRbis')", () => {
  const env = { tool: "getPlayerRecentGames", status: "OK", data: {
    player: { label: "Juan Soto" }, requested: 5, returned: 1,
    families: [{ key: "MLB.hitsRunsRbis", label: "Hits + runs + RBIs" }, { key: "MLB.totalBases", label: "Total bases" }],
    rows: [{ date: "2031-09-26", opponent: "Washington Nationals", values: { "MLB.hitsRunsRbis": 2, "MLB.totalBases": null } }],
    windows: { "MLB.hitsRunsRbis": { size: 5, recordedGames: 5, sum: 14, average: 2.8 } },
  } };
  const text = buildEvidence([env]).facts.map((f) => f.text).join("\n");
  assert.doesNotMatch(text, /hitsRunsRbis|totalBases/);
  assert.match(text, /recorded 2 hits \+ runs \+ RBIs, not recorded total bases/, "missing stays 'not recorded', never 0");
  assert.match(text, /recorded 5 hits \+ runs \+ RBIs entries totalling 14, an average of 2\.8/);
});
