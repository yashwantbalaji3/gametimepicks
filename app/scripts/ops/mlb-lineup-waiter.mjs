#!/usr/bin/env node
/**
 * THE MLB PREGAME LINEUP WAITER — the runner. The rule lives in src/lib/ops/mlb-lineup-waiter.mjs (pure); this file
 * only gathers its inputs, sleeps, and acts on its decision.
 *
 *   node app/scripts/ops/mlb-lineup-waiter.mjs --dry-run --once            # one decision, printed, nothing dispatched
 *   node app/scripts/ops/mlb-lineup-waiter.mjs --dry-run --no-pull         # the full loop, locally, never dispatching
 *   node app/scripts/ops/mlb-lineup-waiter.mjs --relay                      # what the workflow runs
 *
 * Per cycle (≈ every 10 min ± jitter):
 *   1. `git pull --ff-only origin main` and read the committed record (input-snapshots, simulation, board) for the slate
 *   2. StatsAPI: the slate's schedule with hydrated lineups (1 call); a boxscore (the refresh's own source) only for
 *      games whose posted order differs from the committed one, or that are inside T-75 with a side not yet posted
 *   3. `gh run list` of mlb-lineup-refresh (in flight? failed? dispatched how often today?)
 *   4. decide; on a DISPATCH, check the gtp-generated-artifacts writer queue, PULL AGAIN and re-decide on fresh main,
 *      and only then `gh workflow run mlb-lineup-refresh.yml --ref main` (never with --dry-run)
 *   5. after a dispatch, wait for that refresh to finish before deciding again
 *
 * Limits: a hard StatsAPI call cap per run (--max-calls), a wall-clock budget under the job timeout (--budget-min).
 * At the budget, if the slate is not DONE, the run hands over to a fresh run of itself (--relay; a GITHUB_TOKEN
 * workflow_dispatch always creates a run), which queues in the same concurrency group and resumes from committed
 * state. No state is written to the repository: what the waiter remembers across runs (dispatched fingerprints,
 * raised alerts) is printed as `MLB_LINEUP_WAITER_LEDGER {json}` lines and recovered from earlier runs' logs.
 * Dry runs print NO ledger lines (a dry run's alert must never suppress a live run's webhook).
 *
 * ACTIVATION (defence in depth). Anything but `--dry-run` requires the environment variable
 * MLB_LINEUP_WAITER_ENABLED to be EXACTLY "true" (the workflow passes vars.MLB_LINEUP_WAITER_ENABLED). Otherwise the
 * run is forced to `--dry-run --once` with no relay — whatever the flags say, it never dispatches and never relays.
 *
 * TIME. Every sleep (the poll, the post-dispatch wait) is capped at the remaining loop budget, and a hard stop
 * (HARD_STOP_GRACE_MIN after the budget) relays and exits even if one cycle overran — so the run always hands over
 * before the job's timeout-minutes kills it.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  WAITER, WAITER_LIMITS, decideLineupWaiter, normalizeSchedule, boxscoreOrders, committedLineups, lineupFingerprint, etDate,
} from "../../src/lib/ops/mlb-lineup-waiter.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, "../../..");
const STATSAPI = "https://statsapi.mlb.com";
export const LEDGER_MARK = "MLB_LINEUP_WAITER_LEDGER ";
export const REFRESH_WORKFLOW = "mlb-lineup-refresh.yml";
export const SELF_WORKFLOW = "mlb-lineup-waiter.yml";
/** The relay fires at the latest this long after the loop budget, whatever a cycle is doing (budget + this + setup < timeout-minutes). */
export const HARD_STOP_GRACE_MIN = 12;
/** Earlier waiter runs whose logs are read for the ledger, at most (one `gh run view --log` each). */
export const MAX_LEDGER_LOG_FETCHES = 30;
/** How far back earlier waiter runs are listed (one `gh run list` call; cancelled-while-pending runs included). */
export const LEDGER_RUN_LIST_LIMIT = 100;
/** A CallCapReached run relays only if it lasted at least this long (a hot loop must not relay itself forever). */
export const CAP_RELAY_MIN_ELAPSED_MIN = 30;
/** `gh workflow run` attempts before giving up for this cycle (with a run-list check between them). */
export const DISPATCH_ATTEMPTS = 3;

export function parseArgs(argv, env = process.env) {
  const has = (f) => argv.includes(f);
  const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d; };
  const a = {
    dryRun: has("--dry-run"),
    once: has("--once"),
    pull: !has("--no-pull"),
    relay: has("--relay"),
    json: has("--json"),
    now: val("--now", null),
    date: val("--date", null),
    budgetMin: Number(val("--budget-min", 330)),
    maxCalls: Number(val("--max-calls", WAITER_LIMITS.STATSAPI_CALL_CAP)),
    maxDispatches: Number(val("--max-dispatches", WAITER_LIMITS.MAX_DISPATCHES_PER_SLATE)),
  };
  if (a.now && !a.dryRun) throw new Error("--now is a replay/test clock and is only accepted with --dry-run");
  if (!Number.isFinite(a.budgetMin) || a.budgetMin <= 0 || a.budgetMin > 345) throw new Error("--budget-min must be in (0, 345] — under the job timeout");
  if (!Number.isInteger(a.maxCalls) || a.maxCalls < 1 || a.maxCalls > 1000) throw new Error("--max-calls must be an integer in [1, 1000]");
  if (!Number.isInteger(a.maxDispatches) || a.maxDispatches < 1 || a.maxDispatches > 12) throw new Error("--max-dispatches must be an integer in [1, 12]");
  // Defence in depth behind the workflow's guard: live only when the variable is EXACTLY "true" (GitHub's `==` in the
  // job `if` ignores case, so "True" would pass it). Anything else is one dry decision — no dispatch, no relay.
  if (!a.dryRun && env?.MLB_LINEUP_WAITER_ENABLED !== "true") {
    Object.assign(a, { dryRun: true, once: true, relay: false, forcedDryRun: true });
  }
  return a;
}

// ── StatsAPI with a hard call cap ─────────────────────────────────────────────────────────────────────────────

export class CallCapReached extends Error {}

export function createStatsApi({ fetchImpl = globalThis.fetch, cap = WAITER_LIMITS.STATSAPI_CALL_CAP, timeoutMs = 15_000 } = {}) {
  let calls = 0;
  // One deadline per request covers the headers AND the body: a 200 whose body stalls is aborted and rejected too.
  async function once(url) {
    const ctl = new AbortController();
    let t;
    const expired = new Promise((_, reject) => { t = setTimeout(() => { ctl.abort(); reject(new Error(`StatsAPI request timed out after ${timeoutMs} ms`)); }, timeoutMs); });
    try {
      return await Promise.race([
        (async () => {
          const res = await fetchImpl(url, { signal: ctl.signal, headers: { "User-Agent": "gtp-mlb-lineup-waiter/1" } });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.json();
        })(),
        expired,
      ]);
    } finally { clearTimeout(t); }
  }
  async function get(url) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (calls >= cap) throw new CallCapReached(`StatsAPI call cap reached (${cap})`);
      calls++;
      try {
        return await once(url);
      } catch (e) {
        if (e instanceof CallCapReached || attempt === 1) throw e;
      }
    }
    throw new Error("unreachable");
  }
  return {
    get calls() { return calls; },
    schedule: (date) => get(`${STATSAPI}/api/v1/schedule?sportId=1&date=${date}&hydrate=lineups`),
    boxscore: (gamePk) => get(`${STATSAPI}/api/v1/game/${gamePk}/boxscore`),
  };
}

// ── the committed record ──────────────────────────────────────────────────────────────────────────────────────

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

export function readCommitted(repo, date) {
  const board = readJson(path.join(repo, "app/public/data/mlb/boards", `${date}.json`));
  const simulation = readJson(path.join(repo, "app/public/data/mlb/full-game-simulations", `${date}.json`));
  const inputSnapshot = readJson(path.join(repo, "data/internal/mlb/input-snapshots", `${date}.json`));
  const boardFirstPitch = {};
  for (const g of board?.games ?? []) if (Number.isFinite(g?.gamePk) && g.gameDate) boardFirstPitch[g.gamePk] = g.gameDate;
  return { boardPresent: !!board && Array.isArray(board.games), boardFirstPitch, committed: committedLineups({ inputSnapshot, simulation }) };
}

/**
 * A YAML line that puts its workflow (or one of its jobs) in the shared writer queue: `group: gtp-generated-artifacts`
 * (block form, at any indentation), `concurrency: gtp-generated-artifacts` (string form) or `{ group: … }` (flow form),
 * quoted or not, with or without a trailing `# comment`. The job runs on bare node (no install), so this is a strict
 * line pattern rather than a YAML parser; the test suite checks it against js-yaml over every workflow file.
 */
export const WRITER_GROUP_LINE = /^[ \t]*(?:-[ \t]+)?(?:group|concurrency)[ \t]*:[ \t]*(?:\{[^}#]*\bgroup[ \t]*:[ \t]*)?(["']?)gtp-generated-artifacts\1[ \t]*(?:[,}][^#\n]*)?(?:#.*)?$/m;

/** Every workflow file in the shared writer queue — read from the YAML, so a new writer is covered without an edit here. */
export function writerWorkflowFiles(dir = path.join(REPO, ".github/workflows")) {
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x))) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    if (WRITER_GROUP_LINE.test(text)) out.push(f);
  }
  return out.sort();
}

// ── GitHub (gh) ───────────────────────────────────────────────────────────────────────────────────────────────

export function makeGh({ exec = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, timeout: 120_000 }), dryRun = false } = {}) {
  const json = (args) => JSON.parse(exec(args) || "null");
  return {
    refreshRuns: () => json(["run", "list", "--workflow", REFRESH_WORKFLOW, "--limit", "30", "--json", "databaseId,createdAt,updatedAt,status,conclusion,event"]) ?? [],
    activeWriters(files) {
      const out = [];
      for (const status of ["in_progress", "queued", "waiting", "pending", "requested"]) {
        const runs = json(["api", `repos/{owner}/{repo}/actions/runs?status=${status}&per_page=100`, "--jq", "[.workflow_runs[] | {path, name, status, id}]"]) ?? [];
        for (const r of runs) if (files.includes(path.basename(String(r.path ?? "")))) out.push({ workflowName: r.name, file: path.basename(r.path), status: r.status, id: r.id });
      }
      return out;
    },
    // Wide enough to see past the cancelled-while-pending runs a long watch accumulates (each arrival during a running
    // job becomes a pending run that the next arrival replaces) and the skipped runs of a disabled waiter.
    waiterRuns: () => json(["run", "list", "--workflow", SELF_WORKFLOW, "--limit", String(LEDGER_RUN_LIST_LIMIT), "--json", "databaseId,createdAt,status,conclusion"]) ?? [],
    runLog: (id) => exec(["run", "view", String(id), "--log"]),
    dispatchRefresh() {
      if (dryRun) return { dispatched: false, dryRun: true };
      exec(["workflow", "run", REFRESH_WORKFLOW, "--ref", "main"]); // no inputs: the refresh resolves today's ET slate itself
      return { dispatched: true };
    },
    relaySelf() {
      if (dryRun) return { dispatched: false, dryRun: true };
      exec(["workflow", "run", SELF_WORKFLOW, "--ref", "main"]);
      return { dispatched: true };
    },
  };
}

/** Recover what earlier runs of this waiter dispatched and alerted (their `MLB_LINEUP_WAITER_LEDGER` lines). Best effort. */
export function parseLedgerLines(text) {
  const ledger = { dispatches: [], alerted: [] };
  const attempts = [];
  for (const line of String(text ?? "").split("\n")) {
    const i = line.indexOf(LEDGER_MARK);
    if (i < 0) continue;
    try {
      const e = JSON.parse(line.slice(i + LEDGER_MARK.length).trim());
      if (e.dryRun) continue; // never a dry run's memory
      const valid = e.at && Number.isFinite(Date.parse(e.at)) && Array.isArray(e.sides);
      if (e.kind === "dispatch" && valid) ledger.dispatches.push({ at: e.at, fingerprint: e.fingerprint, sides: e.sides, ...(e.basis ? { basis: e.basis } : {}) });
      if (e.kind === "attempt" && valid) attempts.push({ at: e.at, fingerprint: e.fingerprint, sides: e.sides, ...(e.basis ? { basis: e.basis } : {}) });
      if (e.kind === "alert" && e.key) ledger.alerted.push(e.key);
    } catch { /* not ours */ }
  }
  // An `attempt` with no `dispatch` after it: `gh workflow run` errored or the run died mid-call — GitHub may or may
  // not have accepted it. Kept as UNCONFIRMED: the decider counts it only once a refresh run appeared after it.
  for (const a of attempts) {
    const confirmed = ledger.dispatches.some((d) => d.fingerprint === a.fingerprint && Date.parse(d.at) >= Date.parse(a.at));
    if (!confirmed) ledger.dispatches.push({ ...a, unconfirmed: true });
  }
  return ledger;
}

export function recoverLedger(gh, { nowMs, selfRunId = process.env.GITHUB_RUN_ID, maxLogFetches = MAX_LEDGER_LOG_FETCHES } = {}) {
  const ledger = { dispatches: [], alerted: [] };
  try {
    // Only completed runs from the last 36 h that could have executed the loop (a `skipped` run is a disabled
    // waiter's no-op). Runs that certainly ran (success / failure / timed_out) are read first, newest first; the
    // `cancelled` ones — mostly runs replaced while pending, which have no logs — only with the fetches left over, so
    // a long watch's pile of replaced runs can never crowd out the run that actually dispatched.
    const ranFirst = (r) => (r.conclusion === "cancelled" ? 1 : 0);
    const candidates = (gh.waiterRuns() ?? [])
      .filter((r) => String(r.databaseId) !== String(selfRunId) && r.status === "completed" && r.conclusion !== "skipped")
      .filter((r) => { const t = Date.parse(r.createdAt ?? ""); return Number.isFinite(t) && nowMs - t <= 36 * 3600_000; })
      .sort((a, b) => ranFirst(a) - ranFirst(b) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
    let fetched = 0;
    for (const r of candidates) {
      if (fetched >= maxLogFetches) { console.log(`ledger recovery stopped at ${maxLogFetches} run logs — older runs not read`); break; }
      fetched++;
      try {
        const got = parseLedgerLines(gh.runLog(r.databaseId));
        ledger.dispatches.push(...got.dispatches);
        ledger.alerted.push(...got.alerted);
      } catch { /* a run without logs (cancelled while pending) */ }
    }
  } catch (e) { console.log(`ledger recovery skipped (${String(e.message ?? e).slice(0, 80)}) — committed state, the run list, the cap and the spacing still hold`); }
  return ledger;
}

/**
 * Dispatch the refresh, at most `attempts` times. Between attempts the run list is read: a workflow_dispatch run
 * created since the first attempt means GitHub accepted an attempt whose response was lost — never dispatch again.
 * @returns {Promise<{dispatched: boolean, inferred?: boolean, error?: string}>}
 */
export async function dispatchWithRetry(gh, { attempts = DISPATCH_ATTEMPTS, sleep: nap = sleep, nowMs = () => Date.now(), pauseMs = 10_000 } = {}) {
  const since = nowMs() - 5_000;
  let error = null;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      await nap(pauseMs);
      try {
        const accepted = (gh.refreshRuns() ?? []).some((r) => r.event === "workflow_dispatch" && Date.parse(r.createdAt ?? "") >= since);
        if (accepted) return { dispatched: true, inferred: true };
      } catch { /* the run list is down too — try the dispatch again */ }
    }
    try { gh.dispatchRefresh(); return { dispatched: true }; }
    catch (e) { error = String(e?.message ?? e).slice(0, 160); console.log(`gh workflow run failed (attempt ${i + 1}/${attempts}): ${error}`); }
  }
  return { dispatched: false, error };
}

/** After a dispatch: let the run register, then wait for in-flight refreshes — never past the remaining budget. */
export async function waitForRefresh(gh, { sleep: nap = sleep, remainingMs, polls = 25 } = {}) {
  let slept = 0;
  const step = async (ms) => { const t = Math.max(0, Math.min(ms, remainingMs())); if (t > 0) { await nap(t); slept += t; } return t; };
  await step(45_000);
  for (let i = 0; i < polls && remainingMs() > 0; i++) {
    let inflight = 1;
    try { inflight = gh.refreshRuns().filter((r) => r.status !== "completed").length; } catch { /* keep waiting */ }
    if (!inflight) break;
    await step(60_000);
  }
  return slept;
}

// ── one decision ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Gather the inputs and decide once. Every effect is injected, so a test drives it with fixtures.
 * @param d.api     createStatsApi(...)
 * @param d.gh      makeGh(...)
 * @param d.readCommitted (date) => readCommitted(REPO, date)
 * @param d.writerFiles   writer workflow files
 */
export async function decideOnce({ nowIso, date, api, gh, readCommitted: rc, writerFiles, ledger, limits }) {
  const nowMs = Date.parse(nowIso);
  const slateDate = date ?? etDate(nowMs);
  const { games, upstream } = normalizeSchedule(await api.schedule(slateDate));
  const c = rc(slateDate);
  // Confirm with the boxscore (what the refresh's capture reads) wherever the hydrated schedule says a side moved,
  // and inside T-75 for a side the schedule has not posted yet (in case the hydration lags).
  for (const g of games) {
    const fp = Date.parse(g.firstPitch ?? "");
    const lead = (fp - nowMs) / 60_000;
    if (g.abstractGameState !== "Preview" || !Number.isFinite(lead) || lead < 0 || lead > WAITER_LIMITS.MONITOR_LEAD_MIN) continue;
    const u = upstream[g.gamePk] ?? {};
    const cm = c.committed[g.gamePk] ?? {};
    const moved = ["away", "home"].some((s) => { const f = lineupFingerprint(u[s]); return f && f !== (cm[s]?.fingerprint ?? null); });
    const lateUnposted = lead <= 75 && ["away", "home"].some((s) => !lineupFingerprint(u[s]));
    if (moved || lateUnposted) upstream[g.gamePk] = boxscoreOrders(await api.boxscore(g.gamePk));
  }
  const refreshRuns = gh.refreshRuns();
  const base = { nowIso, slateDate, games, upstream, committed: c.committed, boardFirstPitch: c.boardFirstPitch, boardPresent: c.boardPresent, refreshRuns, ledger, limits };
  let d = decideLineupWaiter({ ...base, activeWriters: [] });
  if (d.decision === WAITER.DISPATCH) d = decideLineupWaiter({ ...base, activeWriters: gh.activeWriters(writerFiles) });
  return d;
}

// ── effects ───────────────────────────────────────────────────────────────────────────────────────────────────

const summaryLines = [];
function summary(...lines) { summaryLines.push(...lines); }
function flushSummary() {
  const f = process.env.GITHUB_STEP_SUMMARY;
  if (!f || !summaryLines.length) return;
  try { fs.appendFileSync(f, summaryLines.join("\n") + "\n"); summaryLines.length = 0; } catch { /* the log still has it */ }
}

export function emitAlert(a, { slateDate, dryRun, spawn = spawnSync } = {}) {
  console.log(`::warning::mlb-lineup-waiter ${dryRun ? "(dry run) " : ""}${a.message}`);
  // Only a live run records the key: a dry run's alert must never suppress the live run's real webhook later.
  if (!dryRun) console.log(`${LEDGER_MARK}${JSON.stringify({ kind: "alert", key: a.key, at: new Date().toISOString(), slate: slateDate })}`);
  summary(`- ⚠ ${a.message}`);
  // The existing ops webhook path (scripts/ops_alert.sh, as cron-watchdog uses it). Dry runs print the payload only.
  spawn("bash", [path.join(REPO, "scripts/ops_alert.sh")], {
    stdio: "inherit",
    env: { ...process.env, PHASE: "mlb-lineup-waiter", OPS_ALERT_KIND: "warning", EXIT_STATUS: "0", ERROR_LINE: a.message, SLATE_DATE: slateDate, ...(dryRun ? { OPS_ALERT_PRINT_ONLY: "1" } : {}) },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pull() {
  try { execFileSync("git", ["pull", "--quiet", "--ff-only", "origin", "main"], { cwd: REPO, stdio: "inherit", timeout: 120_000 }); return true; }
  catch { console.log("::warning::mlb-lineup-waiter could not fast-forward main — deciding on the checkout as is"); return false; }
}

function describe(d) {
  const games = d.games.map((g) => `${g.gamePk}${g.gameNumber > 1 ? `(g${g.gameNumber})` : ""}:${g.state}${g.leadMin != null ? `@T-${g.leadMin}` : ""}[${["away", "home"].map((s) => g.sides?.[s]?.status ?? "-").join("/")}]`).join(" ");
  return `${d.decision}${d.next ? `→${d.next}` : ""} · ${d.reasons.join("; ")} · ${games}`;
}

export async function main(argv = process.argv.slice(2)) {
  const a = parseArgs(argv);
  const started = Date.now();
  const deadline = started + a.budgetMin * 60_000;
  const remainingMs = () => Math.max(0, deadline - Date.now());
  const elapsedMin = () => (Date.now() - started) / 60_000;
  const clock = () => (a.now ? a.now : new Date().toISOString());
  const api = createStatsApi({ cap: a.maxCalls });
  const gh = makeGh({ dryRun: a.dryRun });
  if (a.forcedDryRun) console.log("::notice::mlb-lineup-waiter MLB_LINEUP_WAITER_ENABLED is not exactly 'true' — forced to --dry-run --once (no dispatch, no relay)");
  const writerFiles = writerWorkflowFiles();
  const ledger = recoverLedger(gh, { nowMs: Date.parse(clock()) });
  const limits = { MAX_DISPATCHES_PER_SLATE: a.maxDispatches };
  const rc = (date) => readCommitted(REPO, date);
  const alertOpts = (slateDate) => ({ slateDate, dryRun: a.dryRun });
  summary(`### mlb-lineup-waiter ${a.dryRun ? "(dry run)" : ""}`);
  summary(`- writers watched: ${writerFiles.length} (${writerFiles.join(", ")}) · recovered ledger: ${ledger.dispatches.length} dispatch(es), ${ledger.alerted.length} alert key(s)`);
  let last = null;
  let stop = null; // "DONE" | "LATER" | "CAP" | "ONCE" | "BUDGET"
  let failures = 0;
  const inputFailure = (msg) => {
    failures++;
    console.log(`${new Date().toISOString()} ${msg} — retry ${failures}`);
    if (failures === 6) emitAlert({ key: `inputs:${etDate(Date.now())}:${process.env.GITHUB_RUN_ID ?? "local"}`, message: `six consecutive cycles could not read StatsAPI or the run list (${msg.slice(0, 80)})` }, alertOpts(a.date ?? etDate(Date.now())));
  };

  const unfinished = () => last && !last.leaveToLaterTrigger && (last.decision === WAITER.ALERT ? last.next : last.decision) !== WAITER.DONE;
  let relayed = false;
  const relay = (why) => {
    if (relayed) return;
    relayed = true;
    if (!(a.relay && !a.dryRun)) { console.log(`${why} with the slate unfinished (no relay in this mode)`); return; }
    try { gh.relaySelf(); console.log(`::notice::mlb-lineup-waiter ${why} with the slate unfinished — relayed to a fresh run`); summary(`- ${why} — relayed to a fresh run`); }
    catch (e) { console.log(`::warning::mlb-lineup-waiter could not relay (${String(e.message ?? e).slice(0, 80)}) — the next trigger resumes from committed state`); }
  };
  // The hard stop: whatever a cycle is doing HARD_STOP_GRACE_MIN after the budget, relay and exit — always before
  // the job's timeout-minutes (a timeout kill would lose the relay).
  let hardStop = null;
  if (a.relay && !a.dryRun && !a.once) {
    hardStop = setTimeout(() => {
      console.log(`::warning::mlb-lineup-waiter a cycle overran the ${a.budgetMin}-minute budget by ${HARD_STOP_GRACE_MIN} min — relaying and exiting`);
      relay("hard stop after the budget");
      flushSummary();
      process.exit(0);
    }, (a.budgetMin + HARD_STOP_GRACE_MIN) * 60_000);
    hardStop.unref?.();
  }

  for (;;) {
    if (remainingMs() <= 0) { stop = "BUDGET"; break; }
    if (a.pull && !a.dryRun) pull();
    let d;
    try {
      d = await decideOnce({ nowIso: clock(), date: a.date, api, gh, readCommitted: rc, writerFiles, ledger, limits });
    } catch (e) {
      if (e instanceof CallCapReached) {
        emitAlert({ key: `callcap:${etDate(Date.now())}:${process.env.GITHUB_RUN_ID ?? "local"}`, message: `${e.message} after ${Math.round(elapsedMin())} min — exiting${elapsedMin() >= CAP_RELAY_MIN_ELAPSED_MIN ? " and relaying to a fresh run" : "; the next trigger resumes from committed state"}` }, alertOpts(a.date ?? etDate(Date.now())));
        stop = "CAP";
        break;
      }
      inputFailure(`input fetch failed (${String(e.message ?? e).slice(0, 120)})`);
      if (a.once) { stop = "ONCE"; break; }
      await sleep(Math.min(WAITER_LIMITS.POLL_SECONDS * 1000, remainingMs()));
      continue;
    }
    last = d;
    if (d.inputSuspect) inputFailure(d.reasons.join("; ")); else failures = 0;
    console.log(`${clock()} ${describe(d)} · statsapi calls ${api.calls}/${a.maxCalls}`);
    if (a.json) fs.writeSync(1, `${JSON.stringify(d)}\n`);
    for (const al of d.alerts) { emitAlert(al, alertOpts(d.slateDate)); ledger.alerted.push(al.key); }

    const next = d.decision === WAITER.ALERT ? d.next : d.decision;
    if (next === WAITER.DONE) { summary(`- DONE: ${d.reasons.join("; ")}`); stop = "DONE"; break; }
    if (d.leaveToLaterTrigger) { summary(`- too early: ${d.reasons.join("; ")}`); console.log(`::notice::mlb-lineup-waiter ${d.reasons.join("; ")}`); stop = "LATER"; break; }

    if (d.decision === WAITER.DISPATCH) {
      if (a.dryRun) {
        summary(`- would dispatch ${REFRESH_WORKFLOW} for ${d.owed.join(", ")} (dry run — nothing dispatched)`);
        console.log(`::notice::mlb-lineup-waiter DRY RUN — would dispatch ${REFRESH_WORKFLOW} for ${d.owed.join(", ")}`);
        // Remember it in memory only (never a ledger line) so the dry-run loop exercises the dedupe a live run would.
        ledger.dispatches.push({ at: clock(), fingerprint: d.fingerprint, sides: d.owed, basis: d.basis });
        if (a.once) { stop = "ONCE"; break; }
        await sleep(Math.min(WAITER_LIMITS.POLL_SECONDS * 1000, remainingMs()));
        continue;
      }
      // Fresh main, then decide again — another writer may have just produced exactly this.
      let again;
      try {
        if (a.pull) pull();
        again = await decideOnce({ nowIso: clock(), date: a.date, api, gh, readCommitted: rc, writerFiles, ledger, limits });
      } catch (e) {
        if (e instanceof CallCapReached) { stop = "CAP"; emitAlert({ key: `callcap:${etDate(Date.now())}:${process.env.GITHUB_RUN_ID ?? "local"}`, message: `${e.message} before a dispatch — exiting` }, alertOpts(d.slateDate)); break; }
        inputFailure(`re-decide before the dispatch failed (${String(e.message ?? e).slice(0, 120)})`);
        await sleep(Math.min(60_000, remainingMs()));
        continue;
      }
      if (again.decision !== WAITER.DISPATCH || again.fingerprint !== d.fingerprint) {
        console.log(`re-decided on fresh main: ${describe(again)} — not dispatching`);
        continue;
      }
      // `attempt` BEFORE the call, `dispatch` after it: a run that dies (or a gh that errors after GitHub accepted
      // the dispatch) still leaves a line the next run reads.
      const base = { fingerprint: d.fingerprint, sides: d.owed, slate: d.slateDate, n: d.dispatchNumber, basis: again.basis ?? d.basis };
      console.log(`${LEDGER_MARK}${JSON.stringify({ kind: "attempt", at: new Date().toISOString(), ...base })}`);
      const res = await dispatchWithRetry(gh);
      if (!res.dispatched) {
        emitAlert({ key: `dispatch-failed:${d.fingerprint}:${process.env.GITHUB_RUN_ID ?? "local"}`, message: `could not dispatch ${REFRESH_WORKFLOW} for ${d.owed.join(", ")} after ${DISPATCH_ATTEMPTS} attempts (${res.error ?? "unknown"}) — re-deciding next cycle` }, alertOpts(d.slateDate));
        await sleep(Math.min(60_000, remainingMs()));
        continue;
      }
      const entry = { kind: "dispatch", at: new Date().toISOString(), ...base, ...(res.inferred ? { inferred: true } : {}) };
      ledger.dispatches.push(entry);
      console.log(`${LEDGER_MARK}${JSON.stringify(entry)}`);
      console.log(`::notice::mlb-lineup-waiter dispatched ${REFRESH_WORKFLOW} (#${d.dispatchNumber} today) for ${d.owed.join(", ")}`);
      summary(`- ${entry.at} dispatched ${REFRESH_WORKFLOW} (#${d.dispatchNumber}) for ${d.owed.join(", ")}`);
      flushSummary();
      // Let the run register, then wait it out (≤ 25 min) before deciding on what it committed — within the budget.
      await waitForRefresh(gh, { remainingMs });
      continue;
    }

    if (a.once) { stop = "ONCE"; break; }
    const jitter = Math.round((Math.random() * 2 - 1) * WAITER_LIMITS.POLL_JITTER_SECONDS);
    const waitS = d.waitSeconds >= WAITER_LIMITS.POLL_SECONDS ? d.waitSeconds + jitter : d.waitSeconds;
    flushSummary();
    await sleep(Math.min(Math.max(1, waitS) * 1000, remainingMs()));
  }
  if (hardStop) clearTimeout(hardStop);

  // Hand over to a fresh run (it queues in this concurrency group) when the slate is unfinished and this run stopped
  // at its budget — or at the StatsAPI call cap after a real watch (not a hot loop).
  if (!a.once && unfinished()) {
    if (stop === "BUDGET") relay(`reached its ${a.budgetMin}-minute budget`);
    else if (stop === "CAP" && elapsedMin() >= CAP_RELAY_MIN_ELAPSED_MIN) relay("reached the StatsAPI call cap");
  }
  summary(`- StatsAPI calls this run: ${api.calls}/${a.maxCalls}`);
  if (last?.games) {
    summary("", "| game | state | lead | away | home |", "|---|---|---|---|---|");
    for (const g of last.games) summary(`| ${g.gamePk}${g.gameNumber > 1 ? ` (g${g.gameNumber})` : ""} | ${g.state} | ${g.leadMin ?? ""} | ${g.sides?.away?.status ?? ""} | ${g.sides?.home?.status ?? ""} |`);
  }
  flushSummary();
  return stop === "CAP" ? { ...(last ?? {}), decision: last?.decision ?? "CAP", stop } : last && { ...last, stop };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main().catch((e) => { console.error(`mlb-lineup-waiter fatal: ${e?.stack ?? e}`); process.exit(1); });
