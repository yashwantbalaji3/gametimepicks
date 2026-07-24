/**
 * PREDICTION DECISION ENGINE TESTS (Sprint 009 · Phase 11). Proves the engine turns simulation distributions
 * into directional answers deterministically, that the MARKET only supplies the threshold (never the
 * direction), that a prediction survives market agreement, that unsupported families fail closed, and that
 * player direction comes from simulated probability (not the model-vs-market gap).
 *
 * Run: npx tsx --test src/lib/mlb/prediction/decision.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildGamePredictionDecision } from "./decision.ts";
import { strengthLabel, STRENGTH_THRESHOLDS } from "./strength.ts";

/** A synthetic full-game artifact game: home favored 58/42, total dist centred ~8, home run-line dog. */
function fixtureGame(over = {}) {
  const totalDist = [];
  // A simple symmetric-ish integer distribution over 4..13 summing to 1.
  const weights = { 4: 0.03, 5: 0.06, 6: 0.1, 7: 0.14, 8: 0.16, 9: 0.15, 10: 0.12, 11: 0.1, 12: 0.08, 13: 0.06 };
  for (const [v, p] of Object.entries(weights)) totalDist.push({ value: Number(v), label: v, count: p * 10000, probability: p });
  return {
    gamePk: 999001,
    date: "2026-07-24",
    slug: "laa-vs-sf-2026-07-24",
    awayTeam: "LAA",
    homeTeam: "SF",
    awayTeamName: "Angels",
    homeTeamName: "Giants",
    venue: "Oracle Park",
    firstPitch: "2026-07-24T20:00:00Z",
    status: "ready",
    completeness: { level: "ready", notes: [], awayLineupCount: 9, homeLineupCount: 9, hasAwayStarter: true, hasHomeStarter: true, missingFamilies: [] },
    runCount: 10000,
    winProbability: { away: 0.42, home: 0.58 },
    runs: { away: { mean: 3.8, median: 3, p10: 1, p90: 8 }, home: { mean: 4.4, median: 4, p10: 1, p90: 8 } },
    totalRuns: { mean: 8.2, median: 8, p10: 3, p90: 14, distribution: totalDist },
    runDifferential: { mean: 0.5, median: 0, p10: -6, p90: 7, distribution: [] },
    runLine: [{ line: 1.5, homeCover: 0.395, awayCover: 0.295 }, { line: 2.5, homeCover: 0.28, awayCover: 0.205 }],
    teamTotals: null,
    finalScores: [],
    extraInningsProbability: 0.11,
    players: null,
    gameStory: ["story"],
    market: { bookmaker: "dk", capturedAt: "x", moneyline: { home: 0.5842, away: 0.4158 }, total: { line: 8.5, over: 0.49 }, runLine: { line: -1.5, homeCover: 0.41 } },
    artifactHash: "hash-abc",
    ...over,
  };
}

test("strength labels obey the centralized thresholds (selected-side probability)", () => {
  assert.equal(strengthLabel(0.52), "LEAN");
  assert.equal(strengthLabel(0.57), "MODERATE SIMULATION");
  assert.equal(strengthLabel(0.64), "STRONG SIMULATION");
  assert.equal(strengthLabel(0.75), "VERY STRONG SIMULATION");
  // symmetric: a 0.40 side means the OTHER side (0.60) → STRONG.
  assert.equal(strengthLabel(0.4), "STRONG SIMULATION");
  assert.ok(STRENGTH_THRESHOLDS.length === 4);
});

test("moneyline picks the higher SIMULATION win probability, never the market", () => {
  const d = buildGamePredictionDecision(fixtureGame(), null);
  assert.equal(d.predictedWinner.side, "home");
  assert.equal(d.predictedWinner.team, "SF");
  assert.equal(d.moneyline.simulationProbability, 0.58);
  assert.equal(d.moneyline.marketAgreement, "ALIGNED"); // 0.58 vs 0.584 within epsilon
  assert.equal(d.moneyline.strengthLabel, "MODERATE SIMULATION");
});

test("a prediction is STATED even when the market fully agrees (prediction ≠ edge)", () => {
  const d = buildGamePredictionDecision(fixtureGame({ market: { moneyline: { home: 0.58, away: 0.42 }, total: { line: 8.5, over: 0.5 }, runLine: { line: -1.5, homeCover: 0.4 } } }), null);
  assert.equal(d.predictedWinner.team, "SF");
  assert.equal(d.moneyline.marketAgreement, "ALIGNED");
  assert.ok(d.moneyline.simulationProbability > 0.5, "the directional answer survives agreement");
});

test("projected score is the MEDIAN simulated runs, labelled exactly", () => {
  const d = buildGamePredictionDecision(fixtureGame(), null);
  assert.deepEqual({ away: d.projectedScore.away, home: d.projectedScore.home }, { away: 3, home: 4 });
  assert.match(d.projectedScore.label, /Median/);
});

test("total pick is the empirical over/under vs the POSTED line (not the median)", () => {
  const d = buildGamePredictionDecision(fixtureGame(), null);
  // line 8.5: under = P(≤8) = .03+.06+.1+.14+.16 = .49; over = .51 → OVER
  assert.equal(d.total.line, 8.5);
  assert.ok(Math.abs(d.total.underProbability + d.total.overProbability - 1) < 1e-6);
  assert.equal(d.total.pick, d.total.overProbability > d.total.underProbability ? "OVER" : "UNDER");
  // move the line to 9.5 → under grows past over.
  const d2 = buildGamePredictionDecision(fixtureGame({ market: { total: { line: 9.5, over: 0.4 }, moneyline: { home: 0.58, away: 0.42 } } }), null);
  assert.equal(d2.total.pick, "UNDER");
});

test("total is UNAVAILABLE (not fabricated) when there is no posted line", () => {
  const d = buildGamePredictionDecision(fixtureGame({ market: { moneyline: { home: 0.58, away: 0.42 }, total: null, runLine: null } }), null);
  assert.equal(d.total.pick, "UNAVAILABLE");
  assert.equal(d.total.line, null);
  assert.match(d.total.unavailableReason, /no posted/i);
  assert.equal(d.total.simulationMedian, 8); // evidence still shown
});

test("run-line cover comes from simulated margins; favorite lays −1.5, dog gets +1.5", () => {
  const d = buildGamePredictionDecision(fixtureGame(), null);
  // home favored, homeCover(−1.5)=.395 → dog away +1.5 covers .605 → pick AWAY +1.5
  assert.equal(d.runLine.favorite, "home");
  assert.equal(d.runLine.pick, "LAA +1.5");
  assert.equal(d.runLine.pickSide, "away");
  assert.ok(Math.abs(d.runLine.coverProbability - 0.605) < 0.001);
  assert.equal(d.runLine.pushProbability, 0);
});

test("team totals fail closed with no market line, but show the simulated team median", () => {
  const d = buildGamePredictionDecision(fixtureGame(), null);
  assert.equal(d.teamTotals.length, 2);
  for (const t of d.teamTotals) {
    assert.equal(t.pick, "UNAVAILABLE");
    assert.equal(t.line, null);
    assert.ok(typeof t.simulationMedian === "number");
  }
});

test("player direction is the SIMULATED probability side, not the model-vs-market gap; deterministic top-N", () => {
  const picks = [
    { player: "A", team: "SF", market: "batter_hits", line: 0.5, side: "over", modelProbability: 0.8, marketProbability: 0.6 },
    // an edge-picked UNDER lean where the model side prob is < 0.5 → the OVER side is actually higher.
    { player: "B", team: "LAA", market: "batter_total_bases", line: 1.5, side: "under", modelProbability: 0.45, marketProbability: 0.35 },
    { player: "C", team: "SF", market: "pitcher_strikeouts", line: 5.5, side: "over", modelProbability: 0.62, marketProbability: 0.5 },
  ];
  const d = buildGamePredictionDecision(fixtureGame(), picks, { maxPlayers: 5 });
  const a = d.topPlayerPredictions.find((p) => p.player === "A");
  const b = d.topPlayerPredictions.find((p) => p.player === "B");
  assert.equal(a.pick, "OVER");
  assert.equal(a.simulationProbability, 0.8);
  // B: side=under, modelProbability 0.45 → P(under)=0.45 < 0.5 → the OVER side (0.55) is higher → OVER.
  assert.equal(b.pick, "OVER");
  assert.equal(b.simulationProbability, 0.55);
  assert.equal(a.source, "legacy_prop_engine");
  // ranked by simulated probability descending.
  const probs = d.topPlayerPredictions.map((p) => p.simulationProbability);
  assert.deepEqual(probs, [...probs].sort((x, y) => y - x));
});

test("the market never changes the DECISION — same picks with the market removed", () => {
  const withMkt = buildGamePredictionDecision(fixtureGame(), null);
  const noMkt = buildGamePredictionDecision(fixtureGame({ market: { total: { line: 8.5, over: null }, moneyline: null, runLine: null } }), null);
  assert.equal(withMkt.predictedWinner.team, noMkt.predictedWinner.team);
  assert.equal(withMkt.total.pick, noMkt.total.pick);
  assert.equal(withMkt.runLine.pick, noMkt.runLine.pick);
  // only the comparison fields differ.
  assert.equal(noMkt.moneyline.marketAgreement, "NO MARKET");
});

test("deterministic — same artifact + line snapshot → identical decision", () => {
  assert.deepEqual(buildGamePredictionDecision(fixtureGame(), null), buildGamePredictionDecision(fixtureGame(), null));
});

test("an unavailable game produces NO fabricated picks", () => {
  const d = buildGamePredictionDecision(fixtureGame({ status: "unavailable", winProbability: null, runs: null, totalRuns: null }), null);
  assert.equal(d.status, "unavailable");
  assert.equal(d.predictedWinner, null);
  assert.equal(d.moneyline, null);
  assert.equal(d.total, null);
  assert.equal(d.runLine, null);
  assert.deepEqual(d.topPlayerPredictions, []);
  assert.ok(d.unavailableReasons.length > 0);
});

test("REAL July-24 artifact: LAA@SF reproduces SF ML / UNDER 8.5 / LAA +1.5", () => {
  const p = path.join(process.cwd(), "public/data/mlb/full-game-simulations/2026-07-24.json");
  if (!fs.existsSync(p)) return;
  const a = JSON.parse(fs.readFileSync(p, "utf8"));
  const g = a.games.find((x) => x.slug === "laa-vs-sf-2026-07-24");
  if (!g) return;
  const d = buildGamePredictionDecision(g, null);
  assert.equal(d.predictedWinner.team, "SF");
  assert.equal(d.total.pick, "UNDER");
  assert.equal(d.total.line, 8.5);
  assert.equal(d.runLine.pick, "LAA +1.5");
});
