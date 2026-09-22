/**
 * NBA box-score parser guards (NBA readiness track N1).
 *
 * Pins the four rules the corpus depends on: "2-5" splits into made/attempted; a missing or
 * unparseable stat is null and NEVER 0; a DNP keeps didNotPlay:true with every stat null (and the
 * reason is recorded ONLY for DNPs — ESPN stamps "COACH'S DECISION" on players who played); and any
 * departure from ESPN's 14-column label order throws instead of silently mis-indexing.
 *
 * Run: npx tsx --test src/lib/sports/nba/boxscore-corpus.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EXPECTED_LABELS, LabelOrderError, assertLabelOrder, parseIntStat, parseMadeAttempted, parseAthlete,
  parseSummary, canonicalTricodeFromEspnAbbr, countNullMinutes,
} from "./boxscore-parse.mjs";

const STAT_KEYS = ["minutes", "pts", "reb", "ast", "threePm", "threePa", "fgm", "fga", "ftm", "fta", "stl", "blk", "tov", "oreb", "dreb", "pf", "plusMinus"];

const athlete = (over = {}) => ({
  athlete: { id: "4870562", displayName: "Dominick Barlow", position: { abbreviation: "F" } },
  starter: true, didNotPlay: false, reason: "COACH'S DECISION", ejected: false,
  stats: ["30", "6", "2-5", "0-2", "2-2", "10", "2", "1", "1", "0", "1", "9", "4", "+9"],
  ...over,
});

const summary = (players, { labels = [...EXPECTED_LABELS], teams = true } = {}) => ({
  header: {
    competitions: [{
      status: { type: { name: "STATUS_FINAL" } },
      competitors: [
        { homeAway: "home", team: { id: "18", abbreviation: "NY", displayName: "New York Knicks" } },
        { homeAway: "away", team: { id: "20", abbreviation: "PHI", displayName: "Philadelphia 76ers" } },
      ],
    }],
  },
  boxscore: {
    teams: teams ? [
      { homeAway: "away", team: { id: "20", abbreviation: "PHI", displayName: "Philadelphia 76ers" } },
      { homeAway: "home", team: { id: "18", abbreviation: "NY", displayName: "New York Knicks" } },
    ] : [],
    players: players == null ? [] : [
      { team: { id: "20", abbreviation: "PHI", displayName: "Philadelphia 76ers" }, statistics: [{ labels, athletes: players }] },
    ],
  },
});
const META = { providerEventId: "401812480", season: 2026, phase: 1, dateUtc: "2025-10-02T16:00Z", capturedAt: "2026-09-21T12:00:00Z" };

test("made/attempted: '2-5' splits; anything else is null/null (never 0)", () => {
  assert.deepEqual(parseMadeAttempted("2-5"), { made: 2, attempted: 5 });
  assert.deepEqual(parseMadeAttempted("0-0"), { made: 0, attempted: 0 });
  assert.deepEqual(parseMadeAttempted("12-25"), { made: 12, attempted: 25 });
  for (const bad of ["", "--", "2", "2/5", "-5", undefined, null, 25]) assert.deepEqual(parseMadeAttempted(bad), { made: null, attempted: null }, `input ${String(bad)}`);
});

test("integer stats: signed +/- parses; blanks, dashes, fractions and fg strings are null", () => {
  assert.equal(parseIntStat("30"), 30);
  assert.equal(parseIntStat("+9"), 9);
  assert.equal(parseIntStat("-12"), -12);
  assert.equal(parseIntStat("0"), 0);
  for (const bad of ["", "--", "2-5", "12.5", "30:12", undefined, null, "n/a"]) assert.equal(parseIntStat(bad), null, `input ${String(bad)}`);
});

test("a full athlete row maps every column by position, splitting FG/3PT/FT", () => {
  const p = parseAthlete(athlete(), "20");
  assert.equal(p.providerAthleteId, "4870562");
  assert.equal(p.name, "Dominick Barlow");
  assert.equal(p.providerTeamId, "20");
  assert.equal(p.starter, true);
  assert.equal(p.didNotPlay, false);
  assert.equal(p.dnpReason, null, "reason is NOT a DNP reason for a player who played");
  assert.deepEqual(
    STAT_KEYS.map((k) => [k, p[k]]),
    [["minutes", 30], ["pts", 6], ["reb", 10], ["ast", 2], ["threePm", 0], ["threePa", 2], ["fgm", 2], ["fga", 5], ["ftm", 2], ["fta", 2],
      ["stl", 1], ["blk", 0], ["tov", 1], ["oreb", 1], ["dreb", 9], ["pf", 4], ["plusMinus", 9]],
  );
});

test("missing stats are null, never zero-filled: short arrays, blanks and absent stats", () => {
  const short = parseAthlete(athlete({ stats: ["30", "6", "2-5"] }), "20");
  assert.equal(short.minutes, 30); assert.equal(short.pts, 6); assert.equal(short.fgm, 2); assert.equal(short.fga, 5);
  for (const k of STAT_KEYS.filter((k) => !["minutes", "pts", "fgm", "fga"].includes(k))) assert.equal(short[k], null, `${k} must be null`);

  const blanks = parseAthlete(athlete({ stats: ["", "--", "", "", "", "", "", "", "", "", "", "", "", ""] }), "20");
  for (const k of STAT_KEYS) assert.equal(blanks[k], null, `${k} must be null, not 0`);

  const absent = parseAthlete(athlete({ stats: undefined }), "20");
  for (const k of STAT_KEYS) assert.equal(absent[k], null, `${k} must be null when stats is absent`);
  assert.equal(absent.didNotPlay, false);
  assert.ok(!Object.values(absent).some((v) => v === 0), "no zero anywhere in an absent-stats row");
});

test("DNP: didNotPlay stays true, every stat null, reason recorded — even when ESPN sends stats", () => {
  const dnp = parseAthlete(athlete({ didNotPlay: true, starter: false, reason: "INJURY", stats: [] }), "20");
  assert.equal(dnp.didNotPlay, true);
  assert.equal(dnp.starter, false);
  assert.equal(dnp.dnpReason, "INJURY");
  for (const k of STAT_KEYS) assert.equal(dnp[k], null, `${k} must be null for a DNP`);

  const dnpWithStats = parseAthlete(athlete({ didNotPlay: true, stats: ["0", "0", "0-0", "0-0", "0-0", "0", "0", "0", "0", "0", "0", "0", "0", "0"] }), "20");
  for (const k of STAT_KEYS) assert.equal(dnpWithStats[k], null, `${k} must be null for a DNP regardless of stats payload`);

  const dnpNoReason = parseAthlete(athlete({ didNotPlay: true, reason: "" }), "20");
  assert.equal(dnpNoReason.dnpReason, null);
});

test("label-order guard: the expected 14 pass; reorder, rename, extra and missing columns throw", () => {
  assert.doesNotThrow(() => assertLabelOrder([...EXPECTED_LABELS]));
  const swapped = [...EXPECTED_LABELS]; [swapped[1], swapped[5]] = [swapped[5], swapped[1]];
  assert.throws(() => assertLabelOrder(swapped), LabelOrderError);
  assert.throws(() => assertLabelOrder(EXPECTED_LABELS.slice(0, 13)), LabelOrderError);
  assert.throws(() => assertLabelOrder([...EXPECTED_LABELS, "EFF"]), LabelOrderError);
  assert.throws(() => assertLabelOrder(EXPECTED_LABELS.map((l) => (l === "TO" ? "TOV" : l))), LabelOrderError);
  assert.throws(() => assertLabelOrder(undefined), LabelOrderError);
  // and through parseSummary: a mis-ordered team block aborts the whole parse (no partial doc)
  assert.throws(() => parseSummary(summary([athlete()], { labels: swapped }), META), (e) => e instanceof LabelOrderError && Array.isArray(e.actual));
});

test("parseSummary: document shape, team identity (raw abbr + canonical tricode), homeAway, labelSets", () => {
  const { doc, labelSets } = parseSummary(summary([athlete(), athlete({ athlete: { id: "4897471", displayName: "Saint Thomas" }, didNotPlay: true, starter: false, stats: [] })]), META);
  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.providerEventId, "401812480");
  assert.equal(doc.season, 2026); assert.equal(doc.phase, 1); assert.equal(doc.dateUtc, "2025-10-02T16:00Z");
  assert.equal(doc.capturedAt, "2026-09-21T12:00:00Z");
  assert.equal(doc.source, "espn_summary");
  assert.equal(doc.status, "STATUS_FINAL");
  assert.equal(doc.boxscoreAvailable, true);
  assert.deepEqual(doc.teams.map((t) => [t.providerTeamId, t.abbr, t.canonicalTricode, t.homeAway]), [["18", "NY", "NYK", "home"], ["20", "PHI", "PHI", "away"]]);
  assert.equal(doc.players.length, 2);
  assert.equal(doc.players[0].providerTeamId, "20");
  assert.equal(doc.players[1].didNotPlay, true);
  assert.deepEqual(labelSets, [JSON.stringify(EXPECTED_LABELS)]);
  assert.equal(countNullMinutes(doc), 0, "a DNP does not count as null minutes");
});

test("parseSummary: a summary with no player blocks is boxscoreAvailable:false with teams from the header", () => {
  const { doc, labelSets } = parseSummary(summary(null, { teams: false }), META);
  assert.equal(doc.boxscoreAvailable, false);
  assert.deepEqual(doc.players, []);
  assert.deepEqual(labelSets, []);
  assert.deepEqual(doc.teams.map((t) => [t.abbr, t.homeAway]), [["NY", "home"], ["PHI", "away"]]);
});

test("null-minutes counter flags played rows with unparseable minutes only", () => {
  const { doc } = parseSummary(summary([athlete({ stats: ["", "6"] }), athlete({ didNotPlay: true, stats: [] }), athlete()]), META);
  assert.equal(countNullMinutes(doc), 1);
});

test("ESPN abbreviations resolve to the identity-contract tricodes; exhibition clubs resolve to null", () => {
  assert.equal(canonicalTricodeFromEspnAbbr("NY"), "NYK");
  assert.equal(canonicalTricodeFromEspnAbbr("GS"), "GSW");
  assert.equal(canonicalTricodeFromEspnAbbr("SA"), "SAS");
  assert.equal(canonicalTricodeFromEspnAbbr("UTAH"), "UTA");
  assert.equal(canonicalTricodeFromEspnAbbr("WSH"), "WAS");
  assert.equal(canonicalTricodeFromEspnAbbr("NO"), "NOP");
  assert.equal(canonicalTricodeFromEspnAbbr("PHI"), "PHI");
  assert.equal(canonicalTricodeFromEspnAbbr("RM"), null);
  assert.equal(canonicalTricodeFromEspnAbbr(undefined), null);
});
