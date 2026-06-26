/**
 * verify-money-integrity.mjs — the daily chain's financial gate. Loads the canonical money artifacts and
 * runs the cumulative-crown invariants (src/lib/money-integrity.ts). Exits 1 on ANY critical violation so
 * the nightly pipeline FAILS LOUDLY and never settles/publishes on a corrupted bankroll. Read-only.
 *
 *   cd app && npx tsx scripts/verify-money-integrity.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { checkMoneyIntegrity } from "../src/lib/money-integrity.ts";

const root = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app", "public", "data", "mr-dub");
const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(root, f), "utf8")); } catch { return null; } };

const docs = {
  portfolio: load("portfolio.json"),
  banked: load("banked-ladders.json"),
  daily: load("daily-portfolio.json"),
  ledger: load("ledger.json"),
};

const violations = checkMoneyIntegrity(docs);
const critical = violations.filter((v) => v.severity === "critical");
const warnings = violations.filter((v) => v.severity === "warn");

if (docs.portfolio) {
  const p = docs.portfolio;
  console.log(`[money-integrity] crown $${p.crownBankroll} · bankroll $${p.currentBankroll} · profit $${p.settledProfit} · drawdown $${p.drawdown} · ROI ${p.roi}× · record ${p.record?.wins}-${p.record?.losses}`);
}
for (const w of warnings) console.log(`  ⚠ ${w.rule}: ${w.detail}`);
if (critical.length === 0) {
  console.log(`[money-integrity] ✓ all invariants hold (${warnings.length} warning(s)).`);
  process.exit(0);
}
console.error(`[money-integrity] ✗ ${critical.length} CRITICAL violation(s) — refusing to proceed:`);
for (const v of critical) console.error(`  ✗ ${v.rule}: ${v.detail}`);
process.exit(1);
