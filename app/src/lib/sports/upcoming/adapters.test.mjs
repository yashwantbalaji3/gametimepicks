/**
 * Upcoming-adapter guards (Program 148 · Release B).
 *
 * The adapters are the only bridge between committed artifacts and the shared presentation, so the
 * guards prove BOTH directions: real data flows through contract validation intact, and absent data
 * becomes an honest named blocker — never an invented fixture, never an empty calendar that reads
 * as "no games", never the settled UFC archive resurrected as an upcoming event.
 *
 * Run: npx tsx --test src/lib/sports/upcoming/adapters.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { COVERAGE_STATES, validateEvent } from "../schedule-contract.mjs";
import { eplUpcoming, nflUpcoming, nbaUpcoming, ufcUpcoming, allUpcoming } from "./adapters.mjs";

const NOW = "2026-08-09T20:00:00-04:00";

test("EPL event path: an injected capture flows through the Release A contract intact", () => {
  const out = eplUpcoming({
    nowIso: NOW,
    artifact: {
      file: "capture-test.json", season: "2026-27", source: "test-capture",
      generatedAt: "2026-08-09T18:00:00Z", sourceAsOf: "2026-08-09T17:58:00Z",
      dataClass: "capture",
      rows: [
        // Documented soccer/epl fixture schema (the shape real captures will use).
        { homeClub: "Arsenal", awayClub: "Liverpool", kickoffIso: "2026-08-15T14:00:00Z", lifecycle: "SCHEDULED", providerRefs: [{ provider: "odds-api", id: "fx-9001", kind: "event" }] },
        // Legacy fallback shape, proving the adapter tolerates a provider-flavored row.
        { providerFixtureId: "fx-9002", kickoffUtc: "2026-08-15T16:30:00Z", status: "PST", home: "Everton", away: "Fulham" },
      ],
    },
  });
  assert.equal(out.events.length, 2);
  assert.equal(out.quarantined.length, 0);
  for (const e of out.events) assert.equal(validateEvent(e).ok, true, "every emitted event satisfies the contract");
  assert.equal(out.events[0].canonicalEventId, "epl:premier-league:2026-08-15:fx-9001", "identity carries the providerRefs event id");
  assert.equal(out.events[0].status, "SCHEDULED", "a lifecycle already in the taxonomy passes through");
  assert.equal(out.events[1].status, "POSTPONED", "PST maps explicitly, never guessed");
  assert.equal(out.sourceVerdict.configured, true);
});

test("EPL event path: a row that cannot satisfy the contract QUARANTINES instead of rendering", () => {
  const out = eplUpcoming({
    nowIso: NOW,
    artifact: {
      file: "capture-test.json", generatedAt: "2026-08-09T18:00:00Z", dataClass: "capture",
      rows: [{ providerFixtureId: "", kickoffUtc: "2026-08-15T14:00:00Z", status: "NS", home: "A", away: "B" }],
    },
  });
  assert.equal(out.events.length, 0, "an identity-less row must not reach the page");
});

test("EPL disk truth: the committed 2026-27 capture renders a bounded upcoming window, never a silent truncation", () => {
  const out = eplUpcoming({ nowIso: NOW });
  assert.equal(out.sourceVerdict.configured, true);
  assert.equal(out.sourceVerdict.sourceId, "openfootball");
  assert.equal(out.totals.captured, 380, "the full season is captured");
  assert.equal(out.totals.upcoming, 380, "nothing has kicked off yet at an Aug-9 clock");
  assert.equal(out.events.length, out.totals.shown, "shown count matches the events actually rendered");
  assert.ok(out.events.length > 0 && out.events.length <= 12, "the page shows a bounded window");
  assert.equal(out.quarantined.length, 0);
  for (const e of out.events) assert.equal(validateEvent(e).ok, true);
  assert.equal(out.events[0].canonicalEventId.includes("coventry"), true, "opening night is Arsenal v Coventry — the promoted club renders through verified membership");
});

test("NFL without a capture: the blocker is the receipt, not an empty calendar", () => {
  const out = nflUpcoming({ nowIso: NOW, capture: { rows: [] } });
  assert.equal(out.sourceVerdict.configured, false);
  assert.match(out.sourceVerdict.blocker, /No NFL schedule capture exists/);
  assert.equal(out.events.length, 0);
});

test("NFL disk truth: the committed ESPN capture flows through the contract — real events, zero quarantine", () => {
  const out = nflUpcoming({ nowIso: "2026-08-09T22:15:00Z" });
  assert.equal(out.sourceVerdict.configured, true);
  assert.equal(out.sourceVerdict.sourceId, "espn_scoreboard");
  assert.ok(out.events.length >= 10, `expected the preseason window's events, got ${out.events.length}`);
  assert.equal(out.quarantined.length, 0, JSON.stringify(out.quarantined.slice(0, 2)));
  for (const e of out.events) {
    assert.equal(validateEvent(e).ok, true);
    assert.equal(e.status, "SCHEDULED", "ESPN STATUS_SCHEDULED must normalize through the closed taxonomy");
    assert.match(e.canonicalEventId, /^nfl:nfl:\d{4}-\d{2}-\d{2}:\d+$/, "identity carries ESPN's own event id");
  }
  assert.match(out.seasonContext, /preseason/, "seasonType 1 must label itself preseason, never imply the regular season");
});

test("NBA: past probe events are filtered, future ones validate, staleness is stated", () => {
  const probe = {
    generatedAt: "2026-06-10T00:00:00Z",
    events: [
      { id: "ev-past", home: "Celtics", away: "Knicks", commence: "2026-06-12T23:00:00Z" },
      { id: "ev-future", home: "Celtics", away: "Knicks", commence: "2026-10-20T23:00:00Z" },
    ],
  };
  const out = nbaUpcoming({ nowIso: NOW, probe });
  assert.equal(out.events.length, 1, "June games are in the past at an August build — only the future event remains");
  assert.equal(validateEvent(out.events[0]).ok, true);
  assert.equal(out.sourceVerdict.freshness, "STALE");
  assert.match(out.sourceVerdict.blocker, /stale/i, "a stale probe says so in words");
  assert.equal(out.coverage, "OFF_SEASON");
});

test("UFC: the settled archive NEVER renders as an upcoming event", () => {
  const out = ufcUpcoming();
  assert.equal(out.events.length, 0);
  assert.match(out.sourceVerdict.blocker, /NOT shown here as an upcoming event/);
  assert.match(out.sourceVerdict.blocker, /No forward UFC event source/);
});

test("allUpcoming: four sports, fixed order, coverage values from the closed axis only", () => {
  const all = allUpcoming({ nowIso: NOW });
  assert.deepEqual(all.map((s) => s.sport), ["epl", "nfl", "nba", "ufc"]);
  for (const s of all) {
    assert.ok(COVERAGE_STATES.includes(s.coverage), `${s.sport} coverage ${s.coverage} is a contract state`);
    assert.ok(s.sourceVerdict.configured || s.sourceVerdict.blocker, `${s.sport}: unconfigured requires a named blocker`);
    assert.ok(Array.isArray(s.events) && Array.isArray(s.quarantined));
  }
});

test("no adapter smuggles model language into schedule surfaces", () => {
  const all = allUpcoming({ nowIso: NOW });
  const text = JSON.stringify(all).toLowerCase();
  for (const banned of ["edge", "lock of the day", "guaranteed", "beat the market", "prediction", "simulation-ready"]) {
    assert.ok(!text.includes(banned), `adapter output must not contain "${banned}"`);
  }
});
