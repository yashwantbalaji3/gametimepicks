#!/usr/bin/env node
/**
 * THE MONEY AUDIT — one deterministic command that reconstructs the protected Mr. Dub bankroll card by card
 * (Session 8 · A). Read-only: it proves, it never repairs. Exit 1 on any disagreement.
 *
 *   npm run money:audit                 # summary + the last 15 movements + open positions
 *   npm run money:audit -- --all        # every movement
 *   npm run money:audit -- --json <f>   # also write the full reconciliation (movements included) to <f>
 *
 * The rules it checks are in docs/MR_DUB_MONEY_LEDGER.md; the logic is lib/mr-dub/money-movements.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reconcileMoney } from "../../src/lib/mr-dub/money-movements.mjs";
import { checkProtectedLedger, readReceiptsFrom } from "../../src/lib/mr-dub/protected-invariant.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(APP, "public", "data", "mr-dub", f), "utf8"));
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };

const portfolio = read("portfolio.json");
const receipts = readReceiptsFrom(APP);
const r = reconcileMoney({ portfolio, ledgerEvents: read("ledger.json").events ?? [], summaryDays: read("daily-summary.json").days ?? [], receipts });
const inv = checkProtectedLedger(portfolio, receipts);
const usd = (n) => (n == null ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const s = r.summary;

console.log("=== MR. DUB MONEY AUDIT (protected record, official money only) ===");
console.log(`  current bankroll   ${usd(s.currentBankroll)}   (recomputed ${usd(s.recomputedBankroll)})`);
console.log(`  historical peak    ${usd(s.peak)} on ${s.peakDate}   (stored crown ${usd(s.storedCrown)})`);
console.log(`  difference         ${usd(s.deltaToPeak)}`);
console.log(`  open positions     ${s.openPositions} · seed at risk ${usd(s.openSeedAtRisk)} · lane stake ${usd(s.openLaneStake)}`);
console.log(`  completion policy  ${s.completionPolicy.id} from ${s.completionPolicy.effectiveFrom} · ${s.completions} completed run(s) banked ${usd(s.completionsBanked)}`);
console.log(`  folded through     ${s.foldedThrough} · ${s.rows} movements (${Object.entries(s.rowsByEra).map(([k, v]) => `${k} ${v}`).join(", ")})`);
console.log("");
const rows = process.argv.includes("--all") ? r.movements : r.movements.slice(-15);
console.log("  date        product        lane step       stake      return   ticket P/L   bankroll Δ   balance after");
for (const m of rows) {
  console.log(`  ${m.date}  ${m.product.padEnd(13)} ${String(m.lane ?? "").padEnd(5)}${String(m.step ?? "").padStart(4)} ${usd(m.stake).padStart(11)} ${usd(m.return).padStart(11)} ${(m.economicPnl == null ? "—" : usd(m.economicPnl)).padStart(12)} ${usd(m.bankrollDelta).padStart(12)} ${usd(m.bankrollAfter).padStart(15)}`);
}
for (const o of r.open) console.log(`  OPEN ${o.date} ${o.product} ${o.lane} step ${o.step} stake ${usd(o.stake)} (seed at risk ${usd(o.seedAtRisk)})`);
console.log("");
const reasons = [...r.reasons, ...inv.reasons.map((x) => `protected invariant: ${x}`)];
if (arg("--json")) { fs.writeFileSync(arg("--json"), JSON.stringify({ ...r, invariant: inv }, null, 2) + "\n"); console.log(`  wrote ${arg("--json")}`); }
if (reasons.length) { console.error(`=== ✗ MONEY DOES NOT RECONCILE (${reasons.length}) ===`); for (const x of reasons) console.error(`  ✗ ${x}`); process.exit(1); }
console.log("=== ✓ RECONCILED — starting $100 + every official movement = the bankroll; recomputed peak = high-water mark (≥ the June crown) ===");
