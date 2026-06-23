#!/usr/bin/env node
/**
 * Settle the active daily paper portfolio — settlement-ready STUB.
 *
 *   npx tsx app/scripts/settle-daily-portfolio.mjs --date 2026-06-23 --dry-run
 *
 * Reports each active lane's legs + per-leg status. It NEVER fabricates a result: a lane can only be
 * settled once every leg's game is officially final (graded from official sources by the stepped
 * settlement engine). Until then this is dry-run only and reports "awaiting official final". On
 * settlement the daily portfolio would update active bankroll, open exposure, available bankroll,
 * product records, and daily P/L — and never touch the crown. `--apply` is refused while any leg is
 * not final (no fake settlement).
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const date = val("--date", new Date().toISOString().slice(0, 10));
const apply = has("--apply");
const root = path.join(process.cwd(), "app", "public", "data");
const FILE = path.join(root, "mr-dub", "daily-portfolio.json");

let dp;
try { dp = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { console.error(`[settle] no daily portfolio at ${FILE}`); process.exit(1); }
if (dp.date !== date) { console.error(`[settle] portfolio is for ${dp.date}, not ${date}`); process.exit(1); }

const active = (dp.lanes ?? []).filter((l) => l.status === "active");
console.log(`=== Settle daily portfolio · ${apply ? "APPLY" : "DRY-RUN"} · ${date} · ${active.length} active lanes ===`);
for (const l of active) {
  console.log(`  ${l.productLabel} Lane ${l.lane} · stake $${l.stake} · ${l.legCount} legs · settlement=${dp.settlement?.status ?? "pending"}`);
  for (const g of l.legs ?? []) console.log(`     ${g.matchup} · ${g.market}: ${g.selection} (${g.odds > 0 ? "+" : ""}${g.odds}) → awaiting official final`);
}
console.log(`\nactive bankroll $${dp.activeBankroll} · open exposure $${dp.openExposure} · available $${dp.availableBankroll} · crown $${dp.crownBankroll} (never touched on settlement)`);

if (apply) {
  console.error("\n[settle] --apply REFUSED: no leg's game is officially final yet (June 23 games are NS/pre-event).\n  Settlement is gated on official results — re-run --apply after the games are final. No fake settlement performed.");
  process.exit(2);
}
console.log("\nDry-run only — no settlement performed (settlement-ready; awaiting official finals).");
