/**
 * Data-lineage audit — OFFLINE, READ-ONLY.
 *
 * Verifies the canonical data-lineage invariants documented in
 * `docs/DATA_LINEAGE_AND_FILE_RECONCILIATION_2026-06-03.md`. It reads ONLY the
 * baked JSON under `public/data/**` plus source text under `src/**`. It writes
 * NOTHING by default; with `--write-report` it writes ONE deterministic markdown
 * file (`docs/audits/data-lineage-latest.md`). It NEVER deletes, moves, renames,
 * regenerates data, calls an external API, or dispatches a workflow.
 *
 * What it checks (see the doc for the full rationale):
 *   1. canonical directories exist
 *   2. enumerate dates per artifact type
 *   3. latest active (optimizer/snapshot/board) + latest settled (graded)
 *   4. public-era boundary constant (= 2026-05-27) is wired into the loaders
 *   5. June-2 / graded ⊆ optimizer (settled dates have a snapshot)
 *   6. optimizer ↔ snapshot date consistency
 *   7. publicRiskSections: modeled-only (nba/mlb); single-sport buckets are pure
 *   8. recentSeries persisted window is the ≤10 tail (best-effort tail check vs board)
 *   9. legacy/orphan top-level singles + their src/ reference count
 *  10. audit/policy.json computed-but-unconsumed (src/ reference count)
 *  11. results: May 25/26 archive present on disk but era filter is wired
 *  12. exit non-zero on any HARD failure; warnings are listed but exit 0
 *
 * Run (from app/):
 *   npx tsx scripts/audit-data-lineage.mjs
 *   npx tsx scripts/audit-data-lineage.mjs --write-report
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const WRITE_REPORT = process.argv.includes("--write-report");
const DATA = "public/data";
const REPORT_PATH = "../docs/audits/data-lineage-latest.md";

const EXCLUDED_DATES = ["2026-05-25", "2026-05-26"]; // public-era ban (mirror)
const MODELED_SPORTS = new Set(["nba", "mlb"]);
const CANONICAL_DIRS = [
  "boards",
  "mlb/boards",
  "parlays/optimizer",
  "parlays/snapshots",
  "parlays/optimizer-graded",
  "results",
  "mlb/results",
  "audit",
];
const LEGACY_SINGLES = [
  "board.json",
  "schedule.json",
  "hit_rates.json",
  "trends.json",
  "players.json",
  "odds_props.json",
];

// ── tiny result collector ────────────────────────────────────────────────
const results = []; // {level: 'PASS'|'WARN'|'FAIL'|'INFO', check, detail}
const add = (level, check, detail) => results.push({ level, check, detail });

// ── helpers (all defensive: never throw to the top level) ────────────────
const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
function dateFiles(dir) {
  const full = join(DATA, dir);
  if (!existsSync(full)) return [];
  let names = [];
  try {
    names = readdirSync(full);
  } catch {
    return [];
  }
  return names
    .filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))
    .map((n) => n.replace(/\.json$/, ""))
    .sort();
}
const maxDate = (arr) => (arr.length ? arr[arr.length - 1] : null);

// walk src/ once; return list of {path, text} for .ts/.tsx
function readSrcFiles() {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        walk(p);
      } else if (/\.(ts|tsx|mjs)$/.test(e.name)) {
        try {
          out.push({ path: p, text: readFileSync(p, "utf8") });
        } catch {
          /* skip unreadable */
        }
      }
    }
  };
  if (existsSync("src")) walk("src");
  return out;
}
const SRC_FILES = readSrcFiles();
const srcRefCount = (needle) =>
  SRC_FILES.filter((f) => f.text.includes(needle)).length;

// ── 1. canonical directories ─────────────────────────────────────────────
for (const d of CANONICAL_DIRS) {
  const full = join(DATA, d);
  if (existsSync(full) && statSync(full).isDirectory()) {
    add("PASS", "canonical-dir", `${d}/ exists`);
  } else {
    add("FAIL", "canonical-dir", `MISSING canonical directory ${full}`);
  }
}

// ── 2 + 3. enumerate dates + latest active/settled ───────────────────────
const nbaBoards = dateFiles("boards");
const mlbBoards = dateFiles("mlb/boards");
const optimizer = dateFiles("parlays/optimizer");
const snapshots = dateFiles("parlays/snapshots");
const graded = dateFiles("parlays/optimizer-graded");

const latest = {
  nbaBoard: maxDate(nbaBoards),
  mlbBoard: maxDate(mlbBoards),
  optimizer: maxDate(optimizer),
  snapshot: maxDate(snapshots),
  graded: maxDate(graded),
};
add(
  "INFO",
  "counts",
  `boards(NBA)=${nbaBoards.length} boards(MLB)=${mlbBoards.length} optimizer=${optimizer.length} snapshots=${snapshots.length} graded=${graded.length}`,
);
add(
  "INFO",
  "latest",
  `latest optimizer(active)=${latest.optimizer} · latest snapshot=${latest.snapshot} · latest NBA board=${latest.nbaBoard} · latest MLB board=${latest.mlbBoard} · latest graded(settled)=${latest.graded}`,
);

// ── 4 + 11. public-era boundary wired ────────────────────────────────────
let eraConst = null;
{
  let txt = "";
  try {
    txt = readFileSync("src/lib/public-parlay-era.ts", "utf8");
  } catch {
    txt = "";
  }
  const m = txt.match(/PUBLIC_PARLAY_RESULTS_START_DATE\s*=\s*"(\d{4}-\d{2}-\d{2})"/);
  eraConst = m ? m[1] : null;
  if (!eraConst) {
    add("FAIL", "public-era", "could not read PUBLIC_PARLAY_RESULTS_START_DATE from src/lib/public-parlay-era.ts");
  } else if (eraConst !== "2026-05-27") {
    add("WARN", "public-era", `era start is ${eraConst} (expected 2026-05-27)`);
  } else {
    add("PASS", "public-era", `era start = ${eraConst}`);
  }
  // the filter must be referenced by the results loader to be effective
  const filterWired = srcRefCount("isInPublicParlayEra") + srcRefCount("filterDatesToPublicEra");
  if (filterWired > 0) {
    add("PASS", "public-era-wired", `public-era filter referenced in ${filterWired} src file(s)`);
  } else {
    add("FAIL", "public-era-wired", "public-era filter helpers are not referenced anywhere in src/");
  }
}

// summary archive: byDate may contain pre-era rows on disk (expected — filtered at read)
{
  const summary = readJson(join(DATA, "parlays/optimizer-summary.json"));
  const byDate = summary && Array.isArray(summary.byDate) ? summary.byDate : [];
  const preEra = byDate
    .map((r) => r && r.date)
    .filter((d) => isDate(d) && eraConst && d < eraConst)
    .sort();
  const banned = preEra.filter((d) => EXCLUDED_DATES.includes(d));
  if (preEra.length) {
    add(
      "INFO",
      "summary-archive",
      `optimizer-summary.byDate contains ${preEra.length} pre-era archive row(s) [${preEra.join(", ")}] — these are filtered out at read time by the wired public-era filter (not a public leak). May 25/26 present in archive: ${banned.length ? banned.join(", ") : "none"}.`,
    );
  } else {
    add("PASS", "summary-archive", "optimizer-summary.byDate has no pre-era rows");
  }
}

// ── 5. graded ⊆ optimizer (settled dates have a snapshot) ─────────────────
{
  const optSet = new Set(optimizer);
  const orphanGraded = graded.filter((d) => !optSet.has(d)).sort();
  if (orphanGraded.length) {
    add("FAIL", "graded-subset", `graded dates without an optimizer snapshot: ${orphanGraded.join(", ")}`);
  } else {
    add("PASS", "graded-subset", "every graded date has a corresponding optimizer snapshot");
  }
  if (latest.graded) {
    const settledIsLatestOpt = latest.graded === latest.optimizer;
    add(
      "INFO",
      "june2-settled",
      `latest settled = ${latest.graded}${settledIsLatestOpt ? " (== latest optimizer; active surfaces must label it Settled / latest-actionable, never pregame)" : ""}. June-2 graded present: ${graded.includes("2026-06-02") ? "yes" : "no"}.`,
    );
  }
}

// ── 6. optimizer ↔ snapshot consistency ──────────────────────────────────
{
  const snapSet = new Set(snapshots);
  const optSet = new Set(optimizer);
  const optNoSnap = optimizer.filter((d) => !snapSet.has(d)).sort();
  const snapNoOpt = snapshots.filter((d) => !optSet.has(d)).sort();
  if (optNoSnap.length || snapNoOpt.length) {
    add(
      "WARN",
      "optimizer-snapshot",
      `optimizer is canonical, snapshot is legacy/fallback. optimizer-without-snapshot: [${optNoSnap.join(", ") || "none"}]; snapshot-without-optimizer: [${snapNoOpt.join(", ") || "none"}].`,
    );
  } else {
    add("PASS", "optimizer-snapshot", "optimizer and snapshot date sets match");
  }
}

// ── 7 + 8. publicRiskSections + recentSeries invariants over every optimizer file ──
{
  let prsViolations = 0;
  let seriesTooLong = 0;
  let legsScanned = 0;
  const offenders = [];
  for (const d of optimizer) {
    const opt = readJson(join(DATA, `parlays/optimizer/${d}.json`));
    if (!opt) continue;
    // recentSeries window (legPool)
    const legs = (opt.legPool && Array.isArray(opt.legPool.legs)) ? opt.legPool.legs : [];
    for (const l of legs) {
      legsScanned++;
      const rs = Array.isArray(l.recentSeries) ? l.recentSeries : [];
      if (rs.length > 10) {
        seriesTooLong++;
        if (offenders.length < 5) offenders.push(`${d}:${l.playerName || l.playerId}:${l.market} len=${rs.length}`);
      }
    }
    // publicRiskSections modeled-only + single-sport buckets
    const prs = opt.publicRiskSections || {};
    for (const sec of Object.keys(prs)) {
      const buckets = prs[sec] || {};
      for (const bucketKey of Object.keys(buckets)) {
        const slips = Array.isArray(buckets[bucketKey]) ? buckets[bucketKey] : [];
        for (const slip of slips) {
          const slipLegs = Array.isArray(slip.legs) ? slip.legs : [];
          const sports = new Set(slipLegs.map((x) => (x.sport || "").toLowerCase()).filter(Boolean));
          // (a) modeled-only: no unsupported sport anywhere
          for (const sp of sports) {
            if (!MODELED_SPORTS.has(sp)) {
              prsViolations++;
              if (offenders.length < 8) offenders.push(`${d} prs.${sec}.${bucketKey} unsupported sport "${sp}"`);
            }
          }
          // (b) the single-sport buckets must be pure of that sport
          if ((bucketKey === "nba" || bucketKey === "mlb") && (sports.size > 1 || (sports.size === 1 && !sports.has(bucketKey)))) {
            prsViolations++;
            if (offenders.length < 8) offenders.push(`${d} prs.${sec}.${bucketKey} not single-sport ${bucketKey} (sports: ${[...sports].join("+")})`);
          }
        }
      }
    }
  }
  if (prsViolations === 0) {
    add("PASS", "publicRiskSections", `modeled-only + single-sport buckets clean across ${optimizer.length} optimizer file(s)`);
  } else {
    add("FAIL", "publicRiskSections", `${prsViolations} violation(s): ${offenders.filter((o) => o.includes("prs.")).join(" | ")}`);
  }
  if (seriesTooLong === 0) {
    add("PASS", "recentSeries-window", `all ${legsScanned} legPool legs have recentSeries length <= 10 (tail window)`);
  } else {
    add("FAIL", "recentSeries-window", `${seriesTooLong} leg(s) have recentSeries length > 10: ${offenders.filter((o) => o.includes("len=")).join(" | ")}`);
  }
}

// ── 8b. best-effort recentSeries tail check vs board (latest optimizer date) ──
{
  const d = latest.optimizer;
  if (d) {
    const opt = readJson(join(DATA, `parlays/optimizer/${d}.json`));
    const boardIndex = new Map(); // `${sport}|${playerId}|${market}` -> full series
    for (const [sport, path] of [["nba", `boards/${d}.json`], ["mlb", `mlb/boards/${d}.json`]]) {
      const b = readJson(join(DATA, path));
      const leans = b && Array.isArray(b.leans) ? b.leans : [];
      for (const ln of leans) {
        // NBA boards key on `market` (PTS/REB/AST); MLB boards key on `marketKey`.
        const mk = (ln.market || ln.marketKey || "").toLowerCase();
        const series = Array.isArray(ln.recentSeries) ? ln.recentSeries.map(Number).filter(Number.isFinite) : [];
        if (mk && series.length) boardIndex.set(`${sport}|${ln.playerId}|${mk}`, series);
      }
    }
    let verified = 0, mismatch = 0, unmatched = 0, trivial = 0;
    const legs = opt && opt.legPool && Array.isArray(opt.legPool.legs) ? opt.legPool.legs : [];
    for (const l of legs) {
      const key = `${(l.sport || "").toLowerCase()}|${l.playerId}|${(l.market || "").toLowerCase()}`;
      const full = boardIndex.get(key);
      const rs = Array.isArray(l.recentSeries) ? l.recentSeries.map(Number).filter(Number.isFinite) : [];
      if (!full || !full.length) { unmatched++; continue; }
      if (full.length <= 10) { trivial++; continue; } // tail == whole, nothing to distinguish
      const tail = full.slice(-10);
      if (tail.length === rs.length && tail.every((v, i) => v === rs[i])) verified++;
      else mismatch++;
    }
    const level = mismatch > 0 ? "WARN" : "INFO";
    add(
      level,
      "recentSeries-tail",
      `latest optimizer ${d}: tail-correct=${verified}, mismatch=${mismatch} (stale pre-#257 artifacts can mismatch — documented), trivial(series<=10)=${trivial}, unmatched=${unmatched}.`,
    );
  }
}

// ── 9. legacy/orphan top-level singles ───────────────────────────────────
{
  for (const name of LEGACY_SINGLES) {
    const onDisk = existsSync(join(DATA, name));
    const refs = srcRefCount(name);
    if (!onDisk) {
      add("INFO", "legacy-single", `${name}: not on disk`);
    } else if (refs === 0) {
      add("WARN", "legacy-single", `${name}: on disk but 0 src/ references — orphaned legacy single (safe to leave; future cleanup candidate; do NOT delete here)`);
    } else {
      add("INFO", "legacy-single", `${name}: on disk, referenced in ${refs} src/ file(s)`);
    }
  }
}

// ── 10. computed-but-unconsumed audit/policy.json ────────────────────────
{
  const onDisk = existsSync(join(DATA, "audit/policy.json"));
  const refs = srcRefCount("policy.json") + srcRefCount("audit/policy");
  if (!onDisk) {
    add("INFO", "policy-json", "audit/policy.json not on disk");
  } else {
    add(
      "INFO",
      "policy-json",
      `audit/policy.json present; referenced in ${refs} src/ file(s) (expected: written by the pipeline learning loop, surfaced as "confirmed-not-consumed"; the optimizer must NOT consume it as a quality signal).`,
    );
  }
}

// ── render ───────────────────────────────────────────────────────────────
const order = { FAIL: 0, WARN: 1, PASS: 2, INFO: 3 };
const fails = results.filter((r) => r.level === "FAIL");
const warns = results.filter((r) => r.level === "WARN");
const passes = results.filter((r) => r.level === "PASS");
const overall = fails.length ? "FAIL" : warns.length ? "WARN" : "PASS";

function consoleReport() {
  const lines = [];
  lines.push("Data-lineage audit (read-only)");
  lines.push(`overall: ${overall}  ·  ${passes.length} pass, ${warns.length} warn, ${fails.length} fail`);
  lines.push("");
  for (const r of [...results].sort((a, b) => order[a.level] - order[b.level])) {
    lines.push(`[${r.level}] ${r.check}: ${r.detail}`);
  }
  return lines.join("\n");
}

function markdownReport() {
  const lines = [];
  lines.push("# Data Lineage — Latest Audit");
  lines.push("");
  lines.push("> Auto-generated by `app/scripts/audit-data-lineage.mjs` (read-only, deterministic — same data ⇒ byte-identical). Do not hand-edit.");
  lines.push("");
  lines.push(`**Overall: ${overall}** — ${passes.length} pass · ${warns.length} warn · ${fails.length} fail`);
  lines.push("");
  lines.push("| Level | Check | Detail |");
  lines.push("|-------|-------|--------|");
  for (const r of [...results].sort((a, b) => order[a.level] - order[b.level] || a.check.localeCompare(b.check))) {
    const detail = String(r.detail).replace(/\|/g, "\\|");
    lines.push(`| ${r.level} | ${r.check} | ${detail} |`);
  }
  lines.push("");
  return lines.join("\n");
}

console.log(consoleReport());

if (WRITE_REPORT) {
  try {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync("../docs/audits", { recursive: true });
    writeFileSync(REPORT_PATH, markdownReport());
    console.log(`\nWrote ${REPORT_PATH}`);
  } catch (e) {
    console.error(`Failed to write report: ${e.message}`);
    process.exit(2);
  }
}

process.exit(fails.length ? 1 : 0);
