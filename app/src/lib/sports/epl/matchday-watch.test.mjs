/**
 * EPL matchday-watch guards.
 *
 * This decides whether a silently-skipped cron gets noticed. Its failure mode is quiet in both
 * directions — a watchdog that never fires looks identical to a healthy pipeline, and one that fires
 * on non-matchdays gets muted, which comes to the same thing.
 *
 * Run: npx tsx --test src/lib/sports/epl/matchday-watch.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { eplMatchdayWatch } from "./matchday-watch.mjs";

const fx = (...iso) => iso.map((k) => ({ kickoffIso: k }));
const NOW = "2026-08-21T14:30:00Z";           // the watchdog's slot, Friday
const KICKOFF = "2026-08-21T19:00:00Z";       // 4.5h later

test("a skipped run on a matchday is MISSED and dispatches", () => {
  const r = eplMatchdayWatch({ fixtures: fx(KICKOFF), nowIso: NOW, ranToday: false });
  assert.equal(r.state, "MISSED");
  assert.equal(r.shouldDispatch, true);
  assert.match(r.reason, /silently stale/);
});

test("a run that happened on a matchday is RAN and stays quiet", () => {
  const r = eplMatchdayWatch({ fixtures: fx(KICKOFF), nowIso: NOW, ranToday: true, forecastGeneratedAt: "2026-08-21T14:01:00Z" });
  assert.equal(r.state, "RAN");
  assert.equal(r.shouldDispatch, false);
});

test("a quiet week is NOT an alert — silence is the correct answer between matchweeks", () => {
  /* The failure that mutes a watchdog is firing when nothing is due. */
  const r = eplMatchdayWatch({ fixtures: fx("2026-08-28T19:00:00Z"), nowIso: NOW, ranToday: false });
  assert.equal(r.state, "TOO_EARLY");
  assert.equal(r.shouldDispatch, false);
  const none = eplMatchdayWatch({ fixtures: [], nowIso: NOW, ranToday: false });
  assert.equal(none.state, "NO_UPCOMING_FIXTURE");
  assert.equal(none.shouldDispatch, false);
});

test("MATCHDAY IS DERIVED FROM FIXTURES, not from the weekday", () => {
  /*
   * A watchdog keyed to "it's Friday" goes quiet in exactly the weeks the schedule is unusual — a
   * moved kickoff, a cup week, a TV reschedule. A Wednesday fixture must arm it identically.
   */
  const wed = eplMatchdayWatch({ fixtures: fx("2026-08-26T19:00:00Z"), nowIso: "2026-08-26T14:30:00Z", ranToday: false });
  assert.equal(wed.state, "MISSED", "a midweek fixture arms the watch exactly like a Saturday one");
});

test("a past kickoff never arms the watch", () => {
  const r = eplMatchdayWatch({ fixtures: fx("2026-08-21T09:00:00Z"), nowIso: NOW, ranToday: false });
  assert.equal(r.state, "NO_UPCOMING_FIXTURE", "a match already kicked off is not something a forecast run can still serve");
});

test("the nearest kickoff drives the decision, not the list order", () => {
  const r = eplMatchdayWatch({ fixtures: fx("2026-08-24T19:00:00Z", KICKOFF, "2026-08-23T13:00:00Z"), nowIso: NOW, ranToday: false });
  assert.equal(r.state, "MISSED");
  assert.ok(Math.abs(r.hoursToKickoff - 4.5) < 0.01, "must measure to the SOONEST fixture");
});

test("a run that happened but left a stale forecast is caught — running is not producing", () => {
  /*
   * The repeated failure in this repo is not a job that fails; it is a job that succeeds and writes
   * nothing. `ranToday` alone would call that healthy.
   */
  const r = eplMatchdayWatch({ fixtures: fx(KICKOFF), nowIso: NOW, ranToday: true, forecastGeneratedAt: "2026-08-19T14:00:00Z" });
  assert.equal(r.state, "STALE_FORECAST");
  assert.equal(r.shouldDispatch, true);
});

test("leadHours is honoured at its boundary", () => {
  const within = eplMatchdayWatch({ fixtures: fx("2026-08-21T22:00:00Z"), nowIso: NOW, ranToday: false, leadHours: 8 });
  assert.equal(within.state, "MISSED", "7.5h out with an 8h lead is due");
  const outside = eplMatchdayWatch({ fixtures: fx("2026-08-21T23:00:00Z"), nowIso: NOW, ranToday: false, leadHours: 8 });
  assert.equal(outside.state, "TOO_EARLY", "8.5h out is not yet due");
});
