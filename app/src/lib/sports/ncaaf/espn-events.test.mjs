/**
 * NCAAF ESPN event normalisation guards (NCAAF V1 · Stage 1): a scheduled game's "0" is not a score; overtime
 * is only known for completed games; a cross-division game returned by both group requests is one event;
 * disagreeing copies are withheld; NCAAF team ids can never equal NFL team ids; malformed events are refused,
 * never repaired. PRIVATE_RESEARCH.
 *
 * Every event below is a SYNTHETIC TEST FIXTURE shaped like the real 2026-10-09 payloads. None of these ids,
 * teams or scores is real data, and nothing here may enter a research corpus or evaluation.
 *
 * Run: npx tsx --test src/lib/sports/ncaaf/espn-events.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ESPN_CFB_GROUPS, divisionPairing, mergeEventRows, ncaafTeamId, normalizeScoreboardEvent, summarizeSeasonCoverage,
} from "./espn-events.mjs";

const CAPTURED = "2026-10-09T03:32:47Z";
const competitor = (homeAway, id, score, lines) => ({
  homeAway, score, team: { id, abbreviation: `T${id}`, conferenceId: "5" },
  ...(lines ? { linescores: lines.map((value) => ({ value })) } : {}),
});
/** SYNTHETIC_TEST_FIXTURE — not a real game. */
const fixture = ({ id = "900000001", status = "STATUS_FINAL", completed = true, period = 4, home = ["9001", "24"], away = ["9002", "17"], homeLines, awayLines, ...over } = {}) => ({
  id,
  date: "2025-09-27T19:30Z",
  season: { year: 2025, type: 2 },
  week: { number: 5 },
  competitions: [{
    date: "2025-09-27T19:30Z",
    timeValid: true,
    neutralSite: false,
    conferenceCompetition: true,
    venue: { id: "77" },
    status: { period, type: { name: status, completed } },
    competitors: [competitor("home", home[0], home[1], homeLines), competitor("away", away[0], away[1], awayLines)],
    ...over,
  }],
});
const norm = (e, group = ESPN_CFB_GROUPS.FBS) => normalizeScoreboardEvent(e, { capturedAt: CAPTURED, sourceGroup: group });

test("a scheduled game's provider '0' is not a score: both scores and overtime are unknown until completed", () => {
  const { row } = norm(fixture({ status: "STATUS_SCHEDULED", completed: false, period: 0, home: ["9001", "0"], away: ["9002", "0"] }));
  assert.equal(row.completed, false);
  assert.equal(row.home.score, null);
  assert.equal(row.away.score, null);
  assert.equal(row.overtime, null, "an unplayed game is not 'no overtime'");
  assert.equal(row.overtimePeriods, null);
  assert.equal(row.periods, null);
});

test("a completed game keeps its real score, including a genuine 0", () => {
  const { row } = norm(fixture({ home: ["9001", "31"], away: ["9002", "0"], homeLines: [7, 7, 10, 7], awayLines: [0, 0, 0, 0] }));
  assert.equal(row.home.score, 31);
  assert.equal(row.away.score, 0);
  assert.equal(row.overtime, false);
  assert.equal(row.overtimePeriods, 0);
  assert.equal(row.lineScoreConsistent, true);
});

test("overtime is derived from completed periods; double overtime counts two OT periods", () => {
  const { row } = norm(fixture({ period: 6, home: ["9001", "24"], away: ["9002", "30"], homeLines: [0, 3, 0, 14, 7, 0], awayLines: [0, 3, 7, 7, 7, 6] }));
  assert.equal(row.overtime, true);
  assert.equal(row.overtimePeriods, 2);
  assert.equal(row.lineScoreConsistent, true);
});

test("line scores that do not sum to the final are flagged, not corrected", () => {
  const { row } = norm(fixture({ home: ["9001", "24"], homeLines: [7, 7, 7, 7], awayLines: [7, 3, 7, 0] }));
  assert.equal(row.home.score, 24);
  assert.equal(row.lineScoreConsistent, false);
});

test("a completed game with an unparseable score keeps the score unknown", () => {
  const { row } = norm(fixture({ home: ["9001", ""], away: ["9002", "x"] }));
  assert.equal(row.home.score, null);
  assert.equal(row.away.score, null);
  assert.equal(summarizeSeasonCoverage([row]).completedMissingScore, 1);
});

test("a forfeit's 1-0 is an administrative result, never a game score or a regulation final", () => {
  const { row } = norm(fixture({ status: "STATUS_FORFEIT", completed: true, period: 1, home: ["9001", "1"], away: ["9002", "0"], homeLines: [1], awayLines: [0] }));
  assert.equal(row.completed, true);
  assert.equal(row.resultType, "FORFEIT");
  assert.equal(row.home.score, null);
  assert.equal(row.away.score, null);
  assert.equal(row.home.periodScores, null);
  assert.equal(row.overtime, null);
  const s = summarizeSeasonCoverage([row]);
  assert.equal(s.forfeits, 1);
  assert.equal(s.playedFinal, 0);
  assert.equal(s.completedMissingScore, 0, "a forfeit is not a final with a missing score");
});

test("an unrecognised completed status fails closed: kept, counted, never scored", () => {
  const { row } = norm(fixture({ status: "STATUS_ABANDONED", completed: true, home: ["9001", "14"], away: ["9002", "7"] }));
  assert.equal(row.resultType, "OTHER_COMPLETED");
  assert.equal(row.home.score, null);
  assert.equal(summarizeSeasonCoverage([row]).otherCompleted, 1);
});

test("malformed events are refused with a reason, never repaired", () => {
  assert.match(norm({ ...fixture(), id: "abc" }).refused, /digit id/);
  assert.match(norm(fixture({ competitors: [competitor("home", "9001", "1")] })).refused, /exactly one home and one away/);
  assert.match(norm(fixture({ home: ["", "1"] })).refused, /provider team id/);
  assert.match(norm(fixture({ home: ["9001", "1"], away: ["9001", "2"] })).refused, /same team id/);
  assert.match(norm({ id: "900000009" }).refused, /no competition/);
});

test("NCAAF team ids are namespaced: ESPN college id 2 can never equal an NFL team id", () => {
  assert.equal(ncaafTeamId("2"), "ncaaf-team-2");
  assert.notEqual(ncaafTeamId("2"), "nfl-team-2");
  assert.throws(() => ncaafTeamId("ALA"), /digits/);
  assert.throws(() => ncaafTeamId(null), /digits/);
});

test("a cross-division game returned by both group requests merges into one event", () => {
  const e = fixture({ id: "900000002", home: ["9001", "45"], away: ["9100", "3"] });
  const { events, conflicts } = mergeEventRows([norm(e, ESPN_CFB_GROUPS.FBS).row, norm(e, ESPN_CFB_GROUPS.FCS).row]);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].sourceGroups, ["80", "81"]);
  assert.deepEqual(conflicts, []);
});

test("two copies of one event that disagree are withheld as a conflict, not resolved by picking one", () => {
  const a = norm(fixture({ id: "900000003", home: ["9001", "21"] })).row;
  const b = norm(fixture({ id: "900000003", home: ["9001", "28"] }), ESPN_CFB_GROUPS.FCS).row;
  const other = norm(fixture({ id: "900000004" })).row;
  const { events, conflicts } = mergeEventRows([a, b, other]);
  assert.deepEqual(conflicts, ["900000003"]);
  assert.deepEqual(events.map((e) => e.providerEventId), ["900000004"]);
});

test("merging is deterministic regardless of input order", () => {
  const rows = ["900000012", "900000010", "900000011"].map((id) => norm(fixture({ id })).row);
  const one = JSON.stringify(mergeEventRows(rows));
  const two = JSON.stringify(mergeEventRows([...rows].reverse()));
  assert.equal(one, two);
});

test("division pairing uses season membership only; a team in neither set is UNKNOWN", () => {
  const row = norm(fixture({ home: ["9001", "45"], away: ["9100", "3"] })).row;
  const membership = { fbs: new Set(["9001"]), fcs: new Set(["9100"]) };
  assert.equal(divisionPairing(row, membership), "FBS-FCS");
  assert.equal(divisionPairing(row, { fbs: new Set(["9001"]), fcs: new Set() }), "UNKNOWN");
  assert.equal(divisionPairing(row, null), "UNKNOWN");
});

test("coverage summary counts states without inventing any", () => {
  const rows = [
    norm(fixture({ id: "900000020", period: 5, home: ["9001", "27"], away: ["9002", "24"], homeLines: [7, 7, 3, 7, 3], awayLines: [7, 7, 7, 3, 0] })).row,
    norm(fixture({ id: "900000021", status: "STATUS_POSTPONED", completed: false, period: 0, home: ["9003", "0"], away: ["9004", "0"] })).row,
    norm(fixture({ id: "900000022", neutralSite: true, timeValid: false })).row,
  ];
  const s = summarizeSeasonCoverage(rows);
  assert.equal(s.events, 3);
  assert.equal(s.completed, 2);
  assert.equal(s.byStatus.STATUS_POSTPONED, 1);
  assert.equal(s.overtime, 1);
  assert.deepEqual(s.overtimePeriods, { 1: 1 });
  assert.equal(s.neutralSite, 1);
  assert.equal(s.kickoffTimeUnknown, 1);
  assert.equal(s.lineScoreMissing, 1, "a final without line scores is counted as missing, not as consistent");
  assert.equal(s.teams, 4);
  assert.equal(s.divisionPairing.UNKNOWN, 3);
});
