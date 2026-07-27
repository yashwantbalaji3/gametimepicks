/**
 * Game-level intelligence guards.
 *
 * The run-line tests are the important ones. They do NOT restate the cover probabilities the module
 * produces — they build a run-differential histogram, derive what each identity must equal from
 * that histogram, and assert the module agrees. A test that hard-coded the constants would keep
 * passing if the sign convention were inverted, which is the exact defect these exist to prevent.
 *
 * Run: npx tsx --test src/lib/markets/game-intelligence.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildGameIntelligence,
  homeCoverProbability,
  massWhere,
  describeDifference,
} from "./game-intelligence.ts";

const TODAY = "2026-07-27";
const NOW = "2026-07-27T17:00:00Z";

/**
 * A synthetic run-differential histogram (home runs − away runs) and the simulation run-line entries
 * that must follow from it. Building both from one source is what makes the identities checkable.
 */
const DIFF_BINS = [
  { value: -3, probability: 0.10 },
  { value: -2, probability: 0.15 },
  { value: -1, probability: 0.20 },
  { value: 1, probability: 0.25 },
  { value: 2, probability: 0.18 },
  { value: 3, probability: 0.12 },
];
const P_HOME_BY_2_PLUS = 0.18 + 0.12; // 0.30 — home wins by more than 1.5
const P_AWAY_BY_2_PLUS = 0.10 + 0.15; // 0.25 — away wins by more than 1.5

const SIM = {
  gamePk: 1,
  runCount: 10000,
  completeness: { level: "complete", notes: [] },
  winProbability: { home: 0.55, away: 0.45 },
  runs: { home: { median: 4, mean: 4.3 }, away: { median: 3, mean: 3.4 } },
  totalRuns: {
    mean: 8.2,
    median: 8,
    p10: 3,
    p90: 13,
    distribution: [
      { value: 6, probability: 0.2 },
      { value: 7, probability: 0.2 },
      { value: 8, probability: 0.2 }, // push mass for an integer line of 8
      { value: 9, probability: 0.2 },
      { value: 10, probability: 0.2 },
    ],
  },
  runLine: [{ line: 1.5, homeCover: P_HOME_BY_2_PLUS, awayCover: P_AWAY_BY_2_PLUS }],
  runDifferential: { distribution: DIFF_BINS },
};

const BOOK = {
  gameId: "g1",
  homeTeam: "Texas Rangers",
  awayTeam: "Seattle Mariners",
  commenceTime: "2026-07-27T18:35:00Z",
  bookmaker: "draftkings",
  moneyline: {
    home: { odds: 109, impliedProb: 0.4785, noVigProb: 0.4576 },
    away: { odds: -131, impliedProb: 0.5671, noVigProb: 0.5424 },
  },
  runLine: {
    line: 1.5,
    home: { line: 1.5, odds: -162, coverNoVigProb: 0.5913 },
    away: { line: -1.5, odds: 134, coverNoVigProb: 0.4087 },
  },
  total: {
    line: 8,
    over: { odds: -103, noVigProb: 0.4848 },
    under: { odds: -117, noVigProb: 0.5152 },
  },
};

const build = (over = {}) =>
  buildGameIntelligence({
    book: { ...BOOK, ...(over.book ?? {}) },
    sim: over.sim === undefined ? SIM : over.sim,
    gamePk: over.gamePk === undefined ? 1 : over.gamePk,
    artifact: over.artifact ?? { date: TODAY, generatedAt: "2026-07-27T16:35:04.082Z" },
    todayEt: over.todayEt ?? TODAY,
    nowIso: over.nowIso ?? NOW,
  });

// ── Run-line sign convention, derived from the histogram ────────────────────────────────────────

test("home LAYING −1.5 covers exactly when it wins by more than 1.5", () => {
  const fromHistogram = massWhere(DIFF_BINS, (v) => v >= 2);
  const got = homeCoverProbability(SIM, -1.5);
  assert.equal(got.derivation, "home_lays");
  assert.ok(Math.abs(got.prob - fromHistogram) < 1e-9, `${got.prob} vs ${fromHistogram}`);
});

test("home RECEIVING +1.5 covers unless away wins by more than 1.5", () => {
  const fromHistogram = massWhere(DIFF_BINS, (v) => v >= -1);
  const got = homeCoverProbability(SIM, 1.5);
  assert.equal(got.derivation, "home_receives");
  assert.ok(Math.abs(got.prob - fromHistogram) < 1e-9, `${got.prob} vs ${fromHistogram}`);
});

test("the two identities are genuinely different numbers, so matching by line value alone is wrong", () => {
  const laying = homeCoverProbability(SIM, -1.5).prob;
  const receiving = homeCoverProbability(SIM, 1.5).prob;
  assert.notEqual(laying, receiving);
  assert.ok(receiving > laying, "receiving points must be likelier to cover than laying them");
});

test("a magnitude the simulation did not publish yields no cover probability", () => {
  assert.equal(homeCoverProbability(SIM, -3.5), null);
  assert.equal(homeCoverProbability(SIM, 2.5), null);
});

test("a signed book line drives the derivation, not the top-level magnitude", () => {
  const laying = build({
    book: { runLine: { line: -1.5, home: { line: -1.5, odds: -162, coverNoVigProb: 0.5 }, away: { line: 1.5, odds: 134, coverNoVigProb: 0.5 } } },
  });
  assert.equal(laying.runLine.model.derivation, "home_lays");
  const receiving = build();
  assert.equal(receiving.runLine.model.derivation, "home_receives");
});

// ── Moneyline ───────────────────────────────────────────────────────────────────────────────────

test("moneyline compares the simulation against the no-vig price in percentage points", () => {
  const g = build();
  assert.equal(g.moneyline.intelligence.mode, "FULL_COMPARISON");
  assert.equal(g.moneyline.model.homeWinProb, 0.55);
  assert.equal(g.moneyline.sportsbook.homeNoVigProb, 0.4576);
  // 0.55 − 0.4576 = 0.0924 → 9.2 percentage points
  assert.equal(g.moneyline.comparison.home.differencePoints, 9.2);
});

test("moneyline needs no line and survives a null one", () => {
  const g = build();
  assert.equal(g.moneyline.intelligence.blockedBy.length, 0);
});

test("a missing simulation leaves the sportsbook side intact", () => {
  const g = build({ sim: null });
  assert.equal(g.moneyline.intelligence.mode, "SPORTSBOOK_ONLY");
  assert.equal(g.moneyline.model, null);
  assert.ok(g.moneyline.sportsbook, "the price is still real");
  assert.equal(g.moneyline.comparison, null, "no comparison without both sides");
});

// ── Totals and pushes ───────────────────────────────────────────────────────────────────────────

test("an integer total reports push mass instead of hiding it", () => {
  const g = build();
  assert.equal(g.total.line, 8);
  assert.ok(Math.abs(g.total.model.overProb - 0.4) < 1e-9, "9 and 10");
  assert.ok(Math.abs(g.total.model.underProb - 0.4) < 1e-9, "6 and 7");
  assert.ok(Math.abs(g.total.model.pushProb - 0.2) < 1e-9, "exactly 8");
});

test("the total comparison excludes push, matching what a two-way price describes", () => {
  const g = build();
  // 0.4 / (0.4 + 0.4) = 0.5, not 0.4
  assert.ok(Math.abs(g.total.model.overProbExcludingPush - 0.5) < 1e-9);
  assert.equal(g.total.comparison.over.modelProb, g.total.model.overProbExcludingPush);
  // 0.5 − 0.4848 = 0.0152 → 1.5 points
  assert.equal(g.total.comparison.over.differencePoints, 1.5);
});

test("a half-point total has no push mass", () => {
  const g = build({ book: { total: { line: 8.5, over: { odds: -103, noVigProb: 0.4848 }, under: { odds: -117, noVigProb: 0.5152 } } } });
  assert.equal(g.total.model.pushProb, 0);
  assert.ok(Math.abs(g.total.model.overProb - 0.4) < 1e-9);
  assert.equal(g.total.model.overProbExcludingPush, g.total.model.overProb);
});

test("a total with no line is incomplete rather than zero", () => {
  const g = build({ book: { total: { line: null, over: { odds: -103 }, under: { odds: -117 } } } });
  assert.notEqual(g.total.intelligence.mode, "FULL_COMPARISON");
  assert.ok(g.total.intelligence.blockedBy.includes("MARKET_INCOMPLETE"));
});

test("a simulation with no total distribution cannot answer a threshold", () => {
  const g = build({ sim: { ...SIM, totalRuns: { median: 8, distribution: [] } } });
  assert.equal(g.total.model, null);
  assert.ok(g.total.intelligence.blockedBy.includes("THRESHOLD_UNSUPPORTED"));
});

// ── Distribution helper ─────────────────────────────────────────────────────────────────────────

test("massWhere normalizes a count-only histogram", () => {
  const bins = [{ value: 1, count: 250 }, { value: 2, count: 750 }];
  assert.ok(Math.abs(massWhere(bins, (v) => v === 2) - 0.75) < 1e-9);
});

test("massWhere returns null for an absent or empty histogram", () => {
  assert.equal(massWhere(null, () => true), null);
  assert.equal(massWhere([], () => true), null);
});

// ── Freshness, phase and provenance ─────────────────────────────────────────────────────────────

test("a stale snapshot removes the sportsbook side from every family", () => {
  const g = build({ artifact: { date: "2026-07-25", generatedAt: "2026-07-25T16:00:00Z" } });
  for (const f of [g.moneyline, g.runLine, g.total]) {
    assert.equal(f.intelligence.mode, "MODEL_ONLY", `${f.family} must not present a stale price as current`);
    assert.equal(f.sportsbook, null);
    assert.equal(f.comparison, null);
  }
});

test("event phase is independent of artifact freshness", () => {
  const started = build({ nowIso: "2026-07-27T19:00:00Z" });
  assert.equal(started.eventPhase, "STARTED");
  assert.equal(started.snapshot.freshness.state, "CURRENT", "a started game does not make the snapshot stale");
  const pregame = build({ nowIso: "2026-07-27T17:00:00Z" });
  assert.equal(pregame.eventPhase, "PREGAME");
});

test("the capture label describes the artifact and never claims a relative row age", () => {
  const g = build();
  assert.match(g.snapshot.captureLabel, /^Sportsbook snapshot captured /);
  assert.ok(!/ago/.test(g.snapshot.captureLabel), "no relative phrasing — there is no row-level timestamp");
});

test("an unresolved event fails every family closed", () => {
  const g = build({ gamePk: null });
  for (const f of [g.moneyline, g.runLine, g.total]) {
    assert.equal(f.intelligence.mode, "UNAVAILABLE");
    assert.deepEqual(f.intelligence.blockedBy, ["EVENT_UNRESOLVED"]);
  }
});

// ── Uncertainty ─────────────────────────────────────────────────────────────────────────────────

test("a degraded simulation is flagged, not silently equal to a complete one", () => {
  const g = build({
    sim: { ...SIM, completeness: { level: "degraded", notes: ["SEA lineup padded: 8/9 batters posted pregame."] } },
  });
  assert.equal(g.moneyline.model.uncertainty.isDegraded, true);
  assert.equal(g.moneyline.model.uncertainty.notes.length, 1);
  assert.equal(g.moneyline.model.uncertainty.runCount, 10000);
});

// ── Language ────────────────────────────────────────────────────────────────────────────────────

test("difference phrasing is neutral and never implies an advantage", () => {
  const s = describeDifference({ modelProb: 0.61, marketProb: 0.562, differencePoints: 4.8 });
  assert.match(s, /4\.8 percentage points higher/);
  for (const banned of ["edge", "value", "beat", "lock", "advantage", "profit"]) {
    assert.ok(!s.toLowerCase().includes(banned), `phrasing must not contain "${banned}"`);
  }
});

test("agreement reads as agreement rather than a zero-point difference", () => {
  assert.equal(describeDifference({ modelProb: 0.5, marketProb: 0.5, differencePoints: 0 }), "Model and sportsbook agree");
});

test("no team total appears anywhere in the object", () => {
  const g = build();
  assert.ok(!/teamTotal/i.test(JSON.stringify(g)), "the live artifact has no team total and neither may this");
});
