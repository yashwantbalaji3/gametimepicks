#!/usr/bin/env node
/**
 * Cross-lane Bank Builder review — compares the current persisted Lane A/B cards against the freshly
 * generated, correlation-reviewed pair (picked jointly so the two lanes share no game), and on --apply
 * re-persists daily-portfolio.json.
 *
 *   npx tsx app/scripts/review-bank-builder-lanes.mjs --date 2026-06-23 --dry-run
 *   npx tsx app/scripts/review-bank-builder-lanes.mjs --date 2026-06-23 --apply
 *
 * SAFE: a replacement is only an upgrade when the lane's games are pre-event (the builder gates kickoff
 * + the 30m cutoff; a started game keeps its current card). Exposure stays the $100 seed/lane; active
 * bankroll + crown are NEVER changed (only official settlement moves them). Pre-event quality upgrade.
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
try { current = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch { /* none */ }
const fresh = buildPersistedDailyPortfolio(root, nowIso, date, nowIso, apply);

const bb = (dp) => (dp?.lanes ?? []).filter((l) => l.product === "bank-builder");
const legStr = (lane) => (lane?.legs ?? []).map((l) => `${l.selection} ${l.odds > 0 ? "+" : ""}${l.odds}`).join(" + ") || "(none)";
const games = (lane) => new Set((lane?.legs ?? []).map((l) => l.matchup));
const findLane = (lanes, l) => lanes.find((x) => x.lane === l);

console.log(`=== Bank Builder cross-lane review · ${apply ? "APPLY" : "DRY-RUN"} · ${date} ===`);
for (const f of bb(fresh)) {
  const c = findLane(bb(current), f.lane);
  const changed = !c || legStr(c) !== legStr(f);
  console.log(`\nLane ${f.lane} · Step ${f.step} — ${changed ? "REPLACE" : "keep"}${f.activationEligibility?.eligible === false ? " (blocked: " + f.activationEligibility.reason + ")" : ""}`);
  console.log(`  current : ${legStr(c)}${c ? ` → $${c.potentialReturn}` : ""}`);
  console.log(`  proposed: ${legStr(f)} → $${f.potentialReturn} (${f.combinedOdds > 0 ? "+" : ""}${f.combinedOdds}) · rung target $${f.targetReturn}`);
}
// Cross-lane independence summary.
const [A, B] = bb(fresh);
const overlap = [...games(A)].filter((g) => games(B).has(g));
console.log(`\nCross-lane game overlap: ${overlap.length ? overlap.join(", ") + " (NOT independent)" : "NONE — lanes are independent ✓"}`);
console.log(`exposure $${fresh.openExposure} · available $${fresh.availableBankroll} · active bankroll $${fresh.activeBankroll} (unchanged) · crown $${fresh.crownBankroll} (untouched)`);

if (apply) {
  fs.writeFileSync(OUT, JSON.stringify(fresh, null, 2) + "\n");
  console.log(`\nAPPLIED → re-persisted ${path.relative(process.cwd(), OUT)} (pre-event quality upgrade; exposure + active bankroll + crown unchanged).`);
} else {
  console.log("\nDRY-RUN only — no files written.");
}
