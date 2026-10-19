#!/usr/bin/env node
/**
 * THE NBA POST-FINAL WAITER — the runner. The rule lives in src/lib/ops/nba-finals-waiter.mjs (pure); this file only
 * gathers its inputs, sleeps, and acts on its decision.
 *
 *   node app/scripts/ops/nba-finals-waiter.mjs --dry-run --once            # one decision, printed, nothing dispatched
 *   node app/scripts/ops/nba-finals-waiter.mjs --dry-run --no-pull         # the full loop, locally, never dispatching
 *   node app/scripts/ops/nba-finals-waiter.mjs --relay                      # what the workflow runs
 *
 * Per cycle (≈ every 5 min ± jitter, from the night's earliest tip + 100 min):
 *   1. `git pull --ff-only origin main` and read the committed finals record (finals-<season>.json) and the committed
 *      schedule captures for the night
 *   2. ESPN: the night's DAY scoreboard (1 call)
 *   3. `gh run list` of nba-results-refresh (in flight? failed? dispatched how often tonight?)
 *   4. decide; when a final is owed and nothing blocks, confirm it on the MONTH scoreboard the refresh itself reads
 *      (1–2 calls), PULL AGAIN and re-decide on fresh main, and only then
 *      `gh workflow run nba-results-refresh.yml --ref main` (no inputs; never with --dry-run)
 *   5. after a dispatch, wait for that refresh to finish before deciding again
 *
 * Limits: a hard ESPN call cap per run (--max-calls), a wall-clock budget under the job timeout (--budget-min). At the
 * budget, if the night is not DONE, the run hands over to a fresh run of itself (--relay; a GITHUB_TOKEN
 * workflow_dispatch always creates a run), which queues in the same concurrency group and resumes from committed
 * state. No state is written to the repository: what the waiter remembers across runs (dispatched fingerprints,
 * raised alerts, when a final was first seen, ESPN regressions) is printed as `NBA_FINALS_WAITER_LEDGER {json}` lines
 * and recovered from earlier runs' logs. Dry runs print NO ledger lines (a dry run's alert must never suppress a live
 * run's webhook). The ledger is recovered only once a decision needs it — a run that only learns "too early" or
 * "nothing tonight" exits without reading earlier logs (most deliveries of a day are exactly that).
 *
 * ACTIVATION (defence in depth). Anything but `--dry-run` requires the environment variable NBA_FINALS_WAITER_ENABLED
 * to be EXACTLY "true" (the workflow passes vars.NBA_FINALS_WAITER_ENABLED). Otherwise the run is forced to
 * `--dry-run --once` with no relay — whatever the flags say, it never dispatches and never relays.
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
  WAITER, WAITER_LIMITS, decideFinalsWaiter, normalizeScoreboard, committedFinals, nightOf, seasonOf,
} from "../../src/lib/ops/nba-finals-waiter.mjs";
import { fetchScoreboardWindowEvents, utcDayStart, utcDayEnd } from "../../src/lib/sports/espn-scoreboard-window.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, "../../..");
const ESPN_NBA = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
export const LEDGER_MARK = "NBA_FINALS_WAITER_LEDGER ";
export const REFRESH_WORKFLOW = "nba-results-refresh.yml";
export const SELF_WORKFLOW = "nba-finals-waiter.yml";
/** The refresh's own capture window (capture-nba-results.mjs `--days` default): the confirm read covers the same. */
export const REFRESH_WINDOW_DAYS = 9;
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
    maxCalls: Number(val("--max-calls", WAITER_LIMITS.ESPN_CALL_CAP)),
    maxDispatches: Number(val("--max-dispatches", WAITER_LIMITS.MAX_DISPATCHES_PER_NIGHT)),
  };
  if (a.now && !a.dryRun) throw new Error("--now is a replay/test clock and is only accepted with --dry-run");
  if (a.date && !/^\d{4}-\d{2}-\d{2}$/.test(a.date)) throw new Error("--date must be YYYY-MM-DD");
  if (!Number.isFinite(a.budgetMin) || a.budgetMin <= 0 || a.budgetMin > 345) throw new Error("--budget-min must be in (0, 345] — under the job timeout");
  if (!Number.isInteger(a.maxCalls) || a.maxCalls < 1 || a.maxCalls > 1000) throw new Error("--max-calls must be an integer in [1, 1000]");
  if (!Number.isInteger(a.maxDispatches) || a.maxDispatches < 1 || a.maxDispatches > 12) throw new Error("--max-dispatches must be an integer in [1, 12]");
  // Defence in depth behind the workflow's guard: live only when the variable is EXACTLY "true" (GitHub's `==` in the
  // job `if` ignores case, so "True" would pass it). Anything else is one dry decision — no dispatch, no relay.
  if (!a.dryRun && env?.NBA_FINALS_WAITER_ENABLED !== "true") {
    Object.assign(a, { dryRun: true, once: true, relay: false, forcedDryRun: true });
  }
  return a;
}

// ── ESPN with a hard call cap ─────────────────────────────────────────────────────────────────────────────────

export class CallCapReached extends Error {}

export function createEspnApi({ fetchImpl = globalThis.fetch, cap = WAITER_LIMITS.ESPN_CALL_CAP, timeoutMs = 20_000 } = {}) {
  let calls = 0;
  // One deadline per request covers the headers AND the body: a 200 whose body stalls is aborted and rejected too.
  // Returns a Response-like whose body is already read, so the shared window fetcher can use it as its `fetch`.
  async function once(url) {
    const ctl = new AbortController();
    let t;
    const expired = new Promise((_, reject) => { t = setTimeout(() => { ctl.abort(); reject(new Error(`ESPN request timed out after ${timeoutMs} ms`)); }, timeoutMs); });
    try {
      return await Promise.race([
        (async () => {
          const res = await fetchImpl(url, { signal: ctl.signal, headers: { accept: "application/json", "User-Agent": "gtp-nba-finals-waiter/1" } });
          if (!res.ok) return { ok: false, status: res.status, json: async () => null };
          const body = await res.json();
          return { ok: true, status: res.status, json: async () => body };
        })(),
        expired,
      ]);
    } finally { clearTimeout(t); }
  }
  /** Every request goes through here: the cap counts each attempt, a network error is retried once, an HTTP error is not. */
  async function cappedFetch(url) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (calls >= cap) throw new CallCapReached(`ESPN call cap reached (${cap})`);
      calls++;
      try {
        const r = await once(url);
        if (!r.ok && r.status >= 500 && attempt === 0) continue; // a 5xx is an outage: one more try
        return r;
      } catch (e) {
        if (e instanceof CallCapReached || attempt === 1) throw e;
      }
    }
    throw new Error("unreachable");
  }
  /** The night's DAY scoreboard (a single-day `dates=YYYYMMDD` request) — what the waiter polls each cycle. */
  async function day(date) {
    const day = String(date).replaceAll("-", "");
    const r = await cappedFetch(`${ESPN_NBA}?dates=${day}`);
    if (!r.ok) throw new Error(`ESPN day scoreboard HTTP ${r.status}`);
    const body = await r.json();
    if (!Array.isArray(body?.events)) throw new Error("scoreboard payload has no events array");
    return body;
  }
  return {
    get calls() { return calls; },
    day,
    /**
     * What the refresh itself reads: capture-nba-results.mjs's window (the last REFRESH_WINDOW_DAYS UTC days) through
     * the ONE shared scoreboard owner (month requests, window filter) — only the transport is the capped fetch above.
     */
    async refreshWindow(nowMs) {
      const d0 = utcDayStart(new Date(nowMs - REFRESH_WINDOW_DAYS * 86_400_000));
      const d1 = utcDayEnd(new Date(nowMs));
      const r = await fetchScoreboardWindowEvents("basketball/nba", d0, d1, { fetch: cappedFetch });
      return { events: r.events };
    },
  };
}

// ── the committed record ──────────────────────────────────────────────────────────────────────────────────────

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** The committed finals record for the night's season, and the union of the committed schedule captures. */
export function readCommitted(repo, slateDate) {
  const season = seasonOf(slateDate);
  const record = readJson(path.join(repo, "app/public/data/nba/results", `finals-${season}.json`));
  const scheduleTips = {};
  const dir = path.join(repo, "app/public/data/nba/schedule");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort(); } catch { /* none */ }
  for (const f of files) {
    for (const r of readJson(path.join(dir, f))?.rows ?? []) {
      if (r?.providerEventId) scheduleTips[String(r.providerEventId)] = { tip: r.dateUtc ?? null, seasonType: r.seasonType ?? null };
    }
  }
  return { season, committed: committedFinals(record), scheduleTips: files.length ? scheduleTips : null };
}

// ── GitHub (gh) ───────────────────────────────────────────────────────────────────────────────────────────────

export function makeGh({ exec = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, timeout: 120_000 }), dryRun = false } = {}) {
  const json = (args) => JSON.parse(exec(args) || "null");
  return {
    refreshRuns: () => json(["run", "list", "--workflow", REFRESH_WORKFLOW, "--limit", "40", "--json", "databaseId,createdAt,updatedAt,status,conclusion,event"]) ?? [],
    // Wide enough to see past the cancelled-while-pending runs a long watch accumulates (each arrival during a running
    // job becomes a pending run that the next arrival replaces) and the skipped runs of a disabled waiter.
    waiterRuns: () => json(["run", "list", "--workflow", SELF_WORKFLOW, "--limit", String(LEDGER_RUN_LIST_LIMIT), "--json", "databaseId,createdAt,status,conclusion"]) ?? [],
    runLog: (id) => exec(["run", "view", String(id), "--log"]),
    dispatchRefresh() {
      if (dryRun) return { dispatched: false, dryRun: true };
      exec(["workflow", "run", REFRESH_WORKFLOW, "--ref", "main"]); // no inputs: the refresh's dry_run defaults to "false"
      return { dispatched: true };
    },
    relaySelf() {
      if (dryRun) return { dispatched: false, dryRun: true };
      exec(["workflow", "run", SELF_WORKFLOW, "--ref", "main"]);
      return { dispatched: true };
    },
  };
}

export const emptyLedger = () => ({ dispatches: [], alerted: [], finalSeen: [], regressions: [] });

/** Recover what earlier runs of this waiter dispatched, alerted and observed (their ledger lines). Best effort. */
export function parseLedgerLines(text) {
  const ledger = emptyLedger();
  const attempts = [];
  for (const line of String(text ?? "").split("\n")) {
    const i = line.indexOf(LEDGER_MARK);
    if (i < 0) continue;
    try {
      const e = JSON.parse(line.slice(i + LEDGER_MARK.length).trim());
      if (e.dryRun) continue; // never a dry run's memory
      const at = e.at && Number.isFinite(Date.parse(e.at)) ? e.at : null;
      const valid = at && Array.isArray(e.sides);
      if (e.kind === "dispatch" && valid) ledger.dispatches.push({ at, fingerprint: e.fingerprint, sides: e.sides });
      if (e.kind === "attempt" && valid) attempts.push({ at, fingerprint: e.fingerprint, sides: e.sides });
      if (e.kind === "alert" && e.key) ledger.alerted.push(e.key);
      if (e.kind === "final-seen" && at && e.eventId) ledger.finalSeen.push({ eventId: String(e.eventId), at });
      if (e.kind === "regress" && at && e.eventId) ledger.regressions.push({ eventId: String(e.eventId), at });
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
  const ledger = emptyLedger();
  try {
    // Only completed runs from the last 36 h that could have executed the loop (a `skipped` run is a disabled
    // waiter's no-op). Runs that certainly ran are read first, newest first; the `cancelled` ones — mostly runs
    // replaced while pending, which have no logs — only with the fetches left over.
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
        for (const k of Object.keys(ledger)) ledger[k].push(...got[k]);
      } catch { /* a run without logs (cancelled while pending) */ }
    }
  } catch (e) { console.log(`ledger recovery skipped (${String(e.message ?? e).slice(0, 80)}) — committed state, the run list, the cap and the spacing still hold`); }
  return ledger;
}

/**
 * Dispatch the refresh, at most `attempts` times. Between attempts the run list is read: a workflow_dispatch run
 * created since the first attempt means GitHub accepted an attempt whose response was lost — never dispatch again.
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
export async function waitForRefresh(gh, { sleep: nap = sleep, remainingMs, polls = 15 } = {}) {
  let slept = 0;
  const step = async (t0) => { const t = Math.max(0, Math.min(t0, remainingMs())); if (t > 0) { await nap(t); slept += t; } return t; };
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

/** Gather the inputs of one decision (1 ESPN call, the committed record, the refresh run list). */
export async function gatherInputs({ nowIso, date, api, gh, readCommitted: rc }) {
  const nowMs = Date.parse(nowIso);
  const slateDate = date ?? nightOf(nowMs);
  const games = normalizeScoreboard(await api.day(slateDate));
  const c = rc(slateDate);
  return { nowIso, slateDate, games, committed: c.committed, scheduleTips: c.scheduleTips, refreshRuns: gh.refreshRuns(), confirm: undefined };
}

/** Decide on gathered inputs; a `needsConfirm` reads the refresh's month window ONCE per gather and re-decides. */
export async function decideWith(base, { api, ledger, limits }) {
  let d = decideFinalsWaiter({ ...base, ledger, limits });
  if (d.needsConfirm && base.confirm === undefined) {
    const events = normalizeScoreboard(await api.refreshWindow(Date.parse(base.nowIso)));
    base.confirm = Object.fromEntries(events.map((g) => [g.eventId, g]));
    d = decideFinalsWaiter({ ...base, ledger, limits });
  }
  return d;
}

/** Gather and decide once. Every effect is injected, so a test drives it with fixtures. */
export async function decideOnce({ nowIso, date, api, gh, readCommitted: rc, ledger, limits }) {
  return decideWith(await gatherInputs({ nowIso, date, api, gh, readCommitted: rc }), { api, ledger, limits });
}

/** A decision the ledger cannot change: too early (leave to a later trigger) or nothing tonight, with no alert. */
export function needsNoLedger(d) {
  const next = d?.decision === WAITER.ALERT ? d.next : d?.decision;
  return !!d && !d.alerts?.length && (d.leaveToLaterTrigger === true || next === WAITER.DONE);
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
  console.log(`::warning::nba-finals-waiter ${dryRun ? "(dry run) " : ""}${a.message}`);
  // Only a live run records the key: a dry run's alert must never suppress the live run's real webhook later.
  if (!dryRun) console.log(`${LEDGER_MARK}${JSON.stringify({ kind: "alert", key: a.key, at: new Date().toISOString(), slate: slateDate })}`);
  summary(`- ⚠ ${a.message}`);
  // The existing ops webhook path (scripts/ops_alert.sh, as the MLB lineup waiter uses it). Dry runs print only.
  spawn("bash", [path.join(REPO, "scripts/ops_alert.sh")], {
    stdio: "inherit",
    env: { ...process.env, PHASE: "nba-finals-waiter", OPS_ALERT_KIND: "warning", EXIT_STATUS: "0", ERROR_LINE: a.message, SLATE_DATE: slateDate, ...(dryRun ? { OPS_ALERT_PRINT_ONLY: "1" } : {}) },
  });
}

/** Remember what the decider observed (first-seen finals, regressions): in memory always, as ledger lines only live. */
export function recordObservations(d, ledger, { dryRun }) {
  for (const x of d?.observations?.finalSeen ?? []) {
    ledger.finalSeen.push(x);
    if (!dryRun) console.log(`${LEDGER_MARK}${JSON.stringify({ kind: "final-seen", eventId: x.eventId, at: x.at, slate: d.slateDate })}`);
  }
  for (const x of d?.observations?.regressed ?? []) {
    ledger.regressions.push(x);
    if (!dryRun) console.log(`${LEDGER_MARK}${JSON.stringify({ kind: "regress", eventId: x.eventId, at: x.at, slate: d.slateDate })}`);
  }
}

const sleep = (t) => new Promise((r) => setTimeout(r, t));

function pull() {
  try { execFileSync("git", ["pull", "--quiet", "--ff-only", "origin", "main"], { cwd: REPO, stdio: "inherit", timeout: 120_000 }); return true; }
  catch { console.log("::warning::nba-finals-waiter could not fast-forward main — deciding on the checkout as is"); return false; }
}

function describe(d) {
  const games = d.games.map((g) => `${g.eventId}${g.shortName ? `(${g.shortName.replace(/\s+/g, "")})` : ""}:${g.state}${g.attempt ? `/${g.attempt}` : ""}`).join(" ");
  return `${d.decision}${d.next ? `→${d.next}` : ""} · ${d.reasons.join("; ")} · ${games}`;
}

export async function main(argv = process.argv.slice(2)) {
  const a = parseArgs(argv);
  const started = Date.now();
  const deadline = started + a.budgetMin * 60_000;
  const remainingMs = () => Math.max(0, deadline - Date.now());
  const elapsedMin = () => (Date.now() - started) / 60_000;
  const clock = () => (a.now ? a.now : new Date().toISOString());
  const api = createEspnApi({ cap: a.maxCalls });
  const gh = makeGh({ dryRun: a.dryRun });
  if (a.forcedDryRun) console.log("::notice::nba-finals-waiter NBA_FINALS_WAITER_ENABLED is not exactly 'true' — forced to --dry-run --once (no dispatch, no relay)");
  const ledger = emptyLedger();
  let ledgerRecovered = false;
  const ensureLedger = () => {
    if (ledgerRecovered) return;
    ledgerRecovered = true;
    const got = recoverLedger(gh, { nowMs: Date.parse(clock()) });
    for (const k of Object.keys(ledger)) ledger[k].push(...got[k]);
    summary(`- recovered ledger: ${got.dispatches.length} dispatch(es), ${got.alerted.length} alert key(s), ${got.finalSeen.length} final sighting(s), ${got.regressions.length} regression(s)`);
  };
  const limits = { MAX_DISPATCHES_PER_NIGHT: a.maxDispatches };
  const rc = (date) => readCommitted(REPO, date);
  const alertOpts = (slateDate) => ({ slateDate, dryRun: a.dryRun });
  summary(`### nba-finals-waiter ${a.dryRun ? "(dry run)" : ""}`);
  let last = null;
  let stop = null; // "DONE" | "LATER" | "CAP" | "ONCE" | "BUDGET"
  let failures = 0;
  const inputFailure = (msg) => {
    failures++;
    console.log(`${new Date().toISOString()} ${msg} — retry ${failures}`);
    if (failures === 6) emitAlert({ key: `inputs:${nightOf(Date.now())}:${process.env.GITHUB_RUN_ID ?? "local"}`, message: `six consecutive cycles could not read ESPN or the run list (${msg.slice(0, 80)})` }, alertOpts(a.date ?? nightOf(Date.now())));
  };
  /** One decision: gather, decide, and — only if the answer could depend on it — recover the ledger and re-decide. */
  const decideNow = async () => {
    const base = await gatherInputs({ nowIso: clock(), date: a.date, api, gh, readCommitted: rc });
    let d = await decideWith(base, { api, ledger, limits });
    if (!ledgerRecovered && !needsNoLedger(d)) { ensureLedger(); d = await decideWith(base, { api, ledger, limits }); }
    return d;
  };

  const unfinished = () => last && !last.leaveToLaterTrigger && (last.decision === WAITER.ALERT ? last.next : last.decision) !== WAITER.DONE;
  let relayed = false;
  const relay = (why) => {
    if (relayed) return;
    relayed = true;
    if (!(a.relay && !a.dryRun)) { console.log(`${why} with the night unfinished (no relay in this mode)`); return; }
    try { gh.relaySelf(); console.log(`::notice::nba-finals-waiter ${why} with the night unfinished — relayed to a fresh run`); summary(`- ${why} — relayed to a fresh run`); }
    catch (e) { console.log(`::warning::nba-finals-waiter could not relay (${String(e.message ?? e).slice(0, 80)}) — the next trigger resumes from committed state`); }
  };
  // The hard stop: whatever a cycle is doing HARD_STOP_GRACE_MIN after the budget, relay and exit — always before
  // the job's timeout-minutes (a timeout kill would lose the relay).
  let hardStop = null;
  if (a.relay && !a.dryRun && !a.once) {
    hardStop = setTimeout(() => {
      console.log(`::warning::nba-finals-waiter a cycle overran the ${a.budgetMin}-minute budget by ${HARD_STOP_GRACE_MIN} min — relaying and exiting`);
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
      d = await decideNow();
    } catch (e) {
      if (e instanceof CallCapReached) {
        emitAlert({ key: `callcap:${nightOf(Date.now())}:${process.env.GITHUB_RUN_ID ?? "local"}`, message: `${e.message} after ${Math.round(elapsedMin())} min — exiting${elapsedMin() >= CAP_RELAY_MIN_ELAPSED_MIN ? " and relaying to a fresh run" : "; the next trigger resumes from committed state"}` }, alertOpts(a.date ?? nightOf(Date.now())));
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
    console.log(`${clock()} ${describe(d)} · espn calls ${api.calls}/${a.maxCalls}`);
    if (a.json) fs.writeSync(1, `${JSON.stringify(d)}\n`);
    recordObservations(d, ledger, { dryRun: a.dryRun });
    for (const al of d.alerts) { emitAlert(al, alertOpts(d.slateDate)); ledger.alerted.push(al.key); }

    const next = d.decision === WAITER.ALERT ? d.next : d.decision;
    if (next === WAITER.DONE) { summary(`- DONE: ${d.reasons.join("; ")}`); stop = "DONE"; break; }
    if (d.leaveToLaterTrigger) { summary(`- too early: ${d.reasons.join("; ")}`); console.log(`::notice::nba-finals-waiter ${d.reasons.join("; ")}`); stop = "LATER"; break; }

    if (d.decision === WAITER.DISPATCH) {
      if (a.dryRun) {
        summary(`- would dispatch ${REFRESH_WORKFLOW} for ${d.owed.join(", ")} (dry run — nothing dispatched)`);
        console.log(`::notice::nba-finals-waiter DRY RUN — would dispatch ${REFRESH_WORKFLOW} for ${d.owed.join(", ")}`);
        // Remember it in memory only (never a ledger line) so the dry-run loop exercises the dedupe a live run would.
        ledger.dispatches.push({ at: clock(), fingerprint: d.fingerprint, sides: d.owed });
        if (a.once) { stop = "ONCE"; break; }
        await sleep(Math.min(WAITER_LIMITS.POLL_SECONDS * 1000, remainingMs()));
        continue;
      }
      // Fresh main, then decide again — a cron refresh may have just recorded exactly this.
      let again;
      try {
        if (a.pull) pull();
        again = await decideNow();
      } catch (e) {
        if (e instanceof CallCapReached) { stop = "CAP"; emitAlert({ key: `callcap:${nightOf(Date.now())}:${process.env.GITHUB_RUN_ID ?? "local"}`, message: `${e.message} before a dispatch — exiting` }, alertOpts(d.slateDate)); break; }
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
      const base = { fingerprint: d.fingerprint, sides: d.owed, slate: d.slateDate, n: d.dispatchNumber };
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
      console.log(`::notice::nba-finals-waiter dispatched ${REFRESH_WORKFLOW} (#${d.dispatchNumber} tonight) for ${d.owed.join(", ")}`);
      summary(`- ${entry.at} dispatched ${REFRESH_WORKFLOW} (#${d.dispatchNumber}) for ${d.owed.join(", ")}`);
      flushSummary();
      // Let the run register, then wait it out (≤ 15 min; its timeout is 10) before deciding on what it committed.
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

  // Hand over to a fresh run (it queues in this concurrency group) when the night is unfinished and this run stopped
  // at its budget — or at the ESPN call cap after a real watch (not a hot loop).
  if (!a.once && unfinished()) {
    if (stop === "BUDGET") relay(`reached its ${a.budgetMin}-minute budget`);
    else if (stop === "CAP" && elapsedMin() >= CAP_RELAY_MIN_ELAPSED_MIN) relay("reached the ESPN call cap");
  }
  summary(`- ESPN calls this run: ${api.calls}/${a.maxCalls}`);
  if (last?.games) {
    summary("", "| game | tip | ESPN status | state | final |", "|---|---|---|---|---|");
    for (const g of last.games) summary(`| ${g.eventId} ${g.shortName ?? ""} | ${g.tip ?? ""} | ${g.status ?? ""} | ${g.state}${g.attempt ? ` (${g.attempt})` : ""} | ${g.final ?? ""} |`);
  }
  flushSummary();
  return stop === "CAP" ? { ...(last ?? {}), decision: last?.decision ?? "CAP", stop } : last && { ...last, stop };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main().catch((e) => { console.error(`nba-finals-waiter fatal: ${e?.stack ?? e}`); process.exit(1); });
