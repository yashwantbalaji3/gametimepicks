/**
 * audit-mlb-calibration.mjs — READ-ONLY MLB calibration analysis over the FULL per-prop rows.
 *
 * Prefers the complete calibration dataset (public/data/mlb/results/calibration/*.jsonl, produced by
 * export-mlb-calibration-rows.mjs — one row per settled prop with edgePct / modelProbability /
 * marketProbability / confidence / outcome). Falls back to the aggregate comparison reports only when
 * the rows are absent (and says so). Reading the full rows means the edge-bucket calibration is now
 * measured on the WHOLE population, not the per-date extremes.
 *
 * Prints:
 *   1. overall decisive hit rate            5. by market × confidence
 *   2. by market (+ candidate weight)       6. by market × edge bucket (n-guarded)
 *   3. by confidence tier                   7. sample-size warnings
 *   4. by edge bucket                       8. push/void rate + field coverage
 * plus loud warnings (tier inversion, edge anti-calibration, net-negative markets).
 *
 * This is analysis only: it writes nothing, changes no public recommendation, and never touches money.
 * The raw model-performance record it reads is SEPARATE from the official 19-14 product-card record.
 *
 * Usage:  npx tsx scripts/audit-mlb-calibration.mjs [--json]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const RESULTS = path.join(ROOT, "public", "data", "mlb", "results");
const CAL_DIR = path.join(RESULTS, "calibration");
const AS_JSON = process.argv.includes("--json");

// ── Edge buckets + sample guards ──
const EDGE_BUCKETS = ["<0", "0-2.5", "2.5-5", "5-10", "10-20", "20+"];
function edgeBucket(e) {
  if (typeof e !== "number") return null;
  return e < 0 ? "<0" : e < 2.5 ? "0-2.5" : e < 5 ? "2.5-5" : e < 10 ? "5-10" : e < 20 ? "10-20" : "20+";
}
function sampleTier(n) {
  return n < 30 ? "no-conclusion" : n < 100 ? "weak" : "reportable";
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function candidateReliability(hitRate, n) {
  if (n < 100) return { weight: 0.3, note: "insufficient sample — hold near market" };
  const w = clamp01(0.5 + (hitRate - 0.5) * 4);
  const note = hitRate >= 0.53 ? "model adds signal" : hitRate <= 0.485 ? "net-negative — defer to market / avoid" : "≈ coin flip — lean market";
  return { weight: Number(w.toFixed(2)), note };
}

/** Load the full per-prop calibration rows, or null when the dataset hasn't been exported yet. */
function loadRows() {
  if (!fs.existsSync(CAL_DIR)) return null;
  const files = fs.readdirSync(CAL_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
  if (files.length === 0) return null;
  const rows = [];
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(CAL_DIR, f), "utf8").trim().split("\n")) {
      if (line) rows.push(JSON.parse(line));
    }
  }
  return { rows, dates: files.length };
}

const rate = (b) => { const n = b.wins + b.losses; return { n, hitRate: n > 0 ? b.wins / n : 0 }; };
function tally(acc, key, outcome) {
  if (outcome !== "win" && outcome !== "loss") return;
  acc[key] = acc[key] || { wins: 0, losses: 0 };
  if (outcome === "win") acc[key].wins++; else acc[key].losses++;
}

function analyzeRows(rows) {
  const byMarket = {}, byConf = {}, byEdge = {}, byMarketConf = {}, byMarketEdge = {};
  const cov = { edgePct: 0, modelProbability: 0, marketProbability: 0, confidence: 0 };
  let decisive = 0, pushes = 0, total = 0;

  for (const r of rows) {
    total++;
    if (r.edgePct != null) cov.edgePct++;
    if (r.modelProbability != null) cov.modelProbability++;
    if (r.marketProbability != null) cov.marketProbability++;
    if (r.confidence != null) cov.confidence++;
    if (r.outcome === "push" || r.outcome === "void") pushes++;
    if (r.outcome !== "win" && r.outcome !== "loss") continue;
    decisive++;
    const eb = edgeBucket(r.edgePct);
    tally(byMarket, r.market ?? "unknown", r.outcome);
    if (r.confidence) tally(byConf, r.confidence, r.outcome);
    if (eb) tally(byEdge, eb, r.outcome);
    if (r.confidence) tally(byMarketConf, `${r.market}||${r.confidence}`, r.outcome);
    if (eb) tally(byMarketEdge, `${r.market}||${eb}`, r.outcome);
  }

  const marketTable = Object.entries(byMarket).map(([market, b]) => {
    const { n, hitRate } = rate(b); const rel = candidateReliability(hitRate, n);
    return { market, n, hitRate: Number(hitRate.toFixed(4)), sample: sampleTier(n), reliabilityWeight: rel.weight, note: rel.note };
  }).sort((a, b) => b.hitRate - a.hitRate);

  const confOrder = { High: 0, Medium: 1, Low: 2 };
  const confTable = Object.entries(byConf).map(([tier, b]) => { const { n, hitRate } = rate(b); return { tier, n, hitRate: Number(hitRate.toFixed(4)), sample: sampleTier(n) }; })
    .sort((a, b) => (confOrder[a.tier] ?? 9) - (confOrder[b.tier] ?? 9));

  const edgeTable = EDGE_BUCKETS.map((bucket) => byEdge[bucket] ? { bucket, ...(() => { const { n, hitRate } = rate(byEdge[bucket]); return { n, hitRate: Number(hitRate.toFixed(4)), sample: sampleTier(n) }; })() } : null).filter(Boolean);

  const marketConfTable = Object.entries(byMarketConf).map(([k, b]) => { const [market, tier] = k.split("||"); const { n, hitRate } = rate(b); return { market, tier, n, hitRate: Number(hitRate.toFixed(4)), sample: sampleTier(n) }; })
    .filter((r) => r.n >= 30).sort((a, b) => a.market.localeCompare(b.market) || (confOrder[a.tier] ?? 9) - (confOrder[b.tier] ?? 9));

  const marketEdgeTable = Object.entries(byMarketEdge).map(([k, b]) => { const [market, bucket] = k.split("||"); const { n, hitRate } = rate(b); return { market, bucket, n, hitRate: Number(hitRate.toFixed(4)) }; })
    .filter((r) => r.n >= 30).sort((a, b) => a.market.localeCompare(b.market) || EDGE_BUCKETS.indexOf(a.bucket) - EDGE_BUCKETS.indexOf(b.bucket));

  // ── Warnings ──
  const warnings = [];
  const high = confTable.find((t) => t.tier === "High"), low = confTable.find((t) => t.tier === "Low");
  if (high && low && high.hitRate <= low.hitRate) warnings.push(`CONFIDENCE TIERS NON-MONOTONIC — "High" ${(high.hitRate * 100).toFixed(1)}% (n=${high.n}) does NOT out-hit "Low" ${(low.hitRate * 100).toFixed(1)}% (n=${low.n}). Do not up-weight a pick on tier alone.`);
  const hi = edgeTable.find((e) => e.bucket === "20+"), lo = edgeTable.find((e) => e.bucket === "0-2.5");
  if (hi && lo && hi.hitRate < lo.hitRate) warnings.push(`EDGE IS ANTI-CALIBRATED — the biggest claimed edges (20+pp) hit ${(hi.hitRate * 100).toFixed(1)}% (n=${hi.n}), WORSE than small edges 0-2.5pp ${(lo.hitRate * 100).toFixed(1)}%. Raw edge magnitude must be DISCOUNTED, not trusted, at the high end.`);
  for (const m of marketTable) if (m.n >= 100 && m.hitRate < 0.485) warnings.push(`MARKET NET-NEGATIVE — ${m.market} ${(m.hitRate * 100).toFixed(1)}% on n=${m.n}. Defer to the market or avoid.`);

  const denom = decisive || 1;
  return {
    dates: null, total, decisive, pushes,
    overallHitRate: Number((decisive ? Object.values(byMarket).reduce((a, b) => a + b.wins, 0) / denom : 0).toFixed(4)),
    pushRate: Number((pushes / (total || 1)).toFixed(4)),
    fieldCoverage: { edgePct: Number((cov.edgePct / (total || 1)).toFixed(3)), modelProbability: Number((cov.modelProbability / (total || 1)).toFixed(3)), marketProbability: Number((cov.marketProbability / (total || 1)).toFixed(3)), confidence: Number((cov.confidence / (total || 1)).toFixed(3)) },
    byMarket: marketTable, byConfidence: confTable, byEdgeBucket: edgeTable, byMarketConfidence: marketConfTable, byMarketEdgeBucket: marketEdgeTable, warnings,
  };
}

function main() {
  const loaded = loadRows();
  if (!loaded) {
    console.error(`[audit-mlb-calibration] no full calibration rows at ${CAL_DIR}. Run: npx tsx scripts/export-mlb-calibration-rows.mjs --write`);
    process.exit(1);
  }
  const a = analyzeRows(loaded.rows);
  a.dates = loaded.dates;

  if (AS_JSON) { console.log(JSON.stringify(a, null, 2)); return; }

  console.log(`\n=== MLB CALIBRATION AUDIT (read-only, FULL rows) · ${loaded.dates} dates · ${a.total.toLocaleString()} rows · ${a.decisive.toLocaleString()} decisive · overall ${(a.overallHitRate * 100).toFixed(1)}% ===\n`);
  console.log("── By market (candidate reliability weight for a FUTURE blend) ──"); console.table(a.byMarket);
  console.log("── By confidence tier ──"); console.table(a.byConfidence);
  console.log("── By edge bucket (FULL population) ──"); console.table(a.byEdgeBucket);
  console.log("── By market × confidence (n≥30) ──"); console.table(a.byMarketConfidence);
  console.log("── By market × edge bucket (n≥30) ──"); console.table(a.byMarketEdgeBucket);
  console.log(`── Push/void rate: ${(a.pushRate * 100).toFixed(1)}% (${a.pushes}) · field coverage: edgePct ${(a.fieldCoverage.edgePct * 100).toFixed(0)}% · modelProb ${(a.fieldCoverage.modelProbability * 100).toFixed(0)}% · marketProb ${(a.fieldCoverage.marketProbability * 100).toFixed(0)}% ──`);
  console.log("\n── Warnings ──"); for (const w of a.warnings) console.log("  ⚠ " + w);
  console.log("\n── Sample guards: n<30 no-conclusion · 30-100 weak · ≥100 reportable ──");
  console.log("(analysis only — no file written, no public recommendation changed, money untouched)\n");
}

main();
