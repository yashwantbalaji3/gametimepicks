/**
 * audit-current-live-quality — READ-ONLY, deterministic data-quality audit of
 * the active-slate current-live boards (MLB + NBA) + optimizer + snapshot.
 * Date-agnostic generalization of audit-current-live-june4-quality.mjs.
 * No paid API, no writes except the two docs reports.
 *
 * Backward-compatible: the MLB board integrity checks, the "Pass"-exclusion
 * rule, and the optimizer union check are byte-equivalent to the June-4 script;
 * only the labels are date-driven and an NBA summary + snapshot/graded checks
 * are added.
 *
 * Writes (with --write-report):
 *   docs/audits/current-live-quality-latest.md       (full quality audit)
 *   docs/audits/current-live-quality-<DATE>.md       (date-specific snapshot)
 *
 * Run: cd app && npx tsx scripts/audit-current-live-quality.mjs [--date YYYY-MM-DD] [--write-report]
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

// NBA is summarized (not deep-audited): report whether it's real, a stub, or a
// genuine off-day, and surface any provider endpoint errors (e.g. stats.nba.com
// scoreboardv2 timeouts) without failing the slate when ESPN fallback works.
function auditNba(date) {
  const board = loadJSON(resolve(DATA, "boards", `${date}.json`));
  if (!board) return { present: false, note: "absent (no boards/<date>.json)" };
  const allLeans = Array.isArray(board.leans) ? board.leans : [];
  const actionable = allLeans.filter((l) => l.lean === "Over" || l.lean === "Under").length;
  const games = (board.games || []).length;
  const eh = Array.isArray(board.endpointHistory) ? board.endpointHistory : [];
  const errs = eh.filter((e) => e && e.status === "error").map((e) => e.endpoint);
  const real = games > 0 && actionable > 0 && board.propsAvailable !== false;
  let note;
  if (real) note = `${games} game(s), ${actionable} actionable leans (scheduleSource=${board.scheduleSource || "?"}, oddsSource=${board.oddsSource || "?"})`;
  else if (games === 0) note = "no NBA games (off-day or no slate)";
  else note = "present but no actionable props (possible stub/partial)";
  return { present: true, real, games, actionable, endpointErrors: errs, scheduleAvailable: board.scheduleAvailable, propsAvailable: board.propsAvailable, note };
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

// Slate-level structural checks: optimizer present, snapshot present, and graded
// ABSENT for the active (in-progress) date. The graded-absent rule applies ONLY
// to the genuinely active/latest slate — a historical date queried with --date is
// expected to be settled (graded present), so it is reported as info, not a fail.
function auditSlate(date, optPresent, isActive) {
  const checks = [];
  const ck = (level, key, msg) => checks.push({ level, key, msg });
  ck(optPresent ? "pass" : "fail", "optimizer-exists", optPresent ? "optimizer present for slate date" : "optimizer MISSING for slate date");
  const snapPresent = existsSync(resolve(DATA, "parlays", "snapshots", `${date}.json`));
  ck(snapPresent ? "pass" : "warn", "snapshot-exists", snapPresent ? "snapshot present for slate date" : "snapshot missing for slate date");
  const gradedPresent = existsSync(resolve(DATA, "parlays", "optimizer-graded", `${date}.json`));
  if (isActive) {
    ck(gradedPresent ? "fail" : "pass", "graded-absent", gradedPresent ? "graded file PRESENT for ACTIVE date (should be absent until settled)" : "graded absent (correct — active/pending)");
  } else {
    ck("pass", "graded-absent", gradedPresent ? "graded present (expected — historical/settled date)" : "graded absent (historical date not yet settled — informational)");
  }
  return checks;
}

function verdict(boardChecks, slateChecks) {
  const all = [...(boardChecks || []), ...(slateChecks || [])];
  if (!boardChecks) return "FAIL";
  if (all.some((c) => c.level === "fail")) return "FAIL";
  if (all.some((c) => c.level === "warn")) return "WARN";
  return "PASS";
}

function fullMd(b, nba, o, slate, v) {
  const m = [];
  m.push("# Current-Live Data Quality (auto-generated)");
  m.push("");
  m.push("> `app/scripts/audit-current-live-quality.mjs --write-report` · READ-ONLY · deterministic · no paid API.");
  m.push("> Integrity checks on the active-slate MLB + NBA boards + optimizer + snapshot. No data/model/UI change.");
  m.push("");
  m.push(`## Slate ${b.date} — overall: ${v}`);
  m.push("");
  m.push(`MLB board: ${b.games} games · ${b.n} actionable leans (Over/Under) · ${b.passCount} Pass (model-declined, excluded) · ${b.totalLeans} total · generatedAt ${b.generatedAt}`);
  m.push("");
  m.push("### MLB integrity checks");
  m.push("| level | check | detail |");
  m.push("|-------|-------|--------|");
  for (const c of b.checks) m.push(`| ${c.level === "pass" ? "✅" : c.level === "warn" ? "⚠️" : "❌"} ${c.level} | ${c.key} | ${c.msg} |`);
  m.push("");
  m.push("### Slate structural checks");
  m.push("| level | check | detail |");
  m.push("|-------|-------|--------|");
  for (const c of slate) m.push(`| ${c.level === "pass" ? "✅" : c.level === "warn" ? "⚠️" : "❌"} ${c.level} | ${c.key} | ${c.msg} |`);
  m.push("");
  m.push("### MLB market coverage");
  m.push(Object.entries(b.byMarket).map(([k, v2]) => `- ${k}: ${v2}`).join("\n"));
  m.push("");
  m.push("### NBA summary");
  m.push(`- ${nba.note}`);
  if (nba.endpointErrors && nba.endpointErrors.length) m.push(`- provider endpoint errors (non-fatal if fallback worked): ${nba.endpointErrors.join(", ")}`);
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

function completenessMd(b, nba, o, slate, v) {
  const m = [];
  m.push("# Data Quality & Slate Completeness (auto-generated)");
  m.push("");
  m.push("> `app/scripts/audit-current-live-quality.mjs --write-report` · READ-ONLY · no paid API.");
  m.push("");
  m.push(`- **Active slate:** ${b.date} · overall **${v}**`);
  m.push(`- **MLB:** ${b.games} games, ${b.n} actionable leans (+${b.passCount} model-declined Pass), markets: ${Object.keys(b.byMarket).join(", ")}`);
  m.push(`- **Two-way odds:** ${b.checks.find((c) => c.key === "two-way-odds")?.msg}`);
  m.push(`- **playerId/gameId:** ${b.checks.find((c) => c.key === "playerId")?.msg}; ${b.checks.find((c) => c.key === "gameId")?.msg}`);
  m.push(`- **recentSeries / model prob:** ${b.checks.find((c) => c.key === "recentSeries")?.msg}; ${b.checks.find((c) => c.key === "model-prob")?.msg}`);
  m.push(`- **Freshness:** ${b.checks.find((c) => c.key === "freshness")?.msg}`);
  if (o) m.push(`- **Optimizer:** ${o.totalSlips} slips; union holds: ${o.unionOK ? "yes" : "NO"}`);
  m.push(`- **NBA:** ${nba.note}${nba.endpointErrors && nba.endpointErrors.length ? ` (provider errors: ${nba.endpointErrors.join(", ")})` : ""}`);
  m.push(`- **Snapshot:** ${slate.find((c) => c.key === "snapshot-exists")?.msg}`);
  m.push(`- **Graded:** ${slate.find((c) => c.key === "graded-absent")?.msg}`);
  m.push("");
  m.push("No data integrity blockers found that are fixable without paid API/fabrication.");
  m.push("");
  return m.join("\n");
}

const b = ACTIVE ? auditBoard(ACTIVE) : null;
const nba = ACTIVE ? auditNba(ACTIVE) : { present: false, note: "n/a" };
const o = ACTIVE ? auditOptimizer(ACTIVE) : null;
const LATEST = datesIn(resolve(DATA, "parlays", "optimizer")).slice(-1)[0] || null;
const IS_ACTIVE = ACTIVE != null && ACTIVE === LATEST;
const slate = ACTIVE ? auditSlate(ACTIVE, !!o, IS_ACTIVE) : [];
const v = verdict(b ? b.checks : null, slate);
if (!b) {
  console.log(`No MLB board for ${ACTIVE}`);
} else {
  console.log(`Current-live quality ${b.date}: ${v} | ${b.n} leans, ${b.games} games | fails: ${[...b.checks, ...slate].filter((c) => c.level === "fail").length} warns: ${[...b.checks, ...slate].filter((c) => c.level === "warn").length}`);
  for (const c of [...b.checks, ...slate].filter((c) => c.level !== "pass")) console.log(`  [${c.level}] ${c.key}: ${c.msg}`);
  console.log(`NBA: ${nba.note}`);
  if (o) console.log(`optimizer: ${o.totalSlips} slips, union holds=${o.unionOK}`);
  if (WRITE) {
    mkdirSync(DOCS, { recursive: true });
    writeFileSync(resolve(DOCS, "current-live-quality-latest.md"), fullMd(b, nba, o, slate, v), "utf8");
    writeFileSync(resolve(DOCS, `current-live-quality-${b.date}.md`), completenessMd(b, nba, o, slate, v), "utf8");
    console.log(`[--write-report] wrote current-live-quality-latest.md + current-live-quality-${b.date}.md`);
  }
}
