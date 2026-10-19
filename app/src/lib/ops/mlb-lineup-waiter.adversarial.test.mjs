/**
 * INDEPENDENT VERIFIER — adversarial tests for PR #1131 (F1–F11 of docs/launch/approvals/PR1131_ACTIVATION_READINESS.md).
 * Each test asserts the behaviour an operator would need; a FAILURE is a finding. Added to the PR as its acceptance
 * tests. Two were re-expressed against the fixed code rather than the original's text (the assertion is unchanged):
 *   - GUARD #1 modelled the old step's shell test in JS; it now EXECUTES the workflow step's own script (with a stub
 *     `node`) for every case variant of the variable and the input, and asserts no disabled path runs live.
 *   - BUDGET read the old post-dispatch loop's iteration count from the source; it now checks budget + hard stop +
 *     setup against timeout-minutes, and drives the runner's post-dispatch wait with a stalled refresh.
 * Run: npx tsx --test src/lib/ops/mlb-lineup-waiter.adversarial.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

import { WAITER, WAITER_LIMITS, decideLineupWaiter, lineupFingerprint, normalizeSchedule, etDate, minutesToEtMidnight } from "./mlb-lineup-waiter.mjs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { createStatsApi, makeGh, recoverLedger, parseLedgerLines, decideOnce, writerWorkflowFiles, emitAlert, waitForRefresh, LEDGER_MARK, HARD_STOP_GRACE_MIN } from "../../../scripts/ops/mlb-lineup-waiter.mjs";

const REPO = path.resolve(process.cwd(), "..");
const DATE = "2026-10-18";
const ids = (b) => Array.from({ length: 9 }, (_, i) => b + i);
const A = ids(100), B = ids(200), C = ids(300);
const fp = lineupFingerprint;
const game = (pk, firstPitch, extra = {}) => ({ gamePk: pk, firstPitch, officialDate: DATE, abstractGameState: "Preview", codedGameState: "S", detailedState: "Scheduled", startTimeTBD: false, doubleHeader: "N", gameNumber: 1, awayTeamId: pk * 10, homeTeamId: pk * 10 + 1, ...extra });
const side = (arr) => ({ source: arr ? "confirmed" : "props", fingerprint: arr ? fp(arr) : null });
const EMPTY = Object.freeze({ dispatches: [], alerted: [] });
const base = (over = {}) => ({ nowIso: "2026-10-18T18:00:00Z", slateDate: DATE, games: [game(1, "2026-10-18T21:08:00Z")], upstream: { 1: { away: [], home: [] } }, committed: {}, boardFirstPitch: { 1: "2026-10-18T21:08:00Z" }, boardPresent: true, refreshRuns: [], activeWriters: [], ledger: EMPTY, ...over });
const decide = (over) => decideLineupWaiter(base(over));
const run = (id, createdAt, extra = {}) => ({ databaseId: id, createdAt, updatedAt: createdAt, status: "completed", conclusion: "success", event: "schedule", ...extra });

const WF_TEXT = fs.readFileSync(path.join(REPO, ".github/workflows/mlb-lineup-waiter.yml"), "utf8");
const WF = yaml.load(WF_TEXT);

// ── GUARD ────────────────────────────────────────────────────────────────────────────────────────────────────
test("GUARD: a dry_run input that passes the job `if` must also take the shell's dry-run branch (GitHub == is case-insensitive)", () => {
  // docs.github.com …/expressions: "GitHub ignores case when comparing strings."
  const ghEq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const jobIf = (enabled, dry) => ghEq(enabled, "true") || ghEq(dry, "true"); // event = workflow_dispatch
  const step = WF.jobs.wait.steps.find((s) => /mlb-lineup-waiter\.mjs/.test(String(s.run ?? "")));
  // Execute the step's OWN script with a stub `node` that prints its arguments: which branch does each input take?
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "waiter-guard-"));
  fs.writeFileSync(path.join(bin, "node"), "#!/bin/sh\necho \"$@\"\n", { mode: 0o755 });
  const shell = (enabled, dry) => {
    const r = spawnSync("bash", ["-c", step.run], { encoding: "utf8", env: { PATH: `${bin}:${process.env.PATH}`, MLB_LINEUP_WAITER_ENABLED: enabled, DRY: dry } });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.includes("--dry-run") && r.stdout.includes("--once") && !r.stdout.includes("--relay") ? "dry" : "live";
  };
  const cases = [];
  for (const enabled of ["", "false", "True", "TRUE", "tRuE", " true", "true"]) for (const dry of ["", "false", "true", "True", "TRUE", "tRuE"]) cases.push([enabled, dry]);
  const bypass = cases.filter(([enabled, dry]) => jobIf(enabled, dry) && enabled !== "true" && shell(enabled, dry) === "live");
  assert.deepEqual(bypass, [], `while DISABLED (variable not exactly 'true'), ${JSON.stringify(bypass)} pass the guard and run the LIVE loop (--relay, real dispatches)`);
  const dryAsked = cases.filter(([, dry]) => ghEq(dry, "true") && shell("true", dry) === "live");
  assert.deepEqual(dryAsked, [], "a dry_run of any case is a dry run even when enabled");
  assert.equal(shell("true", "false"), "live", "enabled and not a dry run → the live loop");
  assert.equal(shell("true", ""), "live", "enabled, a workflow_run/schedule trigger (no input) → the live loop");
  fs.rmSync(bin, { recursive: true, force: true });
});

test("GUARD: the dry_run input is typed boolean (no free text)", () => {
  assert.equal(WF.on?.workflow_dispatch?.inputs?.dry_run?.type ?? WF[true]?.workflow_dispatch?.inputs?.dry_run?.type, "boolean");
});

// ── WRITERS ──────────────────────────────────────────────────────────────────────────────────────────────────
test("WRITERS: every workflow whose parsed concurrency group is gtp-generated-artifacts is watched", () => {
  const dir = path.join(REPO, ".github/workflows");
  const truth = [];
  for (const f of fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x))) {
    const w = yaml.load(fs.readFileSync(path.join(dir, f), "utf8"));
    const groups = [w?.concurrency?.group, ...Object.values(w?.jobs ?? {}).map((j) => j?.concurrency?.group)];
    if (groups.includes("gtp-generated-artifacts")) truth.push(f);
  }
  const got = writerWorkflowFiles(dir);
  assert.deepEqual(truth.filter((f) => !got.includes(f)), [], "writers missed by the runner's regex");
});

// ── RETRY / DEDUPE ───────────────────────────────────────────────────────────────────────────────────────────
test("DEDUPE: a dispatched refresh that was CANCELLED (concurrency-group replacement) is retried or alerted before T-60", () => {
  const key = `1:away:${fp(A)}`;
  const d = decide({ nowIso: "2026-10-18T19:00:00Z", upstream: { 1: { away: A, home: [] } },
    ledger: { dispatches: [{ at: "2026-10-18T18:20:00Z", sides: [key] }], alerted: [] },
    refreshRuns: [run(70, "2026-10-18T18:20:05Z", { event: "workflow_dispatch", conclusion: "cancelled", updatedAt: "2026-10-18T18:25:00Z" })] });
  assert.ok(d.decision === WAITER.DISPATCH || d.alerts.length > 0, `got ${d.decision}: ${d.reasons.join("; ")} — the owed side is silently stuck until the T-60 alert`);
});

test("DEDUPE: a lineup that changes A → B → back to A is refreshed back to A", () => {
  const kA = `1:away:${fp(A)}`, kB = `1:away:${fp(B)}`;
  const d = decide({ nowIso: "2026-10-18T19:30:00Z", upstream: { 1: { away: A, home: [] } }, committed: { 1: { away: side(B), home: side(null) } },
    ledger: { dispatches: [{ at: "2026-10-18T18:00:00Z", sides: [kA] }, { at: "2026-10-18T18:40:00Z", sides: [kB] }], alerted: [] },
    refreshRuns: [run(1, "2026-10-18T18:00:05Z", { event: "workflow_dispatch", updatedAt: "2026-10-18T18:02:00Z" }), run(2, "2026-10-18T18:40:05Z", { event: "workflow_dispatch", updatedAt: "2026-10-18T18:42:00Z" })] });
  assert.equal(d.decision, WAITER.DISPATCH, `got ${d.decision} [${d.alerts.map((a) => a.key.split(":")[0]).join(",")}]: ${d.reasons.join("; ")} — committed simulation keeps the stale nine B`);
});

// ── DOUBLEHEADER ─────────────────────────────────────────────────────────────────────────────────────────────
test("DOUBLEHEADER: TBD game 2 whose BOARD time is StatsAPI's placeholder (g1 + 5 min) is not dispatched for after that time", () => {
  // StatsAPI 2025 traditional doubleheaders: game 2 gameDate = game 1 + 5 min, startTimeTBD true (e.g. 778195, 778046).
  // The refresh treats a game as started once board gameDate <= now and carries it forward frozen.
  const g1 = game(1, "2026-10-18T17:05:00Z", { doubleHeader: "Y", awayTeamId: 5, homeTeamId: 6 });
  const g2 = game(2, "2026-10-18T17:10:00Z", { doubleHeader: "Y", gameNumber: 2, startTimeTBD: true, awayTeamId: 5, homeTeamId: 6 });
  const d = decide({ nowIso: "2026-10-18T19:00:00Z", games: [g1, g2], upstream: { 1: { away: A, home: B }, 2: { away: C, home: [] } },
    boardFirstPitch: { 1: "2026-10-18T17:05:00Z", 2: "2026-10-18T17:10:00Z" } });
  assert.notEqual(d.decision, WAITER.DISPATCH, "a dispatch the refresh cannot honour (game 2 already 'started' by the board clock) → wasted dispatch + false 'stalled' alert");
});

// ── INPUT FAILURES ───────────────────────────────────────────────────────────────────────────────────────────
test("INPUTS: an empty schedule response while the committed board lists games is NOT a DONE", () => {
  const { games, upstream } = normalizeSchedule({ dates: [] }); // transient StatsAPI glitch / 200 with error body
  const d = decide({ games, upstream });
  assert.notEqual(d.decision === WAITER.ALERT ? d.next : d.decision, WAITER.DONE, "the run exits DONE (no relay) for the rest of the slate");
});

test("INPUTS: a 200 response whose body stalls is bounded by the timeout", async () => {
  const api = createStatsApi({ timeoutMs: 50, fetchImpl: async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }) });
  const r = await Promise.race([api.schedule(DATE).then(() => "resolved", () => "rejected"), new Promise((res) => setTimeout(() => res("HUNG"), 600))]);
  assert.notEqual(r, "HUNG", "res.json() runs after clearTimeout — a stalled body hangs the job until timeout-minutes");
});

test("INPUTS: a run without createdAt (or a ledger entry without a valid `at`) does not throw the decider", () => {
  assert.doesNotThrow(() => decide({ refreshRuns: [{ databaseId: 9, status: "queued", event: "workflow_dispatch", createdAt: null }] }));
});

test("INPUTS: malformed schedule shapes — non-iterable dates throws (retried as an input failure); bad ids are NOT_POSTED", () => {
  assert.throws(() => normalizeSchedule({ dates: {} }));
  const { upstream } = normalizeSchedule({ dates: [{ games: [{ gamePk: 1, gameDate: "2026-10-18T21:08:00Z", lineups: { awayPlayers: A.map((id) => ({ id: String(id) })), homePlayers: B.slice(0, 8).map((id) => ({ id })) } }] }] });
  const d = decide({ upstream });
  assert.equal(d.games[0].sides.away.status, "NOT_POSTED");
  assert.equal(d.games[0].sides.home.status, "NOT_POSTED", "8 batters = partial");
  assert.equal(fp([...A.slice(0, 8), A[0]]), null, "duplicate id");
  assert.equal(fp([...A.slice(0, 8), -1]), null);
});

// ── TIME ─────────────────────────────────────────────────────────────────────────────────────────────────────
test("DST: ET slate date and minutes-to-midnight across both 2026/27 transitions", () => {
  assert.equal(etDate(Date.parse("2026-11-01T03:59:00Z")), "2026-10-31"); // EDT
  assert.equal(etDate(Date.parse("2026-11-01T04:00:00Z")), "2026-11-01");
  assert.equal(etDate(Date.parse("2026-11-02T04:59:00Z")), "2026-11-01"); // EST
  assert.equal(etDate(Date.parse("2026-11-02T05:00:00Z")), "2026-11-02");
  assert.equal(minutesToEtMidnight(Date.parse("2026-11-01T03:50:00Z")), 10);
  assert.equal(minutesToEtMidnight(Date.parse("2026-11-02T04:50:00Z")), 10);
  assert.equal(etDate(Date.parse("2027-03-14T04:59:00Z")), "2027-03-13"); // EST
  assert.equal(minutesToEtMidnight(Date.parse("2027-03-15T03:45:00Z")), 15); // EDT
});

test("MIDNIGHT: inside the ET-midnight guard an owed side WAITs; after midnight yesterday's games leave the slate", () => {
  const late = game(1, "2026-10-19T04:30:00Z"); // 00:30 ET next day but officialDate DATE (TBD/delayed edge)
  const d = decide({ nowIso: "2026-10-19T03:45:00Z", games: [late], boardFirstPitch: { 1: "2026-10-19T04:30:00Z" }, upstream: { 1: { away: A, home: [] } } });
  assert.equal(d.decision === WAITER.ALERT ? d.next : d.decision, WAITER.WAIT);
  assert.match(d.reasons.join(), /midnight/);
  const after = decide({ nowIso: "2026-10-19T04:05:00Z", slateDate: etDate(Date.parse("2026-10-19T04:05:00Z")), games: [late], upstream: { 1: { away: A, home: [] } } });
  assert.equal(after.decision === WAITER.ALERT ? after.next : after.decision, WAITER.DONE, "documented limitation: a game crossing ET midnight is never refreshed (the refresh resolves the new date too)");
});

test("STARTED: Live before the scheduled time, or board time passed while StatsAPI moved it later → never dispatched", () => {
  const up = { 1: { away: A, home: B } };
  assert.notEqual(decide({ nowIso: "2026-10-18T20:00:00Z", upstream: up, games: [game(1, "2026-10-18T21:08:00Z", { abstractGameState: "Live" })] }).decision, WAITER.DISPATCH);
  assert.notEqual(decide({ nowIso: "2026-10-18T21:10:00Z", upstream: up, games: [game(1, "2026-10-18T22:00:00Z")] }).decision, WAITER.DISPATCH);
  assert.notEqual(decide({ nowIso: "2026-10-18T21:00:00Z", upstream: up }).decision, WAITER.DISPATCH, "inside T-10");
});

// ── CAP / SPACING bypass attempts ────────────────────────────────────────────────────────────────────────────
test("CAP: ledger-only dispatches (run list lost/truncated) still cap; a dispatch from the previous ET day does not", () => {
  const up = { 1: { away: A, home: [] } };
  const six = Array.from({ length: 6 }, (_, i) => ({ at: `2026-10-18T1${i}:00:00Z`, sides: [`9:away:${i}`] }));
  assert.notEqual(decide({ upstream: up, ledger: { dispatches: six, alerted: [] }, refreshRuns: [] }).decision, WAITER.DISPATCH);
  const y = [{ at: "2026-10-18T03:00:00Z", sides: ["9:away:x"] }]; // 23:00 ET on 10-17
  assert.equal(decide({ upstream: up, ledger: { dispatches: y, alerted: [] } }).decision, WAITER.DISPATCH);
  // spacing from a MANUAL dispatch seen only in the run list
  assert.equal(decide({ upstream: up, refreshRuns: [run(5, "2026-10-18T17:50:00Z", { event: "workflow_dispatch", updatedAt: "2026-10-18T17:52:00Z" })] }).decision, WAITER.WAIT);
});

// ── RECOVERY ─────────────────────────────────────────────────────────────────────────────────────────────────
test("RECOVERY: the dispatching run is still recovered after the ~10 pending-replaced runs a 330-min watch accumulates", () => {
  // publication-watchdog completes every 30 min 12:00–17:00Z; each arrival during the running job becomes a pending
  // run that the next arrival cancels. Model `gh run list --limit N` faithfully.
  const runs = [{ databaseId: 100, createdAt: "2026-10-18T12:05:00Z", status: "completed" }];
  for (let i = 0; i < 10; i++) runs.unshift({ databaseId: 101 + i, createdAt: `2026-10-18T${String(12 + Math.floor((i + 1) / 2)).padStart(2, "0")}:${(i + 1) % 2 ? "30" : "00"}:00Z`, status: "completed" });
  const entry = `${LEDGER_MARK}${JSON.stringify({ kind: "dispatch", at: "2026-10-18T13:00:00Z", fingerprint: "f", sides: ["1:away:x"] })}`;
  const exec = (args) => {
    if (args[0] === "run" && args[1] === "list") { const n = Number(args[args.indexOf("--limit") + 1]); return JSON.stringify(runs.slice(0, n)); }
    if (args[0] === "run" && args[1] === "view") { if (args[2] === "100") return entry; throw new Error("no logs (cancelled while pending)"); }
    throw new Error(`unexpected gh ${args.join(" ")}`);
  };
  const ledger = recoverLedger(makeGh({ exec, dryRun: true }), { nowMs: Date.parse("2026-10-18T17:40:00Z"), selfRunId: "999" });
  assert.equal(ledger.dispatches.length, 1, "`gh run list --limit 8` drops the run that actually dispatched");
});

test("RECOVERY: a DRY-RUN's alert ledger lines must not suppress the live run's real (webhook) alert", () => {
  const out = [];
  const orig = console.log;
  console.log = (s) => out.push(String(s));
  try { emitAlert({ key: "t60:1:away:abc", message: "x" }, { slateDate: DATE, dryRun: true, spawn: () => ({}) }); } finally { console.log = orig; }
  assert.deepEqual(parseLedgerLines(out.join("\n")).alerted, [], "a later live run recovers this key and never sends the webhook");
});

test("RECOVERY (kill after dispatch, before the ledger line): no duplicate while the refresh is in flight or once it landed", async () => {
  const sched = { dates: [{ date: DATE, games: [{ gamePk: 1, gameDate: "2026-10-18T21:08:00Z", officialDate: DATE, status: { abstractGameState: "Preview" }, teams: { away: { team: { id: 1 } }, home: { team: { id: 2 } } }, lineups: { awayPlayers: A.map((id) => ({ id })) } }] }] };
  const api = { schedule: async () => sched, boxscore: async () => ({ teams: { away: { battingOrder: A }, home: { battingOrder: [] } } }) };
  const dispatched = [];
  const mk = (runs) => ({ refreshRuns: () => runs, activeWriters: () => [], dispatchRefresh: () => dispatched.push(1) });
  const rc = (committed) => () => ({ boardPresent: true, boardFirstPitch: { 1: "2026-10-18T21:08:00Z" }, committed });
  const r = { databaseId: 7, createdAt: "2026-10-18T18:00:03Z", event: "workflow_dispatch" };
  const inflight = await decideOnce({ nowIso: "2026-10-18T18:06:00Z", date: DATE, api, gh: mk([{ ...r, status: "queued" }]), readCommitted: rc({}), writerFiles: [], ledger: EMPTY });
  assert.equal(inflight.decision, WAITER.WAIT);
  const landed = await decideOnce({ nowIso: "2026-10-18T18:20:00Z", date: DATE, api, gh: mk([{ ...r, status: "completed", conclusion: "success", updatedAt: "2026-10-18T18:02:00Z" }]), readCommitted: rc({ 1: { away: side(A), home: side(null) } }), writerFiles: [], ledger: EMPTY });
  assert.equal(landed.decision, WAITER.WAIT);
  // …but if that refresh did NOT take it (cancelled), the ledger-less resume re-dispatches the SAME fingerprint once spacing allows:
  const lost = await decideOnce({ nowIso: "2026-10-18T18:20:00Z", date: DATE, api, gh: mk([{ ...r, status: "completed", conclusion: "cancelled", updatedAt: "2026-10-18T18:01:00Z" }]), readCommitted: rc({}), writerFiles: [], ledger: EMPTY });
  assert.equal(lost.decision, WAITER.DISPATCH, "documented: the duplicate is bounded by spacing + cap (and is the desirable retry)");
  assert.equal(dispatched.length, 0, "decideOnce never dispatches by itself");
});

// ── BUDGET ───────────────────────────────────────────────────────────────────────────────────────────────────
test("BUDGET: loop budget + worst post-dispatch wait fits the job timeout", async () => {
  const step = WF.jobs.wait.steps.find((s) => /--relay/.test(String(s.run ?? "")));
  const budget = Number(step.run.match(/--budget-min (\d+)/)[1]);
  // The post-dispatch wait is capped at the remaining budget; a cycle that overruns anyway is cut by the hard stop.
  const worst = budget + HARD_STOP_GRACE_MIN;
  const timeout = WF.jobs.wait["timeout-minutes"];
  assert.ok(worst + 3 /* checkout + setup-node, generous */ <= timeout, `worst case ≈ ${worst} min + setup > timeout ${timeout} → killed without relay (and without the failure-notify step)`);
  // Drive the post-dispatch wait with a refresh that never completes and 5 minutes of budget left.
  let clock = 0;
  const remaining = 5 * 60_000;
  const slept = await waitForRefresh({ refreshRuns: () => [{ status: "in_progress" }] }, { sleep: async (ms) => { clock += ms; }, remainingMs: () => Math.max(0, remaining - clock) });
  assert.ok(slept <= remaining, `the post-dispatch wait slept ${slept / 60_000} min with 5 min of budget left`);
  // And if the job is killed anyway, the notify step still runs (a timeout is a cancellation, not a failure).
  const notify = WF.jobs.wait.steps.find((s) => /ops_alert\.sh/.test(String(s.run ?? "")));
  assert.match(String(notify.if), /always\(\)|cancelled\(\)/);
});
