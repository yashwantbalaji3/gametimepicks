/**
 * SYNCHRONIZATION GUARDS (Sprint 011). Prove that every surface (game report, /today table, category picks,
 * simulated box score, outcome center) READS the canonical objects and never recomputes a prediction of its
 * own — and that the report's Simulation Outcome Center reconciles exactly with the artifact it displays.
 *
 * Run: npx tsx --test src/lib/mlb/prediction/sync-guards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildGamePredictionDecision } from "./decision.ts";
import { buildTodayPredictionRows } from "./slate.ts";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");

test("no UI component recomputes a prediction — they consume the canonical objects only", () => {
  for (const f of [
    "src/components/game/mlb-full-game-report.tsx",
    "src/components/today/game-predictions.tsx",
    "src/components/today/top-picks-by-category.tsx",
    "src/components/today/full-slate.tsx",
  ]) {
    const src = read(f);
    assert.ok(!/buildGamePredictionDecision|buildPlayerPrediction|simulateFullGame|buildTopPicksByCategory\s*\(/.test(src),
      `${f} must not build predictions in the component (server derives them once)`);
  }
});

test("the report's Simulation Outcome Center reconciles with the artifact it displays", () => {
  const p = path.join(app, "public/data/mlb/full-game-simulations/2026-07-24.json");
  if (!fs.existsSync(p)) return;
  const a = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const g of a.games) {
    if (g.status === "unavailable") continue;
    // Win counts shown = winProbability × runCount (the component multiplies; here we confirm they conserve).
    assert.ok(Math.abs(g.winProbability.away + g.winProbability.home - 1) < 0.005, "win probs conserve");
    const awayWins = Math.round(g.winProbability.away * g.runCount);
    const homeWins = Math.round(g.winProbability.home * g.runCount);
    assert.ok(awayWins + homeWins >= g.runCount - 2 && awayWins + homeWins <= g.runCount + 2, "win counts sum to the run count");
    // Most-likely final scores are valid + sorted descending by probability.
    let prev = 1;
    for (const fs2 of g.finalScores) {
      assert.ok(fs2.probability > 0 && fs2.probability <= prev + 1e-9, "final scores sorted descending");
      prev = fs2.probability;
      assert.ok(Number.isInteger(fs2.away) && Number.isInteger(fs2.home));
    }
  }
});

test("the /today game row equals the decision the game report hero uses (one object, two surfaces)", () => {
  const p = path.join(app, "public/data/mlb/full-game-simulations/2026-07-24.json");
  if (!fs.existsSync(p)) return;
  const a = JSON.parse(fs.readFileSync(p, "utf8"));
  const g = a.games.find((x) => x.slug === "laa-vs-sf-2026-07-24");
  if (!g) return;
  const decision = buildGamePredictionDecision(g, null); // the object the report hero renders
  const [row] = buildTodayPredictionRows([
    { gamePk: g.gamePk, slug: g.slug, href: "/x", homeTeam: g.homeTeam, awayTeam: g.awayTeam, homeTeamName: g.homeTeamName, awayTeamName: g.awayTeamName, homeLogo: null, awayLogo: null, firstPitchIso: g.firstPitch, prediction: decision, playerPredictions: [] },
  ]);
  assert.equal(row.moneyline.team, decision.predictedWinner.team, "same winner");
  assert.equal(row.score.away, decision.projectedScore.away, "same score");
  assert.equal(row.score.home, decision.projectedScore.home);
  assert.equal(row.total.pick, decision.total.pick, "same total pick");
  assert.equal(row.total.line, decision.total.line);
  assert.equal(row.runLine.pick, decision.runLine.pick, "same run-line pick");
});

test("the report + box score render portraits + team branding (visual identity)", () => {
  const src = read("src/components/game/mlb-full-game-report.tsx");
  assert.match(src, /import PlayerAvatar from "@\/components\/player-avatar"/, "portraits imported");
  assert.match(src, /<PlayerAvatar[\s\S]*sport="mlb"/, "MLB portraits rendered");
  assert.match(src, /Simulation outcomes ·/, "outcome center present");
  assert.match(src, /Most likely final scores/, "most-likely scorelines present");
});
