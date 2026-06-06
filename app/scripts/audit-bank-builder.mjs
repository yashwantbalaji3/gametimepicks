/**
 * audit-bank-builder — READ-ONLY guard that a conservative "Top Pick of the
 * Day" / Bank Builder slip is constructible from the slate and obeys the
 * conservative contract:
 *   - exists (FAIL if no qualifying conservative stack)
 *   - 2–3 legs
 *   - EVERY leg is a negative-odds favorite (FAIL on any plus-money/even leg)
 *   - recentGames metadata present for all legs (FAIL otherwise — modal needs it)
 *   - no target-game leakage in recentGames
 * Reports the chosen pick (legs, combined odds, $10 payout, per-leg L5).
 *
 * Mirrors selectBankBuilderSlip: pick the LOWEST combined-decimal (safest)
 * 2-leg all-negative stack from the published pool (publicRiskSections union).
 *
 * Run: cd app && npx tsx scripts/audit-bank-builder.mjs --date 2026-06-06 [--write-report]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { sectionSlipsForSport } from "../src/lib/suggested-parlay-grouping.ts";
import { filterOfficialSuggestedSlips } from "../src/lib/sport-capabilities.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "public", "data");
const DOCS = resolve(__dirname, "..", "..", "docs", "audits");
const argv = process.argv;
const di = argv.indexOf("--date");
const DATE = di >= 0 && argv[di + 1] ? argv[di + 1] : "2026-06-06";
const WRITE = argv.includes("--write-report");
const RISKS = ["low", "medium", "high", "longshot"];

function loadJSON(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }
function decimal(am) { return am >= 0 ? 1 + am / 100 : 1 + 100 / Math.abs(am); }
function americanFromDecimal(d) { return d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)); }
function l5(leg) {
  const rg = Array.isArray(leg.recentGames) ? leg.recentGames.slice(-5) : [];
  const line = leg.line, side = (leg.side || "").toLowerCase();
  if (typeof line !== "number" || !rg.length || (side !== "over" && side !== "under")) return "n/a";
  let d = 0, h = 0;
  for (const g of rg) { const v = g?.value; if (typeof v !== "number" || v === line) continue; d++; if (side === "over" ? v > line : v < line) h++; }
  return d ? `${h}/${d}` : "n/a";
}

const opt = loadJSON(resolve(DATA, "parlays", "optimizer", `${DATE}.json`));
if (!opt) { console.log(`No optimizer for ${DATE}`); process.exit(0); }
const prs = opt.publicRiskSections || {};

// union of published slips, official filter (drop mixed)
const seen = new Set();
const slips = [];
for (const r of RISKS) {
  for (const s of filterOfficialSuggestedSlips(sectionSlipsForSport(prs[r] || {}, "all"))) {
    const id = s.slipId ?? JSON.stringify((s.legs || []).map((l) => [l.playerId, l.market, l.side, l.line]));
    if (seen.has(id)) continue; seen.add(id); slips.push(s);
  }
}

// conservative candidates: 2-3 legs, all negative odds, usable price
const cands = [];
for (const s of slips) {
  const legs = s.legs || [];
  if (legs.length < 2 || legs.length > 3) continue;
  if (!legs.every((l) => typeof l.oddsForSide === "number" && l.oddsForSide < 0)) continue;
  let dec = 1; let ok = true;
  for (const l of legs) { if (typeof l.oddsForSide !== "number") { ok = false; break; } dec *= decimal(l.oddsForSide); }
  if (!ok) continue;
  cands.push({ slip: s, legs, dec, legCount: legs.length });
}
cands.sort((a, b) => Math.abs(a.legCount - 2) - Math.abs(b.legCount - 2) || a.dec - b.dec);

const fails = [], warns = [];
let pick = null;
if (!cands.length) {
  fails.push("no conservative 2-3 leg all-negative-odds stack exists → no Top Pick / Bank Builder");
} else {
  pick = cands[0];
  for (const l of pick.legs) {
    if (typeof l.oddsForSide !== "number" || l.oddsForSide >= 0) fails.push(`Bank Builder leg ${l.playerName} has non-negative odds ${l.oddsForSide}`);
    if (!Array.isArray(l.recentGames) || l.recentGames.length === 0) fails.push(`Bank Builder leg ${l.playerName} missing recentGames metadata`);
    for (const g of (l.recentGames || [])) if (g?.date && String(g.date) >= DATE) fails.push(`Bank Builder leg ${l.playerName} recentGames leaks slate/future date ${g.date}`);
  }
}

const verdict = fails.length ? "FAIL" : warns.length ? "WARN" : "PASS";
console.log(`Bank Builder ${DATE}: ${verdict}`);
if (pick) {
  const am = americanFromDecimal(pick.dec);
  const payout = (10 * pick.dec).toFixed(2);
  console.log(`  Top Pick: ${pick.legCount} legs · combined ${am >= 0 ? "+" : ""}${am} · $10 → $${payout}`);
  for (const l of pick.legs) console.log(`    - ${l.playerName} ${l.market} ${l.side} ${l.line} @ ${l.oddsForSide} · L5 ${l5(l)} · ${l.team || "?"} vs ${l.opponent || "?"}`);
}
for (const f of fails) console.log(`  [FAIL] ${f}`);
for (const w of warns) console.log(`  [WARN] ${w}`);

if (WRITE) {
  const m = [];
  m.push(`# Bank Builder / Top Pick Audit — ${DATE} (auto-generated)`);
  m.push("");
  m.push("> `audit-bank-builder.mjs --write-report` · READ-ONLY · no paid API · no data/model change.");
  m.push("> Verifies a conservative 2–3 leg all-negative-odds Top Pick exists with fresh metadata and no leakage.");
  m.push("");
  m.push(`## Verdict: ${verdict}`);
  if (pick) {
    const am = americanFromDecimal(pick.dec);
    m.push(`- **Top Pick:** ${pick.legCount} legs · combined ${am >= 0 ? "+" : ""}${am} · $10 → $${(10 * pick.dec).toFixed(2)}`);
    for (const l of pick.legs) m.push(`  - ${l.playerName} · ${l.market} ${l.side} ${l.line} @ ${l.oddsForSide} · L5 ${l5(l)} · ${l.team || "?"} vs ${l.opponent || "?"}`);
  }
  for (const f of fails) m.push(`- FAIL: ${f}`);
  for (const w of warns) m.push(`- WARN: ${w}`);
  m.push("");
  m.push("*Read-only; no change to data/model/grading.*");
  mkdirSync(DOCS, { recursive: true });
  writeFileSync(resolve(DOCS, "bank-builder-latest.md"), m.join("\n"), "utf8");
  console.log("[--write-report] wrote bank-builder-latest.md");
}
process.exit(verdict === "FAIL" ? 1 : 0);
