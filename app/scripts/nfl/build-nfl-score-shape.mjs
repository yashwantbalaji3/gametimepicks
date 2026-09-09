/**
 * NFL SCORE SHAPE — the lumpy half of the forecast (P251 · F6).
 *
 * WHAT WAS MISSING. The published regular-season forecast is a margin and a total drawn from
 * normals. It answers "who wins and by roughly how much" well — held-out 2025: 64% of winners,
 * 80% intervals covering 80.15% — and it cannot answer the two questions people actually ask about
 * a football game: what is the likeliest final score, and how often does it land on 3 or 7. Its own
 * simulator documents that limitation in the code: "key-number clustering (3/7) NOT modeled".
 *
 * A second artifact already reported `keyNumbers` for the live slate, computed by rounding that
 * same Gaussian — 3 → 6.1%, 7 → 5.4%, 10 → 4.3%, 14 → 3.8%. That is a smooth decay, which is what
 * a rounded normal produces and is not what football does. Publishing it would have dressed the
 * absence of clustering as a measurement of clustering.
 *
 * WHAT THIS DOES. Runs the EVENT-BASED score engine — the one that simulates touchdowns and field
 * goals, so 20-17 and 24-20 fall out naturally — under its regular-season parameter set, once per
 * game, and publishes the shape the Gaussian cannot produce.
 *
 * COHERENCE IS BY CONSTRUCTION, NOT BY LUCK. Two models of the same game that disagree about who
 * wins is the defect this repository has closed twice. So the engine is not run free: for each
 * game the two teams' scoring multipliers are solved so the simulated median margin and median
 * total MATCH the published forecast's. The engine supplies the shape; the published forecast
 * keeps ownership of the centre. A game where the solve cannot land inside tolerance publishes
 * nothing and records why.
 *
 * Usage: node scripts/nfl/build-nfl-score-shape.mjs --now <iso> [--runs 20000]
 * Writes: app/public/data/nfl/score-shape/<date>.json + latest.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { simulateFullGame, REGULAR_SCORING } from "./lib/nfl-score-engine.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (f, d = null) => { const i = process.argv.indexOf(f); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now");
const RUNS = Number(arg("--runs", "20000"));
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const forecasts = read(path.join(APP, "public/data/nfl/forecasts/latest.json"));
if (!forecasts?.forecasts?.length) { console.error("REFUSED: no published forecasts to take the centre from"); process.exit(2); }

/** Tolerance on the solve. A point of margin and a point of total are inside the rounding the
 *  published score line already does; anything wider would let the two disagree visibly. */
const TOL_MARGIN = 1.0;
const TOL_TOTAL = 1.0;

/**
 * Solve the two scoring multipliers so the engine's medians match the published forecast's.
 *
 * `scale` moves both teams together and controls the TOTAL; `tilt` moves them apart and controls
 * the MARGIN. Both are bounded by the engine's own clamp, so a forecast the engine structurally
 * cannot reach is refused rather than forced.
 */
function solveForGame({ gameId, away, home, targetMargin, targetTotal }) {
  let scale = 1;
  let tilt = 0;
  let last = null;
  for (let iter = 0; iter < 14; iter += 1) {
    const homeMult = Math.max(0.6, Math.min(1.6, scale * (1 + tilt)));
    const awayMult = Math.max(0.6, Math.min(1.6, scale * (1 - tilt)));
    const sim = simulateFullGame({
      gameId: `${gameId}::s${scale.toFixed(4)}::t${tilt.toFixed(4)}`,
      awayTeam: away, homeTeam: home, runs: RUNS,
      awayRosterMult: awayMult, homeRosterMult: homeMult,
      params: REGULAR_SCORING,
    });
    const gotMargin = sim.scoreDifferential.median;
    const gotTotal = sim.totalScore.median;
    last = { sim, homeMult, awayMult, gotMargin, gotTotal };
    if (Math.abs(gotMargin - targetMargin) <= TOL_MARGIN && Math.abs(gotTotal - targetTotal) <= TOL_TOTAL) {
      return { ...last, converged: true, iterations: iter + 1 };
    }
    /* Damped secant-free updates: the total responds roughly linearly to `scale`, and the margin
       to `tilt` at about twice the per-team points swing. */
    scale *= 1 + 0.6 * ((targetTotal - gotTotal) / Math.max(12, targetTotal));
    tilt += 0.35 * ((targetMargin - gotMargin) / Math.max(14, targetTotal));
  }
  return { ...last, converged: false, iterations: 14 };
}

const games = [];
const refused = [];
for (const f of forecasts.forecasts) {
  const s = f.forecastSummary;
  if (!s?.margin || !s?.total) {
    refused.push({ providerEventId: f.providerEventId, matchup: f.matchup, reason: "the published forecast carries no margin/total to match" });
    continue;
  }
  const away = f.away?.abbr ?? "AWAY";
  const home = f.home?.abbr ?? "HOME";
  const solved = solveForGame({
    gameId: `nfl-score-shape::${f.providerEventId}::${forecasts.generatedAt}`,
    away, home,
    targetMargin: s.margin.median,
    targetTotal: s.total.median,
  });
  if (!solved.converged) {
    refused.push({
      providerEventId: f.providerEventId, matchup: f.matchup,
      reason: `the event engine could not reproduce the published centre within ±${TOL_MARGIN} margin / ±${TOL_TOTAL} total (reached margin ${solved.gotMargin}, total ${solved.gotTotal} against ${s.margin.median} / ${s.total.median}) — publishing a shape around a different centre would put two answers on one page`,
    });
    continue;
  }
  const sim = solved.sim;
  games.push({
    providerEventId: f.providerEventId,
    canonicalEventId: f.canonicalEventId,
    matchup: f.matchup,
    kickoffUtc: f.kickoffUtc,
    away, home,
    /** The published centre this shape was solved onto — printed so the match can be re-checked. */
    centre: {
      marginMedian: s.margin.median, totalMedian: s.total.median,
      simulatedMarginMedian: sim.scoreDifferential.median, simulatedTotalMedian: sim.totalScore.median,
      iterations: solved.iterations,
    },
    finalScores: sim.finalScores,
    keyNumbers: sim.keyNumbers,
    marginDistribution: sim.scoreDifferential.distribution.filter((b) => b.probability >= 0.001),
    totalDistribution: sim.totalScore.distribution.filter((b) => b.probability >= 0.001),
    teamPointsDistribution: sim.teamPointsDistribution.filter((b) => b.probability >= 0.001),
    scoringRates: sim.scoringRates,
    overtimeProbability: sim.overtimeProbability,
    tieProbability: sim.tieProbability,
  });
}

/**
 * The key-number receipt, measured on the SAME corpus the engine was fitted to and printed beside
 * the model's own numbers. The engine reproduces football's clustering — 3 is by far the biggest
 * number, as it is in reality — and it is not exact: it puts less mass on 3 than the last three
 * regular seasons did, and more on 10. A reader is told that rather than left to assume calibration
 * nobody measured.
 */
const corpus = read(path.join(ROOT, "data/internal/research/nfl/corpus-v1.json"));
const empiricalKey = (() => {
  const rows = (corpus?.rows ?? []).filter((r) => r.phase === 2 && Number.isFinite(r.ftHome) && Number.isFinite(r.ftAway));
  if (rows.length < 100) return null;
  const abs = rows.map((r) => Math.abs(r.ftHome - r.ftAway));
  const at = (k) => Number((abs.filter((m) => m === k).length / abs.length).toFixed(4));
  return {
    sampleGames: rows.length,
    seasons: Object.keys(corpus?.seasons ?? {}).join(", "),
    byNumber: { 3: at(3), 7: at(7), 10: at(10), 14: at(14) },
    share: Number((abs.filter((m) => [3, 7, 10, 14].includes(m)).length / abs.length).toFixed(4)),
  };
})();

const out = {
  schemaVersion: 1,
  artifact: "nfl-score-shape",
  dataClass: "PUBLIC_DERIVED",
  generatedAt: NOW,
  date: forecasts.date,
  runs: RUNS,
  engine: {
    id: REGULAR_SCORING.MODEL_VERSION,
    parameters: { ...REGULAR_SCORING, OT: { ...REGULAR_SCORING.OT } },
    fittedOn: empiricalKey ? `${empiricalKey.sampleGames} regular-season finals (${empiricalKey.seasons})` : null,
    fitCommand: "node scripts/nfl/fit-nfl-score-engine.mjs --phase 2",
    what: "An event-based score simulation — touchdowns and field goals, not a normal draw — so final scores are lumpy the way football's are and margins can cluster on 3 and 7.",
    centreOwner: "The published forecast owns the median margin and median total; this engine is solved onto them and supplies only the SHAPE around that centre.",
  },
  keyNumberAccuracy: empiricalKey,
  eventCount: games.length,
  games,
  refused,
  disclaimer: "Educational and paper-only — not betting advice.",
};

const dir = path.join(APP, "public/data/nfl/score-shape");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `${out.date}.json`), `${JSON.stringify(out, null, 2)}\n`);
fs.writeFileSync(path.join(dir, "latest.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(`nfl-score-shape ${out.date}: ${games.length} games · ${refused.length} refused · ${RUNS.toLocaleString()} runs each`);
for (const g of games.slice(0, 3)) {
  const k = g.keyNumbers.byNumber.map((x) => `${x.number}→${(x.probability * 100).toFixed(1)}%`).join(" ");
  console.log(`  ${g.matchup}  top ${g.away} ${g.finalScores[0].away}–${g.finalScores[0].home} ${g.home}  ·  ${k}`);
}
for (const r of refused) console.log(`  REFUSED ${r.matchup}: ${r.reason}`);
