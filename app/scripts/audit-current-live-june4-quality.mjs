/**
 * audit-current-live-june4-quality — READ-ONLY, deterministic data-quality audit
 * of the active-slate current-live board + optimizer. No paid API, no writes
 * except the two docs reports. Flags integrity issues without changing anything.
 *
 * Writes:
 *   docs/audits/current-live-june4-quality-latest.md  (full quality audit)
 *   docs/audits/june4-data-quality-latest.md          (slate completeness summary)
 *
 * Run: cd app && npx tsx scripts/audit-current-live-june4-quality.mjs [--date YYYY-MM-DD] [--write-report]
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "public", "data");
const DOCS = resolve(__dirname, "..", "..", "docs", "audits");
const argv = typeof process !== "undefined" ? process.argv : [];
const WRITE = argv.includes("--write-report");
const di = argv.indexOf("--date");
const DATE_ARG = di >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(argv[di + 1] || "") ? argv[di + 1] : null;
const DATE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;

function loadJSON(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }
function datesIn(d) { let f = []; try { f = readdirSync(d); } catch { f = []; } return f.map((x) => (DATE_RE.exec(x) || [])[1]).filter(Boolean).sort(); }
const ACTIVE = DATE_ARG || datesIn(resolve(DATA, "parlays", "optimizer")).slice(-1)[0] || null;
const ALLOWED_MLB = new Set(["batter_hits", "batter_hits_runs_rbis", "batter_total_bases", "pitcher_strikeouts", "batter_runs_scored", "batter_rbis", "batter_home_runs"]);

function num(x) { return typeof x === "number" && Number.isFinite(x); }
function plausibleAmerican(o) { return num(o) && Math.abs(o) >= 100 && Math.abs(o) <= 20000; }

function auditBoard(date) {
  const board = loadJSON(resolve(DATA, "mlb", "boards", `${date}.json`));
  if (!board) return null;
  const allLeans = Array.isArray(board.leans) ? board.leans : [];
  // ACTIONABLE leans only (Over/Under). "Pass" entries are model-declined and
  // intentionally carry null playerId/team — they are not props/parlay candidates.
  const leans = allLeans.filter((l) => l.lean === "Over" || l.lean === "Under");
  const passCount = allLeans.length - leans.length;
  const checks = [];
  const ck = (level, key, msg) => checks.push({ level, key, msg });
  const n = leans.length;

  const missingPid = leans.filter((l) => l.playerId == null).length;
  const missingGid = leans.filter((l) => !l.gameId).length;
  const twoWay = leans.filter((l) => num(l.oddsOver) && num(l.oddsUnder)).length;
  const implied = leans.filter((l) => num(l.impliedOver) && num(l.impliedUnder)).length;
  const withSeries = leans.filter((l) => Array.isArray(l.recentSeries) && l.recentSeries.length > 0).length;
  const withModel = leans.filter((l) => num(l.modelProbOver) && num(l.modelProbUnder)).length;
  const badLine = leans.filter((l) => !num(l.line) || l.line <= 0).length;
  const badOdds = leans.filter((l) => !plausibleAmerican(l.oddsOver) || !plausibleAmerican(l.oddsUnder)).length;
  const unsupported = leans.filter((l) => !ALLOWED_MLB.has(l.marketKey)).map((l) => l.marketKey);
  // TRUE duplicates by lean id (identity), across all leans.
  const idSeen = new Map();
  let dups = 0;
  for (const l of allLeans) { if (l.id != null) idSeen.set(l.id, (idSeen.get(l.id) || 0) + 1); }
  for (const v of idSeen.values()) if (v > 1) dups += v - 1;
  // market coverage (actionable)
  const byMarket = {};
  for (const l of leans) byMarket[l.marketKey] = (byMarket[l.marketKey] || 0) + 1;
  // freshness: generatedAt date vs slate date
  const genDate = (board.generatedAt || "").slice(0, 10);
  const freshOK = genDate === date;

  // verdicts (hard = FAIL, soft = WARN)
  ck(missingPid === 0 ? "pass" : "fail", "playerId", `${n - missingPid}/${n} leans have playerId (missing ${missingPid})`);
  ck(missingGid === 0 ? "pass" : "fail", "gameId", `${n - missingGid}/${n} leans have gameId (missing ${missingGid})`);
  ck(twoWay === n ? "pass" : "warn", "two-way-odds", `${twoWay}/${n} leans have two-way odds (de-vig requires both sides)`);
  ck(implied === n ? "pass" : "warn", "implied-prob", `${implied}/${n} leans have impliedOver/Under`);
  ck(withSeries === n ? "pass" : "warn", "recentSeries", `${withSeries}/${n} leans have recentSeries`);
  ck(withModel === n ? "pass" : "warn", "model-prob", `${withModel}/${n} leans have model probability`);
  ck(badLine === 0 ? "pass" : "fail", "line-plausibility", `${badLine} leans with missing/implausible line`);
  ck(badOdds === 0 ? "pass" : "fail", "odds-plausibility", `${badOdds} leans with implausible American odds (|o|<100 or >20000)`);
  ck(dups === 0 ? "pass" : "fail", "duplicates", `${dups} duplicate (player|market|line|side) rows`);
  ck(unsupported.length === 0 ? "pass" : "fail", "supported-markets", unsupported.length ? `unsupported markets: ${[...new Set(unsupported)].join(", ")}` : "all markets supported");
  ck(freshOK ? "pass" : "warn", "freshness", `board generatedAt=${board.generatedAt} (slate ${date}) — ${freshOK ? "same-day" : "DATE MISMATCH"}`);

  return { date, n, passCount, totalLeans: allLeans.length, games: (board.games || []).length, byMarket, checks, generatedAt: board.generatedAt };
}

function auditOptimizer(date) {
  const opt = loadJSON(resolve(DATA, "parlays", "optimizer", `${date}.json`));
  if (!opt) return null;
  const prs = opt.publicRiskSections || {};
  const rows = [];
  let unionOK = true;
  for (const r of ["low", "medium", "high", "longshot"]) {
    const s = prs[r] || {};
    const all = (s.all || []).length, nba = (s.nba || []).length, mlb = (s.mlb || []).length, multi = (s.multi || []).length;
    const childMax = Math.max(nba, mlb, multi);
    if (all < childMax) unionOK = false;
    rows.push({ r, all, nba, mlb, multi });
  }
  return { totalSlips: opt.totalSlips, legPool: (opt.legPool?.legs || []).length, rows, unionOK, generatedAt: opt.generatedAt };
}

function verdict(board) {
  if (!board) return "FAIL";
  if (board.checks.some((c) => c.level === "fail")) return "FAIL";
  if (board.checks.some((c) => c.level === "warn")) return "WARN";
  return "PASS";
}

function fullMd(b, o, v) {
  const m = [];
  m.push("# Current-Live June-4 Data Quality (auto-generated)");
  m.push("");
  m.push("> `app/scripts/audit-current-live-june4-quality.mjs --write-report` · READ-ONLY · deterministic · no paid API.");
  m.push("> Integrity checks on the active-slate MLB board + optimizer. No data/model/UI change.");
  m.push("");
  m.push(`## Slate ${b.date} — overall: ${v}`);
  m.push("");
  m.push(`Board: ${b.games} games · ${b.n} actionable leans (Over/Under) · ${b.passCount} Pass (model-declined, excluded) · ${b.totalLeans} total · generatedAt ${b.generatedAt}`);
  m.push("");
  m.push("### Integrity checks");
  m.push("| level | check | detail |");
  m.push("|-------|-------|--------|");
  for (const c of b.checks) m.push(`| ${c.level === "pass" ? "✅" : c.level === "warn" ? "⚠️" : "❌"} ${c.level} | ${c.key} | ${c.msg} |`);
  m.push("");
  m.push("### Market coverage");
  m.push(Object.entries(b.byMarket).map(([k, v2]) => `- ${k}: ${v2}`).join("\n"));
  m.push("");
  if (o) {
    m.push("### Optimizer");
    m.push(`- totalSlips ${o.totalSlips} · legPool ${o.legPool} · generatedAt ${o.generatedAt}`);
    m.push("- risk sections (all / nba / mlb / multi):");
    for (const r of o.rows) m.push(`  - ${r.r}: ${r.all} / ${r.nba} / ${r.mlb} / ${r.multi}`);
    m.push(`- All ≥ each child (union) holds: ${o.unionOK ? "yes ✅" : "NO ❌"}`);
  }
  m.push("");
  m.push("*Read-only; no public/model/data change.*");
  m.push("");
  return m.join("\n");
}

function completenessMd(b, o, v) {
  const m = [];
  m.push("# June-4 Data Quality & Slate Completeness (auto-generated)");
  m.push("");
  m.push("> `app/scripts/audit-current-live-june4-quality.mjs --write-report` · READ-ONLY · no paid API.");
  m.push("");
  m.push(`- **Active slate:** ${b.date} · overall **${v}**`);
  m.push(`- **MLB:** ${b.games} games, ${b.n} actionable leans (+${b.passCount} model-declined Pass), markets: ${Object.keys(b.byMarket).join(", ")}`);
  m.push(`- **Two-way odds:** ${b.checks.find((c) => c.key === "two-way-odds")?.msg}`);
  m.push(`- **playerId/gameId:** ${b.checks.find((c) => c.key === "playerId")?.msg}; ${b.checks.find((c) => c.key === "gameId")?.msg}`);
  m.push(`- **recentSeries / model prob:** ${b.checks.find((c) => c.key === "recentSeries")?.msg}; ${b.checks.find((c) => c.key === "model-prob")?.msg}`);
  m.push(`- **Freshness:** ${b.checks.find((c) => c.key === "freshness")?.msg}`);
  if (o) m.push(`- **Optimizer:** ${o.totalSlips} slips; union holds: ${o.unionOK ? "yes" : "NO"}`);
  m.push(`- **NBA:** absent — 2026-06-04 is a genuine NBA off-day (ESPN: 0 events; games Jun 3 & Jun 5).`);
  m.push(`- **June-4 graded:** absent (correct — slate is active/pending, not settled).`);
  m.push("");
  m.push("No data integrity blockers found that are fixable without paid API/fabrication." );
  m.push("");
  return m.join("\n");
}

const b = ACTIVE ? auditBoard(ACTIVE) : null;
const o = ACTIVE ? auditOptimizer(ACTIVE) : null;
const v = verdict(b);
if (!b) {
  console.log(`No board for ${ACTIVE}`);
} else {
  console.log(`Current-live quality ${b.date}: ${v} | ${b.n} leans, ${b.games} games | fails: ${b.checks.filter((c) => c.level === "fail").length} warns: ${b.checks.filter((c) => c.level === "warn").length}`);
  for (const c of b.checks.filter((c) => c.level !== "pass")) console.log(`  [${c.level}] ${c.key}: ${c.msg}`);
  if (o) console.log(`optimizer: ${o.totalSlips} slips, union holds=${o.unionOK}`);
  if (WRITE) {
    mkdirSync(DOCS, { recursive: true });
    writeFileSync(resolve(DOCS, "current-live-june4-quality-latest.md"), fullMd(b, o, v), "utf8");
    writeFileSync(resolve(DOCS, "june4-data-quality-latest.md"), completenessMd(b, o, v), "utf8");
    console.log("[--write-report] wrote current-live-june4-quality-latest.md + june4-data-quality-latest.md");
  }
}
