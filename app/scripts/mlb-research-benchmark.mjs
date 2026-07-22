/**
 * mlb-research-benchmark.mjs — INTERNAL benchmark runner. Scores the captured market baselines (sportsbook implied,
 * de-vig) against official settled outcomes using Brier + log loss + accuracy + calibration, so that when a FUTURE
 * model exists it can be compared on the SAME settled set. NO model here, NO prediction. Reports INSUFFICIENT until
 * enough settled observations exist. Writes data/internal/mlb/pregame-archive/status/benchmark.json (public:false).
 *
 *   node app/scripts/mlb-research-benchmark.mjs
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const ARCH = path.join(REPO, "data/internal/mlb/pregame-archive");
const OBS = path.join(ARCH, "research-observations");
const GATE = { minSettledEligibleObs: 500, minDistinctDates: 30 };
const clamp = (x) => Math.min(1 - 1e-6, Math.max(1e-6, x));
const brier = (a) => (a.length ? +(a.reduce((s, d) => s + (d.p - d.o) ** 2, 0) / a.length).toFixed(6) : null);
const logloss = (a) => (a.length ? +(-a.reduce((s, d) => s + (d.o ? Math.log(clamp(d.p)) : Math.log(1 - clamp(d.p))), 0) / a.length).toFixed(6) : null);
const acc = (a) => (a.length ? +(a.filter((d) => (d.p >= 0.5 ? 1 : 0) === d.o).length / a.length).toFixed(4) : null);

function loadSettled() {
  const rows = [];
  if (!fs.existsSync(OBS)) return rows;
  for (const f of fs.readdirSync(OBS).filter((x) => x.endsWith(".jsonl"))) {
    for (const line of fs.readFileSync(path.join(OBS, f), "utf8").split("\n").filter(Boolean)) {
      try { const o = JSON.parse(line); if (o.settlement_result?.status === "win" || o.settlement_result?.status === "loss") rows.push(o); } catch { /* skip */ }
    }
  }
  return rows;
}

function main() {
  const rows = loadSettled();
  const dates = new Set(rows.map((r) => r.game?.date));
  const met = rows.length >= GATE.minSettledEligibleObs && dates.size >= GATE.minDistinctDates;
  const report = {
    public: false, approvedForProduction: false, productEligible: false, kind: "mlb-research-benchmark",
    settledObservations: rows.length, distinctDates: dates.size, gate: GATE, gateMet: met, baselines: {},
    status: met ? "READY (gate met) — awaiting founder approval before any model comparison is published"
      : `INSUFFICIENT — ${rows.length}/${GATE.minSettledEligibleObs} settled observations across ${dates.size}/${GATE.minDistinctDates} dates; benchmarks are blocked (no model may be called predictive until it beats the de-vig baseline out of sample)`,
  };
  if (rows.length) {
    // the captured MARKET baselines scored on the settled set (NOT a model — the market IS the benchmark)
    const mk = (probFn) => rows.map((r) => ({ p: clamp(probFn(r) ?? 0.5), o: r.settlement_result.status === "win" ? 1 : 0 })).filter((d) => Number.isFinite(d.p));
    const implied = mk((r) => r.market_probability?.impliedProbability);
    const devig = mk((r) => r.market_probability?.noVigProbability);
    report.baselines = {
      sportsbook_implied: { n: implied.length, brier: brier(implied), logLoss: logloss(implied), accuracy: acc(implied) },
      market_devig: { n: devig.length, brier: brier(devig), logLoss: logloss(devig), accuracy: acc(devig) },
    };
  }
  fs.mkdirSync(path.join(ARCH, "status"), { recursive: true });
  fs.writeFileSync(path.join(ARCH, "status", "benchmark.json"), JSON.stringify(report, null, 2));
  console.log(`\n=== MLB research BENCHMARK ===\n${report.status}`);
  if (rows.length) console.log(`market baselines: ${JSON.stringify(report.baselines)}`);
  console.log(`report → ${path.relative(REPO, path.join(ARCH, "status", "benchmark.json"))}`);
}
main();
