/**
 * build-founder-review-previews.mjs — INTERNAL founder-review Bank Builder / Moonshot previews.
 *
 * Reads the read-only multi-sport candidate pool and produces two internal preview artifacts that a
 * founder can review. They are NEVER active cards: status is `founder_review` (a qualifying set exists,
 * needs approval) or `no_play`; `active:false`, `exposure:0`, `officialMoneyRecordAffected:false`,
 * `requiresFounderApproval:true`. No money artifact is read/written. Multi-sport: only settlement-
 * supported eligible legs (MLB statsapi + soccer api-football) may appear.
 *
 * Each leg is emitted in the PROMOTION-READY shape (legId + gameId + marketKey + selection + side + line +
 * de-vigged fair oddsAmerican + settlementSource) so promote-founder-review-to-paper-card.mjs can map it
 * directly. Preview-level labels declare paper-promotion eligibility + that the full-game sim is NOT used.
 *
 * Output (repo-root data/internal — NOT web-served):
 *   data/internal/product-previews/bank-builder/<date>.json
 *   data/internal/product-previews/moonshot/<date>.json
 *
 * Usage:  npx tsx scripts/build-founder-review-previews.mjs [--date 2026-07-09] [--write]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const REPO = path.join(process.cwd(), process.cwd().endsWith("app") ? ".." : "");
const POOL_DIR = path.join(REPO, "data", "internal", "multi-sport", "candidate-pool");
const OUT_BB = path.join(REPO, "data", "internal", "product-previews", "bank-builder");
const OUT_MS = path.join(REPO, "data", "internal", "product-previews", "moonshot");
const WRITE = process.argv.includes("--write");
const DATE = (() => { const i = process.argv.indexOf("--date"); return i >= 0 ? process.argv[i + 1] : null; })();

const BB_MIN_PROB = 0.60;
const MOONSHOT_FLOOR = 700;
const BB_MIN_LEGS = 2;
const decToAmerican = (dec) => (dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1)));
const shortHash = (s) => crypto.createHash("md5").update(s).digest("hex").slice(0, 12);
/** De-vigged FAIR American odds from a de-vigged probability (labelled de_vigged_fair — never a book price). */
const americanFromProb = (p) => (p >= 0.5 ? -Math.round((100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p));

function pickDate() {
  if (DATE) return DATE;
  if (!fs.existsSync(POOL_DIR)) return null;
  const files = fs.readdirSync(POOL_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  return files.length ? files[files.length - 1].replace(".json", "") : null;
}

/** Map a candidate-pool leg to the promotion-ready WorkflowLeg shape (never fabricates a field). */
function toWorkflowLeg(l) {
  const settlementSupported = !!l.settlementSource && l.settlementSource !== "none";
  return {
    legId: shortHash([l.sport, l.date, l.gameId, l.market, l.selection].join("|")),
    sport: l.sport, gameId: l.gameId, gamePk: l.gamePk, eventDate: l.date, event: l.eventName,
    marketKey: l.market, selection: l.selection, side: l.side, line: l.line,
    oddsAmerican: typeof l.marketProbability === "number" ? americanFromProb(l.marketProbability) : null,
    oddsBasis: "de_vigged_fair",
    impliedProbability: l.marketProbability, marketProbability: l.marketProbability,
    publicLabel: l.publicLabel, source: l.artifactSource,
    settlementSupported, settlementSource: l.settlementSource, productEligible: !!l.productEligible,
    reasonCodes: [l.productEligibilityReason].filter(Boolean),
    dataQuality: l.dataQuality,
  };
}

const summarizeDQ = (legs) => legs.reduce((m, l) => { m[l.dataQuality] = (m[l.dataQuality] ?? 0) + 1; return m; }, {});
const coverage = (legs) => ({ supported: legs.filter((l) => l.settlementSupported).length, total: legs.length, bySource: legs.reduce((m, l) => { if (l.settlementSource) m[l.settlementSource] = (m[l.settlementSource] ?? 0) + 1; return m; }, {}) });

/** Every preview carries the same money-safety envelope + workflow labels. */
function envelope(productType, date, status, riskTier, legs, extra) {
  const allSupported = legs.length > 0 && legs.every((l) => l.settlementSupported && l.oddsAmerican != null);
  const promotable = status === "founder_review" && allSupported && legs.length >= (extra.minLegs ?? 1);
  const blocked = [];
  if (status !== "founder_review") blocked.push(`status is ${status}`);
  if (legs.length && !allSupported) blocked.push("a leg is not settlement-supported or lacks odds");
  return {
    kind: extra.kind, previewId: `${productType}-${date}`, productType, generatedAt: date,
    date, slateDate: date, public: false, internal: true,
    status, active: false, exposure: 0, officialMoneyRecordAffected: false, requiresFounderApproval: true,
    riskTier,
    sports: [...new Set(legs.map((l) => l.sport))], sportsIncluded: [...new Set(legs.map((l) => l.sport))],
    marketsIncluded: [...new Set(legs.map((l) => l.marketKey))],
    settlementCoverageSummary: coverage(legs), dataQualitySummary: summarizeDQ(legs),
    paperPromotionEligible: promotable,
    paperPromotionBlockedReasons: promotable ? [] : blocked,
    approvalRequirements: ["explicit --approve-founder-review flag", "--approved-by <founder>"],
    blockedReasons: blocked,
    // The internal full-game simulation is NEVER a selection driver (it is internal_only / insufficient_sample).
    fullGameSimUsed: false, fullGameSimReason: "internal_only_not_driving_selection",
    ...extra,
    legs,
    note: "INTERNAL founder-review preview. NOT an active card. No exposure, no money-record change. Founder approval + settlement + calibration gate any real activation. Odds are de-vigged fair (not a book price).",
  };
}

function bankBuilder(date, eligible) {
  const byGame = new Map();
  for (const l of eligible) {
    if (typeof l.marketProbability !== "number") continue;
    const cur = byGame.get(l.gameId);
    if (!cur || l.marketProbability > cur.marketProbability) byGame.set(l.gameId, l);
  }
  const conservative = [...byGame.values()].filter((l) => l.marketProbability >= BB_MIN_PROB).sort((a, b) => b.marketProbability - a.marketProbability);
  if (conservative.length < BB_MIN_LEGS) {
    return envelope("bank_builder", date, "no_play", "conservative", [], { kind: "bank-builder-founder-review", minLegs: BB_MIN_LEGS, noPlayReason: `fewer than ${BB_MIN_LEGS} distinct-game legs at ≥${BB_MIN_PROB} de-vigged probability`, reason: `fewer than ${BB_MIN_LEGS} distinct-game legs at ≥${BB_MIN_PROB} de-vigged probability` });
  }
  const legs = conservative.slice(0, BB_MIN_LEGS).map(toWorkflowLeg);
  return envelope("bank_builder", date, "founder_review", "conservative", legs, { kind: "bank-builder-founder-review", minLegs: BB_MIN_LEGS, reason: "two conservative distinct-game legs qualify for founder review — NOT placed" });
}

function moonshot(date, eligible) {
  const games = [...new Set(eligible.map((l) => l.gameId))].slice(0, 4);
  const byGame = new Map(games.map((g) => [g, eligible.filter((l) => l.gameId === g && typeof l.marketProbability === "number")]));
  const combos = (arr) => arr.reduce((acc, g) => acc.flatMap((c) => (byGame.get(g) || []).map((l) => [...c, l])), [[]]);
  let best = null, maxReachable = null;
  for (const combo of combos(games)) {
    if (combo.length < 2) continue;
    const prob = combo.reduce((p, l) => p * l.marketProbability, 1);
    if (prob <= 0) continue;
    const american = decToAmerican(1 / prob);
    if (maxReachable == null || american > maxReachable) maxReachable = american;
    if (american >= MOONSHOT_FLOOR && (best == null || american < best.american)) best = { american, combo };
  }
  if (!best) return envelope("moonshot", date, "no_play", "longshot", [], { kind: "moonshot-founder-review", minLegs: 2, noPlayReason: `no distinct-game combo reaches +${MOONSHOT_FLOOR} (best reachable ${maxReachable == null ? "n/a" : (maxReachable >= 0 ? "+" : "") + maxReachable})`, reason: `no distinct-game combo reaches +${MOONSHOT_FLOOR}` });
  const legs = best.combo.map(toWorkflowLeg);
  return envelope("moonshot", date, "founder_review", "longshot", legs, { kind: "moonshot-founder-review", minLegs: 2, combinedAmerican: best.american, combinedOddsAmerican: best.american, reason: `a +${best.american} distinct-game combo qualifies for founder review — NOT placed, no EV claimed` });
}

function main() {
  const date = pickDate();
  if (!date) { console.error("[founder-review] no candidate pool"); process.exit(1); }
  const poolPath = path.join(POOL_DIR, `${date}.json`);
  if (!fs.existsSync(poolPath)) { console.error(`[founder-review] no pool for ${date}`); process.exit(1); }
  const eligible = (JSON.parse(fs.readFileSync(poolPath, "utf8")).legs || []).filter((l) => l.productEligible);

  const bb = bankBuilder(date, eligible);
  const ms = moonshot(date, eligible);
  if (WRITE) {
    fs.mkdirSync(OUT_BB, { recursive: true }); fs.writeFileSync(path.join(OUT_BB, `${date}.json`), JSON.stringify(bb, null, 2) + "\n");
    fs.mkdirSync(OUT_MS, { recursive: true }); fs.writeFileSync(path.join(OUT_MS, `${date}.json`), JSON.stringify(ms, null, 2) + "\n");
  }
  console.log(`[founder-review] ${WRITE ? "WROTE" : "DRY-RUN"} ${date} · eligible ${eligible.length} · BankBuilder ${bb.status}/${bb.paperPromotionEligible ? "promotable" : "blocked"} (${(bb.sports || []).join("+") || "—"}) · Moonshot ${ms.status}/${ms.paperPromotionEligible ? "promotable" : "blocked"} (${(ms.sports || []).join("+") || "—"})`);
  if (!WRITE) console.log("  (dry run — pass --write to persist)");
}

main();
