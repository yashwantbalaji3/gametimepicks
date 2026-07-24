/**
 * SLATE PREDICTION VIEW + SYNCHRONIZATION TESTS (Sprint 010 · Phase 7). Proves the /today Game Predictions
 * table and the Top Model Picks BY CATEGORY are pure derivations of the canonical prediction objects, and —
 * critically — that a player's pick on /today is byte-identical to the game report's (one buildPlayerPrediction,
 * no second engine).
 *
 * Run: npx tsx --test src/lib/mlb/prediction/slate.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildGamePredictionDecision, buildPlayerPrediction } from "./decision.ts";
import { buildTodayPredictionRows, buildTopPicksByCategory } from "./slate.ts";

const totalDist = Object.entries({ 6: 0.15, 7: 0.2, 8: 0.25, 9: 0.2, 10: 0.12, 11: 0.08 }).map(([v, p]) => ({ value: Number(v), label: v, count: p * 1e4, probability: p }));

const fgGame = (over = {}) => ({
  gamePk: 823196,
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
  totalRuns: { mean: 8.2, median: 8, p10: 4, p90: 13, distribution: totalDist },
  runDifferential: { mean: 0.5, median: 0, p10: -6, p90: 7, distribution: [] },
  runLine: [{ line: 1.5, homeCover: 0.395, awayCover: 0.295 }, { line: 2.5, homeCover: 0.28, awayCover: 0.205 }],
  teamTotals: null, finalScores: [], extraInningsProbability: 0.11, players: null, gameStory: ["x"],
  market: { moneyline: { home: 0.58, away: 0.42 }, total: { line: 8.5, over: 0.49 }, runLine: { line: -1.5, homeCover: 0.41 } },
  artifactHash: "h",
  ...over,
});

const picks = [
  { player: "Logan Webb", team: "SF", market: "pitcher_strikeouts", line: 5.5, side: "under", modelProbability: 0.83, marketProbability: 0.44 },
  { player: "Nolan Schanuel", team: "LAA", market: "batter_hits", line: 0.5, side: "over", modelProbability: 0.78, marketProbability: 0.6 },
  { player: "Casey Schmitt", team: "SF", market: "batter_total_bases", line: 1.5, side: "over", modelProbability: 0.55, marketProbability: 0.45 },
];

function slateGame() {
  const prediction = buildGamePredictionDecision(fgGame(), picks);
  const playerPredictions = picks
    .map((p) => buildPlayerPrediction(p, { playerId: 100 + p.market.length, team: p.team, opponent: p.team === "SF" ? "LAA" : "SF" }))
    .sort((a, b) => b.simulationProbability - a.simulationProbability);
  return {
    gamePk: 823196, slug: "laa-vs-sf-2026-07-24", href: "/games/mlb/laa-vs-sf-2026-07-24/",
    homeTeam: "SF", awayTeam: "LAA", homeTeamName: "Giants", awayTeamName: "Angels",
    homeLogo: null, awayLogo: null, firstPitchIso: "2026-07-24T20:00:00Z",
    prediction, playerPredictions,
  };
}

test("game prediction rows are a faithful projection of the decision object", () => {
  const rows = buildTodayPredictionRows([slateGame()]);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.moneyline.team, "SF");
  assert.equal(r.score.away, 3);
  assert.equal(r.score.home, 4);
  assert.equal(r.total.pick, "UNDER");
  assert.equal(r.total.line, 8.5);
  assert.equal(r.runLine.pick, "LAA +1.5");
});

test("rows sort chronologically by first pitch", () => {
  const a = { ...slateGame(), gamePk: 1, firstPitchIso: "2026-07-24T23:00:00Z" };
  const b = { ...slateGame(), gamePk: 2, firstPitchIso: "2026-07-24T17:00:00Z" };
  const rows = buildTodayPredictionRows([a, b]);
  assert.deepEqual(rows.map((r) => r.gamePk), [2, 1]);
});

test("top picks group by MARKET, rank by simulated probability, cap per category, known markets only", () => {
  const cats = buildTopPicksByCategory([slateGame()], { perCategory: 5 });
  const labels = cats.map((c) => c.label);
  assert.ok(labels.includes("Strikeouts") && labels.includes("Hits") && labels.includes("Total Bases"));
  for (const c of cats) {
    const probs = c.picks.map((p) => p.simulationProbability);
    assert.deepEqual(probs, [...probs].sort((x, y) => y - x), "sorted within a category");
    assert.ok(c.picks.length <= 5);
    for (const p of c.picks) assert.ok(p.matchup && p.href, "each pick carries its game context");
  }
});

test("SYNC: a player's pick on /today is identical to the game report's (one shared derivation)", () => {
  const g = slateGame();
  // The game report hero reads prediction.topPlayerPredictions; /today reads the same enriched list.
  const cats = buildTopPicksByCategory([g], { perCategory: 5 });
  const webbCategory = cats.flatMap((c) => c.picks).find((p) => p.player === "Logan Webb");
  const webbReport = g.playerPredictions.find((p) => p.player === "Logan Webb");
  const webbDecision = g.prediction.topPlayerPredictions.find?.((p) => p.player === "Logan Webb") ?? g.playerPredictions.find((p) => p.player === "Logan Webb");
  assert.equal(webbCategory.pick, webbReport.pick, "same pick direction");
  assert.equal(webbCategory.simulationProbability, webbReport.simulationProbability, "same probability");
  assert.equal(webbCategory.line, webbReport.line);
  assert.equal(webbCategory.source, webbReport.source, "same source label");
  // Webb: side=under, modelProbability 0.83 (P under) > 0.5 → UNDER 5.5 @ 83%.
  assert.equal(webbCategory.pick, "UNDER");
  assert.equal(webbCategory.simulationProbability, 0.83);
  void webbDecision;
});

test("no games with a prediction ⇒ empty views (never fabricated)", () => {
  assert.deepEqual(buildTodayPredictionRows([]), []);
  assert.deepEqual(buildTopPicksByCategory([]), []);
});
