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

export function parseArgs(argv) {
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
  return a;
}

// ── StatsAPI with a hard call cap ─────────────────────────────────────────────────────────────────────────────

export class CallCapReached extends Error {}

export function createStatsApi({ fetchImpl = globalThis.fetch, cap = WAITER_LIMITS.STATSAPI_CALL_CAP, timeoutMs = 15_000 } = {}) {
  let calls = 0;
  async function get(url) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (calls >= cap) throw new CallCapReached(`StatsAPI call cap reached (${cap})`);
      calls++;
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), timeoutMs);
        const res = await fetchImpl(url, { signal: ctl.signal, headers: { "User-Agent": "gtp-mlb-lineup-waiter/1" } });
        clearTimeout(t);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
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

/** Every workflow file in the shared writer queue — read from the YAML, so a new writer is covered without an edit here. */
export function writerWorkflowFiles(dir = path.join(REPO, ".github/workflows")) {
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x))) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    if (/^\s*group:\s*["']?gtp-generated-artifacts["']?\s*$/m.test(text)) out.push(f);
  }
  return out.sort();
}

// ── GitHub (gh) ───────────────────────────────────────────────────────────────────────────────────────────────

export function makeGh({ exec = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }), dryRun = false } = {}) {
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
    waiterRuns: () => json(["run", "list", "--workflow", SELF_WORKFLOW, "--limit", "8", "--json", "databaseId,createdAt,status"]) ?? [],
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
  for (const line of String(text ?? "").split("\n")) {
    const i = line.indexOf(LEDGER_MARK);
    if (i < 0) continue;
    try {
      const e = JSON.parse(line.slice(i + LEDGER_MARK.length).trim());
      if (e.kind === "dispatch" && e.at && Array.isArray(e.sides)) ledger.dispatches.push({ at: e.at, fingerprint: e.fingerprint, sides: e.sides });
      if (e.kind === "alert" && e.key) ledger.alerted.push(e.key);
    } catch { /* not ours */ }
  }
  return ledger;
}

export function recoverLedger(gh, { nowMs, selfRunId = process.env.GITHUB_RUN_ID } = {}) {
  const ledger = { dispatches: [], alerted: [] };
  try {
    for (const r of gh.waiterRuns()) {
      if (String(r.databaseId) === String(selfRunId) || r.status !== "completed") continue;
      if (nowMs - Date.parse(r.createdAt) > 36 * 3600_000) continue;
      try {
        const got = parseLedgerLines(gh.runLog(r.databaseId));
        ledger.dispatches.push(...got.dispatches);
        ledger.alerted.push(...got.alerted);
      } catch { /* a run without logs */ }
    }
  } catch (e) { console.log(`ledger recovery skipped (${String(e.message ?? e).slice(0, 80)}) — committed state, the run list, the cap and the spacing still hold`); }
  return ledger;
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
  console.log(`::warning::mlb-lineup-waiter ${a.message}`);
  console.log(`${LEDGER_MARK}${JSON.stringify({ kind: "alert", key: a.key, at: new Date().toISOString(), slate: slateDate })}`);
  summary(`- ⚠ ${a.message}`);
  // The existing ops webhook path (scripts/ops_alert.sh, as cron-watchdog uses it). Dry runs print the payload only.
  spawn("bash", [path.join(REPO, "scripts/ops_alert.sh")], {
    stdio: "inherit",
    env: { ...process.env, PHASE: "mlb-lineup-waiter", OPS_ALERT_KIND: "warning", EXIT_STATUS: "0", ERROR_LINE: a.message, SLATE_DATE: slateDate, ...(dryRun ? { OPS_ALERT_PRINT_ONLY: "1" } : {}) },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pull() {
  try { execFileSync("git", ["pull", "--quiet", "--ff-only", "origin", "main"], { cwd: REPO, stdio: "inherit" }); return true; }
  catch { console.log("::warning::mlb-lineup-waiter could not fast-forward main — deciding on the checkout as is"); return false; }
}

function describe(d) {
  const games = d.games.map((g) => `${g.gamePk}${g.gameNumber > 1 ? `(g${g.gameNumber})` : ""}:${g.state}${g.leadMin != null ? `@T-${g.leadMin}` : ""}[${["away", "home"].map((s) => g.sides?.[s]?.status ?? "-").join("/")}]`).join(" ");
  return `${d.decision}${d.next ? `→${d.next}` : ""} · ${d.reasons.join("; ")} · ${games}`;
}

export async function main(argv = process.argv.slice(2)) {
  const a = parseArgs(argv);
  const started = Date.now();
  const clock = () => (a.now ? a.now : new Date().toISOString());
  const api = createStatsApi({ cap: a.maxCalls });
  const gh = makeGh({ dryRun: a.dryRun });
  const writerFiles = writerWorkflowFiles();
  const ledger = recoverLedger(gh, { nowMs: Date.parse(clock()) });
  const limits = { MAX_DISPATCHES_PER_SLATE: a.maxDispatches };
  const rc = (date) => readCommitted(REPO, date);
  summary(`### mlb-lineup-waiter ${a.dryRun ? "(dry run)" : ""}`);
  summary(`- writers watched: ${writerFiles.length} (${writerFiles.join(", ")}) · recovered ledger: ${ledger.dispatches.length} dispatch(es), ${ledger.alerted.length} alert key(s)`);
  let last = null;
  let failures = 0;

  for (;;) {
    const elapsedMin = (Date.now() - started) / 60_000;
    if (elapsedMin >= a.budgetMin) break;
    if (a.pull && !a.dryRun) pull();
    let d;
    try {
      d = await decideOnce({ nowIso: clock(), date: a.date, api, gh, readCommitted: rc, writerFiles, ledger, limits });
      failures = 0;
    } catch (e) {
      if (e instanceof CallCapReached) {
        emitAlert({ key: `callcap:${etDate(Date.now())}:${process.env.GITHUB_RUN_ID ?? "local"}`, message: `${e.message} after ${Math.round(elapsedMin)} min — exiting; the next trigger resumes from committed state` }, { slateDate: a.date ?? etDate(Date.now()), dryRun: a.dryRun });
        last = { decision: "CAP" };
        break;
      }
      failures++;
      console.log(`${new Date().toISOString()} input fetch failed (${String(e.message ?? e).slice(0, 120)}) — retry ${failures}`);
      if (failures === 6) emitAlert({ key: `inputs:${etDate(Date.now())}:${process.env.GITHUB_RUN_ID ?? "local"}`, message: `six consecutive cycles could not read StatsAPI or the run list (${String(e.message ?? e).slice(0, 80)})` }, { slateDate: a.date ?? etDate(Date.now()), dryRun: a.dryRun });
      if (a.once) break;
      await sleep(Math.min(WAITER_LIMITS.POLL_SECONDS * 1000, Math.max(0, (a.budgetMin - elapsedMin) * 60_000)));
      continue;
    }
    last = d;
    console.log(`${clock()} ${describe(d)} · statsapi calls ${api.calls}/${a.maxCalls}`);
    if (a.json) fs.writeSync(1, `${JSON.stringify(d)}\n`);
    for (const al of d.alerts) { emitAlert(al, { slateDate: d.slateDate, dryRun: a.dryRun }); ledger.alerted.push(al.key); }

    const next = d.decision === WAITER.ALERT ? d.next : d.decision;
    if (next === WAITER.DONE) { summary(`- DONE: ${d.reasons.join("; ")}`); break; }
    if (d.leaveToLaterTrigger) { summary(`- too early: ${d.reasons.join("; ")}`); console.log(`::notice::mlb-lineup-waiter ${d.reasons.join("; ")}`); break; }

    if (d.decision === WAITER.DISPATCH) {
      if (a.dryRun) {
        summary(`- would dispatch ${REFRESH_WORKFLOW} for ${d.owed.join(", ")} (dry run — nothing dispatched)`);
        console.log(`::notice::mlb-lineup-waiter DRY RUN — would dispatch ${REFRESH_WORKFLOW} for ${d.owed.join(", ")}`);
        // Remember it as if dispatched so the dry-run loop exercises the same dedupe a live run would.
        ledger.dispatches.push({ at: clock(), fingerprint: d.fingerprint, sides: d.owed });
        if (a.once) break;
        await sleep(WAITER_LIMITS.POLL_SECONDS * 1000);
        continue;
      }
      // Fresh main, then decide again — another writer may have just produced exactly this.
      if (a.pull) pull();
      const again = await decideOnce({ nowIso: clock(), date: a.date, api, gh, readCommitted: rc, writerFiles, ledger, limits });
      if (again.decision !== WAITER.DISPATCH || again.fingerprint !== d.fingerprint) {
        console.log(`re-decided on fresh main: ${describe(again)} — not dispatching`);
        continue;
      }
      gh.dispatchRefresh();
      const entry = { kind: "dispatch", at: new Date().toISOString(), fingerprint: d.fingerprint, sides: d.owed, slate: d.slateDate, n: d.dispatchNumber };
      ledger.dispatches.push(entry);
      console.log(`${LEDGER_MARK}${JSON.stringify(entry)}`);
      console.log(`::notice::mlb-lineup-waiter dispatched ${REFRESH_WORKFLOW} (#${d.dispatchNumber} today) for ${d.owed.join(", ")}`);
      summary(`- ${entry.at} dispatched ${REFRESH_WORKFLOW} (#${d.dispatchNumber}) for ${d.owed.join(", ")}`);
      flushSummary();
      // Let the run register, then wait it out (≤ 25 min) before deciding on what it committed.
      await sleep(45_000);
      for (let i = 0; i < 25; i++) {
        let inflight = 1;
        try { inflight = gh.refreshRuns().filter((r) => r.status !== "completed").length; } catch { /* keep waiting */ }
        if (!inflight) break;
        await sleep(60_000);
      }
      continue;
    }

    if (a.once) break;
    const jitter = Math.round((Math.random() * 2 - 1) * WAITER_LIMITS.POLL_JITTER_SECONDS);
    const waitS = d.waitSeconds >= WAITER_LIMITS.POLL_SECONDS ? d.waitSeconds + jitter : d.waitSeconds;
    const remainingMs = Math.max(0, (a.budgetMin - (Date.now() - started) / 60_000) * 60_000);
    flushSummary();
    await sleep(Math.min(Math.max(1, waitS) * 1000, remainingMs));
  }

  // At the budget with the slate unfinished: hand over to a fresh run (it queues in this concurrency group).
  const unfinished = last && last.decision !== "CAP" && !last.leaveToLaterTrigger && (last.decision === WAITER.ALERT ? last.next : last.decision) !== WAITER.DONE;
  if (unfinished && !a.once && (Date.now() - started) / 60_000 >= a.budgetMin) {
    if (a.relay && !a.dryRun) {
      try { gh.relaySelf(); console.log(`::notice::mlb-lineup-waiter reached its ${a.budgetMin}-minute budget with the slate unfinished — relayed to a fresh run`); summary("- budget reached — relayed to a fresh run"); }
      catch (e) { console.log(`::warning::mlb-lineup-waiter could not relay (${String(e.message ?? e).slice(0, 80)}) — the next trigger resumes from committed state`); }
    } else console.log("budget reached with the slate unfinished (no relay in this mode)");
  }
  summary(`- StatsAPI calls this run: ${api.calls}/${a.maxCalls}`);
  if (last?.games) {
    summary("", "| game | state | lead | away | home |", "|---|---|---|---|---|");
    for (const g of last.games) summary(`| ${g.gamePk}${g.gameNumber > 1 ? ` (g${g.gameNumber})` : ""} | ${g.state} | ${g.leadMin ?? ""} | ${g.sides?.away?.status ?? ""} | ${g.sides?.home?.status ?? ""} |`);
  }
  flushSummary();
  return last;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main().catch((e) => { console.error(`mlb-lineup-waiter fatal: ${e?.stack ?? e}`); process.exit(1); });
