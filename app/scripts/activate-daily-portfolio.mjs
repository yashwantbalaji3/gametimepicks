#!/usr/bin/env node
/**
 * Activate the daily paper portfolio (Bank Builder A/B + Moonshot A/B).
 *
 *   npx tsx app/scripts/activate-daily-portfolio.mjs --date 2026-06-23 --dry-run
 *   npx tsx app/scripts/activate-daily-portfolio.mjs --date 2026-06-23 --apply
 *
 * Run via tsx (it imports the TS accounting lib so generation logic is never duplicated). DRY-RUN
 * prints the plan and writes nothing. APPLY persists app/public/data/mr-dub/daily-portfolio.json with
 * eligible lanes ACTIVE. It only ever sets open exposure / available / potential — it NEVER changes the
 * active bankroll, the crown, or any settlement record (those move only on official settlement).
 */
import fs from "node:fs";
import path from "node:path";
import { buildPersistedDailyPortfolio } from "../src/lib/daily-portfolio/accounting.ts";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const date = val("--date", new Date().toISOString().slice(0, 10));
const apply = has("--apply");
const nowIso = new Date().toISOString();
const root = path.join(process.cwd(), "app", "public", "data");
const OUT = path.join(root, "mr-dub", "daily-portfolio.json");

const dp = buildPersistedDailyPortfolio(root, nowIso, date, nowIso, apply);

console.log(`=== Daily portfolio activation · ${apply ? "APPLY" : "DRY-RUN"} · date=${date} ===`);
console.log("product       | lane | status    | legs | combined | stake | potential | eligible | reason");
for (const l of dp.lanes) {
  console.log(
    `${l.productLabel.padEnd(13)} |  ${l.lane}   | ${l.status.padEnd(9)} | ${String(l.legCount + "/" + l.targetLegs).padEnd(4)} | ${(l.combinedOdds > 0 ? "+" : "") + l.combinedOdds}`.padEnd(70) +
    ` | $${l.stake} | $${l.potentialReturn} | ${l.activationEligibility.eligible ? "yes" : "no "} | ${l.activationEligibility.reason}`
  );
}
console.log(`\nactive bankroll $${dp.activeBankroll} (unchanged) · open exposure $${dp.openExposure} · available $${dp.availableBankroll} · potential $${dp.potentialReturn} · crown $${dp.crownBankroll} (untouched)`);
console.log(`  Bank Builder exposure $${dp.products.bankBuilder.exposure} · Moonshot exposure $${dp.products.moonshot.exposure}`);

if (apply) {
  fs.writeFileSync(OUT, JSON.stringify(dp, null, 2) + "\n");
  console.log(`\nAPPLIED → wrote ${path.relative(process.cwd(), OUT)} (${dp.lanes.filter((l) => l.status === "active").length} active lanes). Active bankroll + crown unchanged.`);
} else {
  console.log("\nDRY-RUN only — no files written.");
}
