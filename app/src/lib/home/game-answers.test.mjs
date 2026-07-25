/**
 * HOMEPAGE GAME ANSWER GUARDS (Sprint 015 · Phase 1).
 *
 * The homepage may now state what a simulation concluded. These tests pin that it only ever RESTATES the
 * canonical objects: the probability comes from the prediction, the score from the artifact, the story from
 * the one story layer — and that missing data yields nulls (the card degrades to what it showed before)
 * rather than an invented answer.
 *
 * Run: npx tsx --test src/lib/home/game-answers.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildHomeGameAnswer, buildHomeGameAnswers } from "./game-answers.ts";
import { buildSimulationStory } from "../mlb/prediction/story.ts";

const bin = (value, probability) => ({ value, label: String(value), count: 0, probability });

const SIM = {
  slug: "laa-vs-sf-2026-07-24",
  awayTeam: "LAA",
  homeTeam: "SF",
  status: "ready",
  runCount: 10000,
  winProbability: { away: 0.42, home: 0.58 },
  finalScores: [{ away: 3, home: 4, probability: 0.037 }],
  runDifferential: { mean: 0.4, median: 1, p10: -4, p90: 5, distribution: [bin(-1, 0.12), bin(0, 0), bin(1, 0.19)] },
  totalRuns: null,
  extraInningsProbability: 0.11,
  gameStory: [],
};

const PREDICTION = { moneyline: { team: "SF", simulationProbability: 0.582 }, topPlayerPredictions: [] };

const SOURCE = { slug: "laa-vs-sf-2026-07-24", fullGameSim: SIM, prediction: PREDICTION };

test("every field restates a canonical value", () => {
  const a = buildHomeGameAnswer(SOURCE);
  assert.equal(a.prediction, "SF wins 58% of simulations", "0.582 rounds to 58, team from the prediction");
  assert.equal(a.frequency, "5,820 / 10,000 simulations", "0.582 × 10,000");
  assert.equal(a.mostLikelyScore, "LAA 3 – SF 4", "away-first, from finalScores[0]");
  // 0.12 + 0 + 0.19 = 31%, which clears CLOSE_GAME_THRESHOLD, so the story carries the qualifying lead.
  assert.equal(a.story, "This matchup is relatively close: 31% of simulations finish within one run.");
});

test("the story line comes from the ONE story layer, not a second phrasing", () => {
  const a = buildHomeGameAnswer(SOURCE);
  const beat = buildSimulationStory(SIM, PREDICTION).find((b) => b.kind === "closeness");
  assert.equal(a.story, beat.text, "identical text — the homepage cannot word it differently");
  // It must NOT repeat the winner or the score, which are their own fields on the card.
  assert.ok(!a.story.includes("wins"), "story adds uncertainty, it does not restate the prediction");
});

test("missing canonical objects yield nulls — never an invented answer", () => {
  const noPred = buildHomeGameAnswer({ ...SOURCE, prediction: null });
  assert.equal(noPred.prediction, null, "no prediction → no winner claim");
  assert.equal(noPred.frequency, null, "and no frequency to go with it");
  assert.equal(noPred.mostLikelyScore, "LAA 3 – SF 4", "but the artifact's own score survives");

  const noScores = buildHomeGameAnswer({ ...SOURCE, fullGameSim: { ...SIM, finalScores: [] } });
  assert.equal(noScores.mostLikelyScore, null);

  const noDist = buildHomeGameAnswer({ ...SOURCE, fullGameSim: { ...SIM, runDifferential: null } });
  assert.equal(noDist.story, null);

  for (const bad of [
    { ...SOURCE, fullGameSim: null },
    { ...SOURCE, fullGameSim: { ...SIM, status: "unavailable" } },
    { ...SOURCE, fullGameSim: { ...SIM, runCount: 0 } },
  ]) {
    const a = buildHomeGameAnswer(bad);
    assert.deepEqual(
      { p: a.prediction, f: a.frequency, s: a.mostLikelyScore, st: a.story },
      { p: null, f: null, s: null, st: null },
      "an unsimulated game states nothing at all",
    );
  }
});

test("indexed by slug, deterministic", () => {
  const map = buildHomeGameAnswers([SOURCE, { slug: "bare", fullGameSim: null, prediction: null }]);
  assert.deepEqual(Object.keys(map).sort(), ["bare", "laa-vs-sf-2026-07-24"]);
  assert.equal(map["bare"].prediction, null);
  assert.deepEqual(buildHomeGameAnswers([SOURCE]), buildHomeGameAnswers([SOURCE]));
});

test("real slate: the homepage's answer equals the game's own canonical values", () => {
  const simDir = path.join(process.cwd(), "public", "data", "mlb", "full-game-simulations");
  const predDir = path.join(process.cwd(), "public", "data", "mlb", "predictions");
  const files = fs.existsSync(simDir) ? fs.readdirSync(simDir).filter((f) => f.endsWith(".json")) : [];
  assert.ok(files.length > 0, "a shipped simulation artifact exists");
  let checked = 0;

  for (const f of files) {
    const sims = JSON.parse(fs.readFileSync(path.join(simDir, f), "utf8"));
    const predPath = path.join(predDir, f);
    const preds = fs.existsSync(predPath) ? JSON.parse(fs.readFileSync(predPath, "utf8")).predictions ?? [] : [];

    for (const g of sims.games ?? []) {
      const prediction = preds.find((p) => p.gamePk === g.gamePk) ?? null;
      const a = buildHomeGameAnswer({ slug: g.slug, fullGameSim: g, prediction });

      if (g.status === "unavailable" || g.runCount <= 0) {
        assert.equal(a.prediction, null, `${g.slug}: unsimulated game must claim nothing`);
        continue;
      }
      if (prediction?.moneyline) {
        const pct = Math.round(prediction.moneyline.simulationProbability * 100);
        assert.ok(a.prediction.includes(`${pct}%`), `${g.slug}: probability must match the prediction object`);
        assert.ok(a.prediction.startsWith(prediction.moneyline.team), `${g.slug}: wrong team`);
      }
      if (g.finalScores?.[0]) {
        const t = g.finalScores[0];
        assert.equal(a.mostLikelyScore, `${g.awayTeam} ${t.away} – ${g.homeTeam} ${t.home}`);
      }
      for (const w of ["edge", "value", "lock", "profitable", "guaranteed"]) {
        const all = `${a.prediction ?? ""} ${a.frequency ?? ""} ${a.mostLikelyScore ?? ""} ${a.story ?? ""}`;
        assert.ok(!new RegExp(`\\b${w}\\b`, "i").test(all), `${g.slug}: banned word "${w}"`);
      }
      checked += 1;
    }
  }
  assert.ok(checked > 0, "exercised real games");
});
