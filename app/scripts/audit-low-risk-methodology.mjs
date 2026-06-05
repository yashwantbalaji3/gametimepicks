/**
 * audit-low-risk-methodology — READ-ONLY guard that asserts every LOW-risk
 * published card on a slate obeys the conservative policy (PR #282 +
 * fix/june5-risk-methodology-and-form):
 *   - L10 hit rate >= 80% (>= 90% for a near-even price)
 *   - trusted, non-stale recent form (dated recentGames latest within N days)
 *   - no plus-money leg > +110
 *   - no missing/short recentSeries (fail closed)
 *   - a LOW card cannot contain a non-LOW-eligible leg
 * Also reports Medium/High/Longshot populated counts (honest depth, not padded).
 * No paid API, no data/model/grading change.
 *
 * Run: cd app && npx tsx scripts/audit-low-risk-methodology.mjs --date 2026-06-05 [--write-report]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "public", "data");
const DOCS = resolve(__dirname, "..", "..", "docs", "audits");
const argv = process.argv;
const di = argv.indexOf("--date");
const DATE = di >= 0 && argv[di + 1] ? argv[di + 1] : "2026-06-05";
const WRITE = argv.includes("--write-report");
const RISKS = ["low", "medium", "high", "longshot"];

// Policy constants — mirror pipeline/parlay_optimizer.low_risk_leg_eligible.
const MIN_L10 = 0.80;
const STRICT_L10 = 0.90;
const ODDS_FLOOR = -150;
const EXCEPTION_ODDS_MAX = 110;
const MAX_STALE_DAYS = 21;

function loadJSON(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }

function l10HitRate(leg) {
  const s = Array.isArray(leg.recentSeries) ? leg.recentSeries.map(Number).filter(Number.isFinite) : [];
  const line = leg.line, side = (leg.side || "").toLowerCase();
  if (typeof line !== "number" || s.length < 10 || (side !== "over" && side !== "under")) return null;
  const w = s.slice(-10);
  let dec = 0, hits = 0;
  for (const v of w) { if (v === line) continue; dec++; if (side === "over" ? v > line : v < line) hits++; }
  return dec === 0 ? null : hits / dec;
}
function formStale(leg) {
  const g = Array.isArray(leg.recentGames) ? leg.recentGames : [];
  if (!g.length) return false; // no dated provenance → defer to series checks
  const latest = g.map((x) => String(x.date || "")).filter(Boolean).sort().slice(-1)[0];
  if (!latest) return true;
  const days = (new Date(DATE) - new Date(latest)) / 86400000;
  return days > MAX_STALE_DAYS;
}
/** Returns a violation reason for a LOW leg, or null if eligible. */
function lowViolation(leg) {
  const side = (leg.side || "").toLowerCase();
  if (side !== "over" && side !== "under") return "bad_side";
  if (typeof leg.line !== "number") return "no_line";
  if (formStale(leg)) return "stale_form";
  const hr = l10HitRate(leg);
  if (hr === null) return "no_l10_sample";
  if (hr < MIN_L10) return `l10_below_80(${Math.round(hr * 100)}%)`;
  const o = leg.oddsForSide;
  if (typeof o !== "number") return "no_odds";
  if (o > EXCEPTION_ODDS_MAX) return `plus_money(${o})`;
  if (o > ODDS_FLOOR && hr < STRICT_L10) return `near_even_needs_90(${o},${Math.round(hr * 100)}%)`;
  return null;
}

const opt = loadJSON(resolve(DATA, "parlays", "optimizer", `${DATE}.json`));
if (!opt) { console.log(`No optimizer for ${DATE}`); process.exit(0); }
const prs = opt.publicRiskSections || {};

const violations = [];
let lowLegs = 0;
for (const sp of ["nba", "mlb", "multi"]) {
  for (const slip of prs.low?.[sp] || []) {
    for (const leg of slip.legs || []) {
      lowLegs++;
      const v = lowViolation(leg);
      if (v) violations.push({ sport: sp, player: leg.playerName, market: leg.market, side: leg.side, line: leg.line, odds: leg.oddsForSide, reason: v });
    }
  }
}
const counts = {};
for (const r of RISKS) counts[r] = { nba: (prs[r]?.nba || []).length, mlb: (prs[r]?.mlb || []).length, multi: (prs[r]?.multi || []).length };
const verdict = violations.length === 0 ? "PASS" : "FAIL";

console.log(`Low-risk methodology ${DATE}: ${verdict} | low legs=${lowLegs} violations=${violations.length}`);
for (const v of violations.slice(0, 20)) console.log(`  [${v.reason}] ${v.sport} ${v.player} ${v.market} ${v.side} ${v.line} @ ${v.odds}`);
console.log(`  publicRiskSections: ${RISKS.map((r) => `${r}(${counts[r].nba}/${counts[r].mlb}/${counts[r].multi})`).join(" ")}`);

if (WRITE) {
  const m = [];
  m.push(`# Low-Risk Methodology Audit — ${DATE} (auto-generated)`);
  m.push("");
  m.push("> `audit-low-risk-methodology.mjs --write-report` · READ-ONLY · no paid API · no data/model/grading change.");
  m.push(`> Asserts every LOW leg: L10>=80% (>=90% near-even), trusted non-stale form, no plus-money>+110, no missing series.`);
  m.push("");
  m.push(`## Verdict: ${verdict} — ${lowLegs} LOW legs, ${violations.length} violations`);
  m.push("");
  if (violations.length) {
    m.push("| reason | sport | player | market | side | line | odds |");
    m.push("|--------|-------|--------|--------|------|-----:|-----:|");
    for (const v of violations) m.push(`| ${v.reason} | ${v.sport} | ${v.player} | ${v.market} | ${v.side} | ${v.line} | ${v.odds} |`);
  } else {
    m.push("No LOW-risk leg violates the conservative policy. ✅");
  }
  m.push("");
  m.push("## publicRiskSections (nba / mlb / multi)");
  m.push("| risk | nba | mlb | multi |");
  m.push("|------|----:|----:|------:|");
  for (const r of RISKS) m.push(`| ${r} | ${counts[r].nba} | ${counts[r].mlb} | ${counts[r].multi} |`);
  m.push("");
  m.push("*Read-only; no change to data/model/grading.*");
  mkdirSync(DOCS, { recursive: true });
  writeFileSync(resolve(DOCS, "low-risk-methodology-latest.md"), m.join("\n"), "utf8");
  console.log("[--write-report] wrote low-risk-methodology-latest.md");
}
process.exit(verdict === "FAIL" ? 1 : 0);
