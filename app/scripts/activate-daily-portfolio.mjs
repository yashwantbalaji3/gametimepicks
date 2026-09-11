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
import { carryPlacedLanes } from "../src/lib/daily-portfolio/placed-lanes.mjs";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const date = val("--date", new Date().toISOString().slice(0, 10));
const apply = has("--apply");
/* Clock seam. Generation is scheduled at 15:30 UTC, before first pitch; run at any other hour the
 * pre-event filter legitimately empties the pool, and "0 legs" then says nothing about the slate.
 * Production default is unchanged — the wall clock. */
const nowIso = val("--now", new Date().toISOString());
// cwd-robust: this script must run from app/ (for the @/ alias) but may also be invoked from the repo
// root. Resolve public/data either way so readMoney always finds the canonical portfolio.json (a wrong
// root previously made it silently fall back to a stale single-ladder bankroll).
const root = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app", "public", "data");
const OUT = path.join(root, "mr-dub", "daily-portfolio.json");

const built = buildPersistedDailyPortfolio(root, nowIso, date, nowIso, apply);
/* P257: once a lane is placed for a date it stays placed — a same-date rerun never swaps a published card
   (lib/daily-portfolio/placed-lanes.mjs; the 2026-09-11 incident). */
const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : null;
const { dp, carried } = carryPlacedLanes(existing, built);

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

for (const c of carried) console.log(`carried placed lane ${c.lane}${c.changedLegs ? ` — this run would have swapped it (fresh: ${c.freshStatus}); the published card stands` : ""}`);
if (apply) {
  fs.writeFileSync(OUT, JSON.stringify(dp, null, 2) + "\n");
  console.log(`\nAPPLIED → wrote ${path.relative(process.cwd(), OUT)} (${dp.lanes.filter((l) => l.status === "active").length} active lanes). Active bankroll + crown unchanged.`);
} else {
  console.log("\nDRY-RUN only — no files written.");
}
