/**
 * backtest-shadow-calibration.mjs — WALK-FORWARD, no-leakage feasibility test for the shadow
 * calibration. READ-ONLY; writes nothing; CLAIMS nothing. It prints the honest head-to-head so the
 * founder can apply the go/no-go criteria in docs/SHADOW_CALIBRATION_BACKTEST_PLAN_2026-07-09.md.
 *
 * For each graded date D after a minimum history H:
 *   • learn per-market reliability from rows with date < D  (never sees D or later),
 *   • blend D's props model→market via lib/calibration,
 *   • score D's outcomes: Brier(market/model/shadow) + hit rate of shadow lean/strong picks vs the
 *     current High-confidence picks on the same props.
 * Aggregate across all D.
 *
 * Usage:  npx tsx scripts/backtest-shadow-calibration.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { computeMarketReliability, calibrate } from "../src/lib/calibration/index.ts";

const ROOT = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const CAL_DIR = path.join(ROOT, "public", "data", "mlb", "results", "calibration");
const MIN_HISTORY = 10; // graded dates required before the first scored date

function loadByDate() {
  const files = fs.readdirSync(CAL_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
  const byDate = new Map();
  for (const f of files) {
    const date = f.replace(".jsonl", "");
    const rows = fs.readFileSync(path.join(CAL_DIR, f), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    byDate.set(date, rows);
  }
  return byDate;
}

const y = (o) => (o === "win" ? 1 : o === "loss" ? 0 : null); // decisive only
const dqOf = (sample) => (sample === "reportable" ? "high" : sample === "weak" ? "medium" : "thin");

function shadowTier(shadowEdge, rel, dq, rawEdge) {
  if (typeof rawEdge === "number" && rawEdge >= 20) return "no-play";
  if (dq === "unavailable" || rel <= 0.3) return "no-play";
  if (shadowEdge <= 0) return "no-play";
  if (rel < 0.5) return "watch";
  if (shadowEdge >= 3 && rel >= 0.55 && dq === "high") return "strong";
  if (shadowEdge >= 1.5) return "lean";
  return "watch";
}

function main() {
  if (!fs.existsSync(CAL_DIR)) { console.error(`[backtest] no calibration rows at ${CAL_DIR}`); process.exit(1); }
  const byDate = loadByDate();
  const dates = [...byDate.keys()].sort();
  if (dates.length <= MIN_HISTORY) { console.error(`[backtest] need > ${MIN_HISTORY} dates`); process.exit(1); }

  // Brier accumulators + pick buckets.
  const brier = { market: 0, model: 0, shadow: 0, n: 0 };
  const currentHigh = { w: 0, n: 0 };
  const shadowPick = { w: 0, n: 0 };     // lean+strong
  const shadowStrong = { w: 0, n: 0 };
  let scoredProps = 0, priceable = 0, noPlay = 0, scoredDates = 0;

  const train = []; // rows accumulated from dates < D
  for (let i = 0; i < dates.length; i++) {
    const D = dates[i];
    const dRows = byDate.get(D);
    if (i >= MIN_HISTORY) {
      scoredDates++;
      const relBuckets = computeMarketReliability(train);
      const relMap = new Map(relBuckets.map((b) => [b.key, b]));
      for (const r of dRows) {
        const yy = y(r.outcome);
        if (yy == null) continue; // decisive only
        scoredProps++;
        if (r.marketProbability == null || r.modelProbability == null) continue;
        priceable++;
        const b = relMap.get(r.market);
        const rel = b ? b.historicalReliability : 0.3;
        const dq = b ? dqOf(b.sample) : "unavailable";
        const cal = calibrate({ marketProbability: r.marketProbability, modelProbability: r.modelProbability, marketType: r.market, sport: "MLB", historicalReliability: rel, dataQuality: dq });
        const shadowEdge = cal.edge * 100;
        const tier = shadowTier(shadowEdge, rel, dq, r.edgePct);
        // Brier on the leaned side (all three probs are for that side).
        brier.market += (r.marketProbability - yy) ** 2;
        brier.model += (r.modelProbability - yy) ** 2;
        brier.shadow += (cal.calibratedProbability - yy) ** 2;
        brier.n++;
        if (r.confidence === "High") { currentHigh.n++; currentHigh.w += yy; }
        if (tier === "lean" || tier === "strong") { shadowPick.n++; shadowPick.w += yy; }
        if (tier === "strong") { shadowStrong.n++; shadowStrong.w += yy; }
        if (tier === "no-play") noPlay++;
      }
    }
    for (const r of dRows) train.push(r); // grow training set AFTER scoring D (walk-forward)
  }

  const rate = (b) => (b.n ? (b.w / b.n) : 0);
  const brierAvg = (s) => (brier.n ? s / brier.n : 0);
  const pct = (x) => (x * 100).toFixed(1) + "%";

  console.log(`\n=== SHADOW CALIBRATION WALK-FORWARD BACKTEST (no leakage · H=${MIN_HISTORY}) ===`);
  console.log(`scored dates: ${scoredDates} · decisive props scored: ${scoredProps} · priceable: ${priceable} (${pct(priceable / scoredProps)})\n`);
  console.log("── Brier score (lower is better; shadow must beat model to justify wiring) ──");
  console.table({
    market: { brier: Number(brierAvg(brier.market).toFixed(4)) },
    model: { brier: Number(brierAvg(brier.model).toFixed(4)) },
    shadow: { brier: Number(brierAvg(brier.shadow).toFixed(4)) },
  });
  console.log("── Head-to-head hit rate (same holdout props) ──");
  console.table({
    "current High-tier picks": { n: currentHigh.n, hitRate: Number(rate(currentHigh).toFixed(4)) },
    "shadow lean+strong picks": { n: shadowPick.n, hitRate: Number(rate(shadowPick).toFixed(4)) },
    "shadow strong-only picks": { n: shadowStrong.n, hitRate: Number(rate(shadowStrong).toFixed(4)) },
  });
  const improve = rate(shadowPick) - rate(currentHigh);
  console.log(`\nshadow lean+strong vs current High: ${improve >= 0 ? "+" : ""}${(improve * 100).toFixed(1)}pp (n_shadow=${shadowPick.n}, n_high=${currentHigh.n})`);
  console.log(`shadow no-play rate: ${pct(noPlay / priceable)} of priceable props`);
  console.log(`\nBrier Δ (shadow − model): ${(brierAvg(brier.shadow) - brierAvg(brier.model)).toFixed(4)} (negative ⇒ shadow better calibrated)`);
  console.log("\n(feasibility only — no file written, no claim of improvement, money untouched. Apply the go/no-go criteria in the backtest plan doc.)\n");
}

main();
