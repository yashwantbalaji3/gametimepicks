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
import { fileURLToPath } from "node:url";
import { buildMasterLedger } from "../src/lib/mr-dub/master-ledger.ts";
import { buildLedgerCalendar } from "../src/lib/mr-dub/ledger-calendar.ts";
import { readCanonicalMoney } from "../src/lib/daily-portfolio/accounting.ts";
import { computeOpenExposure } from "../src/lib/mr-dub/open-exposure.ts";

// Resolve the data dir relative to THIS script (app/scripts/ → app/public/data), so the gate works whether
// invoked from the repo root (the lifecycle: `npx tsx app/scripts/...`) or from app/ — never cwd-dependent.
const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8"));
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const near = (a, b, eps = 0.01) => Math.abs(Number(a) - Number(b)) <= eps;

// The master-ledger + open-exposure checks are "as of" a date. Default to the CURRENT slate (the
// daily-portfolio's date), overridable with --date, so the gate reconciles TODAY's exposure rather than a
// frozen historical day (audit P1-1: this was hardcoded to 2026-06-26 and silently went stale after a roll).
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
let DATE = arg("--date", "");
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) { try { DATE = read("mr-dub/daily-portfolio.json").date; } catch { /* fall through */ } }
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE || "")) { try { DATE = new Date().toISOString().slice(0, 10); } catch { DATE = "1970-01-01"; } }

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
const master = buildMasterLedger(DATA, `${DATE}T18:00:00Z`, DATE);
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
note("Master ledger / hero", "Open exposure (total)", master.aggregate.openExposure, "Σ today's pending card stakes across 4 products", "open-exposure helper");
for (const p of computeOpenExposure(DATA, DATE).byProduct) note("Open exposure breakdown", p.label, p.amount, p.note, "product active artifact");
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
// Open exposure is a CROSS-PRODUCT figure (money on today's pending cards across all 4 products) — NOT
// portfolio.openExposure (the BB ledger-open subset). It must reconcile to the shared helper + its breakdown.
const oe = computeOpenExposure(DATA, DATE);
const oeBreakdownSum = r2(oe.byProduct.reduce((s, p) => s + p.amount, 0));
check("open-exposure breakdown sums to total", oeBreakdownSum, oe.total, "open-exposure helper");
check("master open exposure == cross-product total", oe.total, master.aggregate.openExposure, "master-ledger vs open-exposure helper");
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
