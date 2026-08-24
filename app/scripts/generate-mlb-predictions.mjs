/**
 * generate-mlb-predictions.mjs — the daily PREDICTION artifact generator (Sprint 009).
 *
 *   npx tsx app/scripts/generate-mlb-predictions.mjs --date 2026-07-24 [--write] [--now ISO]
 *
 * Runs the ONE canonical decision engine over the Sprint 008 full-game artifact (+ the legacy prop picks for
 * player predictions) and writes an immutable, gradeable pregame prediction artifact to
 * public/data/mlb/predictions/<date>.json. The market line is used ONLY as the threshold + a comparison — it
 * never determines a prediction's direction. This artifact is for product/results evaluation only; it is
 * NEVER settled into the 19–14 money record, Bank Builder, Moonshot, or portfolio.
 *
 * Default is a DRY RUN (prints the 15-game matrix). Pass --write to persist.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildGamePredictionDecision, DECISION_ENGINE_VERSION } from "../src/lib/mlb/prediction/decision.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(APP, "public", "data");
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const date = arg("--date") ?? new Date().toISOString().slice(0, 10);
const write = process.argv.includes("--write");
const nowIso = arg("--now") ?? new Date().toISOString();
const readJson = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8")); } catch { return null; } };

const fullGame = readJson(`mlb/full-game-simulations/${date}.json`);
if (!fullGame || !Array.isArray(fullGame.games)) {
  console.log(`[predictions] no full-game artifact for ${date} — nothing to build (honest no-op).`);
  process.exit(0);
}
// Legacy prop picks (for player predictions), joined by gamePk.
const gameSims = readJson(`mlb/game-simulations/${date}.json`);
const picksByGamePk = new Map();
if (gameSims && Array.isArray(gameSims.games)) {
  for (const g of gameSims.games) {
    picksByGamePk.set(String(g.gamePk), (g.generatedPicks ?? [])
      .filter((p) => p.player != null && p.line != null && typeof p.modelProbability === "number")
      .map((p) => ({ player: String(p.player), team: p.team ?? null, market: p.market, marketLabel: p.marketLabel ?? null, line: Number(p.line), side: p.side === "under" ? "under" : "over", modelProbability: p.modelProbability, marketProbability: p.marketProbability ?? null })));
  }
}

const predictions = fullGame.games.map((g) => buildGamePredictionDecision(g, picksByGamePk.get(String(g.gamePk)) ?? null));

const artifact = {
  sport: "mlb",
  date,
  generatedAt: nowIso,
  decisionEngineVersion: DECISION_ENGINE_VERSION,
  sourceArtifact: `full-game-simulations/${date}.json`,
  notBettingAdvice: true,
  settledIntoMoney: false,
  predictions,
};

// ── 15-game matrix ────────────────────────────────────────────────────────────────────────────
console.log(`\n=== MLB PREDICTION MATRIX ${date} · ${DECISION_ENGINE_VERSION} ===`);
console.log("game                         status     ML     score   total        run line      players");
for (const p of predictions) {
  if (p.status === "unavailable") { console.log(`${p.slug.padEnd(28)} UNAVAILABLE — ${p.unavailableReasons[0] ?? ""}`); continue; }
  const tot = p.total.pick === "UNAVAILABLE" ? "n/a" : `${p.total.pick} ${p.total.line}`;
  console.log(
    `${p.slug.padEnd(28)} ${p.status.toUpperCase().padEnd(9)} ${p.predictedWinner.team.padEnd(5)} ` +
      `${p.awayTeam} ${p.projectedScore.away}-${p.projectedScore.home} ${p.homeTeam}`.padEnd(15) +
      ` ${tot.padEnd(11)} ${(p.runLine?.pick ?? "n/a").padEnd(12)} ${p.topPlayerPredictions.length}`,
  );
}
const ready = predictions.filter((p) => p.status === "ready").length;
const degraded = predictions.filter((p) => p.status === "degraded").length;
const unavailable = predictions.filter((p) => p.status === "unavailable").length;
console.log(`\n${predictions.length} games · ${ready} READY · ${degraded} DEGRADED · ${unavailable} UNAVAILABLE`);

if (write) {
  const outDir = path.join(DATA, "mlb", "predictions");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${date}.json`), JSON.stringify(artifact, null, 2));
  console.log(`\n✓ wrote public/data/mlb/predictions/${date}.json (pregame, gradeable, NOT settled into money)`);
  /*
   * IMMUTABLE PER-RUN SNAPSHOT (P196 · Release B1). The dated file above is a MOVING POINTER — it
   * regenerates as lineups post, and its final committed state can postdate the slate (2026-08-22's
   * was written at 02:08 the next day). The game-level grader needs the newest revision that
   * PRE-DATES each first pitch, and in CI (shallow clone) git history cannot supply it. So every
   * run also writes a snapshot that is never rewritten: same artifact, frozen. Internal only — the
   * public export never carries it, and the grader is its one consumer.
   */
  const snapDir = path.join(APP, "..", "data", "internal", "mlb", "prediction-snapshots", date);
  const stamp = nowIso.replace(/[-:T]/g, "").slice(0, 12); // YYYYMMDDHHMM
  const snapPath = path.join(snapDir, `snapshot-${stamp}.json`);
  if (fs.existsSync(snapPath)) {
    console.log(`  snapshot ${path.basename(snapPath)} already exists — left untouched (immutable)`);
  } else {
    fs.mkdirSync(snapDir, { recursive: true });
    fs.writeFileSync(snapPath, JSON.stringify(artifact, null, 2));
    console.log(`  ✓ froze data/internal/mlb/prediction-snapshots/${date}/${path.basename(snapPath)}`);
  }
} else {
  console.log(`\n(dry run — pass --write to persist)`);
}
