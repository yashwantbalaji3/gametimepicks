/**
 * EPL matchday HISTORICAL_REPLAY through the SHARED runner (Program 149 · Release 1 proof).
 *
 * Re-derives a matchday's three-way predictions with the shared harness owning cutoff enforcement,
 * quarantine, mode stamping and determinism — the same Poisson mathematics as the standalone
 * scoreline script, now flowing through the contract every future sport adapter must satisfy.
 * Actual results are joined AFTER the runner emits (validation is bookkeeping about a replay, not
 * an input to it).
 *
 * Run: node scripts/epl/replay-epl-matchday.mjs --season 2025-26 --matchday 38 --now 2026-08-09T22:30:00Z
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runReplay } from "../../src/lib/sports/research/replay-runner.mjs";
import { fitPoisson, predictFixture } from "../../src/lib/soccer/epl-poisson.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..", "data", "internal", "research", "epl");

const arg = (name, fb = null) => { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const NOW = arg("--now"), SEASON = arg("--season", "2025-26"), MD = Number(arg("--matchday", "38"));
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "corpus-v1.json"), "utf8"));
const slateRows = corpus.rows.filter((m) => m.season === SEASON && m.matchday === MD);
if (!slateRows.length) { console.error(`REFUSED: no rows for ${SEASON} MD${MD}`); process.exit(1); }
const cutoffIso = `${slateRows.map((m) => m.dateUtc).sort()[0].slice(0, 10)}T00:00:00Z`;

const adapter = {
  sport: "epl",
  trainingRows: () => corpus.rows.map((m) => ({ ...m, eventKey: `${m.season}:${m.home} v ${m.away}` })),
  slate: () => slateRows.map((m) => ({ eventKey: `${m.home} v ${m.away}`, dateUtc: m.dateUtc, home: m.home, away: m.away })),
  fit: (rows) => fitPoisson(rows),
  predict: (fit, ev) => {
    const p = predictFixture(fit, ev.home, ev.away);
    return { probs: p.threeWay, lambdas: p.lambdas, over25: p.over25, topScorelines: p.topScorelines, coldStart: p.coldStart };
  },
};

const artifact = runReplay({ sportAdapter: adapter, cutoffIso, targetMarket: "match_result_1x2", nowIso: NOW });

// Validation join — settled history beside the replay, misses visible by construction.
const byKey = Object.fromEntries(slateRows.map((m) => [`${m.home} v ${m.away}`, m]));
artifact.validation = artifact.predictions.map((p) => {
  const m = byKey[p.eventKey];
  return {
    eventKey: p.eventKey,
    actualScore: `${m.ftHome}-${m.ftAway}`,
    actualResult: m.result,
    modelProbOfActualResult: Number(p.probs[m.result].toFixed(4)),
  };
});

fs.mkdirSync(path.join(ROOT, "replays"), { recursive: true });
const file = `replay-${SEASON}-md${MD}.json`;
fs.writeFileSync(path.join(ROOT, "replays", file), JSON.stringify(artifact, null, 1));
const hits = artifact.validation.filter((v) => {
  const p = artifact.predictions.find((x) => x.eventKey === v.eventKey);
  return ["H", "D", "A"].sort((a, b) => p.probs[b] - p.probs[a])[0] === v.actualResult;
}).length;
console.log(`${file}: mode ${artifact.mode}, id ${artifact.deterministicId}, training ${artifact.trainingCount}, quarantined ${artifact.quarantinedCount}, top-class ${hits}/${artifact.predictions.length}`);
