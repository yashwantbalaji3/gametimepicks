/**
 * Post-activation fix: Lane B activated correctly via the lock, but Lane A's lock didn't match the engine's
 * pool (activation-time id quirk). Directly write Lane A into the daily-portfolio with the operator-approved
 * legs (settlement-safe ids — parseLaneLeg handles team:<id>:<market>:<side>). Recompute the top-level
 * exposure. NEVER touches canonical bankroll/crown. The ladder Lane A restart already succeeded.
 *   cd app && npx tsx scripts/fix-lane-a-0627.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DP = path.join(APP, "public", "data", "mr-dub", "daily-portfolio.json");
const apply = process.argv.includes("--apply");
const dp = JSON.parse(fs.readFileSync(DP, "utf8"));
const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / -a);
const r2 = (n) => Math.round(n * 100) / 100;

const laneB = dp.lanes.find((l) => l.product === "bank-builder" && l.lane === "B");
const laneA = dp.lanes.find((l) => l.product === "bank-builder" && l.lane === "A");
if (!laneB) throw new Error("Lane B (template) not found");

const legs = [
  { id: "team:72:moneyline_90:away", matchup: "Jordan vs Argentina", market: "Match Result", selection: "Argentina", player: null, odds: -700, provider: laneB.legs[0].provider ?? "consensus", modelConfidence: 0.86, kickoffEt: "10:00 PM ET", risk: "Lower-volatility", photoUrl: null, teamLogo: null },
  { id: "team:71:btts:no", matchup: "Algeria vs Austria", market: "Both Teams To Score", selection: "Both teams to score: No", player: null, odds: -148, provider: laneB.legs[1].provider ?? "consensus", modelConfidence: 0.6, kickoffEt: "10:00 PM ET", risk: "Lower-volatility", photoUrl: null, teamLogo: null },
];
const combinedDecimal = legs.reduce((d, l) => d * dec(l.odds), 1);
const combinedOdds = combinedDecimal >= 2 ? Math.round((combinedDecimal - 1) * 100) : -Math.round(100 / (combinedDecimal - 1));
const stake = 100;
const newA = {
  id: "bank-builder-lane-a-step-1", product: "bank-builder", productLabel: "Bank Builder", lane: "A",
  step: 1, clearedSteps: 0, status: "active", stake, exposure: 100,
  targetReturn: laneB.targetReturn ?? 200, fitsTarget: r2(stake * combinedDecimal) >= 190,
  combinedOdds, combinedDecimal: Number(combinedDecimal.toFixed(4)), potentialReturn: r2(stake * combinedDecimal),
  legCount: 2, targetLegs: 2, legs,
  correlationNote: null, shortfallNote: null,
  whyThisCard: [
    "Operator executive-override restart (June 27 late slate): fresh $100 Step-1 on the only two not-yet-started 10 PM ET games.",
    "Conservative survival pick — Argentina to beat Jordan (heavy favorite) + no-both-score in Algeria/Austria; two uncorrelated games.",
  ],
  activationEligibility: { eligible: true, reason: "operator approved — both legs pre-event (10 PM ET kickoff)" },
  locked: true, approvedAt: new Date().toISOString(),
};

if (laneA) dp.lanes[dp.lanes.indexOf(laneA)] = newA;
else dp.lanes.unshift(newA);

// Recompute top-level exposure: Σ active BB/Moonshot lane exposures.
const active = dp.lanes.filter((l) => l.status === "active");
dp.openExposure = r2(active.reduce((s, l) => s + (l.exposure || 0), 0));
dp.availableBankroll = r2(dp.activeBankroll - dp.openExposure);
dp.potentialReturn = r2(active.filter((l) => l.product === "bank-builder").reduce((s, l) => s + (l.potentialReturn || 0), 0));
if (dp.products?.bankBuilder) { dp.products.bankBuilder.exposure = r2(active.filter((l) => l.product === "bank-builder").reduce((s, l) => s + (l.exposure || 0), 0)); }

console.log(`Lane A → ${legs.map((l) => l.selection).join(" + ")} | +${combinedOdds} | $${stake}→$${r2(stake * combinedDecimal)} | status active`);
console.log(`openExposure $${dp.openExposure} · available $${dp.availableBankroll} · activeBankroll $${dp.activeBankroll} (unchanged) · crown $${dp.crownBankroll} (unchanged)`);
if (!apply) { console.log("DRY-RUN — no write."); process.exit(0); }
fs.writeFileSync(DP, JSON.stringify(dp, null, 2) + "\n");
console.log("APPLIED → daily-portfolio.json Lane A written.");
