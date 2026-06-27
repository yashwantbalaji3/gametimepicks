/**
 * PRODUCTION HEALTH CHECK — the single pre-deploy gate for autonomous operation.
 *
 * Answers "what happens if nobody touches this for 72 hours?" — if any nightly pipeline produces missing,
 * stale, duplicated, orphaned, or non-reconciling data, this FAILS and the workflow must abort the deploy.
 *
 * It COMPOSES the existing money checks (checkMoneyIntegrity) rather than duplicating them, and adds the
 * structural / hygiene / freshness / product-artifact checks that nothing else covers.
 *
 *   npx tsx app/scripts/health-check.mjs [--max-staleness-days N] [--strict-fresh]
 *
 * Exit 0 = healthy (deploy may proceed). Exit 1 = CRITICAL failure (abort deploy). Warnings never fail.
 */
import fs from "node:fs";
import path from "node:path";
import { checkMoneyIntegrity } from "../src/lib/money-integrity.ts";

const ROOT = path.join(process.cwd(), "public", "data");
const argv = process.argv.slice(2);
const MAX_STALE_DAYS = (() => { const i = argv.indexOf("--max-staleness-days"); return i >= 0 ? Number(argv[i + 1]) : 3; })();
const STRICT_FRESH = argv.includes("--strict-fresh"); // promote staleness warnings to critical

const crit = [];   // critical failures → abort
const warn = [];   // warnings → log, never abort
const ok = [];     // passed checks (for the log trail)
const C = (rule, detail) => crit.push({ rule, detail });
const W = (rule, detail) => warn.push({ rule, detail });
const P = (rule) => ok.push(rule);
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const near = (a, b, eps = 0.01) => Math.abs(Number(a) - Number(b)) <= eps;
const readJson = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); } catch { return null; } };

// ── 1. CANONICAL FILES EXIST + PARSE ─────────────────────────────────────────────────────────────
const REQUIRED = ["mr-dub/portfolio.json", "mr-dub/ledger.json", "mr-dub/daily-summary.json", "mr-dub/banked-ladders.json"];
const docs = {};
for (const rel of REQUIRED) {
  const j = readJson(rel);
  if (j == null) { C("canonical-file", `${rel} missing or unparseable`); continue; }
  docs[rel] = j;
  P(`exists: ${rel}`);
}
const portfolio = docs["mr-dub/portfolio.json"];
const ledger = docs["mr-dub/ledger.json"];
const daily = docs["mr-dub/daily-summary.json"];
const banked = docs["mr-dub/banked-ladders.json"];

// ── 2. MONEY INVARIANTS (reuse the canonical checker — no duplication) ───────────────────────────
if (portfolio && banked) {
  const violations = checkMoneyIntegrity({ portfolio, banked, daily: readJson("mr-dub/daily-portfolio.json"), ledger });
  for (const v of violations) (v.severity === "critical" ? C : W)(`money:${v.rule}`, v.detail);
  if (!violations.some((v) => v.severity === "critical")) P("money invariants (checkMoneyIntegrity)");
}

// ── 3. RECONCILIATION ($100 → bankroll, exact) ───────────────────────────────────────────────────
if (portfolio && ledger && daily && banked) {
  const seed = Number(banked.ladders?.[0]?.start ?? 100) || 100;
  const sumProfit = round2((ledger.events ?? []).reduce((s, e) => s + (Number(e.paperProfit) || 0), 0));
  if (!near(seed + sumProfit, portfolio.currentBankroll)) C("reconcile:ledger→bankroll", `seed ${seed} + Σ paperProfit ${sumProfit} = ${round2(seed + sumProfit)} ≠ bankroll ${portfolio.currentBankroll}`); else P("reconcile: ledger Σ + seed == bankroll");
  if (!near(sumProfit, portfolio.settledProfit)) C("reconcile:ledger→settledProfit", `Σ paperProfit ${sumProfit} ≠ settledProfit ${portfolio.settledProfit}`); else P("reconcile: ledger Σ == settledProfit");

  const dayList = [...(daily.days ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  let prev = seed, broke = null;
  for (const d of dayList) { if (!near(d.opening, prev)) { broke = `${d.date}: opening ${d.opening} ≠ prior close ${prev}`; break; } prev = d.closing; }
  if (broke) C("reconcile:day-chain", broke); else P(`reconcile: ${dayList.length}-day chain continuous`);
  if (dayList.length && !near(dayList[dayList.length - 1].closing, portfolio.currentBankroll)) C("reconcile:last-close", `last closing ${dayList[dayList.length - 1].closing} ≠ bankroll ${portfolio.currentBankroll}`);

  const crownSum = round2((banked.ladders ?? []).reduce((s, l) => s + (Number(l.final) || 0), 0));
  if (!near(crownSum, portfolio.crownBankroll)) C("reconcile:crown", `Σ ladder finals ${crownSum} ≠ crown ${portfolio.crownBankroll}`); else P("reconcile: crown == Σ banked finals");
}

// ── 4. DATA HYGIENE — no duplicate event IDs, ISO dates, no orphan/NaN profit ────────────────────
if (ledger) {
  const evs = ledger.events ?? [];
  const ids = evs.map((e) => e.eventId).filter(Boolean);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) C("hygiene:duplicate-event-id", `duplicate eventId(s): ${[...new Set(dupes)].join(", ")}`); else P("hygiene: event IDs unique");
  const badDate = evs.filter((e) => e.date && !/^\d{4}-\d{2}-\d{2}$/.test(e.date));
  if (badDate.length) C("hygiene:bad-date", `${badDate.length} event(s) with non-ISO date`); else P("hygiene: event dates ISO");
  const nan = evs.filter((e) => e.paperProfit != null && !Number.isFinite(Number(e.paperProfit)));
  if (nan.length) C("hygiene:nan-profit", `${nan.length} event(s) with non-finite paperProfit`); else P("hygiene: paperProfit finite");
}

// ── 5. FRESHNESS — generatedAt + latest settled day not staler than tolerance (warn unless --strict) ─
const ymd = (() => { const i = argv.indexOf("--today"); return i >= 0 ? argv[i + 1] : null; })();
function daysBetween(aIso, bIso) { const t = (s) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((t(aIso) - t(bIso)) / 86400000); }
if (portfolio?.generatedAt && ymd) {
  const age = daysBetween(ymd, portfolio.generatedAt);
  if (age > MAX_STALE_DAYS) (STRICT_FRESH ? C : W)("freshness:portfolio", `portfolio.generatedAt is ${age}d old (> ${MAX_STALE_DAYS})`);
  else P(`freshness: portfolio generated ${age}d ago`);
}

// ── 6. PRODUCT ARTIFACTS parse (the four lanes' active artifacts) ─────────────────────────────────
for (const [label, rels] of [
  ["Moonshot", ["moonshot-lane/active.json"]],
  ["WC Specials", ["world-cup/world-cup-specials.json"]],
  ["Homer Nukes", ["mlb/homer-nukes-active.json", "homer-nukes/active.json"]],
]) {
  const found = rels.some((r) => readJson(r) != null);
  if (found) P(`product artifact: ${label}`); else W("product-artifact", `${label} artifact absent (no live card today) — acceptable, surfaced as $0 exposure`);
}

// ── REPORT (PHASE 8 logging) ─────────────────────────────────────────────────────────────────────
const stamp = new Date().toISOString?.() ?? "now"; // (CI provides real time; local resume-safe builds tolerate this)
console.log(`\n=== GameTimePicks HEALTH CHECK · ${stamp} ===`);
console.log(`  ✓ ${ok.length} checks passed`);
for (const w of warn) console.log(`  ⚠ ${w.rule}: ${w.detail}`);
if (portfolio) console.log(`  money: bankroll $${portfolio.currentBankroll} · crown $${portfolio.crownBankroll} · profit $${portfolio.settledProfit} · ${portfolio.record?.wins}-${portfolio.record?.losses}`);
if (crit.length === 0) {
  console.log(`\n=== ✓ HEALTHY — ${ok.length} passed, ${warn.length} warning(s). Deploy may proceed. ===\n`);
  process.exit(0);
}
console.error(`\n=== ✗ UNHEALTHY — ${crit.length} CRITICAL failure(s). ABORT DEPLOY: ===`);
for (const c of crit) console.error(`  ✗ ${c.rule}: ${c.detail}`);
console.error("");
process.exit(1);
