#!/usr/bin/env node
/**
 * Review + (optionally) upgrade the active daily portfolio's PRE-EVENT cards to the current
 * model-best legs. Shows the current persisted card vs the freshly-generated card per lane, with the
 * replacement decision + reason, then (on --apply) re-persists daily-portfolio.json.
 *
 *   npx tsx app/scripts/review-and-upgrade-daily-portfolio.mjs --date 2026-06-23 --dry-run
 *   npx tsx app/scripts/review-and-upgrade-daily-portfolio.mjs --date 2026-06-23 --apply
 *
 * SAFE: a replacement is only an upgrade when the lane's games are pre-event (the builder gates kickoff
 * + the 30m cutoff; a started game keeps its current card). Exposure stays the $100 seed / $25 Moonshot
 * stake; active bankroll + crown are NEVER changed (only official settlement moves them). This is a
 * pre-event quality upgrade, not a settlement.
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

let current = null;
try { current = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch { /* none yet */ }
const fresh = buildPersistedDailyPortfolio(root, nowIso, date, nowIso, apply);

const legStr = (lane) => (lane?.legs ?? []).map((l) => `${l.selection} ${l.odds > 0 ? "+" : ""}${l.odds}`).join(" + ") || "(none)";
const find = (dp, id) => (dp?.lanes ?? []).find((l) => l.product === id.product && l.lane === id.lane);

console.log(`=== Daily portfolio review/upgrade · ${apply ? "APPLY" : "DRY-RUN"} · ${date} ===`);
for (const f of fresh.lanes) {
  const c = current ? find(current, f) : null;
  const changed = !c || legStr(c) !== legStr(f);
  console.log(`\n${f.productLabel} Lane ${f.lane}${f.step ? ` · Step ${f.step}` : ""} — ${changed ? "REPLACE" : "keep"} ${f.activationEligibility?.eligible === false ? "(blocked: " + f.activationEligibility.reason + ")" : ""}`);
  console.log(`  current : ${legStr(c)}${c ? ` → $${c.potentialReturn}` : ""}`);
  console.log(`  proposed: ${legStr(f)} → $${f.potentialReturn} (${f.combinedOdds > 0 ? "+" : ""}${f.combinedOdds})`);
  if (changed && f.whyThisCard?.[0]) console.log(`  reason  : ${f.whyThisCard[0]}`);
}
console.log(`\nexposure $${fresh.openExposure} · available $${fresh.availableBankroll} · active bankroll $${fresh.activeBankroll} (unchanged) · crown $${fresh.crownBankroll} (untouched)`);

if (apply) {
  fs.writeFileSync(OUT, JSON.stringify(fresh, null, 2) + "\n");
  console.log(`\nAPPLIED → re-persisted ${path.relative(process.cwd(), OUT)} (pre-event quality upgrade; exposure + active bankroll + crown unchanged).`);
} else {
  console.log("\nDRY-RUN only — no files written.");
}
