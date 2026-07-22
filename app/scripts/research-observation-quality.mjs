/**
 * research-observation-quality.mjs — the OBSERVATION-LEVEL quality gate (Phase 6). Reads the assembled
 * research-observations/*.jsonl and hard-checks that the materialized dataset is clean before any research uses it:
 *   duplicate observationIds · pending/missing outcomes · future timestamps · pregame leakage · impossible stats.
 * Missing de-vig market probability is a COVERAGE warning (honest null, not a block). Emits PASS or BLOCKED.
 *
 * Complements monitor-mlb-research-quality.mjs (which checks the upstream settlement JOINS). Read-only over the
 * warehouse; writes one internal status file. NO modeling, NO money. Output: status/research-observation-quality.json.
 *
 *   node app/scripts/research-observation-quality.mjs
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const OBS_DIR = path.join(REPO, "data/internal/mlb/pregame-archive/research-observations");
const STATUS = path.join(REPO, "data/internal/mlb/pregame-archive/status");
const SETTLED = new Set(["win", "loss", "push"]);
// Physical [min,max] range of the OFFICIAL actual per market for a single game (impossible-stat backstop; a value
// outside = corrupt box score). Player props are non-negative counting stats. Team-market actuals are box-score
// values the settlement grades against a line: totals = total runs (≥0), spreads = run differential (SIGNED),
// h2h = win margin (signed). Bounds are generous — they catch corruption, not legitimate blowouts.
const ACTUAL_RANGE = {
  batter_hits: [0, 7], batter_total_bases: [0, 18], batter_home_runs: [0, 6], batter_rbis: [0, 12], batter_runs_scored: [0, 6], batter_hits_runs_rbis: [0, 20],
  pitcher_strikeouts: [0, 21], pitcher_outs: [0, 30], pitcher_earned_runs: [0, 20],
  h2h: [-40, 40], spreads: [-40, 40], totals: [0, 40],
};

function main() {
  const now = Date.now();
  let files = [];
  try { files = fs.readdirSync(OBS_DIR).filter((f) => f.endsWith(".jsonl")); } catch { /* none */ }

  const violations = { duplicateIds: [], notSettled: [], missingOutcome: [], futureTimestamp: [], leakage: [], impossibleStat: [] };
  const warnings = { missingMarketProbability: 0 };
  const ids = new Set();
  let total = 0, withMarketProb = 0, coverageSum = 0;
  const byDate = {};

  for (const f of files) {
    const date = f.replace(/\.jsonl$/, "");
    byDate[date] = (byDate[date] || 0);
    for (const line of fs.readFileSync(path.join(OBS_DIR, f), "utf8").split("\n")) {
      if (!line.trim()) continue;
      let o; try { o = JSON.parse(line); } catch { continue; }
      total++; byDate[date]++;
      const id = o.observationId;
      if (id) { if (ids.has(id)) violations.duplicateIds.push(id); else ids.add(id); }
      const st = o.settlement_result?.status;
      if (!SETTLED.has(st)) violations.notSettled.push({ id, status: st ?? null });
      if (o.actual_outcome?.actual == null) violations.missingOutcome.push({ id, market: o.market?.key });
      // timestamps
      const cap = o.market_probability?.capturedAt || o.captureTimestamp;
      const est = o.game?.eventStartTime;
      if (cap && Date.parse(cap) > now) violations.futureTimestamp.push({ id, capturedAt: cap });
      if (cap && est && Date.parse(cap) >= Date.parse(est)) violations.leakage.push({ id, capturedAt: cap, eventStartTime: est });
      // impossible official stat
      const a = o.actual_outcome?.actual, rng = ACTUAL_RANGE[o.market?.key];
      if (typeof a === "number" && rng && (a < rng[0] || a > rng[1])) violations.impossibleStat.push({ id, market: o.market?.key, actual: a, allowedRange: rng });
      // coverage / market-prob presence
      if (typeof o.coverageScore === "number") coverageSum += o.coverageScore;
      if (o.market_probability?.noVigProbability != null) withMarketProb++; else warnings.missingMarketProbability++;
    }
  }

  const hardCounts = Object.fromEntries(Object.entries(violations).map(([k, v]) => [k, v.length]));
  const hardTotal = Object.values(hardCounts).reduce((a, b) => a + b, 0);
  const status = total === 0 ? "EMPTY" : hardTotal === 0 ? "PASS" : "BLOCKED";

  const report = {
    public: false, approvedForProduction: false, productEligible: false, kind: "mlb-research-observation-quality",
    lastUpdated: new Date().toISOString(),
    status,
    totalObservations: total, dates: Object.keys(byDate).length, byDate,
    hardViolations: hardCounts,
    warnings: { ...warnings, marketProbabilityCoveragePct: total ? +(100 * withMarketProb / total).toFixed(1) : null },
    averageCoverageScore: total ? +(coverageSum / total).toFixed(3) : null,
    // sample up to 5 offenders per hard category so a BLOCKED report is actionable
    samples: Object.fromEntries(Object.entries(violations).map(([k, v]) => [k, v.slice(0, 5)])),
    note: "Hard checks (duplicate IDs, pending/missing outcomes, future timestamps, pregame leakage, impossible stats) must all be 0 to PASS. Missing de-vig market probability is a COVERAGE warning, not a block (honest null; those rows are excluded from market-baseline benchmarking). PASS does NOT imply model-readiness — the 30-date/500-observation gate + founder approval still govern modeling.",
  };
  fs.mkdirSync(STATUS, { recursive: true });
  fs.writeFileSync(path.join(STATUS, "research-observation-quality.json"), JSON.stringify(report, null, 2));

  console.log(`\n=== RESEARCH OBSERVATION QUALITY ===`);
  console.log(`  observations: ${total}  ·  dates: ${report.dates}  ·  avg coverage: ${report.averageCoverageScore ?? "-"}`);
  console.log(`  hard violations: ${JSON.stringify(hardCounts)}`);
  console.log(`  market-prob coverage: ${report.warnings.marketProbabilityCoveragePct ?? "-"}%  (missing = honest null, not a block)`);
  console.log(`  STATUS: ${status}`);
  console.log(`  → data/internal/mlb/pregame-archive/status/research-observation-quality.json`);
  process.exit(status === "BLOCKED" ? 1 : 0);
}
const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main();
