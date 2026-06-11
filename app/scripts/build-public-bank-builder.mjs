/**
 * build-public-bank-builder — assembles the PUBLIC $100→$10,000 Bank Builder ledger
 * from official settled data + the user-approved 2026-06-11 policy migration (see
 * docs/operations/bank-builder-100-to-10000-policy-migration-2026-06-11.md).
 *
 * Step 1 = June 9 official MLB win (from the canonical ledger).
 * Step 2 = June 10 official NBA Finals featured hit (from featured-latest.json).
 * Neither is fabricated; the canonical tracked ledger is preserved untouched.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveLadderStep, BANK_BUILDER_GOAL } from "../src/lib/bank-builder-ladder.ts";

const dir = path.join(process.cwd(), "public", "data", "bank-builder");
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const canonical = read("ledger-latest.json");
const featured = read("featured-latest.json");
const j9 = (canonical.entries || []).find((e) => e.date === "2026-06-09");
if (!j9) throw new Error("June 9 canonical entry not found");

const entries = [
  {
    step: 1, date: "2026-06-09", sport: "MLB", result: j9.result,
    bankrollBefore: 100, bankrollAfter: j9.bankrollAfter, // 211.85
    stakeUnits: 100, payoutUnits: j9.bankrollAfter,
    profitUnits: Math.round((j9.bankrollAfter - 100) * 100) / 100,
    combinedAmerican: j9.combinedAmerican, settlementSource: j9.settlementSource,
    officialResultConfirmed: true,
    legs: (j9.legs || []).map((l) => ({ player: l.player, market: l.market, side: l.side, line: l.line, result: l.result, finalStat: l.finalStat })),
  },
  {
    step: 2, date: "2026-06-10", sport: "NBA", event: featured.event, result: featured.result,
    bankrollBefore: featured.stakeDollars, bankrollAfter: featured.settledReturn, // 211.85 -> 728.76
    stakeUnits: featured.stakeDollars, payoutUnits: featured.settledReturn,
    profitUnits: featured.profit, combinedAmerican: featured.combinedAmerican,
    settlementSource: featured.settlementSource, officialResultConfirmed: featured.officialResultConfirmed,
    sameGame: true, correlationNote: featured.correlationNote,
    legs: featured.legs.map((l) => ({ player: l.player, market: l.market, side: l.side, line: l.line, oddsForSide: l.oddsForSide, result: l.result, finalStat: l.finalStat })),
  },
];

const bankroll = entries[entries.length - 1].bankrollAfter; // 728.76
const step = resolveLadderStep(bankroll);
const wins = entries.filter((e) => e.result === "win").length;
const losses = entries.filter((e) => e.result === "loss").length;

const ledger = {
  _disclaimer: "Public paper bankroll — educational tracking only, not betting advice, not a guarantee.",
  ladder: "100-to-10000", base: 100, goal: BANK_BUILDER_GOAL,
  migratedAt: "2026-06-11T05:10:00Z",
  migrationDoc: "docs/operations/bank-builder-100-to-10000-policy-migration-2026-06-11.md",
  entries,
  nextPickStatus: "pending", nextEligibleDate: "2026-06-11",
  nextStakeUnits: bankroll, nextTargetUnits: step ? step.goal : BANK_BUILDER_GOAL,
};
const summary = {
  _disclaimer: ledger._disclaimer, ladder: "100-to-10000",
  startingBankrollUnits: 100, currentBankrollUnits: bankroll,
  currentProgressionStep: step ? step.step : 5,
  currentStepStart: step ? step.start : null, currentStepGoal: step ? step.goal : null,
  goalUnits: BANK_BUILDER_GOAL,
  record: { wins, losses, pushes: 0 }, currentStreak: 2,
  lastSettledDate: "2026-06-10", lastSettledResult: "win",
  lastSettledLabel: "NBA Finals HIT",
  nextTargetUnits: step ? step.goal : BANK_BUILDER_GOAL,
  generatedAt: "2026-06-11T05:10:00Z",
};

fs.writeFileSync(path.join(dir, "public-ledger-latest.json"), JSON.stringify(ledger, null, 2) + "\n");
fs.writeFileSync(path.join(dir, "public-ledger-2026-06-11.json"), JSON.stringify(ledger, null, 2) + "\n");
fs.writeFileSync(path.join(dir, "public-summary-latest.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(`public ladder: $${bankroll} | step ${summary.currentProgressionStep}/5 -> target $${summary.nextTargetUnits} | record ${wins}-${losses} | steps: ${entries.map((e)=>e.step+":"+e.sport+":"+e.result).join(", ")}`);
