/**
 * public-beta-observe — ONE command that states the operational condition of the public beta.
 *
 * WHY THIS EXISTS
 * The facts a session needs before touching anything during the beta were spread across five places:
 * `verify:deployment` for the deployed commit, `health-check` for money, `learning:freshness` for the
 * corpus, two integrity artifacts for quarantine and open proofs, and a human's memory for the pinned
 * money hashes. Assembling them by hand is how a stale board or a half-configured analytics sink gets
 * missed — not because anything failed loudly, but because nobody looked in all five places at once.
 *
 * WHAT IT IS NOT
 * It is not a gate and it is not a fixer. It reads canonical artifacts and reports what they say. It
 * NEVER writes to `app/public/data/mr-dub/**`, never regenerates a board, never settles anything, and
 * never repairs a hash mismatch — a mismatch is reported loudly and left exactly as found, because the
 * only correct response to unexpected money movement is a human looking at it.
 *
 * FAIL CLOSED, BUT ONLY WHERE FAILURE IS REAL
 *   · network unavailable            → deployment UNVERIFIED, exit 0. Not knowing is not a failure.
 *   · missing artifact               → that section reports UNAVAILABLE, exit 0.
 *   · stale board / settlement lag   → WARNING, exit 0. Staleness is a fact to see, not an abort.
 *   · protected money hash mismatch  → FAILURE, non-zero.
 *   · settled date newer than the newest generated board (or a corpus ahead of the ledger)
 *                                    → CONTRADICTION, non-zero. Two artifacts disagreeing about what
 *                                      exists means one of them is wrong, and neither can be trusted
 *                                      until that is resolved.
 *
 * IDEMPOTENT BY CONSTRUCTION
 * The artifact carries ET DATE granularity and facts read off inputs — no wall-clock instant, no
 * elapsed-hours field. Re-running on an unchanged tree the same day rewrites byte-identical JSON, so
 * this can be run repeatedly without producing churn.
 *
 *   npm run ops:public-beta-observe            # human report + artifact
 *   node scripts/public-beta-observe.mjs --json --offline --no-write
 *
 * Overrides exist for tests only: --boards-dir, --ledger, --out-dir.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(APP, "..");

const DEFAULT_ORIGIN = "https://gametimepicks.yashwantbalaji.com";
const MARKER_PATH = "/data/build-info.json";
const TIMEOUT_MS = 20_000;

/** A board older than this is stale enough that a session must not assume it reflects today. */
const STALE_BOARD_DAYS = 3;
/** Settlement runs the morning after a slate, so a lag beyond this is not the normal cadence. */
const STALE_SETTLEMENT_DAYS = 3;

/**
 * Money artifacts pinned by md5. These values are the canonical 19-14 state; they are compared, never
 * written. A mismatch is the one thing here that stops the world.
 */
const PROTECTED = [
  { file: "app/public/data/mr-dub/portfolio.json", expected: "affe6b21071f2b3be96bb2774eb347c3" },
  { file: "app/public/data/mr-dub/bank-builder-locks.json", expected: "cb80473f88f3cb5f67208fa568925295" },
];

/**
 * The four fields whose presence proves a settlement ran THROUGH the lineage path rather than around
 * it. This list is the acceptance definition written in the Sprint 050 observation plan, not a guess:
 * data/internal/mlb/integrity/operational-proof-observation-plan.json → openProofs[clean-lineage-stamping].
 */
const LINEAGE_FIELDS = ["eventId", "providerEventId", "eventStartTime", "settlementSource"];

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const OFFLINE = flag("--offline");
const AS_JSON = flag("--json");
const NO_WRITE = flag("--no-write");
const ORIGIN = (value("--url", process.env.GTP_SITE_URL || DEFAULT_ORIGIN) || "").replace(/\/+$/, "");
const BOARDS_DIR = path.resolve(value("--boards-dir", path.join(APP, "public/data/mlb/boards")));
const LEDGER = path.resolve(value("--ledger", path.join(APP, "public/data/mlb/results/settled_leans.jsonl")));
const OUT_DIR = path.resolve(value("--out-dir", path.join(REPO, "data/internal/ops")));

const CALIBRATION_DIR = path.join(APP, "public/data/mlb/results/calibration");
const FRESHNESS = path.join(REPO, "data/internal/mlb/model-learning/learning-freshness.json");
const LINEAGE_PROOF = path.join(REPO, "data/internal/mlb/integrity/settlement-lineage-live-proof.json");
const PROOF_PLAN = path.join(REPO, "data/internal/mlb/integrity/operational-proof-observation-plan.json");
const RESEARCH_QUARANTINE = path.join(REPO, "data/internal/mlb/research-quarantine");
const SETTLE_ORCHESTRATOR = path.join(REPO, "scripts/automation_settle.sh");
const PIPEFAIL_TEST = "scripts/automation_settle_pipefail_test.sh";
const PIPEFAIL_PROOF = path.join(REPO, "data/internal/mlb/integrity/pipefail-live-proof.json");

// ── helpers ────────────────────────────────────────────────────────────────────

const readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

const etDate = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

function daysBetween(fromIsoDate, toIsoDate) {
  if (!fromIsoDate || !toIsoDate) return null;
  const [fy, fm, fd] = fromIsoDate.split("-").map(Number);
  const [ty, tm, td] = toIsoDate.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

function md5(file) {
  try {
    return crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return null;
  }
}

function localHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .trim()
      .slice(0, 8);
  } catch {
    return null;
  }
}

// ── deployment ─────────────────────────────────────────────────────────────────

/**
 * Same marker and same fail-closed reading as scripts/verify-deployment.mjs. That script is not
 * imported because it runs its whole report at module scope; duplicating ~15 lines of fetch is
 * preferable to importing a side effect. The marker path and the UNKNOWN semantics are kept identical
 * so the two commands can never disagree about the same deployment.
 */
async function observeDeployment() {
  const url = `${ORIGIN}${MARKER_PATH}`;
  const head = localHead();
  const today = etDate(new Date());

  if (OFFLINE) {
    return { status: "UNVERIFIED", reason: "network check skipped (--offline)", url, localHead: head, shaInSync: null };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let info = null;
  let error = null;
  let httpStatus = null;
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    httpStatus = res.status;
    if (!res.ok) error = `HTTP ${res.status}`;
    else {
      const text = await res.text();
      try {
        info = JSON.parse(text);
      } catch {
        error = "response was not valid JSON";
      }
    }
  } catch (err) {
    error = err?.name === "AbortError" ? `timed out after ${TIMEOUT_MS}ms` : String(err?.message || err);
  } finally {
    clearTimeout(timer);
  }

  if (error) {
    return {
      status: "UNVERIFIED",
      reason: httpStatus === 404 ? "marker-not-deployed" : "unreachable",
      detail: error,
      url,
      localHead: head,
      shaInSync: null,
    };
  }

  const buildEtDate = typeof info?.buildEtDate === "string" ? info.buildEtDate : null;
  const sha = info?.commit?.shortSha ?? null;
  const behind = daysBetween(buildEtDate, today);
  let status = "UNVERIFIED";
  if (behind !== null) {
    if (behind < 0) status = "FUTURE";
    else if (behind === 0) status = "CURRENT";
    else if (behind === 1) status = "YESTERDAY";
    else if (behind < 7) status = "STALE";
    else status = "VERY_STALE";
  }

  return {
    status,
    url,
    sha,
    buildEtDate,
    builtAt: typeof info?.builtAt === "string" ? info.builtAt : null,
    environment: info?.environment ?? null,
    daysBehind: behind,
    localHead: head,
    // null = undeterminable (a sha missing on either side), never "false".
    shaInSync: head && sha ? head === sha : null,
  };
}

// ── MLB dates ──────────────────────────────────────────────────────────────────

function readBoards(dir) {
  try {
    const dates = fs
      .readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort();
    return { available: true, count: dates.length, newest: dates.at(-1) ?? null };
  } catch {
    return { available: false, count: 0, newest: null };
  }
}

/**
 * One pass over the settled ledger. The LEDGER's own `date` is authoritative for settlement — a lean
 * carries the game's local date, which rolls past midnight for late West-Coast starts and invents a
 * phantom slate if keyed on (the same reason model-learning-audit keys on the ledger date).
 */
function readLedger(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return { available: false, rows: 0, malformed: 0, newest: null, byDate: new Map() };
  }

  const byDate = new Map();
  let rows = 0;
  let malformed = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let r;
    try {
      r = JSON.parse(line);
    } catch {
      malformed += 1;
      continue;
    }
    if (typeof r.date !== "string") {
      malformed += 1;
      continue;
    }
    rows += 1;
    const entry = byDate.get(r.date) ?? { rows: 0, stamped: 0 };
    entry.rows += 1;
    if (LINEAGE_FIELDS.every((f) => r[f] !== undefined && r[f] !== null && r[f] !== "")) entry.stamped += 1;
    byDate.set(r.date, entry);
  }

  const dates = [...byDate.keys()].sort();
  return { available: true, rows, malformed, dates: dates.length, newest: dates.at(-1) ?? null, byDate };
}

function readQuarantines() {
  const proof = readJson(LINEAGE_PROOF);
  const settlement = proof?.quarantine
    ? [{
        date: proof.quarantine.date,
        status: proof.quarantine.status ?? "QUARANTINED",
        refusedRows: proof.quarantine.refusedRows ?? null,
        source: "settlement-lineage-live-proof.json",
      }]
    : [];

  let research = [];
  try {
    research = fs
      .readdirSync(RESEARCH_QUARANTINE)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort();
  } catch {
    research = [];
  }

  // Two different quarantines with two different meanings. Collapsing them into one list is how a
  // reader concludes a settled slate was refused, or that a leakage exclusion cost us a settlement.
  return { settlement, researchEligibility: research };
}

// ── prediction history ─────────────────────────────────────────────────────────

function observePredictionHistory(newestSettled) {
  const freshness = readJson(FRESHNESS);
  const index = readJson(path.join(CALIBRATION_DIR, "index.json"));
  let newestExport = null;
  try {
    newestExport = fs
      .readdirSync(CALIBRATION_DIR)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .at(-1) ?? null;
  } catch {
    newestExport = null;
  }

  if (!freshness && !index && !newestExport) {
    return { state: "UNAVAILABLE", detail: "no freshness artifact and no calibration export on disk" };
  }

  const asOf = freshness?.asOfSettledDate ?? index?.asOf ?? newestExport;
  const lagDays = daysBetween(asOf, newestSettled);

  let state;
  if (freshness?.healthy === true && (lagDays === 0 || lagDays === null)) state = "CURRENT";
  else if (lagDays !== null && lagDays > 0) state = "BEHIND_LEDGER";
  else state = "REPORTED_UNHEALTHY";

  return {
    state,
    asOfSettledDate: asOf ?? null,
    newestExportedDate: newestExport,
    corpusRows: freshness?.stats?.corpusRows ?? index?.totals?.rows ?? null,
    ledgerRows: freshness?.stats?.ledgerRows ?? null,
    lagDaysBehindLedger: lagDays,
    healthy: freshness?.healthy ?? null,
    problems: freshness?.problems ?? [],
    warningCount: (freshness?.warnings ?? []).length,
  };
}

// ── analytics ──────────────────────────────────────────────────────────────────

const ANALYTICS_CONFIG_FILES = [".env.example", ...(() => {
  try {
    return fs
      .readdirSync(path.join(REPO, ".github/workflows"))
      .filter((f) => f.endsWith(".yml"))
      .map((f) => path.join(".github/workflows", f));
  } catch {
    return [];
  }
})()];

/**
 * Mode is DERIVED, never asserted. `readSinkConfig` in src/lib/analytics/sink.ts sends only when the
 * kill-switch is on AND an endpoint exists, so exactly one of the two present is a half-configuration:
 * nothing leaves the browser, but the state is in flight and worth seeing.
 *
 * Only build-time env and COMMITTED config are inspected. The untracked repo-root .env holds provider
 * secrets and is deliberately not read; endpoint VALUES are never recorded, only presence.
 */
function observeAnalytics() {
  const sources = [];
  const envFlag = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED;
  const envEndpoint = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT;
  let flagOn = envFlag === "1" || envFlag === "true";
  let endpointSet = typeof envEndpoint === "string" && envEndpoint.trim() !== "";
  if (flagOn || endpointSet) sources.push("process env");

  for (const rel of ANALYTICS_CONFIG_FILES) {
    let src;
    try {
      src = fs.readFileSync(path.join(REPO, rel), "utf8");
    } catch {
      continue;
    }
    const on = /NEXT_PUBLIC_ANALYTICS_ENABLED\s*[:=]\s*["']?(1|true)\b/.test(src);
    const ep = /NEXT_PUBLIC_ANALYTICS_ENDPOINT\s*[:=]\s*["']?(https?:\/\/\S+)/.test(src);
    if (on || ep) {
      flagOn = flagOn || on;
      endpointSet = endpointSet || ep;
      sources.push(rel);
    }
  }

  const mode = flagOn && endpointSet ? "LIVE" : flagOn || endpointSet ? "STAGING" : "OFF";
  return {
    mode,
    enabledFlag: flagOn,
    endpointConfigured: endpointSet,
    sources,
    note:
      mode === "OFF"
        ? "no build-time flag and no committed endpoint — the sink resolves to NOOP and nothing leaves the browser"
        : mode === "STAGING"
          ? "half-configured: the sink still resolves to NOOP because sink.ts requires BOTH the flag and an endpoint"
          : "flag and endpoint are both present — outbound events would send",
    decisionMemo: "docs/ANALYTICS_ACTIVATION_DECISION.md",
  };
}

// ── limitations ────────────────────────────────────────────────────────────────

/**
 * Named limitations, read from the observation plan and RE-DERIVED against today's artifacts. A proof
 * is never closed here — code cannot close a proof that requires a real scheduled run — but a proof
 * whose evidence has become observable is reported as such so a session knows to run the checklist in
 * docs/PUBLIC_BETA_OPERATIONAL_PROOF.md rather than assume nothing changed.
 */
function observeLimitations({ lineage }) {
  const plan = readJson(PROOF_PLAN);
  const open = plan?.openProofs ?? [];
  const byId = Object.fromEntries(open.map((p) => [p.id, p]));

  let pipefailDeclared = false;
  try {
    pipefailDeclared = /^set -o pipefail/m.test(fs.readFileSync(SETTLE_ORCHESTRATOR, "utf8"));
  } catch {
    pipefailDeclared = false;
  }

  const items = [];

  items.push({
    id: "clean-lineage-stamping",
    status: lineage.state === "COMPLETE" ? "OBSERVABLE_NOW" : "WALL_CLOCK_OPEN",
    what: "the first clean post-gate settlement has not been observed",
    observed:
      lineage.state === "COMPLETE"
        ? `the newest settled date carries all ${LINEAGE_FIELDS.length} lineage fields — run the settlement-proof checklist to close this`
        : `the newest settled date stamps ${lineage.stampedRows}/${lineage.rows} rows (${lineage.state})`,
    planNote: byId["clean-lineage-stamping"]?.why ?? null,
    closedBy: "docs/PUBLIC_BETA_OPERATIONAL_PROOF.md §5.1",
  });

  // A wall-clock proof stops being open once the natural event actually happens. The proof artifact
  // is the record of that event, so it is read rather than assumed — the same way the lineage gate's
  // live proof is recorded. Reporting a closed proof as still open is its own kind of dishonesty.
  const pipefailProof = readJson(PIPEFAIL_PROOF);
  const pipefailProven = String(pipefailProof?.verdict ?? "").startsWith("PROVEN");

  items.push({
    id: "pipefail-live",
    status: pipefailProven ? "PROVEN" : "WALL_CLOCK_OPEN",
    what: pipefailProven
      ? "a scheduled run failed naturally under the corrected orchestrator and was reported as a failure"
      : "no scheduled run has yet failed naturally under the corrected orchestrator",
    observed: pipefailProven
      ? `${pipefailProof.evidence?.workflow ?? "a scheduled workflow"} exited ${pipefailProof.evidence?.exitCode ?? "non-zero"} on ${pipefailProof.observedAtEt ?? "an observed run"} — ${pipefailProof.evidence?.underlyingError ?? "a real failure"}`
      : pipefailDeclared
        ? "automation_settle.sh declares `set -o pipefail` — the fix is present, its natural proof is not"
        : "automation_settle.sh does NOT declare `set -o pipefail` — the Sprint 049 fix is missing",
    standingEvidence: `${PIPEFAIL_TEST} (deterministic known-negative: the defect reproduces without pipefail)`,
    ...(pipefailProven
      ? { provenBy: PIPEFAIL_PROOF.replace(`${REPO}/`, ""), namedLimitation: pipefailProof.namedLimitation?.detail ?? null }
      : { doNotForceIt: byId["pipefail-live"]?.doNotForceIt ?? "corrupting production data to trigger a failure is not acceptable" }),
  });

  return items;
}

// ── assembly ───────────────────────────────────────────────────────────────────

async function observe() {
  const today = etDate(new Date());
  const warnings = [];
  const failures = [];

  const boards = readBoards(BOARDS_DIR);
  const ledger = readLedger(LEDGER);
  const quarantines = readQuarantines();

  const newestBoard = boards.newest;
  const newestSettled = ledger.newest;
  const boardAgeDays = daysBetween(newestBoard, today);
  const settlementLagDays = daysBetween(newestSettled, today);

  if (!boards.available) warnings.push(`boards directory unavailable at ${path.relative(REPO, BOARDS_DIR)}`);
  if (!ledger.available) warnings.push(`settled ledger unavailable at ${path.relative(REPO, LEDGER)}`);
  if (ledger.malformed > 0) warnings.push(`${ledger.malformed} ledger line(s) could not be read as dated JSON`);
  if (boardAgeDays !== null && boardAgeDays > STALE_BOARD_DAYS) {
    warnings.push(`STALE: newest board ${newestBoard} is ${boardAgeDays} days old (> ${STALE_BOARD_DAYS})`);
  }
  if (settlementLagDays !== null && settlementLagDays > STALE_SETTLEMENT_DAYS) {
    warnings.push(`STALE: newest settled date ${newestSettled} is ${settlementLagDays} days old (> ${STALE_SETTLEMENT_DAYS})`);
  }

  // A settled slate that no board produced means one of the two artifacts is describing a slate that
  // does not exist. Neither can be trusted until a human resolves which.
  if (newestBoard && newestSettled && newestSettled > newestBoard) {
    failures.push(`CONTRADICTION: newest settled date ${newestSettled} is NEWER than the newest generated board ${newestBoard}`);
  }

  const settledEntry = newestSettled ? ledger.byDate.get(newestSettled) : null;
  const stampedRows = settledEntry?.stamped ?? 0;
  const settledRows = settledEntry?.rows ?? 0;
  const coverage = settledRows > 0 ? stampedRows / settledRows : null;
  const lineage = {
    date: newestSettled,
    rows: settledRows,
    stampedRows,
    coverage,
    fields: LINEAGE_FIELDS,
    state: coverage === null ? "UNAVAILABLE" : coverage === 1 ? "COMPLETE" : coverage === 0 ? "NOT_YET_STAMPED" : "PARTIAL",
  };
  if (lineage.state === "NOT_YET_STAMPED") {
    warnings.push(`lineage acceptance NOT_YET_STAMPED for ${newestSettled} — 0/${settledRows} rows carry the four lineage fields`);
  } else if (lineage.state === "PARTIAL") {
    warnings.push(`lineage acceptance PARTIAL for ${newestSettled} — ${stampedRows}/${settledRows} rows stamped`);
  }

  const predictionHistory = observePredictionHistory(newestSettled);
  if (predictionHistory.state === "BEHIND_LEDGER") {
    warnings.push(`prediction-history corpus is ${predictionHistory.lagDaysBehindLedger} day(s) behind the ledger (${predictionHistory.asOfSettledDate} vs ${newestSettled})`);
  } else if (predictionHistory.state === "REPORTED_UNHEALTHY") {
    warnings.push(`prediction-history freshness reports unhealthy: ${(predictionHistory.problems ?? []).join("; ") || "no detail given"}`);
  } else if (predictionHistory.state === "UNAVAILABLE") {
    warnings.push("prediction-history export is unavailable");
  }
  if (predictionHistory.asOfSettledDate && newestSettled && predictionHistory.asOfSettledDate > newestSettled) {
    failures.push(`CONTRADICTION: prediction-history corpus (${predictionHistory.asOfSettledDate}) is ahead of the settled ledger (${newestSettled})`);
  }

  const analytics = observeAnalytics();
  if (analytics.mode !== "OFF") {
    warnings.push(`analytics mode is ${analytics.mode} — activation is a founder decision and the memo (${analytics.decisionMemo}) is unsigned`);
  }

  const protectedHashes = PROTECTED.map(({ file, expected }) => {
    const actual = md5(path.join(REPO, file));
    const state = actual === null ? "MISSING" : actual === expected ? "MATCH" : "MISMATCH";
    if (state !== "MATCH") failures.push(`${state}: ${file} — expected ${expected}, found ${actual ?? "no file"}`);
    return { file, expected, actual, state };
  });

  const deployment = await observeDeployment();
  if (deployment.status === "UNVERIFIED") warnings.push(`deployment UNVERIFIED (${deployment.reason}) — this says nothing either way`);
  else if (deployment.status !== "CURRENT") warnings.push(`deployed build clock is ${deployment.status} (${deployment.buildEtDate})`);
  if (deployment.shaInSync === false) warnings.push(`production is serving ${deployment.sha}, local HEAD is ${deployment.localHead}`);

  const limitations = observeLimitations({ lineage });

  return {
    kind: "public-beta-observation",
    public: false,
    schemaVersion: 1,
    // Day granularity, deliberately: an instant here would make every re-run a diff.
    observedEtDate: today,
    verdict: failures.length ? "FAIL" : warnings.length ? "WARN" : "OK",
    deployment,
    mlb: {
      newestGeneratedBoard: newestBoard,
      boardCount: boards.count,
      boardAgeDays,
      newestSettledDate: newestSettled,
      settlementLagDays,
      settledLedgerRows: ledger.rows,
      settledDates: ledger.dates ?? 0,
      quarantines,
    },
    lineage,
    predictionHistory,
    analytics,
    protectedHashes,
    limitations,
    wallClockObservations: [
      `observed on ${today} (ET)`,
      newestBoard ? `newest generated board ${newestBoard} (${boardAgeDays} day(s) old)` : "no generated board on disk",
      newestSettled ? `newest settled slate ${newestSettled} (${settlementLagDays} day(s) old)` : "no settled slate on disk",
      quarantines.settlement.length
        ? `${quarantines.settlement.map((q) => q.date).join(", ")} remains refused by the settlement-lineage gate`
        : "no settlement quarantine recorded",
    ],
    warnings,
    failures,
  };
}

// ── output ─────────────────────────────────────────────────────────────────────

function print(o) {
  const line = (label, v) => console.log(`  ${label.padEnd(24)}${v}`);
  console.log(`\n  PUBLIC BETA OBSERVATION — ${o.verdict}   (${o.observedEtDate} ET)\n`);

  line("deployment", `${o.deployment.status}${o.deployment.sha ? ` · ${o.deployment.sha}` : ""}${o.deployment.reason ? ` · ${o.deployment.reason}` : ""}`);
  line("local HEAD", `${o.deployment.localHead ?? "unknown"}${o.deployment.shaInSync === true ? " (in sync)" : o.deployment.shaInSync === false ? " (DIFFERENT)" : ""}`);
  line("newest board", `${o.mlb.newestGeneratedBoard ?? "none"}${o.mlb.boardAgeDays === null ? "" : ` (${o.mlb.boardAgeDays}d old)`}`);
  line("newest settled", `${o.mlb.newestSettledDate ?? "none"}${o.mlb.settlementLagDays === null ? "" : ` (${o.mlb.settlementLagDays}d old, ${o.mlb.settledLedgerRows.toLocaleString()} rows)`}`);
  line("settlement quarantine", o.mlb.quarantines.settlement.map((q) => `${q.date} ${q.status}`).join(", ") || "none");
  line("research quarantine", o.mlb.quarantines.researchEligibility.join(", ") || "none");
  line("lineage acceptance", `${o.lineage.state} · ${o.lineage.stampedRows}/${o.lineage.rows} rows on ${o.lineage.date ?? "n/a"}`);
  line("prediction history", `${o.predictionHistory.state}${o.predictionHistory.asOfSettledDate ? ` · through ${o.predictionHistory.asOfSettledDate}` : ""}${o.predictionHistory.corpusRows ? ` · ${o.predictionHistory.corpusRows.toLocaleString()} rows` : ""}`);
  line("analytics", `${o.analytics.mode} · ${o.analytics.note}`);

  console.log("\n  protected hashes");
  for (const h of o.protectedHashes) console.log(`    ${h.state.padEnd(9)} ${h.file}`);

  console.log("\n  named limitations");
  for (const l of o.limitations) console.log(`    ${l.status.padEnd(16)} ${l.id} — ${l.observed}`);

  if (o.warnings.length) {
    console.log("\n  warnings");
    for (const w of o.warnings) console.log(`    · ${w}`);
  }
  if (o.failures.length) {
    console.log("\n  FAILURES");
    for (const f of o.failures) console.log(`    ! ${f}`);
    console.log("\n  Nothing here is repaired automatically. A protected-hash mismatch or a contradiction");
    console.log("  between artifacts needs a human before any further command is run.");
  }
  console.log("");
}

const observation = await observe();

if (!NO_WRITE) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const body = `${JSON.stringify(observation, null, 2)}\n`;
  fs.writeFileSync(path.join(OUT_DIR, `public-beta-observation-${observation.observedEtDate}.json`), body);
  fs.writeFileSync(path.join(OUT_DIR, "latest.json"), body);
}

if (AS_JSON) console.log(JSON.stringify(observation, null, 2));
else {
  print(observation);
  if (!NO_WRITE) console.log(`  wrote ${path.relative(REPO, OUT_DIR)}/{public-beta-observation-${observation.observedEtDate},latest}.json\n`);
}

process.exit(observation.failures.length ? 1 : 0);
