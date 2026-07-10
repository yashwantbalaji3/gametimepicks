/**
 * run-daily-model-improvement.mjs — the INTERNAL daily "did we learn anything?" loop. It reads what is
 * already committed (the paper track record + the raw MLB model-performance summary + the DOCUMENTED
 * per-market reliability findings) and emits honest, founder-gated RECOMMENDATIONS — it never changes a
 * formula, never writes money, never publishes, and never auto-applies anything.
 *
 * The reliability reference below is the settled finding from the calibration audit (docs/…CALIBRATION…):
 * batter_hits adds signal (~54%); total_bases is net-negative (~44%); confidence tiers are anti-predictive;
 * large claimed edge under-performs. These are cited, not recomputed each run (that lives in
 * audit-mlb-calibration.mjs).
 *
 * Output: data/internal/model-improvement/{latest.json, daily/<date>.json} (public:false).
 * Usage: npx tsx scripts/run-daily-model-improvement.mjs [--date 2026-07-09] [--write]
 */
import fs from "node:fs";
import path from "node:path";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const OUT_DIR = path.join(REPO, "data", "internal", "model-improvement");
const WRITE = process.argv.includes("--write");
const DATE = (() => { const i = process.argv.indexOf("--date"); return i >= 0 ? process.argv[i + 1] : null; })();
const readJson = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);

/** Settled per-market reliability (documented calibration finding; sample = 18,227 graded props). */
const MARKET_RELIABILITY = {
  batter_hits: { hitRate: 0.538, sample: 7313, verdict: "adds signal" },
  batter_hits_runs_rbis: { hitRate: 0.501, sample: 3200, verdict: "coin-flip" },
  pitcher_strikeouts: { hitRate: 0.475, sample: 2100, verdict: "net-negative" },
  batter_total_bases: { hitRate: 0.444, sample: 3369, verdict: "avoid" },
};
const RELIABILITY_FLOOR = 0.52;

function main() {
  const tr = readJson(path.join(REPO, "data", "internal", "product-cards", "track-record", "summary.json"));
  const trByMarket = readJson(path.join(REPO, "data", "internal", "product-cards", "track-record", "by-market.json"));
  const mlb = readJson(path.join(APP, "public", "data", "mlb", "results", "lifetime_summary.json"));
  const date = DATE ?? (tr?.lastUpdatedSlateDate ?? "unknown");

  // Recommendations derived from the reliability reference (never auto-applied).
  const marketsToDemote = Object.entries(MARKET_RELIABILITY).filter(([, r]) => r.hitRate < RELIABILITY_FLOOR).map(([market, r]) => ({ market, hitRate: r.hitRate, sample: r.sample, reason: `settled hit rate ${(r.hitRate * 100).toFixed(1)}% < ${RELIABILITY_FLOOR * 100}% floor (${r.verdict})` }));
  const marketsToPromote = Object.entries(MARKET_RELIABILITY).filter(([, r]) => r.hitRate >= RELIABILITY_FLOOR + 0.01).map(([market, r]) => ({ market, hitRate: r.hitRate, sample: r.sample, reason: `settled hit rate ${(r.hitRate * 100).toFixed(1)}% clears the floor (${r.verdict})` }));

  const recommendedNoPlayRules = [
    { rule: "discount-large-edge", detail: "Treat claimed edge ≥20pp as a caution, not a boost — it has historically UNDER-performed (anti-calibrated). Prefer 5–15pp edges from reliable markets.", basis: "settled edge calibration" },
    { rule: "no-play-below-reliability-floor", detail: `Exclude markets with settled hit rate < ${RELIABILITY_FLOOR * 100}% (e.g. batter_total_bases, pitcher_strikeouts) from Bank Builder.`, basis: "per-market reliability" },
    { rule: "thin-paper-sample-conservatism", detail: "While the paper sample is not meaningful (<10 settled cards), prefer no-play over a marginal card and never claim a product edge.", basis: "paper sample size" },
  ];
  const selectorChangesRecommended = [
    { product: "bank_builder", change: "Require every leg's market to clear the reliability floor + cap at 2–3 distinct-game legs.", risk: "low", requiresApproval: true },
    { product: "moonshot", change: "Never add a weak-market leg just to reach the payout floor; require distinct games + keep paper-only until a real sample.", risk: "low", requiresApproval: true },
    { product: "confidence-tier", change: "Do NOT up-weight a pick by confidence tier until a re-derived tier out-hits monotonically on a holdout (tiers are currently anti-predictive).", risk: "medium", requiresApproval: true },
  ];

  const paperSettled = tr?.card?.settledCards ?? 0;
  const summary = {
    kind: "daily-model-improvement", date, asOf: date, public: false, internal: true,
    officialMoneyRecordAffected: false, safeToAutoApply: false, requiresFounderApproval: true,
    sampleMeaningful: paperSettled >= 10,
    inputs: {
      paperTrackRecord: tr ? { settledCards: paperSettled, cardRecord: `${tr.card.wonCards}-${tr.card.lostCards}`, paperPnlUnits: tr.card.paperPnlUnits, meaningful: tr.meaningful } : null,
      rawModelPerformance: mlb ? { totalSettled: mlb.totalSettled, hitRate: mlb.hitRate, smallSample: mlb.smallSample, note: "raw model-performance ledger — research only, NOT product performance, NOT the official 19-14 record" } : null,
      paperByMarket: trByMarket ? Object.keys(trByMarket.byMarket ?? {}).length : 0,
    },
    marketReliabilityReference: MARKET_RELIABILITY,
    marketsToDemote, marketsToPromote, recommendedNoPlayRules, selectorChangesRecommended,
    verdict: paperSettled < 10
      ? "NOT ENOUGH PAPER SAMPLE to change anything. Recommendations are reliability-driven + founder-gated; keep collecting settled paper cards."
      : "Paper sample crossed the minimum — review the recommendations with the founder before any change.",
    note: "INTERNAL research loop. No formula is auto-applied; every recommendation needs founder approval. Never writes money, never public. Raw model hit rate ≠ product performance ≠ the official 19-14 record.",
  };

  if (WRITE) {
    fs.mkdirSync(path.join(OUT_DIR, "daily"), { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, "latest.json"), JSON.stringify(summary, null, 2) + "\n");
    fs.writeFileSync(path.join(OUT_DIR, "daily", `${date}.json`), JSON.stringify(summary, null, 2) + "\n");
  }
  console.log(`[model-improvement] ${WRITE ? "WROTE" : "DRY-RUN"} ${date} · demote ${marketsToDemote.length} · promote ${marketsToPromote.length} · noPlayRules ${recommendedNoPlayRules.length} · sampleMeaningful ${summary.sampleMeaningful} · autoApply ${summary.safeToAutoApply}`);
  if (!WRITE) console.log("  (dry run — pass --write; recommendations are founder-gated, never auto-applied)");
}

main();
