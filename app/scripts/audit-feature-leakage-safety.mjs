/**
 * audit-feature-leakage-safety — READ-ONLY leakage + freshness guard for a
 * slate's MLB + NBA boards. Confirms the predictive inputs only use
 * before-game information and flags stale/missing recent form. No paid API, no
 * data/model/grading change.
 *
 * Checks (per board):
 *   - NO post-game outcome fields on active-board leans (actual/outcome/result/finalStat).
 *   - recentGames: NO game dated on/after the slate date (no future-game leak).
 *   - recentGames: dated provenance present; latest game within a freshness window
 *     (stale → flag; Low Risk fails closed elsewhere).
 *   - recentSeries / recent10 length sanity.
 *   - board generatedAt present + same slate day (freshness).
 * Verdict: FAIL on any leakage (future game / outcome field); WARN on staleness /
 * missing provenance; PASS otherwise.
 *
 * Run: cd app && npx tsx scripts/audit-feature-leakage-safety.mjs --date 2026-06-06 [--write-report]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "public", "data");
const DOCS = resolve(__dirname, "..", "..", "docs", "audits");
const argv = process.argv;
const di = argv.indexOf("--date");
const DATE = di >= 0 && argv[di + 1] ? argv[di + 1] : "2026-06-06";
const WRITE = argv.includes("--write-report");
const STALE_DAYS = 21;
const OUTCOME_FIELDS = ["actual", "outcome", "result", "finalStat", "settledAt", "graded"];

function loadJSON(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }

function auditBoard(label, board) {
  const findings = { fails: [], warns: [], info: [] };
  if (!board) { findings.info.push(`${label}: board absent`); return findings; }
  const leans = (board.leans || []).filter((l) => l.lean === "Over" || l.lean === "Under");
  findings.info.push(`${label}: ${(board.games || []).length} games · ${leans.length} actionable leans · generatedAt ${board.generatedAt || "MISSING"}`);
  // freshness
  if (!board.generatedAt) findings.warns.push(`${label}: board missing generatedAt`);
  else if ((board.generatedAt || "").slice(0, 10) !== DATE) findings.warns.push(`${label}: generatedAt ${board.generatedAt} != slate ${DATE}`);

  let outcomeLeak = 0, futureLeak = 0, missingProv = 0, staleProv = 0, shortSeries = 0;
  let latestAcross = "";
  for (const l of leans) {
    // outcome-field leakage
    for (const f of OUTCOME_FIELDS) if (l[f] !== undefined && l[f] !== null) outcomeLeak++;
    // recentGames future/stale
    const rg = Array.isArray(l.recentGames) ? l.recentGames : null;
    const rs = Array.isArray(l.recentSeries) ? l.recentSeries : (Array.isArray(l.recent10) ? l.recent10 : null);
    if (rg) {
      for (const g of rg) {
        const d = String(g.date || "");
        if (d && d >= DATE) futureLeak++;         // target/future game leak
        if (d > latestAcross) latestAcross = d;
      }
      const latest = rg.map((g) => String(g.date || "")).filter(Boolean).sort().slice(-1)[0];
      if (latest) {
        const days = (new Date(DATE) - new Date(latest)) / 86400000;
        if (days > STALE_DAYS) staleProv++;
      }
    } else if (!rs) {
      missingProv++;
    }
    if (rs && rs.length > 0 && rs.length < 10) shortSeries++;
  }
  if (outcomeLeak) findings.fails.push(`${label}: ${outcomeLeak} leg-fields with post-game outcome data on the ACTIVE board (leakage)`);
  else findings.info.push(`${label}: no post-game outcome fields on leans ✅`);
  if (futureLeak) findings.fails.push(`${label}: ${futureLeak} recentGames entries dated >= slate ${DATE} (future-game leak)`);
  else findings.info.push(`${label}: no recentGames dated on/after slate ✅`);
  if (staleProv) findings.warns.push(`${label}: ${staleProv} leans have stale recent form (latest game > ${STALE_DAYS}d before slate) — Low Risk fails closed`);
  if (missingProv) findings.warns.push(`${label}: ${missingProv} leans have neither recentGames nor recentSeries (no form provenance)`);
  if (shortSeries) findings.info.push(`${label}: ${shortSeries} leans have <10 recent values (L10 not computable → not Low-eligible)`);
  if (latestAcross) findings.info.push(`${label}: latest recentGames date across leans = ${latestAcross}`);
  return findings;
}

const mlb = loadJSON(resolve(DATA, "mlb", "boards", `${DATE}.json`));
const nba = loadJSON(resolve(DATA, "boards", `${DATE}.json`));
const all = { fails: [], warns: [], info: [] };
for (const [lab, b] of [["MLB", mlb], ["NBA", nba]]) {
  const f = auditBoard(lab, b);
  all.fails.push(...f.fails); all.warns.push(...f.warns); all.info.push(...f.info);
}
const verdict = all.fails.length ? "FAIL" : all.warns.length ? "WARN" : "PASS";
console.log(`Feature leakage-safety ${DATE}: ${verdict} | fails=${all.fails.length} warns=${all.warns.length}`);
for (const x of all.fails) console.log(`  [FAIL] ${x}`);
for (const x of all.warns) console.log(`  [WARN] ${x}`);
for (const x of all.info) console.log(`  [info] ${x}`);

if (WRITE) {
  const m = [];
  m.push(`# Feature Leakage-Safety Audit — ${DATE} (auto-generated)`);
  m.push("");
  m.push("> `audit-feature-leakage-safety.mjs --write-report` · READ-ONLY · no paid API · no data/model/grading change.");
  m.push("> Confirms predictive inputs use only before-game info; flags stale/missing recent form.");
  m.push("");
  m.push(`## Verdict: ${verdict} (fails=${all.fails.length}, warns=${all.warns.length})`);
  m.push("");
  for (const [t, arr] of [["Failures (leakage)", all.fails], ["Warnings (staleness / missing provenance)", all.warns], ["Info", all.info]]) {
    m.push(`### ${t}`);
    if (arr.length) for (const x of arr) m.push(`- ${x}`); else m.push("- none");
    m.push("");
  }
  m.push("*Read-only. FAIL = future-game/outcome leakage; WARN = stale/missing form (Low Risk fails closed).*");
  mkdirSync(DOCS, { recursive: true });
  writeFileSync(resolve(DOCS, "feature-leakage-safety-latest.md"), m.join("\n"), "utf8");
  console.log("[--write-report] wrote feature-leakage-safety-latest.md");
}
process.exit(verdict === "FAIL" ? 1 : 0);
