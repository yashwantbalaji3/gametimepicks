/**
 * audit-mlb-calibration.mjs — READ-ONLY MLB calibration analysis.
 *
 * Reads the COMMITTED per-date grading ledger (public/data/mlb/results/comparison_report_*.json — the
 * money-independent model-performance record graded vs official box scores) and prints calibration
 * tables the founder can act on:
 *
 *   • by market      — hit rate + sample per prop market, with a candidate reliability weight.
 *   • by confidence  — hit rate per tier, and a LOUD warning when the tiers are non-monotonic/inverted
 *                      (i.e. "High" confidence does not out-hit "Low").
 *   • by edge bucket — an EXTREMES-ONLY subsample (only the per-date top hits + biggest misses carry a
 *                      per-prop edge in the committed reports), so it is explicitly flagged as
 *                      non-representative — it cannot measure calibration, only flag the data gap.
 *   • candidate reliability weights — a market→weight suggestion for a FUTURE hybrid blend. NOTHING is
 *                      written and NO public recommendation is changed; this is analysis only.
 *
 * This is a JS-native companion to pipeline/calibration_report.py — it needs no Python and reads only
 * the deployed JSON, so any operator can run it. It NEVER touches money or writes any file.
 *
 * Usage:  npx tsx scripts/audit-mlb-calibration.mjs [--json]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const DIR = path.join(ROOT, "public", "data", "mlb", "results");
const AS_JSON = process.argv.includes("--json");

/** Sum wins/losses into a keyed accumulator. */
function addWL(acc, key, wins, losses) {
  acc[key] = acc[key] || { wins: 0, losses: 0 };
  acc[key].wins += wins || 0;
  acc[key].losses += losses || 0;
}

/** hitRate + n from a {wins,losses} bucket (decisive only; pushes already excluded upstream). */
function rate(b) {
  const n = b.wins + b.losses;
  return { n, hitRate: n > 0 ? b.wins / n : 0 };
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));

/**
 * Candidate reliability weight for a market in [0,1] — how much a FUTURE blend should trust the model
 * on this market. Centered at 0.5 (coin flip ⇒ defer fully to the market), scaled by the settled edge
 * over 50%. Thin samples are held near neutral. This is a PROPOSAL input, never a live weight.
 */
function candidateReliability(hitRate, n) {
  if (n < 200) return { weight: 0.3, note: "thin sample — hold near market" };
  const w = clamp01(0.5 + (hitRate - 0.5) * 4); // 53.8%→~0.65, 50%→0.5, 44%→~0.26
  const note = hitRate >= 0.53 ? "model adds signal" : hitRate <= 0.485 ? "net-negative — defer to market / avoid" : "≈ coin flip — lean market";
  return { weight: Number(w.toFixed(2)), note };
}

function main() {
  if (!fs.existsSync(DIR)) {
    console.error(`[audit-mlb-calibration] no grading ledger at ${DIR}`);
    process.exit(1);
  }
  const files = fs.readdirSync(DIR).filter((f) => /^comparison_report_\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (files.length === 0) {
    console.error("[audit-mlb-calibration] no comparison_report_*.json files found");
    process.exit(1);
  }

  const byMarket = {};
  const byConf = {};
  const edge = {}; // EXTREMES-ONLY, non-representative
  let decisive = 0;

  for (const f of files) {
    let r;
    try { r = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { continue; }
    decisive += r.decisive || 0;
    for (const [k, v] of Object.entries(r.byMarket || {})) addWL(byMarket, k, v.wins, v.losses);
    for (const [k, v] of Object.entries(r.byConfidence || {})) addWL(byConf, k, v.wins, v.losses);
    for (const row of [...(r.topHits || []), ...(r.biggestMisses || [])]) {
      if (typeof row.edgePct !== "number" || !row.outcome) continue;
      const b = row.edgePct < 10 ? "0-10pp" : row.edgePct < 20 ? "10-20pp" : row.edgePct < 30 ? "20-30pp" : row.edgePct < 50 ? "30-50pp" : "50pp+";
      edge[b] = edge[b] || { wins: 0, losses: 0 };
      if (row.outcome === "Win") edge[b].wins++; else if (row.outcome === "Loss") edge[b].losses++;
    }
  }

  const marketTable = Object.entries(byMarket)
    .map(([market, b]) => { const { n, hitRate } = rate(b); const rel = candidateReliability(hitRate, n); return { market, n, hitRate: Number(hitRate.toFixed(4)), reliabilityWeight: rel.weight, note: rel.note }; })
    .sort((a, b) => b.hitRate - a.hitRate);

  const confOrder = { High: 0, Medium: 1, Low: 2 };
  const confTable = Object.entries(byConf)
    .map(([tier, b]) => { const { n, hitRate } = rate(b); return { tier, n, hitRate: Number(hitRate.toFixed(4)) }; })
    .sort((a, b) => (confOrder[a.tier] ?? 9) - (confOrder[b.tier] ?? 9));

  const edgeTable = Object.entries(edge).map(([bucket, b]) => { const { n, hitRate } = rate(b); return { bucket, n, hitRate: Number(hitRate.toFixed(4)) }; });

  // ── Warnings ──
  const warnings = [];
  const high = confTable.find((t) => t.tier === "High");
  const low = confTable.find((t) => t.tier === "Low");
  if (high && low && high.hitRate <= low.hitRate) {
    warnings.push(`CONFIDENCE TIERS NON-MONOTONIC — "High" ${(high.hitRate * 100).toFixed(1)}% (n=${high.n}) does NOT out-hit "Low" ${(low.hitRate * 100).toFixed(1)}% (n=${low.n}). The tier label is not a reliable edge signal; do not weight picks up on tier alone.`);
  }
  for (const m of marketTable) {
    if (m.n >= 200 && m.hitRate < 0.485) warnings.push(`MARKET NET-NEGATIVE — ${m.market} ${(m.hitRate * 100).toFixed(1)}% on n=${m.n}. Model is worse than the market here; defer to the line or avoid.`);
  }
  warnings.push(`EDGE-BUCKET DATA GAP — the committed reports persist a per-prop edge only for the per-date top hits + biggest misses (an extremes subsample). The edge table below CANNOT measure calibration; persist per-prop (edgePct, outcome) in the grading pipeline to enable a true edge-bucket calibration.`);

  if (AS_JSON) {
    console.log(JSON.stringify({ dates: files.length, decisive, byMarket: marketTable, byConfidence: confTable, edgeBucketsExtremesOnly: edgeTable, warnings }, null, 2));
    return;
  }

  console.log(`\n=== MLB CALIBRATION AUDIT (read-only) · ${files.length} dates · ${decisive.toLocaleString()} decisive props ===\n`);
  console.log("── By market (with candidate reliability weight for a FUTURE blend) ──");
  console.table(marketTable);
  console.log("── By confidence tier ──");
  console.table(confTable);
  console.log("── By edge bucket (⚠ EXTREMES-ONLY subsample — NOT representative; see warning) ──");
  console.table(edgeTable);
  console.log("\n── Warnings ──");
  for (const w of warnings) console.log("  ⚠ " + w);
  console.log("\n(analysis only — no file written, no public recommendation changed, money untouched)\n");
}

main();
