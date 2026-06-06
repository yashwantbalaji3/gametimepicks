/**
 * audit-leg-modal-metadata — READ-ONLY guard that published MLB leg-detail
 * modals can show real last-N recent-game metadata (date + opponent), not just
 * generic G-1..G-5 values.
 *
 * For every published MLB leg (publicRiskSections), checks its `recentGames`:
 *   - LEAKAGE (FAIL): no row dated on/after the slate (never the target/future game).
 *   - ATTACHED (FAIL): if a leg has source values (`recentSeries` ≥ 5) but EMPTY
 *     `recentGames`, the modal falls back to generic G-1..G-5 despite metadata
 *     being attainable — fail when this affects a meaningful share of legs.
 *   - COVERAGE (WARN): a leg whose shown rows (last 5) lack date/opponent for
 *     more than 2 of 5 rows.
 *   - per-row date/opponent presence is reported.
 * Verdict: FAIL on leakage or widespread missing-attachment; WARN on partial
 * coverage; PASS otherwise.
 *
 * Run: cd app && npx tsx scripts/audit-leg-modal-metadata.mjs --date 2026-06-06 [--write-report]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "public", "data");
const DOCS = resolve(__dirname, "..", "..", "docs", "audits");
const argv = process.argv;
const di = argv.indexOf("--date");
const DATE = di >= 0 && argv[di + 1] ? argv[di + 1] : "2026-06-06";
const WRITE = argv.includes("--write-report");
const RISKS = ["low", "medium", "high", "longshot"];
const SHOWN = 5; // modal shows the last 5
const UNATTACHED_FAIL_FRAC = 0.25; // > 25% of legs with values but no recentGames → FAIL

function loadJSON(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }

const opt = loadJSON(resolve(DATA, "parlays", "optimizer", `${DATE}.json`));
if (!opt) { console.log(`No optimizer for ${DATE}`); process.exit(0); }
const prs = opt.publicRiskSections || {};

// collect MLB published legs (dedup by leanId/playerId+market+line)
const seen = new Set();
const legs = [];
for (const r of RISKS) {
  for (const slip of prs[r]?.mlb || []) {
    for (const lg of slip.legs || []) {
      const k = lg.leanId ?? `${lg.playerId}|${lg.market}|${lg.line}`;
      if (seen.has(k)) continue;
      seen.add(k);
      legs.push(lg);
    }
  }
}

let leakRows = 0;
let unattached = 0;        // has recentSeries(≥5) but empty recentGames
let lowCoverageLegs = 0;   // shown rows: >2/5 missing date or opponent
let totalRows = 0, rowsWithDate = 0, rowsWithOpp = 0;
let withGames = 0;
for (const lg of legs) {
  const rg = Array.isArray(lg.recentGames) ? lg.recentGames : [];
  const rs = Array.isArray(lg.recentSeries) ? lg.recentSeries : [];
  if (rg.length === 0) {
    if (rs.length >= 5) unattached++;
    continue;
  }
  withGames++;
  for (const g of rg) {
    if (g?.date && String(g.date) >= DATE) leakRows++;
  }
  const shown = rg.slice(-SHOWN);
  let miss = 0;
  for (const g of shown) {
    totalRows++;
    if (g?.date) rowsWithDate++; else miss++;
    if (g?.opponent) rowsWithOpp++; else miss++;
  }
  // "miss" counts date+opponent gaps; >2 distinct rows lacking either:
  const rowsMissing = shown.filter((g) => !g?.date || !g?.opponent).length;
  if (rowsMissing > 2) lowCoverageLegs++;
}

const fails = [];
const warns = [];
if (leakRows > 0) fails.push(`${leakRows} recentGames row(s) dated on/after slate ${DATE} (target/future-game leakage)`);
const unattachedFrac = legs.length ? unattached / legs.length : 0;
if (unattachedFrac > UNATTACHED_FAIL_FRAC)
  fails.push(`${unattached}/${legs.length} legs have source values but EMPTY recentGames (modal forced to generic G-1..G-5) — run pipeline/mlb/attach_recent_games`);
else if (unattached > 0)
  warns.push(`${unattached}/${legs.length} legs have values but no recentGames (graceful values-only fallback)`);
if (lowCoverageLegs > 0) warns.push(`${lowCoverageLegs} leg(s) have >2 of 5 shown rows missing date/opponent`);

const verdict = fails.length ? "FAIL" : warns.length ? "WARN" : "PASS";
console.log(`Leg-modal metadata ${DATE}: ${verdict} | MLB legs ${legs.length} · withRecentGames ${withGames} · rows ${totalRows} (date ${rowsWithDate}/${totalRows}, opp ${rowsWithOpp}/${totalRows}) · leakage ${leakRows}`);
for (const f of fails) console.log(`  [FAIL] ${f}`);
for (const w of warns) console.log(`  [WARN] ${w}`);

if (WRITE) {
  const m = [];
  m.push(`# Leg-Modal Recent-Form Metadata Audit — ${DATE} (auto-generated)`);
  m.push("");
  m.push("> `audit-leg-modal-metadata.mjs --write-report` · READ-ONLY · no paid API · no data/model change.");
  m.push("> Confirms MLB leg modals show real last-N date/opponent rows (not generic G-1..G-5) and never leak the target game.");
  m.push("");
  m.push(`## Verdict: ${verdict}`);
  m.push(`- MLB published legs: ${legs.length}; with recentGames: ${withGames}`);
  m.push(`- shown rows: ${totalRows} · with date: ${rowsWithDate} · with opponent: ${rowsWithOpp}`);
  m.push(`- leakage rows (≥ slate): ${leakRows}; unattached legs: ${unattached}; low-coverage legs: ${lowCoverageLegs}`);
  m.push("");
  for (const f of fails) m.push(`- FAIL: ${f}`);
  for (const w of warns) m.push(`- WARN: ${w}`);
  m.push("");
  m.push("*Read-only; no change to data/model/grading.*");
  mkdirSync(DOCS, { recursive: true });
  writeFileSync(resolve(DOCS, "leg-modal-metadata-latest.md"), m.join("\n"), "utf8");
  console.log("[--write-report] wrote leg-modal-metadata-latest.md");
}
process.exit(verdict === "FAIL" ? 1 : 0);
