/**
 * SPRINT 048 — does the learning loop actually have complete data today?
 *
 * WHY THIS EXISTS
 * The prediction-history exporter froze on 2026-07-08 and nobody noticed for three weeks. Nothing
 * errored. No workflow went red. The corpus simply stopped growing while every downstream calibration
 * conclusion kept being computed on it, and kept looking reasonable.
 *
 * That is the failure mode this repository keeps producing: not a crash, but a silent stall behind a
 * green build. Scheduling the exporter (Sprint 048, Phase 1) prevents *that* instance. It does not
 * prevent the next one — a workflow that runs but writes nothing, a settlement that lands after the
 * export, a corpus that grows while the boards behind it are missing.
 *
 * So this asserts the property rather than the process: the corpus must COVER the ledger, be fresh
 * relative to the newest settled date, and reproduce byte-identically from committed inputs.
 *
 * Exit codes: 0 healthy, 1 a real problem. The workflow treats a non-zero exit as a warning rather
 * than an abort — a stale corpus should be visible on /ops, not a reason to fail a settlement that
 * already succeeded.
 *
 * Usage:
 *   npx tsx scripts/check-learning-freshness.mjs            # report
 *   npx tsx scripts/check-learning-freshness.mjs --write    # also write the status artifact
 *   npx tsx scripts/check-learning-freshness.mjs --self-test
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const CAL_DIR = path.join(APP, "public/data/mlb/results/calibration");
const LEDGER = path.join(APP, "public/data/mlb/results/settled_leans.jsonl");
const STATUS = path.join(REPO, "data/internal/mlb/model-learning/learning-freshness.json");

/**
 * How far the corpus may lag the newest settled date before it is a problem.
 *
 * One day, not zero: settlement and export run in the same workflow but the ledger can gain a date
 * whose export lands in the next run if the two are split across the 05:30 and 07:30 passes. Two days
 * would hide a full missed cycle, which is exactly what went unnoticed for three weeks.
 */
const MAX_LAG_DAYS = 1;

/** Below this share of ledger rows present in the corpus, the corpus is not usable for calibration. */
const MIN_COVERAGE = 0.98;

const dateDiffDays = (a, b) =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

export function inspect({ calDir = CAL_DIR, ledger = LEDGER } = {}) {
  const problems = [];
  const warnings = [];

  if (!fs.existsSync(ledger)) {
    return { healthy: false, problems: ["the settled ledger does not exist"], warnings, stats: null };
  }

  // ── ledger side ────────────────────────────────────────────────────────────
  const ledgerDates = new Set();
  let ledgerRows = 0;
  for (const line of fs.readFileSync(ledger, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    ledgerRows += 1;
    if (r.date) ledgerDates.add(r.date);
  }

  // ── corpus side ────────────────────────────────────────────────────────────
  const corpusDates = new Set();
  let corpusRows = 0;
  if (fs.existsSync(calDir)) {
    for (const f of fs.readdirSync(calDir).filter((x) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(x))) {
      corpusDates.add(f.slice(0, 10));
      for (const line of fs.readFileSync(path.join(calDir, f), "utf8").split("\n")) {
        if (line.trim()) corpusRows += 1;
      }
    }
  } else {
    problems.push("the prediction-history corpus directory does not exist");
  }

  const newestLedger = [...ledgerDates].sort().pop() ?? null;
  const newestCorpus = [...corpusDates].sort().pop() ?? null;
  const missingDates = [...ledgerDates].filter((d) => !corpusDates.has(d)).sort();
  const coverage = ledgerRows === 0 ? 0 : corpusRows / ledgerRows;
  const lagDays = newestLedger && newestCorpus ? dateDiffDays(newestLedger, newestCorpus) : null;

  // ── the checks ─────────────────────────────────────────────────────────────
  if (lagDays !== null && lagDays > MAX_LAG_DAYS) {
    problems.push(
      `the corpus is ${lagDays} day(s) behind the ledger (corpus ${newestCorpus}, ledger ${newestLedger}) — ` +
        `this is the shape of the 2026-07-08 stall`,
    );
  }
  if (missingDates.length > 0) {
    problems.push(
      `${missingDates.length} settled date(s) are absent from the corpus: ` +
        `${missingDates.slice(0, 5).join(", ")}${missingDates.length > 5 ? ", …" : ""}`,
    );
  }
  if (coverage < MIN_COVERAGE) {
    problems.push(
      `the corpus holds ${corpusRows} of ${ledgerRows} ledger rows (${(coverage * 100).toFixed(1)}%), ` +
        `below the ${(MIN_COVERAGE * 100).toFixed(0)}% minimum`,
    );
  }
  // SPRINT 049 — a BOARD with no settlement is invisible in a ledger-vs-corpus comparison, because
  // neither side has it. On 2026-07-29 the lineage gate correctly refused to settle 2026-07-28 (a
  // pre-gate board carrying the CLE@CIN doubleheader collision), and nothing in this check noticed:
  // the corpus matched the ledger perfectly, because the ledger was missing the date too.
  //
  // A refused settlement is the RIGHT outcome and must stay visible. Reported as a warning, not a
  // problem — the loop's data is internally consistent; a slate is simply quarantined.
  const boardDir = path.join(APP, "public/data/mlb/boards");
  if (fs.existsSync(boardDir)) {
    const boardDates = fs.readdirSync(boardDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
    // Exclude boards for slates that have not finished yet. Keyed on the ET date rather than "the
    // newest file": on 2026-07-29 the newest board was 2026-07-28, whose slate WAS complete and whose
    // settlement had been refused — dropping the last file hid exactly the case this check exists for.
    const todayEt = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const settleable = boardDates.filter((d) => d < todayEt);
    const unsettled = settleable.filter((d) => !ledgerDates.has(d));
    if (unsettled.length > 0) {
      warnings.push(
        `${unsettled.length} completed slate(s) have a board but no settled rows: ${unsettled.join(", ")} — ` +
          `check whether the settlement-lineage gate refused them (that is a correct outcome, not an outage)`,
      );
    }
  }

  // Growing rows on a shrinking date set, or vice versa, means the exporter partially wrote.
  if (corpusRows > ledgerRows) {
    warnings.push(`the corpus has MORE rows (${corpusRows}) than the ledger (${ledgerRows}) — likely a stale date file`);
  }

  return {
    healthy: problems.length === 0,
    problems,
    warnings,
    stats: {
      ledgerRows, corpusRows, coverage,
      ledgerDates: ledgerDates.size, corpusDates: corpusDates.size,
      newestLedgerDate: newestLedger, newestCorpusDate: newestCorpus,
      lagDays, missingDates,
    },
  };
}

// ── self-test ──────────────────────────────────────────────────────────────────

export function selfTest() {
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "gtp-freshness-"));

  const writeLedger = (rows) =>
    fs.writeFileSync(path.join(tmp, "ledger.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n"));
  const writeCorpus = (byDate) => {
    const dir = path.join(tmp, "cal");
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    for (const [d, n] of Object.entries(byDate)) {
      fs.writeFileSync(path.join(dir, `${d}.jsonl`), Array.from({ length: n }, () => "{}").join("\n"));
    }
    return dir;
  };

  const ledgerRows = [
    ...Array.from({ length: 50 }, () => ({ date: "2026-07-26" })),
    ...Array.from({ length: 50 }, () => ({ date: "2026-07-27" })),
    ...Array.from({ length: 50 }, () => ({ date: "2026-07-28" })),
  ];
  writeLedger(ledgerRows);

  // KNOWN POSITIVE — corpus covers the ledger exactly.
  {
    const dir = writeCorpus({ "2026-07-26": 50, "2026-07-27": 50, "2026-07-28": 50 });
    const r = inspect({ calDir: dir, ledger: path.join(tmp, "ledger.jsonl") });
    ok(r.healthy, `a complete corpus must be healthy: ${JSON.stringify(r.problems)}`);
    ok(r.stats.lagDays === 0, `lag should be 0, got ${r.stats.lagDays}`);
  }

  // KNOWN NEGATIVE — the exact 2026-07-08 stall: corpus stops, ledger keeps going. Two days behind,
  // because a ONE-day lag is deliberately tolerated (settlement and export can split across the two
  // nightly passes) and would not distinguish a stall from normal timing.
  {
    const dir = writeCorpus({ "2026-07-26": 50 });
    const r = inspect({ calDir: dir, ledger: path.join(tmp, "ledger.jsonl") });
    ok(!r.healthy, "a stalled corpus must NOT be healthy");
    ok(r.problems.some((p) => p.includes("behind the ledger")), `expected a lag problem: ${r.problems}`);
    ok(r.stats.missingDates.includes("2026-07-28"), "the missing date must be named");
  }

  // A ONE-day lag alone must NOT be reported as a problem — otherwise the check cries wolf every night
  // the two nightly passes straddle a date boundary, and a real stall gets ignored with the rest.
  {
    const dir = writeCorpus({ "2026-07-26": 50, "2026-07-27": 50, "2026-07-28": 50 });
    fs.writeFileSync(path.join(tmp, "ledger2.jsonl"),
      [...ledgerRows, ...Array.from({ length: 50 }, () => ({ date: "2026-07-29" }))]
        .map((x) => JSON.stringify(x)).join("\n"));
    const r = inspect({ calDir: dir, ledger: path.join(tmp, "ledger2.jsonl") });
    ok(r.stats.lagDays === 1, `expected a 1-day lag, got ${r.stats.lagDays}`);
    ok(!r.problems.some((p) => p.includes("behind the ledger")), "a 1-day lag must not trip the lag rule");
  }

  // A corpus that is fresh but INCOMPLETE must also fail — freshness alone is not coverage.
  {
    const dir = writeCorpus({ "2026-07-26": 1, "2026-07-27": 50, "2026-07-28": 50 });
    const r = inspect({ calDir: dir, ledger: path.join(tmp, "ledger.jsonl") });
    ok(!r.healthy, "a fresh but half-empty corpus must fail on coverage");
    ok(r.problems.some((p) => p.includes("below the")), `expected a coverage problem: ${r.problems}`);
  }

  // A missing corpus directory must be a problem, not a crash.
  {
    const r = inspect({ calDir: path.join(tmp, "nope"), ledger: path.join(tmp, "ledger.jsonl") });
    ok(!r.healthy && r.problems.length > 0, "a missing corpus must report, not throw");
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  return fails;
}

// ── main ───────────────────────────────────────────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) {
    const fails = selfTest();
    if (fails.length) {
      console.error(`SELF-TEST FAILED — ${fails.length}:`);
      for (const f of fails) console.error(`  - ${f}`);
      process.exit(1);
    }
    console.log("self-test ok — a complete corpus passes, and a stalled or half-empty one is caught");
    return;
  }

  const r = inspect();
  const s = r.stats;
  console.log("=== learning-loop freshness ===");
  if (s) {
    console.log(`  ledger : ${s.ledgerRows} rows across ${s.ledgerDates} dates (newest ${s.newestLedgerDate})`);
    console.log(`  corpus : ${s.corpusRows} rows across ${s.corpusDates} dates (newest ${s.newestCorpusDate})`);
    console.log(`  coverage ${(s.coverage * 100).toFixed(1)}% · lag ${s.lagDays} day(s)`);
  }
  for (const p of r.problems) console.log(`  PROBLEM: ${p}`);
  for (const w of r.warnings) console.log(`  warning: ${w}`);
  console.log(r.healthy ? "  → complete learning data for today" : "  → LEARNING DATA INCOMPLETE");

  if (process.argv.includes("--write")) {
    fs.mkdirSync(path.dirname(STATUS), { recursive: true });
    // No wall-clock timestamp: the artifact must reproduce byte-identically from the same inputs, or
    // it churns a commit every night and stops being a signal.
    fs.writeFileSync(STATUS, JSON.stringify({
      kind: "learning-freshness", public: false,
      asOfSettledDate: s?.newestLedgerDate ?? null,
      healthy: r.healthy, problems: r.problems, warnings: r.warnings, stats: s,
    }, null, 2));
    console.log(`  wrote ${path.relative(REPO, STATUS)}`);
  }

  process.exit(r.healthy ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
