/**
 * FORENSIC MONEY AUDIT — soft-launch readiness.
 *
 * Reconstructs the entire $100 → ending bankroll journey from the canonical per-event ledger and proves
 * that EVERY financial value rendered anywhere on the site reconciles to it — exactly, to the cent. It
 * imports the SAME modules the UI uses (buildMasterLedger, buildLedgerCalendar, readCanonicalMoney) so the
 * audit checks the actual displayed values, not a re-derivation. Exits non-zero on ANY mismatch.
 *
 *   node --import tsx scripts/forensic-money-audit.mjs   (or: npx tsx scripts/forensic-money-audit.mjs)
 */
import fs from "node:fs";
import path from "node:path";
import { buildMasterLedger } from "../src/lib/mr-dub/master-ledger.ts";
import { buildLedgerCalendar } from "../src/lib/mr-dub/ledger-calendar.ts";
import { readCanonicalMoney } from "../src/lib/daily-portfolio/accounting.ts";

const DATA = path.join(process.cwd(), "public", "data");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8"));
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const near = (a, b, eps = 0.01) => Math.abs(Number(a) - Number(b)) <= eps;

const portfolio = read("mr-dub/portfolio.json");
const banked = read("mr-dub/banked-ladders.json");
const daily = read("mr-dub/daily-summary.json");
const ledger = read("mr-dub/ledger.json");

const START = 100;
const checks = []; // { id, expected, actual, ok, source }
const matrix = []; // { surface, component, value, calc, source }
const note = (surface, component, value, calc, source) => matrix.push({ surface, component, value, calc, source });
const check = (id, expected, actual, source) => { const ok = near(expected, actual); checks.push({ id, expected: r2(expected), actual: r2(actual), ok, source }); return ok; };

// ── 1. CANONICAL RECONSTRUCTION from the per-event ledger (the one source of truth) ──────────────
const events = ledger.events ?? [];
const sumProfit = r2(events.reduce((s, e) => s + (Number(e.paperProfit) || 0), 0));
const reconstructedBankroll = r2(START + sumProfit);

// ── 2. DAY-BY-DAY chain (daily-summary) ──────────────────────────────────────────────────────────
const days = [...(daily.days ?? [])].sort((a, b) => a.date.localeCompare(b.date));
let prevClose = START, chainBreaks = [];
for (const d of days) {
  if (!near(d.opening, prevClose)) chainBreaks.push(`${d.date}: opening ${d.opening} ≠ prior close ${prevClose}`);
  if (!near(d.closing, r2(d.opening + d.pl))) chainBreaks.push(`${d.date}: closing ${d.closing} ≠ opening+pl ${r2(d.opening + d.pl)}`);
  prevClose = d.closing;
}
const dailySumPl = r2(days.reduce((s, d) => s + d.pl, 0));
const firstOpening = days[0]?.opening, lastClosing = days[days.length - 1]?.closing;

// ── 3. CROWN = Σ banked completed-ladder finals ────────────────────────────────────────────────
const crownFromLadders = r2((banked.ladders ?? []).reduce((s, l) => s + (Number(l.final) || 0), 0));

// ── 4. MASTER LEDGER (the computed cross-product view the page renders) ─────────────────────────
const master = buildMasterLedger(DATA, "2026-06-26T18:00:00Z", "2026-06-26");
const bbEntry = master.products.find((p) => p.productId === "bank-builder");
const sideNet = r2(master.products.filter((p) => !p.canonical).reduce((s, p) => s + p.profit, 0));

// ── 5. CALENDAR (the computed view) ─────────────────────────────────────────────────────────────
const cal = buildLedgerCalendar(days, START);

// ── 6. readCanonicalMoney (used by daily-portfolio / allocation / moonshot) ─────────────────────
const canon = readCanonicalMoney(DATA);

// ───────────────────────── MATRIX (every displayed financial value) ─────────────────────────────
note("Mr.Dub hero / status bar / today card", "Paper bankroll", portfolio.currentBankroll, "ledger Σprofit + $100", "portfolio.json.currentBankroll");
note("Mr.Dub hero money path", "Realized profit", portfolio.settledProfit, "bankroll − $100", "portfolio.json.settledProfit");
note("Mr.Dub hero", "Crown / HWM", portfolio.crownBankroll, "Σ banked ladder finals", "portfolio.json.crownBankroll");
note("Mr.Dub hero", "Drawdown", portfolio.drawdown, "crown − bankroll", "portfolio.json.drawdown");
note("Mr.Dub hero", "ROI multiple", portfolio.roiMultiple, "settledProfit / $100", "portfolio.json.roiMultiple");
note("Mr.Dub hero / status bar", "Record", `${portfolio.record.wins}-${portfolio.record.losses}`, "settled cards", "portfolio.json.record");
note("Achievement banner", "Paper profit", portfolio.settledProfit, "canonical settledProfit", "portfolio.json.settledProfit");
note("Master ledger", "Bank Builder realized", bbEntry?.profit, "canonical settledProfit", "master-ledger ← portfolio.json");
note("Master ledger", "Side-lane net", master.aggregate.sideLaneNet, "Σ flat (payout−stake)", "product-ledger/{moonshot,wc,homer}.json");
note("Master ledger", "All-products net / lifetime", master.aggregate.lifetimeProfit, "BB realized + side net", "master-ledger");
note("Master ledger", "Open exposure", master.aggregate.openExposure, "canonical placed exposure", "portfolio.json.openExposure");
note("Calendar stats", "Current bankroll", cal.stats.currentBankroll, "last day closing", "daily-summary.json");
note("Calendar stats", "High-water", cal.stats.highWaterMark, "max day closing", "daily-summary.json");
note("Calendar stats", "ROI multiple", cal.stats.roiMultiple, "totalPl / $100", "daily-summary.json");
note("Moonshot / allocation", "Active bankroll", canon.activeBankroll, "readCanonicalMoney", "portfolio.json → banked fallback");
note("Moonshot / allocation", "Crown", canon.crownBankroll, "readCanonicalMoney", "portfolio.json → banked fallback");

// ───────────────────────── CHECKS (expected vs actual, must all reconcile) ──────────────────────
check("ledger Σprofit + $100 == bankroll", reconstructedBankroll, portfolio.currentBankroll, "ledger.json vs portfolio.json");
check("Σ daily P/L == settledProfit", dailySumPl, portfolio.settledProfit, "daily-summary vs portfolio");
check("bankroll − $100 == settledProfit", r2(portfolio.currentBankroll - START), portfolio.settledProfit, "portfolio.json");
check("ledger Σprofit == settledProfit", sumProfit, portfolio.settledProfit, "ledger vs portfolio");
check("day-chain first opening == $100", firstOpening, START, "daily-summary");
check("day-chain last closing == bankroll", lastClosing, portfolio.currentBankroll, "daily-summary vs portfolio");
check("crown (Σ ladder finals) == crownBankroll", crownFromLadders, portfolio.crownBankroll, "banked-ladders vs portfolio");
check("crown == HWM", portfolio.crownBankroll, portfolio.highWaterMark, "portfolio.json");
check("crown − bankroll == drawdown", r2(portfolio.crownBankroll - portfolio.currentBankroll), portfolio.drawdown, "portfolio.json");
check("ROI multiple == settledProfit/$100", r2(portfolio.settledProfit / START), portfolio.roiMultiple, "portfolio.json");
check("master BB profit == settledProfit", bbEntry?.profit, portfolio.settledProfit, "master-ledger vs portfolio");
check("master BB record W == canonical", bbEntry?.record.wins, portfolio.record.wins, "master-ledger vs portfolio");
check("master BB record L == canonical", bbEntry?.record.losses, portfolio.record.losses, "master-ledger vs portfolio");
check("master lifetime == BB + side net", r2(bbEntry?.profit + sideNet), master.aggregate.lifetimeProfit, "master-ledger");
check("master open exposure == canonical", portfolio.openExposure, master.aggregate.openExposure, "master-ledger vs portfolio");
check("calendar bankroll == portfolio", cal.stats.currentBankroll, portfolio.currentBankroll, "calendar vs portfolio");
check("calendar HWM == portfolio crown", cal.stats.highWaterMark, portfolio.crownBankroll, "calendar vs portfolio");
check("calendar ROI == portfolio ROI", cal.stats.roiMultiple, portfolio.roiMultiple, "calendar vs portfolio");
check("readCanonicalMoney bankroll == portfolio", canon.activeBankroll, portfolio.currentBankroll, "accounting vs portfolio");
check("readCanonicalMoney crown == portfolio", canon.crownBankroll, portfolio.crownBankroll, "accounting vs portfolio");
// Fallback guard: readCanonicalMoney's derive-path now uses the LEDGER (Σ paperProfit + seed), which
// includes the live cycle — so it must equal the canonical bankroll even if portfolio.json were absent.
const seed = Number(banked.ladders?.[0]?.start ?? 100) || 100;
const ledgerFallbackBankroll = r2(seed + sumProfit);
check("ledger-based fallback bankroll == canonical bankroll", ledgerFallbackBankroll, portfolio.currentBankroll, "ledger fallback vs portfolio");
// And prove the OLD base formula was indeed stale (documents WHY we no longer use it).
const staleBaseFormula = r2(banked.crownTotal + (banked.historicalDualLaneLosses ?? 0));
matrix.push({ surface: "(deprecated)", component: "banked-base formula (NOT used)", value: staleBaseFormula, calc: "crownTotal + historicalDualLaneLosses", source: `stale base — omits live cycle; replaced by ledger derivation` });

// ───────────────────────── OUTPUT ───────────────────────────────────────────────────────────────
console.log("\n=== FINANCIAL VALUE MATRIX (every displayed money figure → source) ===");
for (const m of matrix) console.log(`  ${String(m.value).padStart(12)}  ${m.surface} › ${m.component}  [${m.source}]`);

console.log("\n=== RECONCILIATION CHECKS (expected vs actual) ===");
let failed = 0;
for (const c of checks) {
  const status = c.ok ? "✓" : "✗ FAIL";
  if (!c.ok) failed++;
  console.log(`  ${c.ok ? "✓" : "✗"} ${c.id.padEnd(48)} expected ${String(c.expected).padStart(11)}  actual ${String(c.actual).padStart(11)}  [${c.source}]`);
}

console.log("\n=== DAY-CHAIN ===");
console.log(`  ${days.length} settled days · first opening $${firstOpening} · last closing $${lastClosing} · Σ daily P/L $${dailySumPl}`);
if (chainBreaks.length) { console.log("  ✗ CHAIN BREAKS:"); for (const b of chainBreaks) console.log("    " + b); failed += chainBreaks.length; }
else console.log("  ✓ chain continuous (every opening == prior closing; every closing == opening + P/L)");

console.log(`\n=== RESULT: ${failed === 0 ? "✓ MATHEMATICALLY PERFECT — every value reconciles to the $100 → $" + portfolio.currentBankroll + " journey" : "✗ " + failed + " RECONCILIATION FAILURE(S)"} ===\n`);
process.exit(failed === 0 ? 0 : 1);
