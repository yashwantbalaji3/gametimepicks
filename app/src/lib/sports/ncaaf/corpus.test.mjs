/**
 * NCAAF corpus guards (NCAAF-001.7/001.10): only played finals enter; every exclusion is counted with a reason;
 * division comes from reconciled season membership; same-day duplicates are quarantined; slate days are
 * America/New_York dates across DST; output is byte-deterministic; the as-of filter is strict. PRIVATE_RESEARCH.
 *
 * Every event below is a SYNTHETIC TEST FIXTURE (ids 9xxxxxxxx / teams 90xx). None of it is real data, and
 * nothing here may enter a research corpus or evaluation.
 *
 * Run: npx tsx --test src/lib/sports/ncaaf/corpus.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeScoreboardEvent } from "./espn-events.mjs";
import {
  CORPUS_ROW_FIELDS, buildSeasonCorpus, reconcileMembership, rowsKnownBefore, serializeRows, slateDateEt, summarizeCorpus,
} from "./corpus.mjs";

/** SYNTHETIC_TEST_FIXTURE — shaped like a normalised espn-events row. */
const ev = (id, home, away, { date = "2025-09-27T19:30Z", status = "STATUS_FINAL", hs = 21, as = 14, period = 4, season = 2025 } = {}) => {
  const completed = !["STATUS_SCHEDULED", "STATUS_POSTPONED", "STATUS_CANCELED"].includes(status);
  return normalizeScoreboardEvent({
    id, date, season: { year: season, type: 2 }, week: { number: 5 },
    competitions: [{
      date, timeValid: true, neutralSite: false, conferenceCompetition: false,
      status: { period, type: { name: status, completed } },
      competitors: [
        { homeAway: "home", score: String(hs), team: { id: home, conferenceId: "5" } },
        { homeAway: "away", score: String(as), team: { id: away, conferenceId: "6" } },
      ],
    }],
  }, { capturedAt: "2026-10-09T00:00:00Z", sourceGroup: "80" }).row;
};
const MEMBERSHIP = { fbs: ["9001", "9002", "9003", "9004", "9999"], fcs: ["9101", "9102"] };

test("membership is reconciled to teams that played; a team in both divisions refuses the season", () => {
  const m = reconcileMembership(MEMBERSHIP, [ev("900000001", "9001", "9002")]);
  assert.deepEqual([...m.fbs].sort(), ["9001", "9002"], "never-playing ids (9999) drop out");
  assert.throws(() => reconcileMembership({ fbs: ["9001"], fcs: ["9001"] }, [ev("900000001", "9001", "9002")]), /both FBS and FCS/);
});

test("only played finals enter; every other event is excluded with its reason", () => {
  const events = [
    ev("900000010", "9001", "9002"),
    ev("900000011", "9003", "9004", { status: "STATUS_FORFEIT", hs: 1, as: 0 }),
    ev("900000012", "9001", "9003", { date: "2025-10-04T19:30Z", status: "STATUS_CANCELED" }),
    ev("900000013", "9002", "9004", { date: "2025-10-04T19:30Z", status: "STATUS_SCHEDULED", hs: 0, as: 0 }),
    ev("900000014", "9001", "9004", { date: "2024-10-11T19:30Z", season: 2024 }),
    ev("900000015", "8001", "8002", { date: "2025-10-11T19:30Z" }),
  ];
  const { rows, excluded } = buildSeasonCorpus(2025, events, { fbs: [...MEMBERSHIP.fbs, "8001"], fcs: MEMBERSHIP.fcs });
  assert.deepEqual(rows.map((r) => r.eventId), ["900000010", "900000015"]);
  assert.deepEqual(Object.fromEntries(excluded.map((x) => [x.eventId, x.reason])), {
    900000011: "NOT_PLAYED_FORFEIT",
    900000012: "NOT_COMPLETED",
    900000013: "NOT_COMPLETED",
    900000014: "SEASON_MISMATCH",
  });
  assert.equal(rows.find((r) => r.eventId === "900000015").pairing, "FBS-NON_D1");
});

test("a game with no Division I team is refused, not classified", () => {
  const { rows, excluded } = buildSeasonCorpus(2025, [ev("900000020", "7001", "7002")], MEMBERSHIP);
  assert.equal(rows.length, 0);
  assert.equal(excluded[0].reason, "NO_D1_TEAM");
});

test("division pairing is ordered FBS → FCS → NON_D1 regardless of home/away", () => {
  const { rows } = buildSeasonCorpus(2025, [ev("900000030", "9101", "9001"), ev("900000031", "9002", "9102", { date: "2025-10-04T19:30Z" })], MEMBERSHIP);
  assert.deepEqual(rows.map((r) => [r.homeDivision, r.awayDivision, r.pairing]), [["FCS", "FBS", "FBS-FCS"], ["FBS", "FCS", "FBS-FCS"]]);
});

test("two ids for the same matchup on one slate day are both quarantined", () => {
  const { rows, excluded } = buildSeasonCorpus(2025, [
    ev("900000040", "9001", "9002", { date: "2025-09-27T16:00Z" }),
    ev("900000041", "9002", "9001", { date: "2025-09-27T23:00Z", hs: 10, as: 7 }),
    ev("900000042", "9003", "9004"),
  ], MEMBERSHIP);
  assert.deepEqual(rows.map((r) => r.eventId), ["900000042"]);
  assert.deepEqual(excluded.map((x) => x.reason), ["DUPLICATE_MATCHUP_SAME_DAY", "DUPLICATE_MATCHUP_SAME_DAY"]);
});

test("a team appearing in two different games on one slate day is quarantined", () => {
  const { rows, excluded } = buildSeasonCorpus(2025, [
    ev("900000050", "9001", "9002", { date: "2025-09-27T16:00Z" }),
    ev("900000051", "9001", "9003", { date: "2025-09-27T23:00Z" }),
  ], MEMBERSHIP);
  assert.equal(rows.length, 0);
  assert.deepEqual(excluded.map((x) => x.reason), ["TEAM_TWICE_SAME_DAY", "TEAM_TWICE_SAME_DAY"]);
});

test("slate day is the America/New_York date, across both DST regimes", () => {
  assert.equal(slateDateEt("2025-09-28T03:30Z"), "2025-09-27", "11:30 PM EDT Saturday is Saturday's slate");
  assert.equal(slateDateEt("2025-09-28T04:30Z"), "2025-09-28");
  assert.equal(slateDateEt("2025-12-21T04:30Z"), "2025-12-20", "11:30 PM EST (UTC-5) is still the 20th");
  assert.equal(slateDateEt("2025-12-21T05:00Z"), "2025-12-21");
  assert.equal(slateDateEt("not a date"), null);
});

test("rowsKnownBefore is strict: a same-day result never reaches a same-day forecast", () => {
  const { rows } = buildSeasonCorpus(2025, [
    ev("900000060", "9001", "9002", { date: "2025-09-20T16:00Z" }),
    ev("900000061", "9003", "9004", { date: "2025-09-27T16:00Z" }),
    ev("900000062", "9001", "9004", { date: "2025-10-04T16:00Z" }),
  ], MEMBERSHIP);
  assert.deepEqual(rowsKnownBefore(rows, "2025-09-27").map((r) => r.eventId), ["900000060"]);
  assert.deepEqual(rowsKnownBefore(rows, "2025-09-20"), []);
  assert.throws(() => rowsKnownBefore(rows, "2025-9-27"), /YYYY-MM-DD/);
  assert.throws(() => rowsKnownBefore(rows, undefined), /YYYY-MM-DD/);
});

test("output is byte-deterministic regardless of input order, with fixed field order", () => {
  const events = [
    ev("900000072", "9003", "9004", { date: "2025-10-04T16:00Z" }),
    ev("900000070", "9001", "9002", { date: "2025-09-20T16:00Z" }),
    ev("900000071", "9101", "9102", { date: "2025-09-20T16:00Z" }),
  ];
  const a = serializeRows(buildSeasonCorpus(2025, events, MEMBERSHIP).rows);
  const b = serializeRows(buildSeasonCorpus(2025, [...events].reverse(), MEMBERSHIP).rows);
  assert.equal(a, b);
  assert.deepEqual(Object.keys(JSON.parse(a.split("\n")[0])), [...CORPUS_ROW_FIELDS]);
  assert.deepEqual(a.trim().split("\n").map((l) => JSON.parse(l).eventId), ["900000070", "900000071", "900000072"]);
});

test("a played final keeps a genuine 0 and its overtime periods; summary counts reconcile", () => {
  const events = [ev("900000080", "9001", "9002", { hs: 0, as: 3 }), ev("900000081", "9003", "9004", { date: "2025-10-04T16:00Z", period: 6, hs: 30, as: 24 }), ev("900000082", "9001", "9003", { date: "2025-10-11T16:00Z", status: "STATUS_CANCELED" })];
  const { rows, excluded } = buildSeasonCorpus(2025, events, MEMBERSHIP);
  assert.equal(rows[0].homeScore, 0);
  assert.equal(rows[1].overtimePeriods, 2);
  const s = summarizeCorpus(rows, excluded);
  assert.equal(s.games + s.excluded, events.length, "every input event is either a row or a counted exclusion");
  assert.equal(s.overtime, 1);
  assert.deepEqual(s.excludedByReason, { NOT_COMPLETED: 1 });
});
