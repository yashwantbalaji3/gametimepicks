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

const report = buildEplLearningReport(rows);
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

console.log(`epl learning · ${report.sample.graded} graded · ${report.sample.pairedWithMarket} with a market baseline`);
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
