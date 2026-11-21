/**
 * EPL current-results adapter guards (Program 154 · Release A).
 *
 * Run: npx tsx --test src/lib/soccer/epl-current-results.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { loadCurrentEplResults } from "./epl-current-results.mjs";

const NOW_PRESEASON = "2026-08-10T20:00:00Z";
const NOW_SEASON = "2026-08-22T22:00:00Z";
const FIXTURES = { rows: [
  // Real canonical ids from the committed capture convention (same builder both sides).
  { eventId: "soccer:epl:arsenal-v-coventry-city:20260821t1900", homeClub: "Arsenal", awayClub: "Coventry City", kickoffIso: "2026-08-21T19:00:00Z", matchweek: 1 },
  // NOTE: canonical ids SORT participants (order must not matter) — chelsea before fulham.
  { eventId: "soccer:epl:chelsea-v-fulham:20260824t1900", homeClub: "Fulham", awayClub: "Chelsea", kickoffIso: "2026-08-24T19:00:00Z", matchweek: 1 },
] };

/*
 * DISK TRUTH — the committed capture must be honest about ITSELF.
 *
 * This test used to assert `state === "PRESEASON"` and `rowCount === 0` against the live artifact.
 * That held until 2026-08-21, when Arsenal played Coventry and the capture correctly recorded a
 * finished match. The guard then went red because THE PRODUCT WORKED — the fourth time in this
 * codebase a test pinned to today's data has reported a success as a regression.
 *
 * So it no longer pins a season phase. It pins the two things that would actually be defects: the
 * artifact disagreeing with its own row count (a fabricated or dropped match), and the adapter
 * deriving a different state from the artifact than the artifact declares. PRESEASON is still held
 * to zero rows — that direction of the claim never expires, because a preseason capture with
 * results in it is a fabrication no matter what the date is.
 */
test("DISK TRUTH · the committed capture agrees with itself and with the adapter", () => {
  const a = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "soccer", "epl", "results", "latest.json"), "utf8"));
  assert.equal(a.dataClass, "RESULTS_CAPTURE");

  const rows = Array.isArray(a.rows) ? a.rows : [];
  assert.equal(a.rowCount, rows.length, "the declared row count must match the rows actually carried");

  // The one-way claim that outlives any date: no matchweek invented before the season starts.
  if (a.state === "PRESEASON") {
    assert.equal(a.rowCount, 0, "no fabricated matchweek, no 0-0 placeholders");
  }

  // Read at the artifact's own stamp, so freshness cannot be what is under test here.
  const out = loadCurrentEplResults({ nowIso: a.generatedAt });
  assert.equal(out.state, a.state, "the adapter must not silently re-classify the committed capture");
  if (out.state === "PRESEASON") assert.equal(out.results.length, 0);
});

test("NOT_CONFIGURED when no artifact — the adapter says so instead of inventing an empty slate", () => {
  const out = loadCurrentEplResults({ nowIso: NOW_PRESEASON, artifact: null });
  assert.equal(out.state, "NOT_CONFIGURED");
  assert.match(out.note, /capture-epl-results/);
});

test("SOURCE_STALE when stamps exceed the window — an outage never reads as an empty slate", () => {
  const out = loadCurrentEplResults({ nowIso: "2026-08-14T20:00:00Z", artifact: { seasonStart: "2026-08-21", sourceAsOf: "2026-08-10T00:00:00Z", rows: [] } });
  assert.equal(out.state, "SOURCE_STALE");
});

test("RESULTS · completed fixtures join by CANONICAL identity, grade through the contract, reconcile exactly once", () => {
  const artifact = {
    seasonStart: "2026-08-21", sourceAsOf: NOW_SEASON,
    rows: [
      { providerEventId: "espn-1", dateUtc: "2026-08-21T19:00:00Z", home: "Arsenal", away: "Coventry City", ftHome: 2, ftAway: 0, statusRaw: "STATUS_FULL_TIME" },
      { providerEventId: "espn-dup", dateUtc: "2026-08-21T19:00:00Z", home: "Arsenal", away: "Coventry City", ftHome: 2, ftAway: 0, statusRaw: "STATUS_FULL_TIME" },
      { providerEventId: "espn-unjoined", dateUtc: "2026-08-22T14:00:00Z", home: "Everton", away: "Liverpool", ftHome: 1, ftAway: 1, statusRaw: "STATUS_FULL_TIME" },
      { providerEventId: "espn-badgoals", dateUtc: "2026-08-24T19:00:00Z", home: "Fulham", away: "Chelsea", ftHome: null, ftAway: 2, statusRaw: "STATUS_FULL_TIME" },
      { providerEventId: "espn-unresolved", dateUtc: "2026-08-22T16:00:00Z", home: "Some New Club", away: "Chelsea", ftHome: 1, ftAway: 0, statusRaw: "STATUS_FULL_TIME" },
    ],
  };
  const out = loadCurrentEplResults({ nowIso: NOW_SEASON, artifact, fixtures: FIXTURES });
  assert.equal(out.state, "RESULTS");
  assert.equal(out.results.length, 1, "only the cleanly joined result settles");
  assert.equal(out.results[0].canonicalEventId, "soccer:epl:arsenal-v-coventry-city:20260821t1900");
  assert.equal(out.results[0].contractCheck, "WIN", "the settlement contract is exercised at ingest");
  assert.equal(out.quarantined.length, 4);
  assert.ok(out.quarantined.some((q) => /exactly once/.test(q.reason)), "duplicate consumption refused");
  assert.ok(out.quarantined.some((q) => /unjoined/.test(q.reason)), "a result without a scheduled fixture never settles");
  assert.ok(out.quarantined.some((q) => /StatsAPI lesson/.test(q.reason)), "completed without integer goals quarantines");
  assert.ok(out.quarantined.some((q) => /identity/.test(q.reason)), "an unresolvable club refuses, never fuzzy-joins");
  assert.equal(out.reconciliation.exact, true, "joined + quarantined = completed, no silent drops");
});

test("one malformed row never throws the slate — the adapter is total", () => {
  const out = loadCurrentEplResults({ nowIso: NOW_SEASON, artifact: { seasonStart: "2026-08-21", sourceAsOf: NOW_SEASON, rows: [{ providerEventId: "x", dateUtc: "not-a-date", home: "Arsenal", away: "Chelsea", ftHome: 1, ftAway: 0, statusRaw: "STATUS_FULL_TIME" }] }, fixtures: FIXTURES });
  assert.equal(out.state, "RESULTS");
  assert.equal(out.results.length, 0);
  assert.equal(out.quarantined.length, 1);
});

/*
 * MW10 GRADING BREAK (2026-11-12): the only fixture capture carries placeholder 15:00Z kickoffs, so a match ESPN played
 * at another minute has a different canonical id on the result. The result still reaches its fixture on the stable key
 * — the club pair, the same home club, a kickoff within PAIR_JOIN_WINDOW_DAYS — and says how it joined.
 */
const PLACEHOLDER = { rows: [
  { eventId: "soccer:epl:coventry-city-v-everton:20261107t1500", homeClub: "Everton", awayClub: "Coventry City", kickoffIso: "2026-11-07T15:00:00Z", matchweek: 10 },
  { eventId: "soccer:epl:coventry-city-v-everton:20270410t1400", homeClub: "Coventry City", awayClub: "Everton", kickoffIso: "2027-04-10T14:00:00Z", matchweek: 32 },
] };
const NOW_MW10 = "2026-11-07T02:00:00Z";
const mw10 = (row) => loadCurrentEplResults({ nowIso: NOW_MW10, artifact: { seasonStart: "2026-08-21", sourceAsOf: NOW_MW10, rows: [{ providerEventId: "espn-mw10", ftHome: 1, ftAway: 2, statusRaw: "STATUS_FULL_TIME", ...row }] }, fixtures: PLACEHOLDER });

test("PLACEHOLDER KICKOFF · a result at the real time joins its fixture by club pair + home club + window, and names the fixture id forecasts used", () => {
  const out = mw10({ dateUtc: "2026-11-06T20:00Z", home: "Everton", away: "Coventry City" });
  assert.equal(out.results.length, 1, JSON.stringify(out.quarantined));
  const r = out.results[0];
  assert.equal(r.canonicalEventId, "soccer:epl:coventry-city-v-everton:20261106t2000", "the result keeps its own canonical id");
  assert.equal(r.fixtureEventId, "soccer:epl:coventry-city-v-everton:20261107t1500", "the id the forecast was published under");
  assert.equal(r.joinedBy, "CLUB_PAIR_WINDOW");
  assert.equal(r.kickoffUtc, "2026-11-06T20:00:00Z", "the REAL kickoff travels to the grader's pre-kickoff check");
  assert.deepEqual([r.home, r.away, r.ftHome, r.ftAway], ["Everton", "Coventry City", 1, 2]);
});

test("PLACEHOLDER KICKOFF · a reversed fixture, a match outside the window, or two candidates never join (no swapped goals, no guess)", () => {
  assert.equal(mw10({ dateUtc: "2026-11-06T20:00Z", home: "Coventry City", away: "Everton" }).results.length, 0, "reversed orientation: the other meeting is months away and the near one names the other home club");
  assert.equal(mw10({ dateUtc: "2026-12-06T20:00Z", home: "Everton", away: "Coventry City" }).results.length, 0, "30 days off: outside the window");
  const two = loadCurrentEplResults({ nowIso: NOW_MW10, artifact: { seasonStart: "2026-08-21", sourceAsOf: NOW_MW10, rows: [{ providerEventId: "e", dateUtc: "2026-11-06T20:00Z", home: "Everton", away: "Coventry City", ftHome: 1, ftAway: 2, statusRaw: "STATUS_FULL_TIME" }] }, fixtures: { rows: [PLACEHOLDER.rows[0], { ...PLACEHOLDER.rows[0], eventId: "soccer:epl:coventry-city-v-everton:20261108t1500", kickoffIso: "2026-11-08T15:00:00Z" }] } });
  assert.equal(two.results.length, 0, "two same-pair fixtures in the window: ambiguous, quarantined");
  assert.equal(two.reconciliation.exact, true);
});

test("CANONICAL join unchanged: an exact-id result still joins as CANONICAL with fixtureEventId = its own id", () => {
  const out = mw10({ dateUtc: "2026-11-07T15:00Z", home: "Everton", away: "Coventry City" });
  assert.equal(out.results[0].joinedBy, "CANONICAL");
  assert.equal(out.results[0].fixtureEventId, out.results[0].canonicalEventId);
});
