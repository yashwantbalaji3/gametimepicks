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

test("DISK TRUTH · the committed capture is an honest fresh PRESEASON state with zero rows", () => {
  const a = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "soccer", "epl", "results", "latest.json"), "utf8"));
  assert.equal(a.dataClass, "RESULTS_CAPTURE");
  assert.equal(a.state, "PRESEASON");
  assert.equal(a.rowCount, 0, "no fabricated matchweek, no 0-0 placeholders");
  const out = loadCurrentEplResults({ nowIso: a.generatedAt });
  assert.equal(out.state, "PRESEASON");
  assert.equal(out.results.length, 0);
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
