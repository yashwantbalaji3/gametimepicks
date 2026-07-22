/**
 * mlb-simulation-readiness.mjs — INTERNAL daily readiness report toward the research gate. Aggregates the archive
 * status + quality + benchmark into a single view: dates X/30, settled X/500, feature/market/lineup coverage %,
 * and a SIMULATION READINESS % (composite). It NEVER says "model ready" — modeling stays BLOCKED until the gate
 * passes AND the founder approves. Writes status/simulation-readiness.json (public:false). No model, no prediction.
 *
 *   node app/scripts/mlb-simulation-readiness.mjs
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const ARCH = path.join(REPO, "data/internal/mlb/pregame-archive");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const pct = (n, d) => (d ? +(100 * Math.min(1, n / d)).toFixed(1) : 0);

function main() {
  const latest = readJson(path.join(ARCH, "status", "latest.json")) || {};
  const quality = readJson(path.join(ARCH, "status", "research-quality.json")) || {};
  const benchmark = readJson(path.join(ARCH, "status", "benchmark.json")) || {};
  const sj = latest.settlementJoins || {};
  const cov = latest.coverageByFamilyPct || {};

  const dates = latest.datesCollected ?? 0;
  const settled = sj.settledEligibleRows ?? 0;
  const datesPct = pct(dates, 30);
  const settledPct = pct(settled, 500);
  // feature readiness = mean of the headline family coverage %; lineup + market surfaced separately
  const famVals = ["pitcher_status", "environment", "umpire", "confirmed_lineup"].map((f) => cov[f] ?? 0);
  const featureCoveragePct = +(famVals.reduce((a, b) => a + b, 0) / famVals.length).toFixed(1);
  const lineupCoveragePct = cov.confirmed_lineup ?? 0;
  const marketCoveragePct = (sj.joinRows ?? 0) > 0 ? 100 : 0; // markets are captured (leans carried); settled is the gate
  // composite readiness = the BINDING constraint (settled data) — never inflated by feature coverage alone
  const dataReadinessPct = Math.min(datesPct, settledPct);
  const simulationReadinessPct = dataReadinessPct; // the gate is data-bound; features are necessary, not sufficient

  const report = {
    public: false, approvedForProduction: false, productEligible: false, kind: "mlb-simulation-readiness",
    gate: { dates: `${dates}/30`, settledObservations: `${settled}/500`, datesPct, settledPct, met: dates >= 30 && settled >= 500 },
    coverage: { featureCoveragePct, lineupCoveragePct, marketCoveragePct, byFamily: cov },
    dataQuality: quality.overall ?? "unknown",
    benchmark: benchmark.status ? benchmark.status.slice(0, 80) : "not run",
    simulationReadinessPct,
    modelingStatus: "BLOCKED — modeling is not permitted until the research gate passes AND the founder approves. Feature coverage being high does NOT make a model ready.",
  };
  fs.mkdirSync(path.join(ARCH, "status"), { recursive: true });
  fs.writeFileSync(path.join(ARCH, "status", "simulation-readiness.json"), JSON.stringify(report, null, 2));

  console.log(`\n=== MLB SIMULATION READINESS (gate monitor) ===`);
  console.log(`dates:            ${report.gate.dates}  (${datesPct}%)`);
  console.log(`settled obs:      ${report.gate.settledObservations}  (${settledPct}%)   <- BINDING CONSTRAINT`);
  console.log(`feature coverage: ${featureCoveragePct}%  · lineup ${lineupCoveragePct}%  · market ${marketCoveragePct}%`);
  console.log(`data quality:     ${report.dataQuality}`);
  console.log(`SIMULATION READINESS: ${simulationReadinessPct}%   —   modeling ${report.gate.met ? "GATE MET (await founder approval)" : "BLOCKED"}`);
  console.log(`report → ${path.relative(REPO, path.join(ARCH, "status", "simulation-readiness.json"))}`);
}
main();
