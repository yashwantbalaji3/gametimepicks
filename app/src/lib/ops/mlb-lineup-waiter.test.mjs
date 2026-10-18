/**
 * The MLB pregame lineup waiter: the pure decider, the runner's injected seams, and the workflow contract.
 * Run: npx tsx --test src/lib/ops/mlb-lineup-waiter.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

import {
  WAITER, WAITER_LIMITS, decideLineupWaiter, lineupFingerprint, committedLineups, normalizeSchedule, boxscoreOrders,
  isPostponed, etDate, minutesToEtMidnight, fnv1a,
} from "./mlb-lineup-waiter.mjs";
import {
  parseArgs, createStatsApi, CallCapReached, makeGh, parseLedgerLines, recoverLedger, decideOnce, writerWorkflowFiles,
  LEDGER_MARK, REFRESH_WORKFLOW,
} from "../../../scripts/ops/mlb-lineup-waiter.mjs";

const REPO = path.resolve(process.cwd(), "..");
const DATE = "2026-10-18";
const ids = (base) => Array.from({ length: 9 }, (_, i) => base + i);
const A = ids(100), B = ids(200), C = ids(300), D = ids(400);
const fp = lineupFingerprint;
const game = (pk, firstPitch, extra = {}) => ({
  gamePk: pk, firstPitch, officialDate: DATE, abstractGameState: "Preview", codedGameState: "S", detailedState: "Scheduled",
  startTimeTBD: false, doubleHeader: "N", gameNumber: 1, awayTeamId: pk * 10, homeTeamId: pk * 10 + 1, ...extra,
});
const side = (arr) => ({ source: arr ? "confirmed" : "props", fingerprint: arr ? fp(arr) : null });
const EMPTY_LEDGER = Object.freeze({ dispatches: [], alerted: [] });
/** A slate with one game at 21:08Z (5:08 PM ET), nothing committed, nothing posted. */
function inputs(over = {}) {
  return {
    nowIso: "2026-10-18T18:00:00Z", slateDate: DATE,
    games: [game(1, "2026-10-18T21:08:00Z")],
    upstream: { 1: { away: [], home: [] } },
    committed: {},
    boardFirstPitch: {}, boardPresent: true, refreshRuns: [], activeWriters: [], ledger: EMPTY_LEDGER,
    ...over,
  };
}
const decide = (over) => decideLineupWaiter(inputs(over));
const run = (id, createdAt, extra = {}) => ({ databaseId: id, createdAt, updatedAt: createdAt, status: "completed", conclusion: "success", event: "schedule", ...extra });

// ── fingerprints and normalisation ───────────────────────────────────────────────────────────────────────────

test("fingerprint: a full nine of distinct ids, order-sensitive, deterministic; anything else is null", () => {
  assert.equal(fp(A), fp([...A]));
  assert.notEqual(fp(A), fp([...A].reverse()), "batting ORDER is the input");
  assert.equal(fp(A.slice(0, 8)), null);
  assert.equal(fp([...A.slice(0, 8), A[0]]), null, "a duplicate is a mid-write capture, not a lineup");
  assert.equal(fp(null), null);
  assert.match(fnv1a("x"), /^[0-9a-f]{8}$/);
});

test("committedLineups: the input snapshot is the record; the published simulation is the fallback", () => {
  const simulation = { games: [{ gamePk: 1, awayTeam: "TB", homeTeam: "CLE", completeness: { awayLineupSource: "confirmed", homeLineupSource: "props" },
    players: { batters: [...A.map((id, i) => ({ playerId: id, team: "TB", battingOrder: i + 1 })), ...B.slice(0, 7).map((id, i) => ({ playerId: id, team: "CLE", battingOrder: i + 1 }))] } }] };
  const fromSim = committedLineups({ simulation });
  assert.equal(fromSim[1].from, "simulation");
  assert.equal(fromSim[1].away.fingerprint, fp(A));
  assert.equal(fromSim[1].home.fingerprint, null, "a prop-derived side carries no confirmed fingerprint");
  const inputSnapshot = { games: [{ gamePk: 1, away: { source: "confirmed", batterIds: C }, home: { source: "confirmed", batterIds: B } }] };
  const both = committedLineups({ simulation, inputSnapshot });
  assert.equal(both[1].from, "input-snapshot");
  assert.equal(both[1].away.fingerprint, fp(C));
  assert.equal(both[1].home.fingerprint, fp(B));
});

test("committedLineups on the REAL committed 2026-10-18 record agrees with itself (snapshot vs simulation)", () => {
  const read = (p) => { try { return JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8")); } catch { return null; } };
  const simulation = read(`app/public/data/mlb/full-game-simulations/${DATE}.json`);
  const inputSnapshot = read(`data/internal/mlb/input-snapshots/${DATE}.json`);
  if (!simulation || !inputSnapshot) return; // data may roll; the synthetic test above pins the rule
  const a = committedLineups({ simulation });
  const b = committedLineups({ simulation, inputSnapshot });
  for (const pk of Object.keys(b)) {
    for (const s of ["away", "home"]) if (b[pk][s].source === "confirmed") assert.equal(a[pk]?.[s]?.fingerprint, b[pk][s].fingerprint, `${pk} ${s}`);
  }
});

test("normalizeSchedule / boxscoreOrders read StatsAPI's shapes", () => {
  const { games, upstream } = normalizeSchedule({ dates: [{ date: DATE, games: [{ gamePk: 7, gameDate: "2026-10-18T21:08:00Z", officialDate: DATE, doubleHeader: "N", gameNumber: 1,
    status: { abstractGameState: "Preview", codedGameState: "P", detailedState: "Pre-Game", startTimeTBD: false },
    teams: { away: { team: { id: 139 } }, home: { team: { id: 114 } } }, lineups: { awayPlayers: A.map((id) => ({ id })) } }] }] });
  assert.equal(games[0].gamePk, 7);
  assert.equal(games[0].awayTeamId, 139);
  assert.deepEqual(upstream[7].away, A);
  assert.deepEqual(upstream[7].home, []);
  assert.deepEqual(boxscoreOrders({ teams: { away: { battingOrder: A }, home: { battingOrder: [] } } }), { away: A, home: [], source: "boxscore" });
  assert.ok(isPostponed({ codedGameState: "D", detailedState: "Postponed" }));
  assert.ok(isPostponed({ codedGameState: "C", detailedState: "Cancelled" }));
  assert.ok(!isPostponed({ codedGameState: "P", detailedState: "Pre-Game" }));
});

test("ET helpers: slate date and the midnight guard", () => {
  assert.equal(etDate(Date.parse("2026-10-19T03:30:00Z")), "2026-10-18");
  assert.equal(etDate(Date.parse("2026-10-19T04:30:00Z")), "2026-10-19");
  assert.equal(minutesToEtMidnight(Date.parse("2026-10-19T03:50:00Z")), 10);
});

// ── monitoring window ────────────────────────────────────────────────────────────────────────────────────────

test("before T-240 it waits for the window, however early it arrives", () => {
  const d = decide({ nowIso: "2026-10-18T13:00:00Z" });
  assert.equal(d.decision, WAITER.WAIT);
  assert.equal(d.waitSeconds, (Date.parse("2026-10-18T17:08:00Z") - Date.parse("2026-10-18T13:00:00Z")) / 1000);
  assert.equal(d.games[0].state, "BEFORE_WINDOW");
});

test("an arrival more than HORIZON_MIN before the first window exits and leaves it to a later trigger", () => {
  const d = decide({ nowIso: "2026-10-18T09:30:00Z" });
  assert.equal(d.decision, WAITER.WAIT);
  assert.equal(d.leaveToLaterTrigger, true);
  assert.equal(decide({ nowIso: "2026-10-18T12:00:00Z" }).leaveToLaterTrigger, undefined, "inside the horizon it sleeps to the window");
  assert.equal(WAITER_LIMITS.HORIZON_MIN, 330, "the horizon equals the runner's loop budget");
});

test("inside the window with nothing posted: poll again in ten minutes", () => {
  const d = decide();
  assert.equal(d.decision, WAITER.WAIT);
  assert.equal(d.waitSeconds, WAITER_LIMITS.POLL_SECONDS);
  assert.match(d.reasons.join(), /waiting for 2 side\(s\) to post/);
});

test("a newly posted side → DISPATCH (and only that side is owed)", () => {
  const d = decide({ upstream: { 1: { away: A, home: [] } } });
  assert.equal(d.decision, WAITER.DISPATCH);
  assert.deepEqual(d.owed, [`1:away:${fp(A)}`]);
  assert.equal(d.dispatchNumber, 1);
  assert.equal(d.fingerprint, decide({ upstream: { 1: { away: A, home: [] } } }).fingerprint, "deterministic");
});

test("an UNCHANGED fingerprint never dispatches", () => {
  const d = decide({ upstream: { 1: { away: A, home: B } }, committed: { 1: { away: side(A), home: side(B) } } });
  assert.equal(d.decision, WAITER.WAIT);
  assert.match(d.reasons.join(), /already in the committed simulation/);
});

test("a CHANGED fingerprint (late scratch) dispatches", () => {
  const scratched = [...B.slice(0, 8), 999];
  const d = decide({ nowIso: "2026-10-18T20:30:00Z", upstream: { 1: { away: A, home: scratched } }, committed: { 1: { away: side(A), home: side(B) } } });
  assert.equal(d.decision, WAITER.DISPATCH);
  assert.deepEqual(d.owed, [`1:home:${fp(scratched)}`]);
});

test("never twice for the same fingerprint (ledger), but a NEW change of the same side still dispatches", () => {
  const key = `1:away:${fp(A)}`;
  const ledger = { dispatches: [{ at: "2026-10-18T17:00:00Z", fingerprint: "x", sides: [key] }], alerted: [] };
  const d = decide({ upstream: { 1: { away: A, home: [] } }, ledger });
  assert.equal(d.decision, WAITER.WAIT);
  assert.match(d.reasons.join(), /never twice for the same fingerprint/);
  const d2 = decide({ upstream: { 1: { away: C, home: [] } }, ledger });
  assert.equal(d2.decision, WAITER.DISPATCH);
  assert.deepEqual(d2.owed, [`1:away:${fp(C)}`]);
});

// ── slate shapes ─────────────────────────────────────────────────────────────────────────────────────────────

test("multiple games with different first pitches: each opens its own window", () => {
  const games = [game(1, "2026-10-18T17:05:00Z"), game(2, "2026-10-18T23:10:00Z")];
  const upstream = { 1: { away: [], home: [] }, 2: { away: C, home: D } };
  const d = decide({ nowIso: "2026-10-18T15:00:00Z", games, upstream });
  assert.equal(d.games.find((g) => g.gamePk === 2).state, "BEFORE_WINDOW");
  assert.equal(d.decision, WAITER.WAIT, "game 2's posted lineups are not acted on before its window");
  const later = decide({ nowIso: "2026-10-18T19:30:00Z", games, upstream });
  assert.equal(later.decision, WAITER.DISPATCH);
  assert.equal(later.games.find((g) => g.gamePk === 1).state, "STARTED");
  assert.deepEqual(later.owed.map((k) => k.split(":")[0]), ["2", "2"]);
});

test("doubleheader: game 1 started is never dispatched; game 2 (TBD) is watched from game 1's time + offset", () => {
  const g1 = game(1, "2026-10-18T17:05:00Z", { doubleHeader: "Y", gameNumber: 1, awayTeamId: 5, homeTeamId: 6 });
  const g2 = game(2, "2026-10-18T17:05:00Z", { doubleHeader: "Y", gameNumber: 2, startTimeTBD: true, awayTeamId: 5, homeTeamId: 6 });
  const upstream = { 1: { away: A, home: B }, 2: { away: C, home: [] } };
  const d = decide({ nowIso: "2026-10-18T18:30:00Z", games: [g1, g2], upstream });
  const r1 = d.games.find((g) => g.gamePk === 1), r2 = d.games.find((g) => g.gamePk === 2);
  assert.equal(r1.state, "STARTED");
  assert.equal(r2.state, "WATCHING", "a TBD game is not 'started' by its placeholder time");
  assert.equal(r2.firstPitch, new Date(Date.parse("2026-10-18T17:05:00Z") + WAITER_LIMITS.TBD_GAME_OFFSET_MIN * 60_000).toISOString());
  assert.equal(d.decision, WAITER.DISPATCH);
  assert.deepEqual(d.owed, [`2:away:${fp(C)}`]);
  // Once StatsAPI says game 2 is Live, it is over for the waiter.
  const live = decide({ nowIso: "2026-10-18T20:00:00Z", games: [g1, { ...g2, abstractGameState: "Live" }], upstream });
  assert.equal(live.games.find((g) => g.gamePk === 2).state, "STARTED");
  assert.notEqual(live.decision, WAITER.DISPATCH);
});

test("postponement: a postponed game is never dispatched; a slate of only postponed games is DONE", () => {
  const pp = game(1, "2026-10-18T21:08:00Z", { abstractGameState: "Final", codedGameState: "D", detailedState: "Postponed" });
  const d = decide({ games: [pp], upstream: { 1: { away: A, home: B } } });
  assert.equal(d.decision, WAITER.DONE);
  assert.equal(d.games[0].state, "POSTPONED");
  const mixed = decide({ games: [pp, game(2, "2026-10-18T22:00:00Z")], upstream: { 1: { away: A, home: B }, 2: { away: C, home: [] } } });
  assert.equal(mixed.decision, WAITER.DISPATCH);
  assert.deepEqual(mixed.owed, [`2:away:${fp(C)}`]);
});

test("a game missing from the committed board is reported, never dispatched for (the refresh cannot simulate it)", () => {
  const d = decide({ games: [game(1, "2026-10-18T21:08:00Z"), game(2, "2026-10-18T22:08:00Z")], upstream: { 1: { away: [], home: [] }, 2: { away: C, home: D } }, boardFirstPitch: { 1: "2026-10-18T21:08:00Z" } });
  assert.equal(d.games.find((g) => g.gamePk === 2).state, "NOT_ON_BOARD");
  assert.equal(d.decision, WAITER.WAIT);
});

test("first-pitch change: the schedule is re-read each cycle, and the board's own clock is honoured", () => {
  const upstream = { 1: { away: A, home: [] } };
  // Moved LATER (19:05 → 23:05): the refresh judges "started" by the board's 19:05, so past it nothing can help.
  const later = game(1, "2026-10-18T23:05:00Z");
  const before = decide({ nowIso: "2026-10-18T18:50:00Z", games: [later], upstream, boardFirstPitch: { 1: "2026-10-18T19:05:00Z" } });
  assert.equal(before.decision, WAITER.DISPATCH, "15 min before the board's first pitch is still dispatchable");
  const after = decide({ nowIso: "2026-10-18T19:10:00Z", games: [later], upstream, boardFirstPitch: { 1: "2026-10-18T19:05:00Z" } });
  assert.notEqual(after.decision, WAITER.DISPATCH);
  // Moved EARLIER (21:08 → 18:05): the new time closes the window.
  const earlier = decide({ nowIso: "2026-10-18T18:00:00Z", games: [game(1, "2026-10-18T18:05:00Z")], upstream, boardFirstPitch: { 1: "2026-10-18T21:08:00Z" } });
  assert.notEqual(earlier.decision, WAITER.DISPATCH, "5 minutes to the moved first pitch is inside the cutoff");
  // Moved out of the window entirely (no board): not watched yet.
  const out = decide({ nowIso: "2026-10-18T18:00:00Z", games: [game(1, "2026-10-18T23:30:00Z")], upstream });
  assert.equal(out.games[0].state, "BEFORE_WINDOW");
  assert.equal(out.decision, WAITER.WAIT);
});

test("a game already started is never dispatched, and neither is one inside the T-10 cutoff", () => {
  const upstream = { 1: { away: A, home: B } };
  const started = decide({ nowIso: "2026-10-18T21:09:00Z", upstream });
  assert.notEqual(started.decision, WAITER.DISPATCH);
  assert.equal(started.games[0].state, "STARTED");
  const live = decide({ nowIso: "2026-10-18T20:00:00Z", upstream, games: [game(1, "2026-10-18T21:08:00Z", { abstractGameState: "Live" })] });
  assert.notEqual(live.decision, WAITER.DISPATCH, "StatsAPI Live overrides the clock");
  const cutoff = decide({ nowIso: "2026-10-18T21:00:00Z", upstream });
  assert.notEqual(cutoff.decision, WAITER.DISPATCH);
  assert.equal(cutoff.games[0].dispatchable, false);
});

// ── alerts ───────────────────────────────────────────────────────────────────────────────────────────────────

test("never-posted lineups: nothing to dispatch, then ALERT at first pitch, then DONE (once)", () => {
  const atT30 = decide({ nowIso: "2026-10-18T20:38:00Z" });
  assert.equal(atT30.decision, WAITER.WAIT);
  const atStart = decide({ nowIso: "2026-10-18T21:10:00Z" });
  assert.equal(atStart.decision, WAITER.ALERT);
  assert.equal(atStart.next, WAITER.DONE);
  assert.match(atStart.alerts[0].message, /started without a confirmed-lineup simulation for away \+ home/);
  const again = decide({ nowIso: "2026-10-18T21:20:00Z", ledger: { dispatches: [], alerted: atStart.alerts.map((a) => a.key) } });
  assert.equal(again.decision, WAITER.DONE, "an alert key already raised is never raised twice");
  const muchLater = decide({ nowIso: "2026-10-19T01:00:00Z" });
  assert.equal(muchLater.decision, WAITER.DONE, "a late arrival does not re-alert games long under way");
});

test("T-60: posted upstream but not in the simulation → ALERT (rides on a DISPATCH when one is possible)", () => {
  const upstream = { 1: { away: A, home: B } };
  const withDispatch = decide({ nowIso: "2026-10-18T20:15:00Z", upstream });
  assert.equal(withDispatch.decision, WAITER.DISPATCH);
  assert.equal(withDispatch.alerts.length, 2);
  const keys = [`1:away:${fp(A)}`, `1:home:${fp(B)}`];
  const attempted = decide({ nowIso: "2026-10-18T20:15:00Z", upstream, ledger: { dispatches: [{ at: "2026-10-18T19:00:00Z", sides: keys }], alerted: [] } });
  assert.equal(attempted.decision, WAITER.ALERT);
  assert.equal(attempted.next, WAITER.WAIT);
  assert.ok(attempted.alerts.every((a) => a.key.startsWith("t60:")));
});

test("a failed refresh (any trigger) on this slate → ALERT once", () => {
  const refreshRuns = [run(55, "2026-10-18T17:30:00Z", { conclusion: "failure" })];
  const d = decide({ refreshRuns });
  assert.equal(d.decision, WAITER.ALERT);
  assert.equal(d.alerts[0].key, "refresh-failed:55");
  const again = decide({ refreshRuns, ledger: { dispatches: [], alerted: ["refresh-failed:55"] } });
  assert.equal(again.decision, WAITER.WAIT);
  const yesterday = decide({ refreshRuns: [run(54, "2026-10-17T17:30:00Z", { conclusion: "failure" })] });
  assert.equal(yesterday.decision, WAITER.WAIT, "a past slate's failure is not this slate's alert");
});

test("a refresh that completed after our dispatch but did not take the lineup → stalled ALERT, no re-dispatch", () => {
  const key = `1:away:${fp(A)}`;
  const d = decide({ upstream: { 1: { away: A, home: [] } }, ledger: { dispatches: [{ at: "2026-10-18T17:30:00Z", sides: [key] }], alerted: [] },
    refreshRuns: [run(60, "2026-10-18T17:30:30Z", { event: "workflow_dispatch", updatedAt: "2026-10-18T17:32:00Z" })] });
  assert.equal(d.decision, WAITER.ALERT);
  assert.equal(d.alerts[0].key, `stalled:${key}`);
});

// ── limits and gates ─────────────────────────────────────────────────────────────────────────────────────────

test("the per-slate cap: six workflow_dispatch refreshes today → WAIT + one cap alert", () => {
  const refreshRuns = Array.from({ length: 6 }, (_, i) => run(i + 1, `2026-10-18T1${i}:00:00Z`, { event: "workflow_dispatch" }));
  const d = decide({ upstream: { 1: { away: A, home: [] } }, refreshRuns });
  assert.equal(d.decision, WAITER.ALERT);
  assert.equal(d.next, WAITER.WAIT);
  assert.equal(d.alerts[0].key, `cap:${DATE}`);
  const five = decide({ upstream: { 1: { away: A, home: [] } }, refreshRuns: refreshRuns.slice(0, 5) });
  assert.equal(five.decision, WAITER.DISPATCH);
  assert.equal(five.dispatchNumber, 6);
  const scheduled = decide({ upstream: { 1: { away: A, home: [] } }, refreshRuns: refreshRuns.map((r) => ({ ...r, event: "schedule" })) });
  assert.equal(scheduled.decision, WAITER.DISPATCH, "cron runs do not count against the dispatch cap");
  const lowered = decide({ upstream: { 1: { away: A, home: [] } }, refreshRuns: refreshRuns.slice(0, 2), limits: { MAX_DISPATCHES_PER_SLATE: 2 } });
  assert.notEqual(lowered.decision, WAITER.DISPATCH);
});

test("minimum spacing between dispatches (ledger or run list), with the wait computed", () => {
  const key = `1:home:${fp(B)}`;
  const d = decide({ upstream: { 1: { away: A, home: [] } }, ledger: { dispatches: [{ at: "2026-10-18T17:55:00Z", sides: [key] }], alerted: [] } });
  assert.equal(d.decision, WAITER.WAIT);
  assert.equal(d.waitSeconds, (WAITER_LIMITS.MIN_SPACING_MIN - 5) * 60);
  const viaRuns = decide({ upstream: { 1: { away: A, home: [] } }, refreshRuns: [run(9, "2026-10-18T17:50:00Z", { event: "workflow_dispatch", updatedAt: "2026-10-18T17:52:00Z" })] });
  assert.equal(viaRuns.decision, WAITER.WAIT);
  const spaced = decide({ upstream: { 1: { away: A, home: [] } }, ledger: { dispatches: [{ at: "2026-10-18T17:44:00Z", sides: [key] }], alerted: [] } });
  assert.equal(spaced.decision, WAITER.DISPATCH);
});

test("a gtp-generated-artifacts writer running or queued → WAIT (never dispatch into the queue)", () => {
  const up = { 1: { away: A, home: [] } };
  for (const status of ["in_progress", "queued", "pending"]) {
    const d = decide({ upstream: up, activeWriters: [{ workflowName: "mlb-daily-production", status }] });
    assert.equal(d.decision, WAITER.WAIT, status);
    assert.match(d.reasons.join(), /writer is/);
  }
  const unchecked = decide({ upstream: up, activeWriters: null });
  assert.equal(unchecked.decision, WAITER.WAIT);
  assert.equal(unchecked.needsWriterCheck, true, "an unchecked queue is not an empty queue");
});

test("a refresh in flight, or one that finished seconds ago, is waited out and re-decided", () => {
  const up = { 1: { away: A, home: [] } };
  const inflight = decide({ upstream: up, refreshRuns: [{ databaseId: 3, createdAt: "2026-10-18T17:58:00Z", status: "in_progress", event: "schedule" }] });
  assert.equal(inflight.decision, WAITER.WAIT);
  assert.match(inflight.reasons.join(), /in_progress/);
  const settling = decide({ upstream: up, refreshRuns: [run(4, "2026-10-18T17:57:00Z", { updatedAt: "2026-10-18T17:59:00Z" })] });
  assert.equal(settling.decision, WAITER.WAIT);
});

test("no board yet, and the ET-midnight guard, are WAITs", () => {
  assert.equal(decide({ upstream: { 1: { away: A, home: [] } }, boardPresent: false }).decision, WAITER.WAIT);
  const late = decide({ nowIso: "2026-10-19T03:45:00Z", games: [game(1, "2026-10-19T05:10:00Z")], upstream: { 1: { away: A, home: [] } } });
  assert.equal(late.decision, WAITER.WAIT);
  assert.match(late.reasons.join(), /ET-midnight/);
});

test("DONE after the last first pitch; DONE on an empty slate; never touches another date's games", () => {
  assert.equal(decide({ nowIso: "2026-10-18T21:08:00Z", ledger: { dispatches: [], alerted: [`started:${DATE}:1`] } }).decision, WAITER.DONE);
  assert.equal(decide({ games: [] }).decision, WAITER.DONE);
  const other = decide({ games: [game(1, "2026-10-19T21:08:00Z", { officialDate: "2026-10-19" })], upstream: { 1: { away: A, home: B } } });
  assert.equal(other.decision, WAITER.DONE, "a game whose official date is not this slate is not this slate's");
});

// ── idempotent resume ────────────────────────────────────────────────────────────────────────────────────────

test("IDEMPOTENT RESUME: a restarted run rebuilds the same answer from main, the run list and the recovered ledger", () => {
  const up = { 1: { away: A, home: [] } };
  const first = decide({ upstream: up });
  assert.equal(first.decision, WAITER.DISPATCH);
  // Run 1 printed its ledger line, dispatched, and died before the refresh landed.
  const entry = { kind: "dispatch", at: "2026-10-18T18:00:05Z", fingerprint: first.fingerprint, sides: first.owed, slate: DATE, n: 1 };
  const log = `wait\tWait for confirmed lineups\t2026-10-18T18:00:05.1Z ${LEDGER_MARK}${JSON.stringify(entry)}\nnoise ${LEDGER_MARK}{not json\n`;
  const ledger = parseLedgerLines(log);
  assert.equal(ledger.dispatches.length, 1);
  // (a) the refresh it dispatched is still running → wait;
  const r = { databaseId: 70, createdAt: "2026-10-18T18:00:06Z", event: "workflow_dispatch" };
  assert.equal(decide({ nowIso: "2026-10-18T18:05:00Z", upstream: up, ledger, refreshRuns: [{ ...r, status: "in_progress" }] }).decision, WAITER.WAIT);
  // (b) it committed the lineup → nothing owed, even with NO ledger at all (main is the record);
  const done = { 1: { away: side(A), home: side(null) } };
  for (const lg of [ledger, EMPTY_LEDGER]) {
    assert.equal(decide({ nowIso: "2026-10-18T18:30:00Z", upstream: up, committed: done, ledger: lg, refreshRuns: [{ ...r, status: "completed", conclusion: "success", updatedAt: "2026-10-18T18:02:00Z" }] }).decision, WAITER.WAIT);
  }
  // (c) without the ledger, the run list alone still enforces spacing and the cap.
  const noLedger = decide({ nowIso: "2026-10-18T18:05:00Z", upstream: up, refreshRuns: [{ ...r, status: "completed", conclusion: "success", updatedAt: "2026-10-18T18:01:30Z" }] });
  assert.equal(noLedger.decision, WAITER.WAIT);
  assert.match(noLedger.reasons.join(), /spacing/);
  // Same inputs, same answer: the decider has no hidden state.
  assert.deepEqual(decide({ upstream: up }), first);
});

test("recoverLedger reads only completed earlier runs of the waiter, and survives gh failing", () => {
  const entry = `${LEDGER_MARK}${JSON.stringify({ kind: "alert", key: "t60:x" })}`;
  const gh = { waiterRuns: () => [{ databaseId: 1, createdAt: "2026-10-18T12:00:00Z", status: "completed" }, { databaseId: 2, createdAt: "2026-10-18T17:00:00Z", status: "in_progress" }, { databaseId: 3, createdAt: "2026-10-18T17:30:00Z", status: "completed" }],
    runLog: (id) => (id === 1 ? entry : "") };
  assert.deepEqual(recoverLedger(gh, { nowMs: Date.parse("2026-10-18T18:00:00Z"), selfRunId: "3" }).alerted, ["t60:x"]);
  assert.deepEqual(recoverLedger({ waiterRuns: () => { throw new Error("gh down"); } }, { nowMs: 0 }), { dispatches: [], alerted: [] });
});

// ── the runner's seams ───────────────────────────────────────────────────────────────────────────────────────

test("--dry-run never dispatches: gh is never asked to run a workflow", () => {
  const calls = [];
  const gh = makeGh({ dryRun: true, exec: (args) => { calls.push(args); return "[]"; } });
  assert.deepEqual(gh.dispatchRefresh(), { dispatched: false, dryRun: true });
  assert.deepEqual(gh.relaySelf(), { dispatched: false, dryRun: true });
  assert.ok(!calls.some((a) => a[0] === "workflow"));
  const live = makeGh({ exec: (args) => { calls.push(args); return ""; } });
  live.dispatchRefresh();
  assert.deepEqual(calls.at(-1), ["workflow", "run", REFRESH_WORKFLOW, "--ref", "main"], "no inputs: the refresh resolves today's ET slate");
});

test("parseArgs: --now only with --dry-run; the budget stays under the job timeout", () => {
  assert.throws(() => parseArgs(["--now", "2026-10-18T18:00:00Z"]), /only accepted with --dry-run/);
  assert.equal(parseArgs(["--dry-run", "--now", "2026-10-18T18:00:00Z"]).now, "2026-10-18T18:00:00Z");
  assert.throws(() => parseArgs(["--budget-min", "400"]), /under the job timeout/);
  assert.throws(() => parseArgs(["--max-calls", "5000"]));
  assert.equal(parseArgs([]).maxCalls, WAITER_LIMITS.STATSAPI_CALL_CAP);
});

test("the StatsAPI call cap is hard (retries count)", async () => {
  let n = 0;
  const api = createStatsApi({ cap: 3, fetchImpl: async () => { n++; return { ok: n !== 1, status: 500, json: async () => ({}) }; } });
  await api.schedule(DATE); // 1 failure + 1 success = 2 calls
  await api.boxscore(1); // 3
  await assert.rejects(api.boxscore(2), CallCapReached);
  assert.equal(api.calls, 3);
});

test("decideOnce: boxscore only where the posted order moved; the writer queue only on a DISPATCH", async () => {
  const sched = { dates: [{ date: DATE, games: [
    { gamePk: 1, gameDate: "2026-10-18T21:08:00Z", officialDate: DATE, status: { abstractGameState: "Preview", codedGameState: "P", detailedState: "Pre-Game" }, teams: { away: { team: { id: 1 } }, home: { team: { id: 2 } } }, lineups: { awayPlayers: A.map((id) => ({ id })), homePlayers: B.map((id) => ({ id })) } },
    { gamePk: 2, gameDate: "2026-10-18T23:08:00Z", officialDate: DATE, status: { abstractGameState: "Preview", codedGameState: "P", detailedState: "Pre-Game" }, teams: { away: { team: { id: 3 } }, home: { team: { id: 4 } } } },
  ] }] };
  const box = [];
  const api = { schedule: async () => sched, boxscore: async (pk) => { box.push(pk); return { teams: { away: { battingOrder: A }, home: { battingOrder: [] } } }; } };
  let writerChecks = 0;
  const gh = { refreshRuns: () => [], activeWriters: () => { writerChecks++; return []; } };
  const rc = () => ({ boardPresent: true, boardFirstPitch: {}, committed: {} });
  const d = await decideOnce({ nowIso: "2026-10-18T18:00:00Z", date: DATE, api, gh, readCommitted: rc, writerFiles: [], ledger: EMPTY_LEDGER });
  assert.deepEqual(box, [1], "game 2 has nothing posted and is outside T-75 → no boxscore call");
  assert.equal(d.decision, WAITER.DISPATCH);
  assert.deepEqual(d.owed, [`1:away:${fp(A)}`], "the boxscore (the refresh's own source) overrides the schedule's home nine");
  assert.equal(writerChecks, 1);
  const quiet = await decideOnce({ nowIso: "2026-10-18T18:00:00Z", date: DATE, api, gh, readCommitted: () => ({ boardPresent: true, boardFirstPitch: {}, committed: { 1: { away: side(A), home: side(B) } } }), writerFiles: [], ledger: EMPTY_LEDGER });
  assert.equal(quiet.decision, WAITER.WAIT);
  assert.equal(writerChecks, 1, "no dispatch in view → the writer queue is not polled");
});

test("the writer set is read from the workflows: every gtp-generated-artifacts writer, mlb-lineup-refresh included", () => {
  const files = writerWorkflowFiles(path.join(REPO, ".github/workflows"));
  for (const f of ["mlb-lineup-refresh.yml", "mlb-daily-production.yml", "daily-products.yml", "nfl-event-window.yml"]) assert.ok(files.includes(f), f);
  assert.ok(!files.includes("mlb-lineup-waiter.yml"), "the waiter is not a writer");
  assert.ok(!files.includes("publication-watchdog.yml"));
});

// ── the workflow contract ────────────────────────────────────────────────────────────────────────────────────

const WF_TEXT = fs.readFileSync(path.join(REPO, ".github/workflows/mlb-lineup-waiter.yml"), "utf8");
const WF = yaml.load(WF_TEXT);
const ON = WF.on ?? WF[true];
const JOB = WF.jobs.wait;
const RUN = JOB.steps.map((s) => String(s.run ?? "")).join("\n");

test("CONTRACT: deduped, never cancelled; least privilege; under the 6-hour cap", () => {
  assert.deepEqual(WF.concurrency, { group: "mlb-lineup-waiter", "cancel-in-progress": false });
  assert.deepEqual(WF.permissions, { actions: "write", contents: "read" });
  assert.ok(JOB["timeout-minutes"] < 360 && JOB["timeout-minutes"] > 330, "the loop budget (330) fits inside the timeout, under GitHub's 360");
  assert.match(RUN, /--budget-min 330/);
  assert.match(RUN, /--max-calls 400/);
});

test("CONTRACT: the activation guard — nothing runs unless vars.MLB_LINEUP_WAITER_ENABLED == 'true' (dry run excepted)", () => {
  const cond = String(JOB.if);
  assert.match(cond, /vars\.MLB_LINEUP_WAITER_ENABLED == 'true'/);
  assert.match(cond, /github\.event_name == 'workflow_dispatch' && github\.event\.inputs\.dry_run == 'true'/);
  assert.match(cond, /head_branch == github\.event\.repository\.default_branch/, "workflow_run trust boundary");
  assert.match(RUN, /if \[ "\$\{DRY:-false\}" = "true" \]; then\s+node app\/scripts\/ops\/mlb-lineup-waiter\.mjs --dry-run --once/);
  assert.match(WF_TEXT, /ROLLBACK/);
  assert.match(WF_TEXT, /MERGING THIS FILE DOES NOT ACTIVATE IT/);
});

test("CONTRACT: triggers are the delivered clocks (workflow_run) plus crons as extras; dispatchable", () => {
  assert.deepEqual(ON.workflow_run.workflows, ["mlb-daily-production", "publication-watchdog"]);
  assert.deepEqual(ON.workflow_run.types, ["completed"]);
  assert.ok(ON.schedule.length >= 2);
  assert.ok("workflow_dispatch" in ON);
});

test("CONTRACT: writes nothing, spends nothing — no commit, no push, no provider key", () => {
  assert.doesNotMatch(RUN, /git (commit|push|add)/);
  assert.doesNotMatch(WF_TEXT, /ODDS_API|THE_ODDS|SPORTSDATA|API_KEY/);
  const secrets = [...WF_TEXT.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(secrets)], ["OPS_WEBHOOK_URL"], "the only secret is the existing ops webhook");
  assert.ok(!JOB.steps.some((s) => /npm ci/.test(String(s.run ?? ""))), "node builtins only — no install");
  const src = fs.readFileSync(path.join(REPO, "app/scripts/ops/mlb-lineup-waiter.mjs"), "utf8");
  assert.doesNotMatch(src, /writeFileSync\(|git", \["(commit|push)/, "the runner writes no file and no commit");
  assert.match(src, /statsapi\.mlb\.com/);
  assert.doesNotMatch(src, /the-odds-api|api\.the-odds|ODDS_API_KEY/);
});

test("CONTRACT: the only workflow the waiter dispatches is mlb-lineup-refresh (plus its own relay), with no inputs", () => {
  const src = fs.readFileSync(path.join(REPO, "app/scripts/ops/mlb-lineup-waiter.mjs"), "utf8");
  const runs = [...src.matchAll(/\["workflow", "run", (\w+), "--ref", "main"\]/g)].map((m) => m[1]);
  assert.deepEqual(runs.sort(), ["REFRESH_WORKFLOW", "SELF_WORKFLOW"]);
  assert.doesNotMatch(src, /"workflow", "run",[^\]]*"-f"/);
  // The refresh it dispatches keeps its own pre-event boundary and its writer queue.
  const refresh = yaml.load(fs.readFileSync(path.join(REPO, ".github/workflows/mlb-lineup-refresh.yml"), "utf8"));
  assert.equal(refresh.concurrency.group, "gtp-generated-artifacts");
  assert.ok("workflow_dispatch" in (refresh.on ?? refresh[true]));
});
