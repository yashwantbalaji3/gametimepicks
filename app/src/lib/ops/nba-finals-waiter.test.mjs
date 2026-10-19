/**
 * The NBA post-final waiter: the pure decider, the runner's injected seams, the workflow contract (activation guard,
 * trust boundary, least privilege), the Vercel build impact the activation plan states, and the fixture replay.
 * Run: npx tsx --test src/lib/ops/nba-finals-waiter.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import yaml from "js-yaml";

import {
  WAITER, WAITER_LIMITS, decideFinalsWaiter, normalizeScoreboard, committedFinals, finalFingerprint, nightOf, seasonOf,
  etDate, isFinalStatus, isOffStatus, adapterQuarantineReason,
} from "./nba-finals-waiter.mjs";
import {
  parseArgs, createEspnApi, CallCapReached, makeGh, parseLedgerLines, recoverLedger, decideOnce, gatherInputs, decideWith,
  needsNoLedger, emitAlert, dispatchWithRetry, waitForRefresh, recordObservations, emptyLedger, readCommitted,
  LEDGER_MARK, REFRESH_WORKFLOW, SELF_WORKFLOW, HARD_STOP_GRACE_MIN, MAX_LEDGER_LOG_FETCHES, CAP_RELAY_MIN_ELAPSED_MIN, REFRESH_WINDOW_DAYS,
} from "../../../scripts/ops/nba-finals-waiter.mjs";
import { replayNight, loadFixtures, snapshotAt } from "../../../scripts/ops/replay-nba-finals-waiter.mjs";
import { nbaSeasonLabel } from "../sports/nba/finals-record.mjs";

const REPO = path.resolve(process.cwd(), "..");
const FIX = path.join(REPO, "app/scripts/ops/fixtures/nba-finals-waiter");
const NIGHT = "2026-10-20";
const EMPTY = Object.freeze({ dispatches: [], alerted: [], finalSeen: [], regressions: [] });
const game = (id, tip, extra = {}) => ({ eventId: String(id), shortName: `G${id}`, tip, statusName: "STATUS_SCHEDULED", seasonType: 2, homeId: "1", awayId: "2", homeScore: 0, awayScore: 0, ...extra });
const final = (g, home, away, status = "STATUS_FINAL") => ({ ...g, statusName: status, homeScore: home, awayScore: away });
/** Opening night as ESPN lists it: BOS@DET 19:00Z, PHI@NY 23:00Z, OKC@SA 01:30Z (10-21). */
const G1 = game(401909088, "2026-10-20T19:00Z"), G2 = game(401909089, "2026-10-20T23:00Z"), G3 = game(401909090, "2026-10-21T01:30Z");
const key = (g) => `${g.eventId}:${finalFingerprint(g)}`;
const conf = (...gs) => Object.fromEntries(gs.map((g) => [g.eventId, g]));
const rec = (...ids) => committedFinals({ finals: ids.map((id) => ({ providerEventId: String(id) })), conflicts: [], refused: [] });
function inputs(over = {}) {
  return {
    nowIso: "2026-10-21T01:35:00Z", slateDate: NIGHT, games: [G1, G2, G3], committed: rec(G1.eventId),
    refreshRuns: [], ledger: EMPTY, ...over,
  };
}
const decide = (over) => decideFinalsWaiter(inputs(over));
const run = (id, createdAt, extra = {}) => ({ databaseId: id, createdAt, updatedAt: createdAt, status: "completed", conclusion: "success", event: "schedule", ...extra });
const F2 = final(G2, 118, 111);

// ── helpers and normalisation ────────────────────────────────────────────────────────────────────────────────

test("normalizeScoreboard reads the RECORDED ESPN day scoreboards (scheduled opening night; real preseason finals)", () => {
  const sched = normalizeScoreboard(JSON.parse(fs.readFileSync(path.join(FIX, "espn-nba-day-20261020.recorded.json"), "utf8")));
  assert.deepEqual(sched.map((g) => [g.eventId, g.tip, g.statusName]), [
    ["401909088", "2026-10-20T19:00Z", "STATUS_SCHEDULED"], ["401909089", "2026-10-20T23:00Z", "STATUS_SCHEDULED"], ["401909090", "2026-10-21T01:30Z", "STATUS_SCHEDULED"],
  ]);
  assert.ok(sched.every((g) => g.homeId && g.awayId && g.seasonType === 2));
  const fin = normalizeScoreboard(JSON.parse(fs.readFileSync(path.join(FIX, "espn-nba-day-20261016.trimmed.json"), "utf8")));
  assert.equal(fin.length, 12);
  assert.ok(fin.every((g) => isFinalStatus(g.statusName) && Number.isInteger(g.homeScore) && Number.isInteger(g.awayScore)));
  const cha = fin.find((g) => g.eventId === "401901822");
  assert.deepEqual([cha.homeScore, cha.awayScore], [116, 98], "MEM (home) 116 on ESPN today; the record holds 117 — its conflicts entry");
  assert.deepEqual(normalizeScoreboard({ events: [{ id: null }, { id: 5, competitions: [{ competitors: [{ homeAway: "home", score: "" }] }] }] }).map((g) => [g.eventId, g.homeScore]), [["5", null]]);
});

test("the night rolls over at 8 AM ET; ESPN's day scoreboard groups the 01:30Z tip on the US date; seasons agree with the finals record", () => {
  assert.equal(nightOf(Date.parse("2026-10-20T22:00:00Z")), "2026-10-20");
  assert.equal(nightOf(Date.parse("2026-10-21T04:30:00Z")), "2026-10-20", "12:30 AM ET is still the night of the 20th");
  assert.equal(nightOf(Date.parse("2026-10-21T11:59:00Z")), "2026-10-20");
  assert.equal(nightOf(Date.parse("2026-10-21T12:00:00Z")), "2026-10-21", "8 AM ET starts the next night");
  assert.equal(nightOf(Date.parse("2026-11-02T12:59:00Z")), "2026-11-01", "after the DST change (Nov 1) 8 AM EST is 13:00Z");
  assert.equal(nightOf(Date.parse("2026-11-02T13:00:00Z")), "2026-11-02");
  assert.equal(etDate(Date.parse("2026-10-21T01:30:00Z")), "2026-10-20");
  for (const d of ["2026-10-20", "2027-01-15", "2027-06-10", "2027-08-01"]) assert.equal(seasonOf(d), nbaSeasonLabel(d), d);
  assert.ok(isFinalStatus("STATUS_FINAL") && isFinalStatus("STATUS_FINAL_OT") && !isFinalStatus("STATUS_IN_PROGRESS") && !isFinalStatus(null));
  assert.ok(isOffStatus("STATUS_POSTPONED") && isOffStatus("STATUS_CANCELED") && !isOffStatus("STATUS_DELAYED"));
  assert.notEqual(finalFingerprint(final(G2, 118, 111)), finalFingerprint(final(G2, 118, 112)), "a corrected score is a new fingerprint");
  assert.equal(finalFingerprint(final(G2, 118, 111)), finalFingerprint(final(G2, 118, 111, "STATUS_FINAL_OT")), "the status label is not part of the final");
});

test("committedFinals on the REAL committed finals record: every ESPN final of 10-16 is recorded — nothing owed, the conflict game included", () => {
  const record = JSON.parse(fs.readFileSync(path.join(REPO, "app/public/data/nba/results/finals-2026-27.json"), "utf8"));
  const c = committedFinals(record);
  assert.equal(Object.keys(c.finals).length, record.finals.length);
  assert.ok(c.finals["401901822"] && c.held["401901822"], "401901822 is recorded AND has a conflicts entry");
  const games = normalizeScoreboard(JSON.parse(fs.readFileSync(path.join(FIX, "espn-nba-day-20261016.trimmed.json"), "utf8")));
  const d = decideFinalsWaiter({ nowIso: "2026-10-17T05:00:00Z", slateDate: "2026-10-16", games, committed: c, refreshRuns: [], ledger: EMPTY });
  assert.equal(d.decision, WAITER.DONE);
  assert.ok(d.games.every((g) => g.state === "RECORDED"), "a recorded final stands even when ESPN now shows another score (write-once; the refresh records the conflict)");
});

// ── the window ───────────────────────────────────────────────────────────────────────────────────────────────

test("before any game is near its end it sleeps to the window (earliest unfinished tip + 100 min)", () => {
  const d = decide({ nowIso: "2026-10-20T22:05:00Z" });
  assert.equal(d.decision, WAITER.WAIT);
  assert.equal(d.games.find((g) => g.eventId === G2.eventId).opensAt, "2026-10-21T00:40:00.000Z");
  assert.equal(d.waitSeconds, (155 * 60), "22:05 → 00:40");
  assert.ok(!d.leaveToLaterTrigger);
  // BOS@DET not recorded yet and in progress at 20:00 — its window (20:40) is the first.
  const early = decide({ nowIso: "2026-10-20T20:00:00Z", committed: rec(), games: [{ ...G1, statusName: "STATUS_IN_PROGRESS" }, G2, G3] });
  assert.equal(early.waitSeconds, 40 * 60);
});

test("an arrival more than HORIZON_MIN before the first window exits and leaves the watch to a later trigger", () => {
  const d = decide({ nowIso: "2026-10-20T12:30:00Z", committed: rec() });
  assert.equal(d.decision, WAITER.WAIT);
  assert.equal(d.leaveToLaterTrigger, true);
  assert.equal(WAITER_LIMITS.HORIZON_MIN, 330);
  assert.equal(needsNoLedger(d), true, "the runner exits without reading earlier logs");
});

test("inside the window with nothing final: poll every 5 minutes", () => {
  const d = decide({ nowIso: "2026-10-21T00:45:00Z", games: [G1, { ...G2, statusName: "STATUS_IN_PROGRESS" }, G3] });
  assert.equal(d.decision, WAITER.WAIT);
  assert.equal(d.waitSeconds, WAITER_LIMITS.POLL_SECONDS);
  assert.equal(WAITER_LIMITS.POLL_SECONDS, 300);
});

// ── owed → dispatch ──────────────────────────────────────────────────────────────────────────────────────────

test("a final on ESPN not in the committed record → confirm on the month feed → DISPATCH (only that game is owed)", () => {
  const first = decide({ games: [G1, F2, G3] });
  assert.equal(first.decision, WAITER.WAIT);
  assert.equal(first.needsConfirm, true, "the cheap gates pass; the month scoreboard is read last");
  assert.deepEqual(first.observations.finalSeen.map((x) => x.eventId), [G2.eventId], "first sighting is recorded for the 45-min alert");
  const d = decide({ games: [G1, F2, G3], confirm: conf(F2) });
  assert.equal(d.decision, WAITER.DISPATCH);
  assert.deepEqual(d.owed, [key(F2)]);
  assert.equal(d.dispatchNumber, 1);
});

test("the month feed (the refresh's transport) not showing the final yet → WAIT, never a futile dispatch", () => {
  const d = decide({ games: [G1, F2, G3], confirm: conf({ ...G2, statusName: "STATUS_IN_PROGRESS" }) });
  assert.equal(d.decision, WAITER.WAIT);
  assert.equal(d.waitSeconds, 120);
  assert.match(d.reasons.join(), /month scoreboard/);
  const otherScore = decide({ games: [G1, F2, G3], confirm: conf(final(G2, 118, 109)) });
  assert.equal(otherScore.decision, WAITER.WAIT, "a different final on the month feed is not this fingerprint");
});

test("DEDUPE: never twice for one final — in flight, or landed and recorded; a landed refresh that did not take it is STALLED (alert, no loop)", () => {
  const k = key(F2);
  const led = { ...EMPTY, dispatches: [{ at: "2026-10-21T01:35:00Z", sides: [k] }] };
  const inflight = decide({ nowIso: "2026-10-21T01:36:00Z", games: [G1, F2, G3], ledger: led, refreshRuns: [run("W1", "2026-10-21T01:35:05Z", { status: "in_progress", conclusion: null, event: "workflow_dispatch" })] });
  assert.equal(inflight.decision, WAITER.WAIT);
  assert.equal(inflight.games.find((g) => g.eventId === G2.eventId).attempt, "pending");
  const recorded = decide({ nowIso: "2026-10-21T01:45:00Z", games: [G1, F2, G3], ledger: led, committed: rec(G1.eventId, G2.eventId), refreshRuns: [run("W1", "2026-10-21T01:35:05Z", { updatedAt: "2026-10-21T01:36:30Z", event: "workflow_dispatch" })] });
  assert.equal(recorded.games.find((g) => g.eventId === G2.eventId).state, "RECORDED");
  assert.notEqual(recorded.decision, WAITER.DISPATCH);
  const stalledIn = { nowIso: "2026-10-21T01:45:00Z", games: [G1, F2, final(G3, 1, 2, "STATUS_IN_PROGRESS")], ledger: led, refreshRuns: [run("W1", "2026-10-21T01:35:05Z", { updatedAt: "2026-10-21T01:36:30Z", event: "workflow_dispatch" })] };
  const stalled = decide(stalledIn);
  assert.notEqual(stalled.decision, WAITER.DISPATCH);
  assert.ok(stalled.alerts.some((a) => a.key === `stalled:${k}`));
  // The alert is raised once: with it in the ledger the same state is a quiet WAIT, and never a dispatch.
  const again = decide({ ...stalledIn, ledger: { ...led, alerted: [`stalled:${k}`] } });
  assert.equal(again.decision, WAITER.WAIT);
  assert.equal(again.alerts.length, 0);
});

test("RETRY: a dispatched refresh that ended cancelled/failed is retried once (alert), then alerted as exhausted", () => {
  const k = key(F2);
  const cancelled = (id, at) => run(id, at, { event: "workflow_dispatch", conclusion: "cancelled", updatedAt: at });
  const one = decide({ nowIso: "2026-10-21T01:50:00Z", games: [G1, F2, G3], confirm: conf(F2), ledger: { ...EMPTY, dispatches: [{ at: "2026-10-21T01:35:00Z", sides: [k] }] }, refreshRuns: [cancelled("W1", "2026-10-21T01:35:05Z")] });
  assert.equal(one.decision, WAITER.DISPATCH);
  assert.ok(one.alerts.some((a) => a.key === `lost:${k}`));
  const failed = run("W2", "2026-10-21T01:50:05Z", { event: "workflow_dispatch", conclusion: "failure", updatedAt: "2026-10-21T01:51:00Z" });
  const two = decide({ nowIso: "2026-10-21T02:05:00Z", games: [G1, F2, G3], confirm: conf(F2), ledger: { ...EMPTY, dispatches: [{ at: "2026-10-21T01:35:00Z", sides: [k] }, { at: "2026-10-21T01:50:00Z", sides: [k] }], alerted: [`lost:${k}`] }, refreshRuns: [cancelled("W1", "2026-10-21T01:35:05Z"), failed] });
  assert.notEqual(two.decision, WAITER.DISPATCH, `bounded: MAX_ATTEMPTS_PER_KEY = ${WAITER_LIMITS.MAX_ATTEMPTS_PER_KEY}`);
  assert.ok(two.alerts.some((a) => a.key === `retry-exhausted:${k}`));
  assert.ok(two.alerts.some((a) => a.key === "refresh-failed:W2"), "a failed refresh is alerted on its own");
});

test("SPACING: at least 10 minutes between dispatches (run list or ledger), with the wait computed", () => {
  const F3 = final(G3, 121, 119);
  const d = decide({ nowIso: "2026-10-21T04:06:00Z", games: [G1, { ...F2 }, F3], committed: rec(G1.eventId, G2.eventId), confirm: conf(F3), refreshRuns: [run("W1", "2026-10-21T04:02:00Z", { event: "workflow_dispatch", updatedAt: "2026-10-21T04:03:10Z" })] });
  assert.equal(d.decision, WAITER.WAIT);
  assert.match(d.reasons.join(), /spacing is 10 min/);
  assert.equal(d.waitSeconds, 6 * 60);
  const viaLedger = decide({ nowIso: "2026-10-21T04:06:00Z", games: [G1, F2, F3], committed: rec(G1.eventId, G2.eventId), confirm: conf(F3), ledger: { ...EMPTY, dispatches: [{ at: "2026-10-21T04:01:00Z", sides: ["x:y"] }] } });
  assert.equal(viaLedger.decision, WAITER.WAIT);
  assert.equal(WAITER_LIMITS.MIN_SPACING_MIN, 10);
});

test("CAP: six workflow_dispatch refreshes tonight → WAIT + one cap alert; ledger-only dispatches count; last night's do not", () => {
  const runs = Array.from({ length: 6 }, (_, i) => run(`W${i}`, new Date(Date.parse("2026-10-20T20:00:00Z") + i * 30 * 60_000).toISOString(), { event: "workflow_dispatch", updatedAt: "2026-10-20T23:00:00Z" }));
  const d = decide({ games: [G1, F2, G3], confirm: conf(F2), refreshRuns: runs });
  assert.notEqual(d.decision, WAITER.DISPATCH);
  assert.ok(d.alerts.some((a) => a.key === `cap:${NIGHT}`));
  const ledgerOnly = decide({ games: [G1, F2, G3], confirm: conf(F2), ledger: { ...EMPTY, dispatches: runs.map((r) => ({ at: r.createdAt, sides: ["a:b"] })) } });
  assert.notEqual(ledgerOnly.decision, WAITER.DISPATCH, "a lost run list cannot lift the cap");
  const lastNight = runs.map((r, i) => ({ ...r, createdAt: `2026-10-20T0${i}:00:00Z`, updatedAt: `2026-10-20T0${i}:01:00Z` }));
  assert.equal(decide({ games: [G1, F2, G3], confirm: conf(F2), refreshRuns: lastNight }).decision, WAITER.DISPATCH, "00–05Z on the 20th belongs to the night of the 19th");
  assert.equal(WAITER_LIMITS.MAX_DISPATCHES_PER_NIGHT, 6);
});

test("IN-FLIGHT: never dispatch while any nba-results-refresh run is queued or in progress (cron or manual); a just-finished one settles first", () => {
  for (const status of ["queued", "in_progress", "waiting", "pending"]) {
    const d = decide({ games: [G1, F2, G3], confirm: conf(F2), refreshRuns: [run(1, "2026-10-21T01:34:00Z", { status, conclusion: null })] });
    assert.equal(d.decision, WAITER.WAIT, status);
    assert.equal(d.waitSeconds, 60);
  }
  const settling = decide({ games: [G1, F2, G3], confirm: conf(F2), refreshRuns: [run(1, "2026-10-21T01:33:00Z", { updatedAt: "2026-10-21T01:34:30Z" })] });
  assert.equal(settling.decision, WAITER.WAIT);
  assert.match(settling.reasons.join(), /re-deciding on its push/);
});

test("POSTPONED / CANCELLED games are never watched; a night of only postponed games is DONE", () => {
  const d = decide({ committed: rec(), games: [{ ...G1, statusName: "STATUS_POSTPONED" }, { ...G2, statusName: "STATUS_CANCELED" }, { ...G3, statusName: "STATUS_POSTPONED" }] });
  assert.equal(d.decision, WAITER.DONE);
  assert.ok(d.games.every((g) => g.state === "POSTPONED"));
  const mixed = decide({ games: [G1, { ...G2, statusName: "STATUS_POSTPONED" }, final(G3, 100, 99)], confirm: conf(final(G3, 100, 99)) });
  assert.equal(mixed.decision, WAITER.DISPATCH);
  assert.deepEqual(mixed.owed, [key(final(G3, 100, 99))]);
});

test("ESPN REGRESSION FINAL → IN: no dispatch while it is not final, one alert, and the attempt before it expires — not a false stall", () => {
  const k = key(F2);
  const seen = { eventId: G2.eventId, at: "2026-10-21T01:35:00Z" };
  const dispatchedLanded = { ...EMPTY, finalSeen: [seen], dispatches: [{ at: "2026-10-21T01:35:00Z", sides: [k] }] };
  // The refresh ran while ESPN had already taken the final back (it captured IN): it landed, the record lacks it.
  const runs = [run("W1", "2026-10-21T01:35:05Z", { updatedAt: "2026-10-21T01:36:30Z", event: "workflow_dispatch" })];
  const back = decide({ nowIso: "2026-10-21T01:40:00Z", games: [G1, { ...G2, statusName: "STATUS_IN_PROGRESS" }, G3], ledger: dispatchedLanded, refreshRuns: runs });
  assert.notEqual(back.decision, WAITER.DISPATCH);
  assert.deepEqual(back.observations.regressed.map((x) => x.eventId), [G2.eventId]);
  assert.ok(back.alerts.some((a) => a.key.startsWith(`regress:${G2.eventId}:`)));
  // Once the regression is recorded (as the runner does), the game going final again is owed afresh.
  const ledger = { ...dispatchedLanded, regressions: [{ eventId: G2.eventId, at: "2026-10-21T01:40:00Z" }], alerted: back.alerts.map((a) => a.key) };
  const finalAgain = decide({ nowIso: "2026-10-21T01:50:00Z", games: [G1, F2, G3], confirm: conf(F2), ledger, refreshRuns: runs });
  assert.equal(finalAgain.decision, WAITER.DISPATCH);
  assert.ok(!finalAgain.alerts.some((a) => a.key.startsWith("stalled:")), "no false stall alert");
  assert.deepEqual(finalAgain.observations.finalSeen.map((x) => x.eventId), [G2.eventId], "a new final episode starts its own 45-min clock");
  // Without a regression record the same history is a stall (alert), never a second dispatch.
  const noRegress = decide({ nowIso: "2026-10-21T01:50:00Z", games: [G1, F2, G3], confirm: conf(F2), ledger: dispatchedLanded, refreshRuns: runs });
  assert.notEqual(noRegress.decision, WAITER.DISPATCH);
  // The regression is observed once per final episode, not every cycle.
  const recorded = { ...ledger };
  const stillIn = decide({ nowIso: "2026-10-21T01:45:00Z", games: [G1, { ...G2, statusName: "STATUS_IN_PROGRESS" }, G3], ledger: recorded, refreshRuns: runs });
  assert.deepEqual(stillIn.observations.regressed, []);
  assert.equal(stillIn.alerts.filter((a) => a.key.startsWith("regress:")).length, 0);
});

test("HELD: a final the record REFUSED or holds under review in `conflicts` → one alert, never a dispatch, and the night ends (no infinite dispatch)", () => {
  const refused = committedFinals({ finals: [{ providerEventId: G1.eventId }], refused: [{ providerEventId: G2.eventId, reason: "home: team id 18 is NY but the row says NYK — identity disagrees, not recorded" }], conflicts: [] });
  const F3 = final(G3, 121, 119);
  const cycles = [];
  let ledger = { ...EMPTY };
  for (const now of ["2026-10-21T04:10:00Z", "2026-10-21T04:15:00Z", "2026-10-21T04:20:00Z"]) {
    const d = decide({ nowIso: now, games: [G1, F2, F3], committed: { ...refused, finals: { ...refused.finals, [G3.eventId]: {} } }, confirm: conf(F2, F3), ledger });
    cycles.push(d);
    ledger = { ...ledger, alerted: [...ledger.alerted, ...d.alerts.map((a) => a.key)] };
  }
  assert.ok(cycles.every((d) => d.decision !== WAITER.DISPATCH));
  assert.equal(cycles[0].games.find((g) => g.eventId === G2.eventId).state, "HELD");
  assert.equal(cycles.flatMap((d) => d.alerts).filter((a) => a.key === `held:${G2.eventId}`).length, 1, "alerted once");
  assert.equal(cycles[2].decision, WAITER.DONE);
  const conflicted = committedFinals({ finals: [], refused: [], conflicts: [{ providerEventId: G2.eventId, note: "the recorded final stands; review before any correction" }] });
  const c = decide({ games: [G1, F2, G3], committed: { ...conflicted, finals: { [G1.eventId]: {} } }, confirm: conf(F2) });
  assert.notEqual(c.decision, WAITER.DISPATCH);
  assert.match(c.alerts.find((a) => a.key === `held:${G2.eventId}`).message, /conflicts/);
});

test("LATE: final on ESPN for 45 min and still not committed → one alert (rides on a DISPATCH when one is possible)", () => {
  const ledger = { ...EMPTY, finalSeen: [{ eventId: G2.eventId, at: "2026-10-21T00:50:00Z" }] };
  const d = decide({ nowIso: "2026-10-21T01:35:00Z", games: [G1, F2, G3], confirm: conf(F2), ledger });
  assert.equal(d.decision, WAITER.DISPATCH);
  assert.ok(d.alerts.some((a) => a.key === `late:${key(F2)}` && /45 min/.test(a.message)));
  const before = decide({ nowIso: "2026-10-21T01:34:00Z", games: [G1, F2, G3], confirm: conf(F2), ledger });
  assert.ok(!before.alerts.some((a) => a.key.startsWith("late:")), "44 min is not late yet");
  assert.equal(WAITER_LIMITS.NOT_COMMITTED_ALERT_MIN, 45);
});

test("a corrected score on ESPN is a NEW fingerprint (owed again), never the old key re-dispatched", () => {
  const old = key(F2);
  const corrected = final(G2, 118, 112);
  const runs = [run("W1", "2026-10-21T01:35:05Z", { updatedAt: "2026-10-21T01:36:30Z", event: "workflow_dispatch" })];
  const d = decide({ nowIso: "2026-10-21T01:50:00Z", games: [G1, corrected, G3], confirm: conf(corrected), refreshRuns: runs, ledger: { ...EMPTY, dispatches: [{ at: "2026-10-21T01:35:00Z", sides: [old] }] } });
  assert.equal(d.decision, WAITER.DISPATCH);
  assert.deepEqual(d.owed, [key(corrected)]);
});

test("GIVE UP: a game still not final 8 h after tip is alerted once and the night ends", () => {
  const d = decide({ nowIso: "2026-10-21T09:31:00Z", committed: rec(G1.eventId, G2.eventId), games: [G1, F2, { ...G3, statusName: "STATUS_IN_PROGRESS" }] });
  assert.equal(d.next, WAITER.DONE);
  assert.ok(d.alerts.some((a) => a.key === `giveup:${NIGHT}:${G3.eventId}`));
});

test("INPUTS: an empty scoreboard while the committed schedule lists tonight's games is an input failure, not DONE; invalid timestamps never throw", () => {
  const scheduleTips = { [G2.eventId]: { tip: G2.tip, seasonType: 2 } };
  const empty = decide({ games: [], scheduleTips });
  assert.equal(empty.decision, WAITER.WAIT);
  assert.equal(empty.inputSuspect, true);
  assert.equal(decide({ games: [], scheduleTips: null }).decision, WAITER.DONE);
  assert.equal(decide({ nowIso: "2026-10-21T08:00:00Z", games: [], scheduleTips }).decision, WAITER.DONE, "every listed game long over");
  assert.doesNotThrow(() => decide({ games: [G1, F2, G3], refreshRuns: [{ databaseId: 9, status: "completed", conclusion: "failure", createdAt: null }], ledger: { ...EMPTY, dispatches: [{ at: null, sides: ["a:b"] }, { at: "garbage", sides: ["c:d"] }], finalSeen: [{ eventId: G2.eventId, at: "bad" }] } }));
  assert.throws(() => decideFinalsWaiter({ nowIso: "nope" }), /nowIso required/);
  assert.equal(adapterQuarantineReason(F2, {}), "no committed schedule capture carries this event id (no schedule lineage)");
  assert.equal(adapterQuarantineReason(final(G2, 100, 100), { [G2.eventId]: { seasonType: 2 } }), "final 100-100 is tied");
  assert.equal(adapterQuarantineReason(F2, { [G2.eventId]: { seasonType: 2 } }), null);
});

test("DONE once every game of the night is recorded; a game of another date on the scoreboard is never this night's", () => {
  assert.equal(decide({ committed: rec(G1.eventId, G2.eventId, G3.eventId) }).decision, WAITER.DONE);
  const stray = decide({ committed: rec(G1.eventId, G2.eventId, G3.eventId), games: [G1, G2, G3, final(game(1, "2026-10-21T23:00Z"), 1, 2)] });
  assert.equal(stray.decision, WAITER.DONE);
});

// ── the runner's seams ───────────────────────────────────────────────────────────────────────────────────────

test("ACTIVATION F1: the runner forces --dry-run --once unless NBA_FINALS_WAITER_ENABLED is exactly 'true'", () => {
  for (const v of [undefined, "", "false", "True", "TRUE", " true", "true ", "1", "yes"]) {
    const a = parseArgs(["--relay", "--budget-min", "330"], { NBA_FINALS_WAITER_ENABLED: v });
    assert.deepEqual([a.dryRun, a.once, a.relay, a.forcedDryRun], [true, true, false, true], String(v));
  }
  const live = parseArgs(["--relay"], { NBA_FINALS_WAITER_ENABLED: "true" });
  assert.deepEqual([live.dryRun, live.once, live.relay, live.forcedDryRun], [false, false, true, undefined]);
  assert.equal(parseArgs(["--dry-run", "--once"], {}).forcedDryRun, undefined, "an asked-for dry run is not 'forced'");
  assert.throws(() => parseArgs(["--now", "2026-10-21T01:00:00Z"], { NBA_FINALS_WAITER_ENABLED: "true" }), /only accepted with --dry-run/);
  assert.throws(() => parseArgs(["--budget-min", "400"], { NBA_FINALS_WAITER_ENABLED: "true" }), /under the job timeout/);
  assert.throws(() => parseArgs(["--max-dispatches", "40"], {}));
  assert.throws(() => parseArgs(["--date", "20261020"], {}));
  assert.equal(parseArgs([], {}).maxCalls, WAITER_LIMITS.ESPN_CALL_CAP);
});

test("--dry-run never dispatches; a live dispatch is exactly `gh workflow run nba-results-refresh.yml --ref main` (no inputs)", () => {
  const calls = [];
  const gh = makeGh({ dryRun: true, exec: (args) => { calls.push(args); return "[]"; } });
  assert.deepEqual(gh.dispatchRefresh(), { dispatched: false, dryRun: true });
  assert.deepEqual(gh.relaySelf(), { dispatched: false, dryRun: true });
  assert.ok(!calls.some((a) => a[0] === "workflow"));
  const live = makeGh({ exec: (args) => { calls.push(args); return ""; } });
  live.dispatchRefresh();
  assert.deepEqual(calls.at(-1), ["workflow", "run", REFRESH_WORKFLOW, "--ref", "main"]);
  live.relaySelf();
  assert.deepEqual(calls.at(-1), ["workflow", "run", SELF_WORKFLOW, "--ref", "main"]);
});

test("the ESPN call cap is hard (retries count); a 200 whose body stalls is bounded by the timeout; a payload without events is an error", async () => {
  let n = 0;
  const api = createEspnApi({ cap: 3, fetchImpl: async () => { n++; return { ok: n !== 1, status: 500, json: async () => ({ events: [] }) }; } });
  await api.day(NIGHT); // 1 failure + 1 success
  await api.day(NIGHT);
  await assert.rejects(api.day(NIGHT), CallCapReached);
  assert.equal(api.calls, 3);
  let m = 0;
  const slow = createEspnApi({ timeoutMs: 30, fetchImpl: async () => { m++; return { ok: true, status: 200, json: () => (m === 1 ? new Promise(() => {}) : Promise.resolve({ events: [] })) }; } });
  assert.deepEqual(await slow.day(NIGHT), { events: [] });
  assert.equal(slow.calls, 2);
  const bad = createEspnApi({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ nope: 1 }) }) });
  await assert.rejects(bad.day(NIGHT), /no events array/);
  const urls = [];
  const win = createEspnApi({ fetchImpl: async (u) => { urls.push(u); return { ok: true, status: 200, json: async () => ({ events: [{ id: "1", date: "2026-10-20T23:00Z" }, { id: "2", date: "2026-09-01T23:00Z" }] }) }; } });
  const w = await win.refreshWindow(Date.parse("2026-10-21T01:35:00Z"));
  assert.deepEqual(urls, ["https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=202610&limit=1000"], "the refresh's own month transport");
  assert.deepEqual(w.events.map((e) => e.id), ["1"], `filtered to the refresh's ${REFRESH_WINDOW_DAYS}-day window`);
  const day = [];
  await createEspnApi({ fetchImpl: async (u) => { day.push(u); return { ok: true, status: 200, json: async () => ({ events: [] }) }; } }).day(NIGHT);
  assert.deepEqual(day, ["https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261020"]);
});

test("the capture's window and transport match what this confirm reads (capture-nba-results.mjs)", () => {
  const src = fs.readFileSync(path.join(REPO, "app/scripts/nba/capture-nba-results.mjs"), "utf8");
  assert.match(src, /arg\("--days", "9"\)/);
  assert.match(src, /fetchScoreboardWindowEvents\("basketball\/nba", d0, d1\)/);
  assert.match(src, /\/\^STATUS_FINAL\/\.test/);
});

test("ledger lines: dispatch / attempt / alert / final-seen / regress round-trip; dry-run lines and garbage are ignored", () => {
  const L = (o) => `${LEDGER_MARK}${JSON.stringify(o)}`;
  const text = [
    L({ kind: "attempt", at: "2026-10-21T01:35:00Z", fingerprint: "f1", sides: ["a:1"] }),
    L({ kind: "dispatch", at: "2026-10-21T01:35:01Z", fingerprint: "f1", sides: ["a:1"] }),
    L({ kind: "attempt", at: "2026-10-21T02:00:00Z", fingerprint: "f2", sides: ["b:2"] }),
    L({ kind: "alert", key: "late:a:1", at: "2026-10-21T02:00:00Z" }),
    L({ kind: "alert", key: "dry", dryRun: true }),
    L({ kind: "final-seen", eventId: "401909089", at: "2026-10-21T01:31:00Z" }),
    L({ kind: "regress", eventId: "401909089", at: "2026-10-21T01:33:00Z" }),
    L({ kind: "final-seen", eventId: "x", at: "bad" }),
    `${LEDGER_MARK}{not json`,
  ].join("\n");
  const l = parseLedgerLines(text);
  assert.equal(l.dispatches.length, 2);
  assert.equal(l.dispatches.find((d) => d.fingerprint === "f2").unconfirmed, true, "an attempt with no dispatch line is unconfirmed");
  assert.deepEqual(l.alerted, ["late:a:1"]);
  assert.deepEqual(l.finalSeen, [{ eventId: "401909089", at: "2026-10-21T01:31:00Z" }]);
  assert.deepEqual(l.regressions, [{ eventId: "401909089", at: "2026-10-21T01:33:00Z" }]);
  // An unconfirmed attempt blocks only once a refresh run appeared after it.
  const k = key(F2);
  const att = parseLedgerLines(L({ kind: "attempt", at: "2026-10-21T01:30:00Z", fingerprint: "f", sides: [k] }));
  assert.equal(decide({ games: [G1, F2, G3], confirm: conf(F2), ledger: att }).decision, WAITER.DISPATCH);
  assert.notEqual(decide({ games: [G1, F2, G3], confirm: conf(F2), ledger: att, refreshRuns: [run(3, "2026-10-21T01:30:02Z", { status: "in_progress", conclusion: null, event: "workflow_dispatch" })] }).decision, WAITER.DISPATCH);
});

test("recordObservations: in memory always; ledger lines only for a live run", () => {
  const out = [];
  const orig = console.log;
  console.log = (x) => out.push(String(x));
  const d = { slateDate: NIGHT, observations: { finalSeen: [{ eventId: "1", at: "2026-10-21T01:31:00Z" }], regressed: [{ eventId: "2", at: "2026-10-21T01:32:00Z" }] } };
  const dry = emptyLedger(), live = emptyLedger();
  try {
    recordObservations(d, dry, { dryRun: true });
    recordObservations(d, live, { dryRun: false });
  } finally { console.log = orig; }
  assert.equal(dry.finalSeen.length + dry.regressions.length, 2);
  assert.equal(live.finalSeen.length + live.regressions.length, 2);
  const parsed = parseLedgerLines(out.join("\n"));
  assert.equal(parsed.finalSeen.length + parsed.regressions.length, 2, "exactly the live run's two lines");
});

test("RECOVERY: lists 100 runs, skips skipped / in-progress / old / self, reads ran-for-sure runs first, at most MAX_LEDGER_LOG_FETCHES logs; survives gh failing", () => {
  const listed = [], views = [];
  const runs = [];
  for (let i = 0; i < 60; i++) runs.push({ databaseId: 1000 - i, createdAt: new Date(Date.parse("2026-10-21T03:00:00Z") - i * 60_000).toISOString(), status: "completed", conclusion: i % 2 ? "cancelled" : "skipped" });
  runs.push({ databaseId: 1, createdAt: "2026-10-20T22:05:00Z", status: "completed", conclusion: "success" });
  runs.push({ databaseId: 2, createdAt: "2026-10-19T01:00:00Z", status: "completed", conclusion: "success" });
  runs.push({ databaseId: 3, createdAt: "2026-10-21T03:30:00Z", status: "in_progress", conclusion: null });
  const exec = (args) => {
    if (args[1] === "list") { listed.push(args); return JSON.stringify(runs); }
    views.push(args[2]);
    if (args[2] === "1") return `${LEDGER_MARK}${JSON.stringify({ kind: "dispatch", at: "2026-10-21T01:35:00Z", fingerprint: "f", sides: ["401909089:x"] })}`;
    throw new Error("no logs");
  };
  const got = recoverLedger(makeGh({ exec, dryRun: true }), { nowMs: Date.parse("2026-10-21T03:40:00Z"), selfRunId: "0" });
  assert.equal(listed[0][listed[0].indexOf("--limit") + 1], "100");
  assert.equal(got.dispatches.length, 1);
  assert.equal(views[0], "1");
  assert.ok(!views.includes("2") && !views.includes("3"), "older than 36 h / not completed: never read");
  assert.ok(views.length <= MAX_LEDGER_LOG_FETCHES);
  assert.deepEqual(recoverLedger({ waiterRuns: () => { throw new Error("gh down"); } }, { nowMs: 0 }), emptyLedger());
});

test("LAZY LEDGER: 'too early' and 'nothing tonight' exits never need it; anything with an owed final or an alert does", () => {
  assert.equal(needsNoLedger(decide({ nowIso: "2026-10-20T12:30:00Z", committed: rec() })), true);
  assert.equal(needsNoLedger(decide({ committed: rec(G1.eventId, G2.eventId, G3.eventId) })), true);
  assert.equal(needsNoLedger(decide({ games: [G1, F2, G3] })), false);
  assert.equal(needsNoLedger(decide({ nowIso: "2026-10-21T09:31:00Z", committed: rec(G1.eventId, G2.eventId), games: [G1, F2, { ...G3, statusName: "STATUS_IN_PROGRESS" }] })), false, "a DONE with an alert needs the ledger's dedupe");
  assert.equal(needsNoLedger(decide({ nowIso: "2026-10-20T22:05:00Z" })), false, "sleeping to a window inside the horizon is a watch");
});

test("decideOnce: one day call per cycle, the month confirm only when a final is owed, and at most once per gather", async () => {
  let day = 0, month = 0;
  const payload = (g) => ({ events: [g].map((x) => ({ id: x.eventId, date: x.tip, shortName: x.shortName, season: { type: 2 }, status: { type: { name: x.statusName } }, competitions: [{ competitors: [{ homeAway: "home", score: String(x.homeScore), team: { id: x.homeId } }, { homeAway: "away", score: String(x.awayScore), team: { id: x.awayId } }] }] })) });
  const api = { day: async () => { day++; return payload(F2); }, refreshWindow: async () => { month++; return payload(F2); } };
  const gh = { refreshRuns: () => [] };
  const rc = () => ({ committed: rec(), scheduleTips: null });
  const d = await decideOnce({ nowIso: "2026-10-21T01:35:00Z", date: NIGHT, api, gh, readCommitted: rc, ledger: EMPTY });
  assert.equal(d.decision, WAITER.DISPATCH);
  assert.deepEqual([day, month], [1, 1]);
  const base = await gatherInputs({ nowIso: "2026-10-21T01:35:00Z", date: NIGHT, api, gh, readCommitted: rc });
  await decideWith(base, { api, ledger: EMPTY });
  await decideWith(base, { api, ledger: EMPTY }); // the runner's re-decide after recovering the ledger
  assert.deepEqual([day, month], [2, 2], "the second decide reuses the confirm");
  const quiet = await decideOnce({ nowIso: "2026-10-21T01:35:00Z", date: NIGHT, api: { day: async () => payload({ ...G2, statusName: "STATUS_IN_PROGRESS" }), refreshWindow: async () => { month++; return { events: [] }; } }, gh, readCommitted: rc, ledger: EMPTY });
  assert.equal(quiet.decision, WAITER.WAIT);
  assert.equal(month, 2, "nothing owed → the month scoreboard is not read");
});

test("readCommitted reads the season's finals record and the union of the committed schedule captures", () => {
  const c = readCommitted(REPO, NIGHT);
  assert.equal(c.season, "2026-27");
  assert.ok(c.committed.present && Object.keys(c.committed.finals).length >= 67);
  assert.equal(c.scheduleTips["401909089"].tip, "2026-10-20T23:00Z", "opening night's PHI@NY has schedule lineage");
});

test("emitAlert: dry-run alerts record no ledger line (never suppressing the live webhook); live ones do; both go to ops_alert.sh", () => {
  const out = [];
  const spawned = [];
  const orig = console.log;
  console.log = (x) => out.push(String(x));
  try {
    emitAlert({ key: "late:k", message: "m" }, { slateDate: NIGHT, dryRun: true, spawn: (...a) => spawned.push(a) });
    emitAlert({ key: "late:live", message: "m" }, { slateDate: NIGHT, dryRun: false, spawn: (...a) => spawned.push(a) });
  } finally { console.log = orig; }
  assert.deepEqual(parseLedgerLines(out.join("\n")).alerted, ["late:live"]);
  assert.ok(out.some((l) => l.startsWith("::warning::nba-finals-waiter (dry run) m")));
  assert.equal(spawned.length, 2);
  assert.match(spawned[0][1][0], /scripts\/ops_alert\.sh$/);
  assert.equal(spawned[0][2].env.OPS_ALERT_PRINT_ONLY, "1");
  assert.equal(spawned[1][2].env.OPS_ALERT_PRINT_ONLY, undefined);
  assert.equal(spawned[1][2].env.PHASE, "nba-finals-waiter");
  assert.equal(spawned[1][2].env.OPS_ALERT_KIND, "warning");
});

test("dispatchWithRetry retries a failing gh and never re-dispatches once the run list shows the dispatch was accepted", async () => {
  let calls = 0;
  const flaky = { dispatchRefresh: () => { calls++; if (calls < 2) throw new Error("HTTP 502"); }, refreshRuns: () => [] };
  assert.deepEqual(await dispatchWithRetry(flaky, { sleep: async () => {} }), { dispatched: true });
  let sent = 0;
  const lost = { dispatchRefresh: () => { sent++; throw new Error("timeout"); }, refreshRuns: () => [{ event: "workflow_dispatch", createdAt: new Date(Date.now() + 1000).toISOString() }] };
  assert.deepEqual(await dispatchWithRetry(lost, { sleep: async () => {} }), { dispatched: true, inferred: true });
  assert.equal(sent, 1);
  const down = { dispatchRefresh: () => { throw new Error("down"); }, refreshRuns: () => { throw new Error("down"); } };
  assert.equal((await dispatchWithRetry(down, { sleep: async () => {} })).dispatched, false);
});

test("BUDGET: the post-dispatch wait never sleeps past the budget; budget + hard stop + setup fits the job timeout", async () => {
  for (const left of [0, 30_000, 5 * 60_000, 60 * 60_000]) {
    let t = 0;
    const slept = await waitForRefresh({ refreshRuns: () => [{ status: "queued" }] }, { sleep: async (x) => { t += x; }, remainingMs: () => Math.max(0, left - t) });
    assert.ok(slept <= left, `${left}: slept ${slept}`);
  }
  let t = 0, polls = 0;
  await waitForRefresh({ refreshRuns: () => (++polls < 3 ? [{ status: "in_progress" }] : [{ status: "completed" }]) }, { sleep: async (x) => { t += x; }, remainingMs: () => 3600_000 });
  assert.equal(t, 45_000 + 2 * 60_000);
  assert.ok(330 + HARD_STOP_GRACE_MIN + 3 <= JOB["timeout-minutes"]);
  assert.ok(CAP_RELAY_MIN_ELAPSED_MIN >= 15);
  const src = fs.readFileSync(path.join(REPO, "app/scripts/ops/nba-finals-waiter.mjs"), "utf8");
  assert.match(src, /stop === "CAP" && elapsedMin\(\) >= CAP_RELAY_MIN_ELAPSED_MIN\) relay\(/);
  assert.match(src, /try \{\s*if \(a\.pull\) pull\(\);\s*again = await decideNow\(\);/, "the pre-dispatch re-decide on fresh main is inside a try");
  assert.match(src, /const res = await dispatchWithRetry\(gh\);/);
});

// ── the workflow contract ────────────────────────────────────────────────────────────────────────────────────

const WF_TEXT = fs.readFileSync(path.join(REPO, ".github/workflows/nba-finals-waiter.yml"), "utf8");
const WF = yaml.load(WF_TEXT);
const ON = WF.on ?? WF[true];
const JOB = WF.jobs.wait;
const RUN = JOB.steps.map((s) => String(s.run ?? "")).join("\n");

test("CONTRACT: deduped, never cancelled, dry runs in their own group; least privilege; under the 6-hour cap", () => {
  assert.equal(WF.concurrency["cancel-in-progress"], false);
  assert.equal(WF.concurrency.group, "${{ github.event_name == 'workflow_dispatch' && github.event.inputs.dry_run == 'true' && 'nba-finals-waiter-dry' || 'nba-finals-waiter' }}");
  assert.deepEqual(WF.permissions, { actions: "write", contents: "read" });
  assert.ok(JOB["timeout-minutes"] < 360 && JOB["timeout-minutes"] > 330);
  assert.match(RUN, /--budget-min 330/);
  assert.match(RUN, /--max-calls 200/);
  assert.match(RUN, /--max-dispatches 6/);
  assert.ok(!JOB.concurrency, "never in gtp-generated-artifacts or the refresh's own group");
});

test("CONTRACT: the activation guard — nothing runs unless vars.NBA_FINALS_WAITER_ENABLED == 'true' (dry run excepted); workflow_run trust boundary", () => {
  const cond = String(JOB.if);
  assert.match(cond, /vars\.NBA_FINALS_WAITER_ENABLED == 'true'/);
  assert.match(cond, /github\.event_name == 'workflow_dispatch' && github\.event\.inputs\.dry_run == 'true'/);
  assert.match(cond, /github\.event_name != 'workflow_run' \|\|\s*github\.event\.workflow_run\.head_branch == github\.event\.repository\.default_branch/);
  assert.equal(ON.workflow_dispatch.inputs.dry_run.type, "boolean");
  assert.equal(ON.workflow_dispatch.inputs.dry_run.default, false);
  const step = JOB.steps.find((s) => /--relay/.test(String(s.run ?? "")));
  assert.equal(step.env.NBA_FINALS_WAITER_ENABLED, "${{ vars.NBA_FINALS_WAITER_ENABLED }}", "the runner re-checks the variable itself");
  assert.match(step.run, /if \[ "\$\{NBA_FINALS_WAITER_ENABLED:-\}" = "true" \]; then/);
  assert.match(step.run, /tr '\[:upper:\]' '\[:lower:\]'/);
  assert.match(step.run, /else\s+node app\/scripts\/ops\/nba-finals-waiter\.mjs --dry-run --once\s+fi/);
  assert.match(WF_TEXT, /MERGING THIS FILE DOES NOT ACTIVATE IT/);
  assert.match(WF_TEXT, /ROLLBACK/);
  assert.match(WF_TEXT, /docs\/launch\/approvals\/NBA_FINALS_WAITER_ACTIVATION\.md/);
  assert.ok(fs.existsSync(path.join(REPO, "docs/launch/approvals/NBA_FINALS_WAITER_ACTIVATION.md")));
});

test("GUARD (executed): every case variant of the variable and the input — no disabled path runs live; any-case dry_run is dry", () => {
  const ghEq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase(); // "GitHub ignores case when comparing strings."
  const jobIf = (enabled, dry) => ghEq(enabled, "true") || ghEq(dry, "true");
  const step = JOB.steps.find((s) => /nba-finals-waiter\.mjs/.test(String(s.run ?? "")));
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "nba-waiter-guard-"));
  fs.writeFileSync(path.join(bin, "node"), "#!/bin/sh\necho \"$@\"\n", { mode: 0o755 });
  const shell = (enabled, dry) => {
    const r = spawnSync("bash", ["-c", step.run], { encoding: "utf8", env: { PATH: `${bin}:${process.env.PATH}`, NBA_FINALS_WAITER_ENABLED: enabled, DRY: dry } });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.includes("--dry-run") && r.stdout.includes("--once") && !r.stdout.includes("--relay") ? "dry" : "live";
  };
  try {
    const cases = [];
    for (const enabled of ["", "false", "True", "TRUE", "tRuE", " true", "true"]) for (const dry of ["", "false", "true", "True", "TRUE", "tRuE"]) cases.push([enabled, dry]);
    assert.deepEqual(cases.filter(([e, d]) => jobIf(e, d) && e !== "true" && shell(e, d) === "live"), [], "a disabled waiter reached the live loop");
    assert.deepEqual(cases.filter(([, d]) => ghEq(d, "true") && shell("true", d) === "live"), [], "a dry_run of any case must be dry");
    assert.equal(shell("true", "false"), "live");
    assert.equal(shell("true", ""), "live", "enabled + a workflow_run/schedule trigger (no input) → the live loop");
  } finally { fs.rmSync(bin, { recursive: true, force: true }); }
});

test("CONTRACT: triggers are the delivered clocks (publication-watchdog, nba-forecast-window) plus best-effort crons; dispatchable", () => {
  assert.deepEqual(ON.workflow_run.workflows, ["publication-watchdog", "nba-forecast-window"]);
  assert.deepEqual(ON.workflow_run.types, ["completed"]);
  assert.deepEqual(ON.schedule.map((s) => s.cron), ["47 21 * * *", "47 23 * * *", "47 1 * * *"]);
  assert.ok("workflow_dispatch" in ON);
});

test("CONTRACT: writes nothing, spends nothing — no commit, no push, no provider key, no install", () => {
  assert.doesNotMatch(RUN, /git (commit|push|add)/);
  assert.doesNotMatch(WF_TEXT, /ODDS_API|THE_ODDS|SPORTSDATA|API_KEY/);
  assert.deepEqual([...new Set([...WF_TEXT.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]))], ["OPS_WEBHOOK_URL"]);
  assert.ok(!JOB.steps.some((s) => /npm (ci|install)/.test(String(s.run ?? ""))), "node builtins only — no install");
  for (const f of ["app/scripts/ops/nba-finals-waiter.mjs", "app/src/lib/ops/nba-finals-waiter.mjs"]) {
    const src = fs.readFileSync(path.join(REPO, f), "utf8");
    assert.doesNotMatch(src, /writeFileSync\(|git", \["(commit|push|add)/, `${f} writes no file and no commit`);
    assert.doesNotMatch(src, /the-odds-api|ODDS_API_KEY/);
    // Bare node on the runner: only node builtins and dependency-free repo modules.
    for (const [, spec] of src.matchAll(/^import .* from "([^"]+)";$/gm)) assert.ok(spec.startsWith("node:") || spec.startsWith("."), `${f} imports ${spec}`);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(REPO, "app/src/lib/sports/espn-scoreboard-window.mjs"), "utf8"), /^import /m, "the shared ESPN window module stays import-free");
});

test("CONTRACT: the only workflows the waiter dispatches are nba-results-refresh (no inputs) and its own relay; the refresh keeps its own writer rules", () => {
  const src = fs.readFileSync(path.join(REPO, "app/scripts/ops/nba-finals-waiter.mjs"), "utf8");
  const runs = [...src.matchAll(/\["workflow", "run", (\w+), "--ref", "main"\]/g)].map((m) => m[1]);
  assert.deepEqual(runs.sort(), ["REFRESH_WORKFLOW", "SELF_WORKFLOW"]);
  assert.doesNotMatch(src, /"workflow", "run",[^\]]*"-f"/);
  const refresh = yaml.load(fs.readFileSync(path.join(REPO, ".github/workflows/nba-results-refresh.yml"), "utf8"));
  const ron = refresh.on ?? refresh[true];
  assert.equal(ron.workflow_dispatch.inputs.dry_run.default, "false", "a no-input dispatch is a live refresh");
  assert.equal(refresh.concurrency.group, "nba-results-refresh");
  assert.equal(refresh.concurrency["cancel-in-progress"], false);
  const step = refresh.jobs.refresh.steps.map((s) => String(s.run ?? "")).join("\n");
  assert.match(step, /git add "\$RESULTS\/"/, "the refresh stages only app/public/data/nba/results/");
  assert.match(step, /build-nba-finals-record\.mjs/);
  assert.match(String(refresh.jobs.refresh.if), /head_branch == github\.event\.repository\.default_branch/);
});

// ── the build impact the activation plan states ──────────────────────────────────────────────────────────────

test("VERCEL: a refresh commit under app/public/data/nba/results BUILDS; the waiter's own files (workflow, test) do not", () => {
  const script = path.join(REPO, "app/scripts/vercel-ignore-build.sh");
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "nba-waiter-vercel-"));
  const git = (...args) => { const r = spawnSync("git", args, { cwd: repo, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const commit = (files) => { for (const [rel, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); fs.writeFileSync(path.join(repo, rel), c); } git("add", "-A"); git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "c", "--no-gpg-sign"); return git("rev-parse", "HEAD"); };
  const ignore = (base) => spawnSync("bash", [script], { cwd: path.join(repo, "app"), encoding: "utf8", env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: base, VERCEL_PROJECT_PRODUCTION_URL: "", VERCEL_FORCE_BUILD: "" } }).status;
  try {
    git("init", "-q");
    const base = commit({ "app/package.json": "{}", "app/public/data/nba/results/finals-2026-27.json": "{}\n", "app/public/data/nba/results/latest.json": "{}\n", "README.md": "x" });
    const wf = commit({ ".github/workflows/nba-finals-waiter.yml": "name: x\n", "app/src/lib/ops/nba-finals-waiter.test.mjs": "// t\n" });
    assert.equal(ignore(base), 0, "the waiter's workflow and test are not build inputs");
    commit({ "app/public/data/nba/results/finals-2026-27.json": "{\"finals\":[1]}\n", "app/public/data/nba/results/latest.json": "{\"rows\":[1]}\n" });
    assert.equal(ignore(wf), 1, "a recorded final is a Production build");
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

// ── the fixture replay ───────────────────────────────────────────────────────────────────────────────────────

test("REPLAY (recorded fixtures, synthetic opening night): ≤ 1 dispatch per game, finals recorded within minutes, DONE", async () => {
  const r = await replayNight();
  assert.equal(r.stop, "DONE");
  for (const g of r.games) assert.ok(g.waiterDispatches <= 1, `${g.eventId}: ${g.waiterDispatches} dispatches`);
  const by = Object.fromEntries(r.games.map((g) => [g.eventId, g]));
  assert.equal(by["401909088"].waiterDispatches, 0, "BOS@DET ends in the dense watchdog hours — a delivered refresh records it first");
  for (const id of ["401909089", "401909090"]) {
    assert.equal(by[id].waiterDispatches, 1);
    assert.ok(by[id].withWaiter - by[id].espnFinal <= 10 * 60_000, `${id} recorded ${(by[id].withWaiter - by[id].espnFinal) / 60_000} min after the final`);
    assert.ok(by[id].withWaiter < by[id].cronOnly, `${id}: earlier than the delivered crons`);
  }
  assert.ok(by["401909089"].cronOnly - by["401909089"].espnFinal > 120 * 60_000, "the measured cron gap leaves PHI@NY unpublished for hours without the waiter");
  assert.equal(r.dispatches.length, 2);
  assert.equal(r.alerts.length, 0);
  assert.ok(r.calls.day + r.calls.month <= WAITER_LIMITS.ESPN_CALL_CAP);
  assert.ok(r.relays >= 1, "the 330-min budget relays once across the night");
});

test("REPLAY variants: a cancelled waiter refresh is retried once (≤ 2 for that game); an arrival at 12:30Z leaves the watch to a later trigger", async () => {
  const r = await replayNight({ failDispatched: 1 });
  const phi = r.games.find((g) => g.eventId === "401909089");
  assert.equal(phi.waiterDispatches, 2);
  assert.ok(r.alerts.some((a) => a.key.startsWith("lost:401909089:")));
  assert.ok(Number.isFinite(phi.withWaiter) && phi.withWaiter - phi.espnFinal <= 30 * 60_000);
  assert.ok(r.games.every((g) => g.waiterDispatches <= WAITER_LIMITS.MAX_ATTEMPTS_PER_KEY));
  const early = await replayNight({ start: "2026-10-20T12:30:00Z" });
  assert.equal(early.stop, "LATER");
  assert.equal(early.calls.day, 1);
  const fx = loadFixtures();
  const snap = normalizeScoreboard(snapshotAt(fx.scheduled, fx.timeline, Date.parse("2026-10-21T01:32:00Z"), { month: true }));
  assert.equal(snap.find((g) => g.eventId === "401909089").statusName, "STATUS_HALFTIME", "the month feed lags the day feed by the fixture's monthLagSec");
});
