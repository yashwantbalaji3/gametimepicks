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

import fs from "node:fs";
import path from "node:path";

import { COVERAGE_STATES, EVENT_STATUS, validateEvent } from "../schedule-contract.mjs";
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
  /*
   * P224: this asserted `>= 10` events with the reason "the preseason window's events" — a proxy for
   * "the capture is real", sized to a preseason week. The committed capture now holds the single
   * regular-season opener, so the number rotted while the contract it was guarding did not.
   *
   * CONSERVATION is the claim that never rots and is strictly stronger than a threshold: every row
   * the capture committed comes out the other side, either as an event or as a named quarantine.
   */
  const rawRows = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nfl/schedule/latest.json"), "utf8")).rows ?? [];
  assert.ok(rawRows.length > 0, "the committed capture is not empty");
  assert.equal(out.events.length + out.quarantined.length, rawRows.length, "every committed row is accounted for");
  assert.equal(out.quarantined.length, 0, JSON.stringify(out.quarantined.slice(0, 2)));
  /*
   * THE MAPPING, NOT THE MOMENT.
   *
   * This asserted every event was SCHEDULED, which is a property of the capture's timing rather than
   * of the contract. On 2026-08-28 at 19:20 ET the committed capture held one STATUS_IN_PROGRESS
   * row — a game genuinely in play — and the guard failed as though the taxonomy had broken.
   *
   * What is worth pinning is that every raw ESPN status lands INSIDE the closed taxonomy, and that
   * the two statuses this capture actually contains map to the right members. An unknown status
   * would still fail, which is the defect the assertion was written for.
   */
  const rawCapture = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nfl/schedule/latest.json"), "utf8"));
  const rawById = new Map((rawCapture.rows ?? []).map((r) => [String(r.providerEventId), r.statusRaw]));
  const EXPECTED = { STATUS_SCHEDULED: "SCHEDULED", STATUS_IN_PROGRESS: "LIVE" };
  for (const e of out.events) {
    assert.equal(validateEvent(e).ok, true);
    assert.ok(EVENT_STATUS.includes(e.status), `${e.status} is outside the closed taxonomy`);
    const raw = rawById.get(String(e.providerEventId ?? ""));
    if (raw && EXPECTED[raw]) {
      assert.equal(e.status, EXPECTED[raw], `ESPN ${raw} must normalize to ${EXPECTED[raw]}`);
    }
    assert.match(e.canonicalEventId, /^nfl:nfl:\d{4}-\d{2}-\d{2}:\d+$/, "identity carries ESPN's own event id");
  }
  /*
   * The season LABEL must follow the capture's own seasonType — the original claim ("seasonType 1
   * must label itself preseason, never imply the regular season") with its phase unpinned, so it
   * keeps working in both directions instead of only the one the calendar happened to be in.
   */
  const types = new Set(rawRows.map((r) => r.seasonType));
  if (types.has(1) && types.size === 1) {
    assert.match(out.seasonContext, /preseason/i, "seasonType 1 must label itself preseason, never imply the regular season");
  } else if (types.has(2) && types.size === 1) {
    assert.match(out.seasonContext, /regular season/i, "seasonType 2 must label itself the regular season");
    assert.doesNotMatch(out.seasonContext, /preseason/i, "and must not carry the preseason label");
  }
  assert.ok(out.seasonContext && out.seasonContext.length > 3, "the window always states which season it describes");
});

test("NBA disk truth: confirmed 2026-27 events render as PARTIAL-calendar truth, never as the season", () => {
  const out = nbaUpcoming({ nowIso: NOW });
  assert.equal(out.sourceVerdict.configured, true);
  assert.equal(out.sourceVerdict.sourceId, "espn_scoreboard");
  assert.equal(out.coverage, "SCHEDULE_ONLY");
  assert.match(out.seasonContext, /confirmed events only/, "a partial official calendar must say it is partial");
  assert.ok(out.totals.captured >= 40, `expected the confirmed preseason slate, got ${out.totals.captured}`);
  assert.ok(out.events.length > 0 && out.events.length <= 12);
  assert.equal(out.quarantined.length, 0, JSON.stringify(out.quarantined.slice(0, 2)));
  for (const e of out.events) {
    assert.equal(validateEvent(e).ok, true);
    assert.equal(e.status, "SCHEDULED");
  }
});

test("NBA without a capture: honest off-season state, no stale-probe resurrection", () => {
  const out = nbaUpcoming({ nowIso: NOW, capture: { rows: [] } });
  assert.equal(out.sourceVerdict.configured, false);
  assert.equal(out.coverage, "OFF_SEASON");
  assert.match(out.sourceVerdict.blocker, /No NBA schedule capture exists/);
  assert.equal(out.events.length, 0);
});

test("UFC disk truth: forward BOUTS validate through the red/blue scheme with their card as context", () => {
  const out = ufcUpcoming({ nowIso: NOW });
  assert.equal(out.sourceVerdict.configured, true);
  assert.equal(out.sourceVerdict.sourceId, "espn_scoreboard");
  // The forward window legitimately collapses when cards start (83→17 observed live the night two
  // cards ran, Aug 12) — the invariant is a NON-EMPTY validated bout list, never a count era.
  assert.ok(out.totals.captured >= 5, `expected a non-empty forward bout list, got ${out.totals.captured}`);
  assert.ok(out.events.length > 0 && out.events.length <= 12);
  assert.equal(out.quarantined.length, 0, JSON.stringify(out.quarantined.slice(0, 2)));
  for (const e of out.events) {
    assert.equal(validateEvent(e).ok, true);
    assert.ok(e.competitors.red?.name && e.competitors.blue?.name, "bouts use the contract's red/blue scheme");
    assert.ok(e.context, "every bout names its parent card");
  }
});

test("UFC without a capture: the settled archive NEVER renders as an upcoming event", () => {
  const out = ufcUpcoming({ nowIso: NOW, capture: { bouts: [] } });
  assert.equal(out.events.length, 0);
  assert.match(out.sourceVerdict.blocker, /NOT shown here as an upcoming event/);
  assert.match(out.sourceVerdict.blocker, /No forward UFC capture exists/);
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
