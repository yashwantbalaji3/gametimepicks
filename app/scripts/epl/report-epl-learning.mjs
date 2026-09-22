/**
 * The EPL learning report — what the ledger says about the model, and about the price beside it.
 *
 * Usage: npx tsx scripts/epl/report-epl-learning.mjs --now <iso> [--write]
 * Writes: data/internal/research/epl/learning/latest.json  (PRIVATE — it contains market data)
 *
 * PRIVATE, and not because the numbers are embarrassing. The comparison is derived from paid odds
 * captures, which never reach a public artifact. What the public page shows is the graded count and
 * the fact that no accuracy claim is being made — see graded-record.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildEplLearningReport } from "../../src/lib/sports/epl/learning-report.mjs";
import { loadEplCorpus } from "../../src/lib/sports/epl/corpus.mjs";
import { EPL_ELO_POISSON_MODEL_ID } from "../../src/lib/sports/epl/elo-poisson.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const WRITE = process.argv.includes("--write");

const LEDGER = path.join(APP, "public/data/soccer/epl/results/graded-forecasts.jsonl");
const rows = fs.existsSync(LEDGER)
  ? fs.readFileSync(LEDGER, "utf8").split("\n").filter((l) => l.trim()).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } })
  : [];

/*
 * v1.7 F2 (G1): WHICH model is live is read from the newest forecast set's own stamp (the builder writes
 * matchModel.modelId from the receipts), falling back to the adopted P304 id. The ledger-wide figures stay,
 * labelled ALL_MODELS; the live model gets its own bucket so a previous model's 36 rows can never read as its record.
 */
const liveModelId = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/epl/forecasts/latest.json"), "utf8")).matchModel?.modelId ?? EPL_ELO_POISSON_MODEL_ID; } catch { return EPL_ELO_POISSON_MODEL_ID; }
})();
const report = buildEplLearningReport(rows, { liveModelId });
const corpus = loadEplCorpus(REPO);

const out = {
  schemaVersion: 1,
  artifact: "epl-learning-report",
  dataClass: "INTERNAL_RESEARCH",
  public: false,
  generatedAt: NOW,
  /* What the model is currently trained on — the other half of "is it learning". */
  corpus: { historical: corpus.base, currentSeason: corpus.current, total: corpus.rows.length, season: corpus.currentSeason },
  ...report,
};

console.log(`epl learning · ${report.sample.graded} graded (all models) · ${report.sample.pairedWithMarket} with a market baseline`);
console.log(`  live model ${report.liveModel.modelId}: ${report.liveModel.n} graded · logLoss ${report.liveModel.logLoss ?? "—"} · by model: ${Object.values(report.byModel).map((b) => `${b.modelId} ${b.n}`).join(", ") || "none"}`);
console.log(`  corpus: ${corpus.base} historical + ${corpus.current} this season = ${corpus.rows.length}`);
console.log(`  model   logLoss ${report.model.logLoss ?? "—"} · brier ${report.model.brier ?? "—"}`);
const p = report.comparison.onPairedMatches;
if (report.sample.pairedWithMarket > 0) {
  console.log(`  vs market on ${report.sample.pairedWithMarket} paired: model ${p.model.logLoss} · market ${p.market.logLoss} · delta ${p.logLossDelta}`);
}
console.log(`  comparison: ${report.comparison.state} — ${report.comparison.detail}`);
console.log(`  stopping rule: ${report.stoppingRule.state} — ${report.stoppingRule.detail}`);

if (!WRITE) { console.log("dry run — pass --write to persist."); process.exit(0); }
const dir = path.join(REPO, "data/internal/research/epl/learning");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "latest.json"), `${JSON.stringify(out, null, 1)}\n`);
console.log("wrote data/internal/research/epl/learning/latest.json");
