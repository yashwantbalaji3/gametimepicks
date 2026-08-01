/**
 * Lifecycle automation — locks that the canonical daily lifecycle (roll_to_next_day.sh) owns every stage,
 * the production smoke test + run report exist and are wired as post-deploy gates, and the health gate runs
 * inside the lifecycle. Source-level (fast); behavioural correctness is proven by running the scripts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repo = path.join(process.cwd(), "..");
const readRepo = (rel) => fs.readFileSync(path.join(repo, rel), "utf8");
const readApp = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

test("there is exactly ONE canonical lifecycle orchestrator (roll_to_next_day.sh)", () => {
  const roll = readRepo("scripts/roll_to_next_day.sh");
  // It owns the full chain: settle → reconcile/gate → projections → all four products → build → deploy → smoke.
  assert.match(roll, /settle_soccer_day\.sh/, "settles the prior day");
  assert.match(roll, /gate\b/, "runs the money/health gate");
  assert.match(roll, /activate-daily-portfolio/, "generates Bank Builder + Moonshot");
  assert.match(roll, /world-cup-specials|refresh.*specials|specials/i, "refreshes WC Specials");
  assert.match(roll, /homer|ingest-mlb-slate/i, "ingests Homer Nukes");
  assert.match(roll, /smoke-test-production\.mjs/, "post-deploy production smoke test");
  assert.match(roll, /write-run-report\.mjs/, "emits a run report");
});

test("production smoke test derives expected money from canonical (no hardcoded values)", () => {
  const s = readApp("scripts/smoke-test-production.mjs");
  assert.match(s, /portfolio\.json/, "reads canonical portfolio for expected values");
  assert.match(s, /currentBankroll/, "checks the live bankroll against canonical");
  assert.match(s, /crownBankroll/, "checks the live crown against canonical");
  assert.match(s, /process\.exit\(1\)/, "fails the deploy on drift");
  // anti-hardcode: must not bake a dollar literal into the assertion.
  assert.ok(!/20,065\.40|20065\.4/.test(s), "no hardcoded bankroll literal in the smoke test");
});

test("run report captures the required observability fields, money from canonical", () => {
  const r = readApp("scripts/write-run-report.mjs");
  for (const field of ["settledDay", "mode", "deployed", "smoke", "durationSec", "products", "warnings", "deployUrl"]) {
    assert.ok(r.includes(field), `report includes ${field}`);
  }
  assert.match(r, /portfolio\.currentBankroll/, "money snapshot derives from canonical portfolio");
  assert.ok(!/20065\.4|20,065/.test(r), "no hardcoded bankroll literal in the report writer");
});

test("the lifecycle gate runs all three money guards (integrity + forensic + health)", () => {
  const roll = readRepo("scripts/roll_to_next_day.sh");
  assert.match(roll, /verify-money-integrity\.mjs/, "money-integrity in the gate");
  assert.match(roll, /forensic-money-audit\.mjs/, "forensic audit in the gate");
  assert.match(roll, /health-check\.mjs/, "health check in the gate");
});

test("daily-lifecycle.yml is the manual recovery roll — dispatch-only, deploy opt-in", () => {
  // Program 092-095 Lane E reversed the earlier ownership: nightly-settle is THE one scheduled
  // settlement writer (see settlement-writer-ownership.test.mjs, which pins that invariant).
  // The full roll remains available by hand; a silently regained cron is a regression here.
  const wf = readRepo(".github/workflows/daily-lifecycle.yml");
  assert.ok(!/^\s*-\s*cron:/m.test(wf), "dispatch-only: the roll must not regain a schedule silently");
  assert.match(wf, /workflow_dispatch:/, "manual recovery dispatch preserved");
  assert.match(wf, /roll_to_next_day\.sh/, "invokes the canonical lifecycle script");
  assert.match(wf, /ENABLE_AUTONOMOUS_DEPLOY/, "auto-deploy is opt-in via a repo variable (irreversible action gated)");
  // honest-skip: credentials are wired but their absence must not be a hard requirement here.
  assert.match(wf, /ODDS_API_KEY/, "passes the odds key through (honest-skip when unset)");
  assert.match(wf, /ops_alert\.sh/, "failures route through the shared alerter");
});

test("overlapping product orchestrators are retired to dispatch-only (no duplicate crons)", () => {
  const hasCron = (rel) => /^\s*-\s*cron:/m.test(readRepo(rel));
  // mlb ingest is now step 8 of the canonical lifecycle; lineup-aware's window cron expired.
  assert.ok(!hasCron(".github/workflows/mlb-daily.yml"), "mlb-daily cron retired (dispatch-only)");
  assert.ok(!hasCron(".github/workflows/lineup-aware-refresh.yml"), "lineup-aware cron retired (dispatch-only)");
});

test("there is exactly ONE product orchestrator (the dead parallel daily-product-refresh is removed)", () => {
  assert.ok(!fs.existsSync(path.join(process.cwd(), "scripts/daily-product-refresh.mjs")),
    "the superseded parallel product orchestrator must not exist");
  // the lifecycle keeps the Mr. Dub master-ledger artifact fresh after settle + generate.
  assert.match(readRepo("scripts/roll_to_next_day.sh"), /build-master-ledger\.mjs/, "roll rebuilds the master ledger");
});

test("the money gates resolve their data dir cwd-agnostically (work from the lifecycle's repo-root call)", () => {
  // Regression lock: the gate() runs `npx tsx app/scripts/...` from the REPO ROOT, so a bare
  // process.cwd()/public/data (app-only) silently aborts the whole roll. Both must derive from import.meta.url.
  for (const s of ["scripts/forensic-money-audit.mjs", "scripts/health-check.mjs"]) {
    const src = readApp(s);
    assert.match(src, /fileURLToPath\(import\.meta\.url\)/, `${s} resolves data dir from its own file location`);
    assert.ok(!/path\.join\(process\.cwd\(\),\s*"public",\s*"data"\)/.test(src), `${s} must not hardcode cwd/public/data`);
  }
});

test("health-check guards against a stale master-ledger artifact (the $8,247 rot)", () => {
  assert.match(readApp("scripts/health-check.mjs"), /artifact-drift:master-ledger/, "warns when the on-disk ledger drifts from canonical");
});

test("forensic audit reconciles the CURRENT slate date, not a frozen literal (audit P1-1)", () => {
  const s = readApp("scripts/forensic-money-audit.mjs");
  assert.match(s, /buildMasterLedger\(DATA, `\$\{DATE\}/, "master-ledger uses the derived DATE");
  assert.match(s, /computeOpenExposure\(DATA, DATE\)/, "open-exposure uses the derived DATE");
  // the only allowed 2026-06-26 is the explanatory comment — never a live buildMasterLedger/exposure arg.
  assert.ok(!/computeOpenExposure\(DATA, "2026-06-26"\)|buildMasterLedger\(DATA, "2026-06-26/.test(s), "no hardcoded 2026-06-26 in the live checks");
});

test("official-results fetch uses real date math at month boundaries (audit P1-6)", () => {
  const s = readRepo("pipeline/fetch_official_soccer.py");
  assert.match(s, /datetime\.date\(y, m, dd\)/, "uses a real calendar date as the base");
  assert.match(s, /datetime\.timedelta\(days=/, "real timedelta math (carries month/year correctly)");
  assert.match(s, /range\(3\)/, "window spans the slate date + 2 days (a combined window can span 3 UTC dates)");
  assert.ok(!/\{dd\+1:02d\}/.test(s), "no naive dd+1 rollover");
});

test("health-check validates daily-portfolio integrity (active-lane-has-legs, slate freshness, bankroll drift)", () => {
  const s = readApp("scripts/health-check.mjs");
  assert.match(s, /active-no-legs/, "an active wager with zero legs is a CRITICAL");
  assert.match(s, /daily-portfolio:stale-date/, "a not-today slate (missed roll) is flagged");
  assert.match(s, /daily-portfolio:bankroll-drift/, "daily activeBankroll must match canonical");
});

test("settle validates the OFFICIAL operator bundle before trusting it (audit P1-11)", () => {
  // The OFFICIAL= bundle is the one path where a hand-supplied file moves paper money — it must be
  // structurally sound (valid JSON + non-empty matches[] with status) or settlement refuses.
  const s = readRepo("scripts/settle_soccer_day.sh");
  assert.match(s, /OFFICIAL bundle failed validation/, "refuses a malformed/empty bundle");
  assert.match(s, /matches.*array|non-empty matches/i, "requires a non-empty matches[] array");
});

test("settle ROLLS the daily portfolio forward before its money gate (2026-07-06 regression)", () => {
  // ROOT CAUSE of the 2026-07-06 nightly-settle + daily-lifecycle failures: settling active lanes moved
  // portfolio.json's bankroll, but daily-portfolio.json still advertised the PRE-settlement activeBankroll,
  // so verify-money-integrity's `daily=canonical-bankroll` invariant failed with exit 1 and BOTH workflows
  // aborted with no commit. The fix regenerates the daily portfolio (activate-daily-portfolio) AFTER the
  // ledger rebuild and BEFORE the money gate. This locks that wiring + ordering so it can't regress.
  const s = readRepo("scripts/settle_soccer_day.sh");
  assert.match(s, /activate-daily-portfolio\.mjs --date "\$ROLL_DATE" --apply/, "rolls the daily portfolio forward on --apply");
  assert.match(s, /ROLL_DATE=\$\(TZ=America\/New_York date \+%F\)/, "rolls to TODAY in ET (the roll-forward day), not the settled date");
  // Ordering: the roll-forward step must appear BEFORE the money-integrity gate, else the gate sees a stale portfolio.
  const rollIdx = s.indexOf("Roll daily portfolio forward");
  const gateIdx = s.indexOf("verify-money-integrity.mjs");
  assert.ok(rollIdx > 0 && gateIdx > 0 && rollIdx < gateIdx, "daily-portfolio roll-forward precedes the money gate");
});

test("settle-first guard keys off the LADDER (settled slateDate), not stale daily-portfolio status", () => {
  // Settlement never rewrites the daily-portfolio status, so the guard must confirm settlement via the
  // ladder's settled step dated PREV — otherwise it would HALT the autonomous roll after every settlement.
  const roll = readRepo("scripts/roll_to_next_day.sh");
  assert.match(roll, /dual-bank-builder-active\.json/, "guard reads the ladder");
  assert.match(roll, /settled_prev/, "guard distinguishes settled vs honest-skip");
  assert.match(roll, /slateDate.*==.*prev|s\.get\("slateDate"\)==prev/, "matches the PREV-dated settled step");
});

test("settlement auto-heals a missing ladder step slot (guarded to the expected step)", () => {
  // A known desync: the daily card-build flow can create the daily-portfolio card without adding the open
  // ladder slot, so settlement found no slot and hard-failed. It now auto-creates an open slot for the
  // EXPECTED step (currentStep or currentStep+1) and overwrites it with the official result.
  const s = readApp("scripts/settle-daily-portfolio.mjs");
  assert.match(s, /auto-heal/i, "auto-heals a missing slot rather than aborting settlement");
  assert.match(s, /currentStep|cur \+ 1|cur\+1/, "guarded to the expected next step so a wrong step still fails loudly");
  assert.match(s, /lane\.steps\.push/, "creates an open slot");
});

test("ops-notify writes a heartbeat, never throws on webhook failure, always exits 0", () => {
  const s = readApp("scripts/ops-notify.mjs");
  assert.match(s, /heartbeat\.json/, "writes the dead-man's-switch heartbeat");
  assert.match(s, /OPS_WEBHOOK_URL/, "optional webhook (honest-skip when unset)");
  assert.match(s, /catch\s*\(/, "webhook failure is caught — notification never breaks the lifecycle");
  assert.match(s, /process\.exit\(0\)/, "always exits 0");
});

test("check-heartbeat is the dead-man's-switch — fails on stale or missing heartbeat", () => {
  const s = readApp("scripts/check-heartbeat.mjs");
  assert.match(s, /HEARTBEAT MISSING/, "fails if no run ever recorded a heartbeat");
  assert.match(s, /max-hours|maxHours/, "fails when the last run is older than tolerance");
  assert.match(s, /process\.exit\(1\)/, "non-zero on unhealthy so a monitor/cron can alert");
});

test("the lifecycle is observable + resilient: notify wired, failure-trap, rebase-retry, scoped add", () => {
  const roll = readRepo("scripts/roll_to_next_day.sh");
  const settle = readRepo("scripts/settle_soccer_day.sh");
  // observability: both the roll and the standalone settle emit a heartbeat/notify (P0-2).
  assert.match(roll, /ops-notify\.mjs/, "roll emits a heartbeat/notify");
  assert.match(settle, /ops-notify\.mjs/, "settle emits a heartbeat/notify");
  // a hard failure still produces a report + heartbeat (P1-3) via an EXIT trap.
  assert.match(roll, /trap on_exit EXIT/, "failure trap emits a report/heartbeat even on die");
  // the push survives concurrent main writes (P0-3) and never blanket-stages stray files (P2-1).
  assert.match(roll, /rebase origin\/main/, "rebase-retry on push contention");
  assert.ok(!/git add -A/.test(roll), "scoped git add (not -A)");
  // the smoke window tolerates a cold Vercel build (P0-4): more than the old 4×45s.
  assert.match(roll, /seq 1 10/, "smoke polls ~8 min, not ~3 min");
});

test("settle + lifecycle pin tsx to app/tsconfig.json so the @/ alias resolves from the repo root", () => {
  // Regression lock: app/scripts/*.mjs are invoked from the repo root; the settlement + product graphs import
  // `@/lib/...`, which tsx only resolves via app/tsconfig.json. Without the pin the roll aborted at grading.
  for (const sh of ["scripts/settle_soccer_day.sh", "scripts/roll_to_next_day.sh"]) {
    assert.match(readRepo(sh), /TSX_TSCONFIG_PATH=.*app\/tsconfig\.json/, `${sh} pins tsx to app/tsconfig.json`);
  }
  // and the ledger-rebuild path must be app/scripts/… (a bare scripts/… does not exist at the repo root).
  assert.ok(!/npx tsx scripts\/build-mr-dub-ledger\.mjs/.test(readRepo("scripts/settle_soccer_day.sh")),
    "build-mr-dub-ledger is invoked as app/scripts/… not scripts/…");
});
