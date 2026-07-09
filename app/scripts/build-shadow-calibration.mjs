/**
 * build-shadow-calibration.mjs — write the SHADOW CALIBRATION summary artifact.
 *
 * Reads the full per-prop calibration rows (public/data/mlb/results/calibration/*.jsonl) and emits a
 * machine-readable summary of learned reliability + recommendations for founder review and future
 * shadow backtesting. It is NOT a public recommendation and is NOT wired into any pick — it is a
 * development/review artifact.
 *
 * Output: public/data/mlb/results/shadow-calibration/latest.json
 *
 * Determinism: no wall-clock timestamps — `asOf` is the latest GRADED date, so re-runs on the same
 * committed rows produce a byte-identical file. Writes nothing outside the shadow-calibration folder;
 * never touches money.
 *
 * Usage:  npx tsx scripts/build-shadow-calibration.mjs [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { computeMarketReliability, computeConfidenceReliability, computeEdgeBucketReliability } from "../src/lib/calibration/index.ts";

const ROOT = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const CAL_DIR = path.join(ROOT, "public", "data", "mlb", "results", "calibration");
const OUT_DIR = path.join(ROOT, "public", "data", "mlb", "results", "shadow-calibration");
const WRITE = process.argv.includes("--write");

function loadRows() {
  if (!fs.existsSync(CAL_DIR)) return { rows: [], latest: null };
  const files = fs.readdirSync(CAL_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
  const rows = [];
  for (const f of files) for (const l of fs.readFileSync(path.join(CAL_DIR, f), "utf8").trim().split("\n")) if (l) rows.push(JSON.parse(l));
  return { rows, latest: files.length ? files[files.length - 1].replace(".jsonl", "") : null };
}

/** Bucket → {market/tier/bucket, wins, losses, pushes(0 here), hitRate, reliabilityWeight, sampleWarning?} */
function toSummary(buckets, keyName) {
  return buckets.map((b) => ({
    [keyName]: b.key,
    n: b.n,
    wins: b.wins,
    losses: b.losses,
    hitRate: b.hitRate,
    reliabilityWeight: b.historicalReliability,
    ...(b.sample !== "reportable" ? { sampleWarning: b.sample } : {}),
  }));
}

function recommendations(byMarket, byEdge, byConf) {
  const recs = [];
  for (const m of byMarket) {
    if (m.sample === "no-conclusion") { recs.push({ type: "monitor", target: `market:${m.key}`, reason: `only n=${m.n} — insufficient to conclude` }); continue; }
    if (m.hitRate >= 0.53) recs.push({ type: "promote", target: `market:${m.key}`, reason: `${(m.hitRate * 100).toFixed(1)}% on n=${m.n} — model adds signal` });
    else if (m.hitRate <= 0.485) recs.push({ type: "deemphasize", target: `market:${m.key}`, reason: `${(m.hitRate * 100).toFixed(1)}% on n=${m.n} — net-negative vs market` });
    else recs.push({ type: "monitor", target: `market:${m.key}`, reason: `${(m.hitRate * 100).toFixed(1)}% — ≈ coin flip` });
  }
  const hi = byEdge.find((e) => e.key === "20+"), lo = byEdge.find((e) => e.key === "0-2.5");
  if (hi && lo && hi.hitRate < lo.hitRate) recs.push({ type: "deemphasize", target: "edge>=20pp", reason: `biggest claimed edges hit ${(hi.hitRate * 100).toFixed(1)}% < small edges ${(lo.hitRate * 100).toFixed(1)}% — edge is anti-calibrated; discount it` });
  const high = byConf.find((c) => c.key === "High"), low = byConf.find((c) => c.key === "Low");
  if (high && low && high.hitRate <= low.hitRate) recs.push({ type: "monitor", target: "confidence-tiers", reason: `"High" ${(high.hitRate * 100).toFixed(1)}% ≤ "Low" ${(low.hitRate * 100).toFixed(1)}% — tier label not a reliable up-weight (Simpson's effect across markets)` });
  return recs;
}

function main() {
  const { rows, latest } = loadRows();
  if (rows.length === 0) { console.error(`[shadow-cal] no calibration rows at ${CAL_DIR}. Run export-mlb-calibration-rows.mjs --write first.`); process.exit(1); }

  const byMarket = computeMarketReliability(rows);
  const byConfidence = computeConfidenceReliability(rows);
  const byEdgeBucket = computeEdgeBucketReliability(rows);
  const decisive = rows.filter((r) => r.outcome === "win" || r.outcome === "loss").length;
  const pushes = rows.filter((r) => r.outcome === "push" || r.outcome === "void").length;

  const summary = {
    sport: "MLB",
    kind: "shadow-calibration",
    public: false,
    asOf: latest, // deterministic — NOT wall-clock
    latestGradedDate: latest,
    rowCount: rows.length,
    decisiveCount: decisive,
    pushCount: pushes,
    byMarket: toSummary(byMarket, "market"),
    byConfidence: toSummary(byConfidence, "confidence"),
    byEdgeBucket: toSummary(byEdgeBucket, "edgeBucket"),
    recommendations: recommendations(byMarket, byEdgeBucket, byConfidence),
    note: "Internal/dev shadow calibration for founder review + future backtesting. NOT a public recommendation; NOT wired into any live pick. Separate from the official 19-14 product record.",
  };

  if (WRITE) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, "latest.json"), JSON.stringify(summary, null, 2) + "\n");
  }
  console.log(`[shadow-cal] ${WRITE ? "WROTE" : "DRY-RUN"} shadow-calibration/latest.json · ${rows.length} rows · ${summary.recommendations.length} recommendations`);
  for (const r of summary.recommendations) console.log(`  · ${r.type.toUpperCase()} ${r.target} — ${r.reason}`);
  if (!WRITE) console.log("  (dry run — pass --write to persist)");
}

main();
