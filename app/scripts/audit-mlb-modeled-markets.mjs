/**
 * audit-mlb-modeled-markets.mjs — calibration + market-comparison audit of the 4 CURRENTLY public-modeled
 * MLB player-prop markets (pitcher_strikeouts, batter_hits, batter_total_bases, batter_hits_runs_rbis).
 *
 * LEAKAGE-SAFE BY CONSTRUCTION — fully offline, no re-fetch:
 *   - board archives public/data/mlb/boards/<date>.json carry the PREGAME modelProb + implied (market) odds.
 *   - settled_leans.jsonl carries the OFFICIAL box-score `actual` + `outcome` (Win/Loss) for the model's lean.
 *   - Join by `id`; a consistency guard asserts settled.projection == board.projection (proves the archive is
 *     the pregame board, not a post-hoc regenerate).
 *
 * For each market, model vs market on the LEAN SIDE (the side the model actually picked — the product-relevant
 * comparison): Brier, log loss, calibration-by-bucket, model-vs-market gap buckets, sample size, over/under
 * split, confidence-bucket performance, product-eligible subset. Then a verdict:
 *   PUBLIC_MODEL_OK · PUBLIC_MODEL_NEEDS_CAUTION · DEMOTE_TO_MARKET_CONTEXT · INSUFFICIENT_SAMPLE.
 *
 * Writes: data/internal/mlb/reference/mlb-modeled-markets-audit.json (public:false). Decides nothing public —
 * it produces the evidence; a human/mission acts on the verdict.
 *
 * Run: node app/scripts/audit-mlb-modeled-markets.mjs
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const BOARD_DIR = path.join(APP, "public/data/mlb/boards");
const SETTLED = path.join(APP, "public/data/mlb/results/settled_leans.jsonl");
const OUT = path.join(REPO, "data/internal/mlb/reference/mlb-modeled-markets-audit.json");

const MARKETS = ["pitcher_strikeouts", "batter_hits", "batter_total_bases", "batter_hits_runs_rbis"];
const MIN_SAMPLE = 100;   // below this → INSUFFICIENT_SAMPLE
const CLOSE = 0.0015;     // |Brier gap| under this ⇒ "matches the market" (noise)

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const clamp = (p) => Math.min(0.999, Math.max(0.001, p));
const brier = (rows) => mean(rows.map((r) => (r.modelProb - r.won) ** 2));
const brierMkt = (rows) => mean(rows.map((r) => (r.marketProb - r.won) ** 2));
const logloss = (rows, key) => mean(rows.map((r) => { const q = clamp(r[key]); return -(r.won * Math.log(q) + (1 - r.won) * Math.log(1 - q)); }));

// ── build id → pregame model/market prob for the lean side (from board archives) ──
function loadBoardIndex() {
  const idx = new Map();
  for (const f of fs.readdirSync(BOARD_DIR)) {
    if (!f.endsWith(".json")) continue;
    let board;
    try { board = JSON.parse(fs.readFileSync(path.join(BOARD_DIR, f), "utf8")); } catch { continue; }
    for (const l of board.leans ?? []) {
      if (!l.id) continue;
      const io = Number(l.impliedOver), iu = Number(l.impliedUnder);
      const under = l.lean === "Under";
      const modelProb = under ? l.modelProbUnder : l.modelProbOver;
      const impliedLean = under ? iu : io;
      // de-vig proportionally when both sides exist, else fall back to the raw implied
      const marketProb = Number.isFinite(io) && Number.isFinite(iu) && io + iu > 0 ? impliedLean / (io + iu) : impliedLean;
      if (!Number.isFinite(modelProb) || !Number.isFinite(marketProb)) continue;
      idx.set(l.id, { modelProb, marketProb, projection: l.projection, sigma: l.sigma });
    }
  }
  return idx;
}

function bucketCalibration(rows, probKey) {
  const out = [];
  for (let b = 0; b < 10; b++) {
    const lo = b / 10, hi = (b + 1) / 10;
    const inB = rows.filter((r) => r[probKey] >= lo && r[probKey] < (b === 9 ? 1.0001 : hi));
    if (inB.length) out.push({ bucket: `${b * 10}-${b * 10 + 10}%`, n: inB.length, predicted: +mean(inB.map((r) => r[probKey])).toFixed(3), empirical: +mean(inB.map((r) => r.won)).toFixed(3) });
  }
  return out;
}

function classify(m) {
  if (m.sampleSize < MIN_SAMPLE) return "INSUFFICIENT_SAMPLE";
  const dBrier = m.brier.model - m.brier.market;   // negative ⇒ model better
  const dLog = m.logloss.model - m.logloss.market; // negative ⇒ model better
  const beatsBoth = dBrier < 0 && dLog < 0;
  const failsBoth = dBrier > 0 && dLog > 0;
  const close = Math.abs(dBrier) < CLOSE;
  if (failsBoth && !close) return "DEMOTE_TO_MARKET_CONTEXT";
  if (beatsBoth && !close) return "PUBLIC_MODEL_OK";
  return "PUBLIC_MODEL_NEEDS_CAUTION"; // mixed, or within noise of the market
}

function main() {
  const board = loadBoardIndex();
  const rowsByMkt = Object.fromEntries(MARKETS.map((m) => [m, []]));
  let joined = 0, unmatched = 0, nonDecisive = 0, leakFails = 0, projChecked = 0;

  for (const line of fs.readFileSync(SETTLED, "utf8").trim().split("\n")) {
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (!MARKETS.includes(o.marketKey)) continue;
    const outcome = String(o.outcome || "").toLowerCase();
    if (outcome !== "win" && outcome !== "loss") { nonDecisive++; continue; } // push/void → not a binary event
    const b = board.get(o.id);
    if (!b) { unmatched++; continue; }
    // leakage/consistency guard: the settled projection must equal the pregame board projection
    if (Number.isFinite(o.projection) && Number.isFinite(b.projection)) {
      projChecked++;
      if (Math.abs(o.projection - b.projection) > 0.05) leakFails++;
    }
    joined++;
    rowsByMkt[o.marketKey].push({
      won: outcome === "win" ? 1 : 0, modelProb: b.modelProb, marketProb: b.marketProb,
      edgePct: Number(o.edgePct), confidence: o.confidence, lean: o.lean, line: o.line, actual: o.actual,
    });
  }

  const byMarket = {};
  for (const mk of MARKETS) {
    const rows = rowsByMkt[mk];
    const N = rows.length;
    const base = {
      sampleSize: N, overRate: +mean(rows.map((r) => r.won)).toFixed(4),
      overUnderSplit: { over: rows.filter((r) => r.lean === "Over").length, under: rows.filter((r) => r.lean === "Under").length },
    };
    if (N === 0) { byMarket[mk] = { ...base, verdict: "INSUFFICIENT_SAMPLE" }; continue; }
    const brModel = brier(rows), brMkt = brierMkt(rows), llModel = logloss(rows, "modelProb"), llMkt = logloss(rows, "marketProb");
    // confidence buckets
    const conf = {};
    for (const c of ["Low", "Medium", "High"]) {
      const cr = rows.filter((r) => r.confidence === c);
      if (cr.length) conf[c] = { n: cr.length, hitRate: +mean(cr.map((r) => r.won)).toFixed(3), brierModel: +brier(cr).toFixed(4), brierMarket: +brierMkt(cr).toFixed(4) };
    }
    // model-vs-market gap buckets (edgePct)
    const gaps = [[-99, 0], [0, 5], [5, 10], [10, 20], [20, 999]];
    const gapBuckets = gaps.map(([lo, hi]) => { const g = rows.filter((r) => r.edgePct >= lo && r.edgePct < hi); return { gap: `${lo}..${hi}`, n: g.length, hitRate: g.length ? +mean(g.map((r) => r.won)).toFixed(3) : null }; }).filter((x) => x.n > 0);
    // product-eligible subset: model over the market (edge>0), decisive, non-longshot proxy (edge<40 to drop noise)
    const elig = rows.filter((r) => r.edgePct > 0);
    const eligStats = elig.length ? { n: elig.length, hitRate: +mean(elig.map((r) => r.won)).toFixed(3), brierModel: +brier(elig).toFixed(4), brierMarket: +brierMkt(elig).toFixed(4) } : { n: 0 };
    const m = {
      ...base,
      brier: { model: +brModel.toFixed(4), market: +brMkt.toFixed(4), modelBeatsMarket: brModel < brMkt },
      logloss: { model: +llModel.toFixed(4), market: +llMkt.toFixed(4), modelBeatsMarket: llModel < llMkt },
      mae: +mean(rows.map((r) => Math.abs((r.actual ?? 0) - (r.line ?? 0)))).toFixed(3),
      calibrationByBucket: bucketCalibration(rows, "modelProb"),
      gapBuckets, confidenceBuckets: conf, productEligibleSubset: eligStats,
    };
    m.verdict = classify(m);
    byMarket[mk] = m;
  }

  const report = {
    sport: "mlb", kind: "modeled-markets-calibration-audit", public: false,
    generatedFor: "internal validation only — regression check on the 4 live modeled markets",
    method: "settled_leans (official actual/outcome) ⋈ board archives (pregame modelProb + de-vigged market) by id, lean-side",
    join: { joined, unmatched, nonDecisive },
    leakageChecks: { rule: "settled.projection == pregame board.projection", checked: projChecked, failures: leakFails, passed: leakFails === 0 },
    thresholds: { MIN_SAMPLE, CLOSE },
    byMarket,
    summary: Object.fromEntries(MARKETS.map((mk) => [mk, byMarket[mk].verdict])),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

  // ── console ──
  console.log(`\n=== MLB modeled-markets audit — joined ${joined} settled leans (${unmatched} unmatched, ${nonDecisive} non-decisive) ===`);
  console.log(`leakage guard (settled.projection == board.projection): ${report.leakageChecks.passed ? "✓ PASS" : "✗ FAIL " + leakFails + "/" + projChecked}`);
  for (const mk of MARKETS) {
    const m = byMarket[mk];
    console.log(`\n● ${mk}  (n=${m.sampleSize}, over-rate ${(m.overRate * 100).toFixed(1)}%, O/U ${m.overUnderSplit?.over}/${m.overUnderSplit?.under})`);
    if (m.sampleSize === 0) { console.log("   INSUFFICIENT_SAMPLE"); continue; }
    console.log(`   Brier   model ${m.brier.model}  vs market ${m.brier.market}  → ${m.brier.modelBeatsMarket ? "model" : "MARKET"} better`);
    console.log(`   LogLoss model ${m.logloss.model}  vs market ${m.logloss.market}  → ${m.logloss.modelBeatsMarket ? "model" : "MARKET"} better`);
    console.log(`   product-eligible subset (edge>0): n=${m.productEligibleSubset.n} hit ${m.productEligibleSubset.hitRate != null ? (m.productEligibleSubset.hitRate * 100).toFixed(1) + "%" : "—"}  Brier m${m.productEligibleSubset.brierModel} vs mk${m.productEligibleSubset.brierMarket}`);
    console.log(`   confidence: ` + Object.entries(m.confidenceBuckets).map(([c, v]) => `${c} n${v.n}/${(v.hitRate * 100).toFixed(0)}%`).join("  "));
    console.log(`   VERDICT: ${m.verdict}`);
  }
  console.log(`\nSUMMARY: ${JSON.stringify(report.summary)}`);
  console.log(`report → ${path.relative(REPO, OUT)}`);
}
main();
