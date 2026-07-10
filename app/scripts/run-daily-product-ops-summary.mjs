/**
 * run-daily-product-ops-summary.mjs — a READ-ONLY daily operator checklist for the paper product
 * workflow. It changes NO public state and NEVER touches money; it only reads committed artifacts and
 * prints (and optionally writes, with --write-summary) an honest snapshot + a recommended action.
 *
 * Reports: official money md5 + record/bankroll/exposure; detected slates; candidate-pool counts;
 * founder-review previews + paper-promotion eligibility; paper cards pending approval / settlement;
 * blocked markets; the internal full-game-sim verdict (non-driving); and a recommended next action.
 *
 * Output (only with --write-summary): data/internal/ops/daily-product-summary/<date>.json (public:false).
 * Usage: npx tsx scripts/run-daily-product-ops-summary.mjs [--date 2026-07-09] [--write-summary]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const EXPECTED_MONEY_MD5 = "affe6b21071f2b3be96bb2774eb347c3";
const WRITE = process.argv.includes("--write-summary");
const DATE = (() => { const i = process.argv.indexOf("--date"); return i >= 0 ? process.argv[i + 1] : null; })();

const readJson = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const latestIn = (dir, re = /^\d{4}-\d{2}-\d{2}\.json$/) => { if (!fs.existsSync(dir)) return null; const f = fs.readdirSync(dir).filter((x) => re.test(x)).sort(); return f.length ? f[f.length - 1].replace(".json", "") : null; };

function main() {
  const boardDir = path.join(APP, "public", "data", "mlb", "boards");
  const wcDir = path.join(APP, "public", "data", "world-cup", "projections");
  const date = DATE ?? latestIn(boardDir) ?? latestIn(path.join(REPO, "data", "internal", "multi-sport", "candidate-pool"));

  // ── Money (READ-ONLY) ──
  const portfolio = readJson(path.join(APP, "public", "data", "mr-dub", "portfolio.json")) ?? {};
  const moneyMd5 = crypto.createHash("md5").update(fs.readFileSync(path.join(APP, "public", "data", "mr-dub", "portfolio.json"))).digest("hex");
  const moneyIntact = moneyMd5 === EXPECTED_MONEY_MD5;
  const money = { md5: moneyMd5, intact: moneyIntact, record: portfolio.record, currentBankroll: portfolio.currentBankroll, crownBankroll: portfolio.crownBankroll, openExposure: portfolio.openExposure ?? 0 };

  // ── Slates ──
  const slates = { mlbBoard: latestIn(boardDir), worldCup: latestIn(wcDir), candidatePool: latestIn(path.join(REPO, "data", "internal", "multi-sport", "candidate-pool")) };

  // ── Candidate pool ──
  const pool = readJson(path.join(REPO, "data", "internal", "multi-sport", "candidate-pool", `${date}.json`));
  const blockedMarkets = pool ? Object.keys(pool.eligibilityByReason || {}).filter((r) => /no product-card settlement wired/i.test(r)) : [];

  // ── Previews + paper cards ──
  const previews = {};
  const pendingApproval = [];
  for (const [product, slug] of [["bank_builder", "bank-builder"], ["moonshot", "moonshot"], ["longshot", "longshot"]]) {
    const pv = readJson(path.join(REPO, "data", "internal", "product-previews", slug, `${date}.json`));
    if (!pv) continue;
    previews[product] = { status: pv.status, paperPromotionEligible: !!pv.paperPromotionEligible, legs: (pv.legs || []).length, sports: pv.sportsIncluded || pv.sports || [], blocked: pv.paperPromotionBlockedReasons || [] };
    // Pending approval = a promotable founder_review preview with no paper card yet.
    const cardDir = path.join(REPO, "data", "internal", "product-cards", "paper", slug, date);
    const hasCard = fs.existsSync(cardDir) && fs.readdirSync(cardDir).some((f) => f.endsWith(".json"));
    if (pv.status === "founder_review" && pv.paperPromotionEligible && !hasCard) pendingApproval.push(product);
  }

  // ── Paper cards pending settlement ──
  const paperRoot = path.join(REPO, "data", "internal", "product-cards", "paper");
  let pendingSettlement = 0, paperCards = 0;
  if (fs.existsSync(paperRoot)) {
    for (const slug of fs.readdirSync(paperRoot)) {
      const sdir = path.join(paperRoot, slug);
      if (!fs.statSync(sdir).isDirectory()) continue;
      for (const d of fs.readdirSync(sdir)) {
        const dd = path.join(sdir, d);
        if (!fs.existsSync(dd) || !fs.statSync(dd).isDirectory()) continue;
        for (const f of fs.readdirSync(dd).filter((x) => x.endsWith(".json"))) {
          paperCards += 1;
          const card = readJson(path.join(dd, f));
          const settled = readJson(path.join(REPO, "data", "internal", "product-cards", "settlements", slug, d, f));
          if (!settled || settled.status === "pending" || settled.status === "partially_settled") pendingSettlement += 1;
        }
      }
    }
  }

  // ── Full-game sim (internal, non-driving) ──
  const fgs = readJson(path.join(REPO, "data", "internal", "mlb", "full-game-sim-backtests", "rolling-latest.json"));
  const fullGameSim = fgs ? { verdict: fgs.verdict, gamesGraded: fgs.metrics?.gamesGraded ?? 0, driving: false, note: "internal_only, never drives selection" } : { verdict: "absent", driving: false };

  // ── Recommended action ──
  let recommendedAction;
  if (!moneyIntact) recommendedAction = "STOP — official money md5 drift detected; investigate before any ops";
  else if (pendingApproval.length) recommendedAction = `review preview → (operator) approve paper card for: ${pendingApproval.join(", ")}`;
  else if (pendingSettlement > 0) recommendedAction = `run settle-paper-product-cards (${pendingSettlement} paper card(s) pending settlement)`;
  else if (Object.values(previews).every((p) => p.status === "no_play")) recommendedAction = "no-play — collect more data";
  else recommendedAction = "wait for settlement / collect more data";

  const summary = {
    kind: "daily-product-ops-summary", date, asOf: date, public: false, internal: true, officialMoneyRecordAffected: false,
    money, slates, candidatePool: pool ? pool.counts : null, blockedMarkets,
    previews, pendingApproval, paperCards, pendingSettlement, fullGameSim,
    recommendedAction,
    note: "READ-ONLY operator checklist. No money/exposure/public change. Paper cards are internal + paper-only; they never affect the official record.",
  };

  if (WRITE) { const dir = path.join(REPO, "data", "internal", "ops", "daily-product-summary"); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${date}.json`), JSON.stringify(summary, null, 2) + "\n"); }
  console.log(`[ops-summary] ${date} · money ${moneyIntact ? "OK" : "⚠ DRIFT"} (${money.record ? `${money.record.wins}-${money.record.losses}` : "?"}, $${money.currentBankroll}) · pool ${summary.candidatePool?.eligible ?? "?"}/${summary.candidatePool?.total ?? "?"} eligible`);
  console.log(`  previews: ${Object.entries(previews).map(([p, v]) => `${p}=${v.status}${v.paperPromotionEligible ? "*" : ""}`).join(" · ") || "none"}`);
  console.log(`  pending approval: ${pendingApproval.join(", ") || "none"} · paper cards: ${paperCards} (pending settle ${pendingSettlement}) · full-game-sim: ${fullGameSim.verdict} (non-driving)`);
  console.log(`  ▶ ${recommendedAction}`);
  if (!WRITE) console.log("  (read-only — pass --write-summary to persist)");
}

main();
