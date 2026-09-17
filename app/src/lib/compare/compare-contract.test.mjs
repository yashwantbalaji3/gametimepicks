/**
 * MATCHUP EXPLORER + COMPARE — pure contracts (v1.4 · §93–§100 · §137 unit).
 *
 *  CP1  pair identity is symmetric (A/B = B/A: key, shared seasons, shared families, H2H set) and never name-based
 *  CP2  cross-sport, same-entity, unpublished and unsupported-sport pairs are refused with stable codes
 *  CP3  stat intersection is exact on canonical keys; a requested stat outside the intersection is refused (no fallback)
 *  CP4  season intersection: newest SHARED factual season is the default; NFL 2026 (no rows) is never selected
 *  CP5  missing ≠ zero: nulls never enter an aggregate; a recorded 0 does; windows state their own n
 *  CP6  H2H: finals only, pending excluded, doubleheaders distinct, no duplicate ids, ties counted, inconsistent sides refused
 *  CP7  EPL Team Compare is blocked (no record, no score, no meeting) even if score-shaped rows appear
 *  CP8  UFC has no comparable stat family → Player Compare refuses; a no-winner bout never becomes a loss upstream
 *  CP9  matchup registry: exact game id, both sides must agree, window-bounded, durable (builder refuses a drop),
 *       "entering this game" excludes the game itself; Upcoming is never decided at build time
 *  CP10 stat families mirror the v1.3 research registry and have a stable product order
 *  CP11 no evaluative output: comparison objects carry no winner/advantage/rank field
 *
 * Run: npx tsx --test src/lib/compare/compare-contract.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { BLOCKER, EVALUATIVE_TERMS, FORBIDDEN_COMPARE_FIELDS, pairKey } from "./contract.mjs";
import { getPlayerCompareEligibility, getTeamCompareEligibility } from "./eligibility.mjs";
import { getHeadToHead } from "./head-to-head.mjs";
import { buildTeamComparison } from "./team-compare.mjs";
import { buildPlayerComparison, describeValues } from "./player-compare.mjs";
import { buildMatchup, matchupRegistry, MATCHUP_WINDOWS } from "./matchup.mjs";
import { STAT_FAMILIES, familyBySlug, sharedStatFamilies, statFamily, statSlug } from "./stat-families.mjs";
import { assertFamiliesMatchResearch } from "./stat-families-check.mjs";
import { playerCompareEntity, playerStatKeys } from "./entities.mjs";
import { assembleCompareProjection } from "./projection-build.mjs";

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────────
// TEAM row: [gameId, date, seasonId, ha, opp, status, own, opp, result]
const team = (sport, id, name, rows, extra = {}) => ({ schemaVersion: 1, artifact: "compare-team", sport, id, slug: name.toLowerCase().replace(/\s+/g, "-"), name, abbreviation: null, path: `/teams/${sport.toLowerCase()}/x/`, supportsResults: sport !== "EPL", resultsThrough: null, coverage: { status: "FULL", notes: [], from: null, to: null }, rows, ...extra });
// PLAYER row: [gameId, date, seasonId, teamId, opp, ha, ...values in stats order]
const player = (sport, id, name, stats, rows) => ({ schemaVersion: 1, artifact: "compare-player", sport, id, slug: name.toLowerCase().replace(/\s+/g, "-"), name, currentTeamId: null, path: `/players/${sport.toLowerCase()}/x/`, coverage: { status: "FULL", notes: [], from: null, to: null }, stats, rows });

const NYM = "mlb-team-121", NYY = "mlb-team-147", LAA = "mlb-team-108";
const mets = team("MLB", NYM, "New York Mets", [
  ["900003", "2026-09-20T23:05:00Z", "MLB-2026", "H", NYY, "S", null, null, null], // scheduled: never a result
  ["900002", "2026-08-30T23:05:00Z", "MLB-2026", "A", NYY, "F", 0, 3, "L"], // doubleheader game 2 (a 0 is a score)
  ["900001", "2026-08-30T17:05:00Z", "MLB-2026", "A", NYY, "F", 5, 4, "W"], // doubleheader game 1
  ["900001", "2026-08-30T17:05:00Z", "MLB-2026", "A", NYY, "F", 5, 4, "W"], // duplicated row must not double count
  ["800001", "2025-06-01T17:05:00Z", "MLB-2025", "H", NYY, "F", 2, 2, "T"],
  ["700001", "2025-05-01T17:05:00Z", "MLB-2025", "H", LAA, "F", 1, 0, "W"],
]);
const yankees = team("MLB", NYY, "New York Yankees", [
  ["900003", "2026-09-20T23:05:00Z", "MLB-2026", "A", NYM, "S", null, null, null],
  ["900002", "2026-08-30T23:05:00Z", "MLB-2026", "H", NYM, "F", 3, 0, "W"],
  ["900001", "2026-08-30T17:05:00Z", "MLB-2026", "H", NYM, "F", 4, 5, "L"],
  ["800001", "2025-06-01T17:05:00Z", "MLB-2025", "A", NYM, "F", 2, 2, "T"],
]);

const REC = "NFL.receivingYards", RCP = "NFL.receptions", PASS = "NFL.passingYards";
const wrA = player("NFL", "nfl-athlete-1", "Chris Manhertz", [REC, RCP], [
  ["g5", "2026-09-14T17:00:00Z", "NFL-2026", "nfl-team-1", "nfl-team-2", "H", null, null], // 2026 row with nothing recorded is not a value
  ["g4", "2025-12-01T18:00:00Z", "NFL-2025", "nfl-team-1", "nfl-team-2", "H", 0, 0],
  ["g3", "2025-11-01T18:00:00Z", "NFL-2025", "nfl-team-3", "nfl-team-2", "A", 40, 3],
  ["g2", "2024-10-01T18:00:00Z", "NFL-2024", "nfl-team-3", "nfl-team-2", "A", null, 2],
  ["g1", "2024-09-01T18:00:00Z", "NFL-2024", "nfl-team-3", "nfl-team-2", "A", 20, 1],
]);
const wrB = player("NFL", "nfl-athlete-2", "Chris Manhertz", [REC, RCP], [
  ["h3", "2026-09-14T17:00:00Z", "NFL-2026", "nfl-team-2", "nfl-team-1", "A", null, null], // both sides have a 2026 row, neither recorded a value
  ["h2", "2025-12-02T18:00:00Z", "NFL-2025", "nfl-team-2", "nfl-team-1", "A", 100, 8],
  ["h1", "2023-12-02T18:00:00Z", "NFL-2023", "nfl-team-2", "nfl-team-1", "A", 60, 5],
]);
const qb = player("NFL", "nfl-athlete-3", "Quarter Back", [PASS], [["q1", "2025-10-01T18:00:00Z", "NFL-2025", "nfl-team-4", "nfl-team-1", "H", 250]]);

// ── CP1 ────────────────────────────────────────────────────────────────────────────────────────────
test("CP1 pair identity is symmetric and id-based (same-name players stay two people)", () => {
  assert.equal(pairKey("MLB", NYM, NYY), pairKey("MLB", NYY, NYM));
  assert.notEqual(pairKey("NFL", "nfl-athlete-1", "nfl-athlete-2"), pairKey("NFL", "nfl-athlete-1", "nfl-athlete-1"));
  const ab = getTeamCompareEligibility(mets, yankees), ba = getTeamCompareEligibility(yankees, mets);
  assert.equal(ab.pair, ba.pair);
  assert.deepEqual(ab.sharedSeasons, ba.sharedSeasons);
  const pab = getPlayerCompareEligibility(wrA, wrB), pba = getPlayerCompareEligibility(wrB, wrA);
  assert.equal(pab.pair, pba.pair);
  assert.deepEqual(pab.sharedStatFamilies, pba.sharedStatFamilies);
  assert.deepEqual(pab.sharedSeasons, pba.sharedSeasons);
  // Same display name, different canonical ids: a real comparison of two people, not SAME_ENTITY.
  assert.equal(wrA.name, wrB.name);
  assert.ok(pab.eligible, JSON.stringify(pab.blockers));
  const hab = getHeadToHead({ a: mets, b: yankees }), hba = getHeadToHead({ a: yankees, b: mets });
  assert.deepEqual(hab.meetings.map((m) => m.gameId), hba.meetings.map((m) => m.gameId));
  assert.deepEqual([hab.record.aWins, hab.record.bWins, hab.record.ties], [hba.record.bWins, hba.record.aWins, hba.record.ties]);
});

// ── CP2 ────────────────────────────────────────────────────────────────────────────────────────────
test("CP2 cross-sport, same entity, unpublished and unsupported sports are refused", () => {
  const nflTeam = team("NFL", "nfl-team-12", "Kansas City Chiefs", [["e1", "2025-09-01T00:00:00Z", "NFL-2025", "H", "nfl-team-24", "F", 20, 10, "W"]]);
  assert.deepEqual(getTeamCompareEligibility(mets, nflTeam).blockers, [BLOCKER.DIFFERENT_SPORT]);
  assert.deepEqual(getTeamCompareEligibility(mets, mets).blockers, [BLOCKER.SAME_ENTITY]);
  assert.deepEqual(getTeamCompareEligibility(mets, null).blockers, [BLOCKER.ENTITY_NOT_PUBLISHED]);
  const eplP = player("EPL", "epl-athlete-1", "Mid Fielder", ["EPL.goals"], [["m1", "2025-09-01T15:00:00Z", "EPL-2025-26", "epl-team-1", "epl-team-2", "H", 1]]);
  assert.deepEqual(getPlayerCompareEligibility(wrA, eplP).blockers, [BLOCKER.DIFFERENT_SPORT]);
  assert.deepEqual(sharedStatFamilies(wrA, eplP), [], "cross-sport never intersects even on similar labels");
  const f1 = player("UFC", "ufc-athlete-1", "A", [], []), f2 = player("UFC", "ufc-athlete-2", "B", [], []);
  assert.deepEqual(getPlayerCompareEligibility(f1, f2).blockers, [BLOCKER.SPORT_NOT_SUPPORTED]);
});

// ── CP3 ────────────────────────────────────────────────────────────────────────────────────────────
test("CP3 exact stat intersection in product order; no fallback to an unshared stat", () => {
  assert.deepEqual(sharedStatFamilies(wrA, wrB), [REC, RCP]);
  const e = getPlayerCompareEligibility(wrA, wrB);
  assert.equal(e.selectedStat, REC, "default = first shared family in product order");
  const noShare = getPlayerCompareEligibility(wrA, qb);
  assert.deepEqual(noShare.blockers, [BLOCKER.NO_SHARED_STAT]);
  assert.equal(noShare.selectedStat, null, "never an arbitrary stat");
  const bad = getPlayerCompareEligibility(wrA, wrB, { stat: PASS });
  assert.deepEqual(bad.blockers, [BLOCKER.STAT_NOT_SHARED]);
  assert.equal(bad.selectedStat, null);
  assert.deepEqual(getPlayerCompareEligibility(wrA, wrB, { stat: "NFL.receivingyards" }).blockers, [BLOCKER.STAT_NOT_SHARED], "case-variant key is not a key");
  assert.equal(statFamily("NFL.Receiving Yards"), null);
  assert.equal(familyBySlug("NFL", "receiving-yards")?.key, REC);
  assert.equal(familyBySlug("EPL", "receiving-yards"), null);
  // MLB hitter vs pitcher-only: no shared family.
  const hitter = player("MLB", "mlb-player-1", "Hit Ter", ["MLB.hits"], [["x", "2026-07-01T23:00:00Z", "MLB-2026", NYM, NYY, "H", 1]]);
  const pitcher = player("MLB", "mlb-player-2", "Pitch Er", ["MLB.pitcherStrikeouts"], [["y", "2026-07-01T23:00:00Z", "MLB-2026", NYY, NYM, "A", 7]]);
  assert.deepEqual(getPlayerCompareEligibility(hitter, pitcher).blockers, [BLOCKER.NO_SHARED_STAT]);
});

// ── CP4 ────────────────────────────────────────────────────────────────────────────────────────────
test("CP4 newest SHARED factual season is the default; NFL 2026 without rows is never chosen", () => {
  const e = getPlayerCompareEligibility(wrA, wrB);
  assert.deepEqual(e.sharedSeasons, ["NFL-2025"], "A has 2024+2025 values, B 2023+2025 → only 2025 shared");
  assert.equal(e.defaultSeason, "NFL-2025");
  assert.ok(!e.sharedSeasons.includes("NFL-2026"), "a 2026 row with no recorded value is not a season with data");
  assert.deepEqual(getPlayerCompareEligibility(wrA, wrB, { season: "NFL-2026" }).blockers, [BLOCKER.SEASON_NOT_SHARED]);
  assert.deepEqual(getPlayerCompareEligibility(wrA, wrB, { season: "NFL-2024" }).blockers, [BLOCKER.SEASON_NOT_SHARED], "one side only");
  const old = player("NFL", "nfl-athlete-9", "Old Timer", [REC], [["o1", "2014-09-01T18:00:00Z", "NFL-2014", "nfl-team-5", "nfl-team-6", "H", 55]]);
  assert.deepEqual(getPlayerCompareEligibility(wrA, old).blockers, [BLOCKER.NO_SHARED_SEASON]);
  const t = getTeamCompareEligibility(mets, yankees);
  assert.equal(t.defaultSeason, "MLB-2026");
  assert.deepEqual(t.sharedSeasons, ["MLB-2026", "MLB-2025"]);
});

// ── CP5 ────────────────────────────────────────────────────────────────────────────────────────────
test("CP5 missing is never zero; recorded zero is a value; windows state their own n", () => {
  assert.deepEqual(describeValues([0, null, undefined, 4]), { n: 2, mean: 2, median: 2, min: 0, max: 4, total: 4 });
  assert.deepEqual(describeValues([null, null]), { n: 0, mean: null, median: null, min: null, max: null, total: null });
  const c = buildPlayerComparison({ a: wrA, b: wrB, stat: REC, season: "NFL-2025" });
  assert.equal(c.a.season.n, 2, "2025: 40 and a recorded 0");
  assert.equal(c.a.season.mean, 20);
  assert.equal(c.a.season.min, 0);
  const w5 = c.a.windows.find((w) => w.size === 5);
  assert.equal(w5.n, 3, "g5 (null) and g2 (null) excluded: 0, 40, 20");
  assert.deepEqual(w5.values, [0, 40, 20]);
  assert.equal(w5.complete, false, "3 of 5 is never labelled 'Last 5'");
  const bw5 = c.b.windows.find((w) => w.size === 5);
  assert.equal(bw5.n, 2);
  // Rows keep that game's team (historical affiliation).
  assert.equal(c.a.windows[2].games.find((g) => g.gameId === "g3").teamId, "nfl-team-3");
  // Entity build: a column never recorded (null everywhere) is not a family; a 0-only column is.
  const research = {
    sport: "NFL", id: "nfl-athlete-7", slug: "x", name: "X", currentTeamId: null, coverage: { status: "FULL", notes: [], from: null, to: null },
    columns: [{ key: "targets" }, { key: "receptions" }, { key: "receivingYards" }, { key: "receivingTds" }],
    groups: [{ key: "receiving", label: "Receiving", columns: ["targets", "receptions", "receivingYards", "receivingTds"] }],
    gameLog: [["z1", "2025-09-01T18:00:00Z", "NFL-2025", "nfl-team-1", "nfl-team-2", "H", null, null, null, "E", null, 3, 0, null, 0]],
  };
  const ent = playerCompareEntity(research, "/players/nfl/x/");
  assert.deepEqual(playerStatKeys(research), ["NFL.receptions", "NFL.targets", "NFL.receivingTds"]);
  assert.deepEqual(ent.rows[0].slice(6), [0, 3, 0], "receptions 0 stays 0; receivingYards (null) is not carried");
});

// ── CP6 ────────────────────────────────────────────────────────────────────────────────────────────
test("CP6 head-to-head: finals only, doubleheaders distinct, no duplicate game, ties, pending excluded", () => {
  const h = getHeadToHead({ a: mets, b: yankees });
  assert.deepEqual(h.meetings.map((m) => m.gameId), ["900002", "900001", "800001"], "newest first; both doubleheader games; duplicate row counted once");
  assert.deepEqual(h.record, { meetings: 3, aWins: 1, bWins: 1, ties: 1 });
  assert.deepEqual(h.notFinal.map((m) => m.gameId), ["900003"], "scheduled game listed as not final, never a result");
  assert.equal(h.meetings.find((m) => m.gameId === "900002").aScore, 0, "a 0-run final is a score");
  assert.equal(h.meetings[0].site, "B_HOME");
  assert.deepEqual(getHeadToHead({ a: mets, b: yankees, seasonId: "MLB-2025" }).record, { meetings: 1, aWins: 0, bWins: 0, ties: 1 });
  assert.equal(h.recordedFrom, "MLB-2025", "depth is the shared recorded span, never all-time");
  // Inconsistent sides (scores disagree) are refused, not averaged.
  const bad = team("MLB", NYY, "New York Yankees", [["900001", "2026-08-30T17:05:00Z", "MLB-2026", "H", NYM, "F", 9, 9, "T"]]);
  const hb = getHeadToHead({ a: mets, b: bad });
  assert.equal(hb.record.meetings, 0);
  assert.equal(hb.inconsistent, 1);
  // A game present on one side only is not a meeting.
  const oneSide = team("MLB", NYY, "New York Yankees", []);
  assert.equal(getHeadToHead({ a: mets, b: oneSide }).record.meetings, 0);
  // "before" excludes the game itself and later games.
  assert.deepEqual(getHeadToHead({ a: mets, b: yankees, before: { date: "2026-08-30T23:05:00Z", gameId: "900002" } }).meetings.map((m) => m.gameId), ["900001", "800001"]);
});

// ── CP7 ────────────────────────────────────────────────────────────────────────────────────────────
test("CP7 EPL Team Compare is blocked even when score-shaped rows exist", () => {
  const a = team("EPL", "epl-team-1", "Arsenal", [["s1", "2025-09-01T15:00:00Z", "EPL-2025-26", "H", "epl-team-2", "F", 2, 1, "W"]], { supportsResults: true });
  const b = team("EPL", "epl-team-2", "Chelsea", [["s1", "2025-09-01T15:00:00Z", "EPL-2025-26", "A", "epl-team-1", "F", 1, 2, "L"]], { supportsResults: true });
  const e = getTeamCompareEligibility(a, b);
  assert.equal(e.eligible, false);
  assert.deepEqual(e.blockers, [BLOCKER.TEAM_RESULTS_UNSUPPORTED]);
  const c = buildTeamComparison({ a, b });
  assert.equal(c.season, null);
  assert.equal(c.headToHead, null);
  const h = getHeadToHead({ a, b });
  assert.equal(h.supported, false);
  assert.equal(h.record, null);
  assert.deepEqual(h.meetings, []);
});

// ── CP8 ────────────────────────────────────────────────────────────────────────────────────────────
test("CP8 UFC has no comparable family; its projection counts every fighter as excluded with a reason", () => {
  assert.deepEqual(STAT_FAMILIES.UFC, []);
  const out = assembleCompareProjection({ researchContentSha256: "probe", index: [], teams: { MLB: [], NFL: [], EPL: [] }, players: { NFL: [], EPL: [], MLB: [], UFC: [{ id: "ufc-athlete-1" }] }, labels: {}, previousMatchupIds: {} });
  const rd = JSON.parse(out.files.get("readiness.json"));
  assert.equal(rd.players.UFC.shipped, false);
  assert.deepEqual(rd.players.UFC.excludedReasons, { NO_COMPARABLE_STAT_FAMILY: 1 });
  assert.ok(![...out.files.keys()].some((k) => /UFC/.test(k)), "no UFC compare artifact");
});

// ── CP9 ────────────────────────────────────────────────────────────────────────────────────────────
test("CP9 matchup registry: exact ids, agreeing sides, bounded window, durable, entering-this-game", () => {
  const w = MATCHUP_WINDOWS.MLB;
  const { entries, excluded } = matchupRegistry("MLB", [mets, yankees]);
  assert.deepEqual(entries.map((e) => e.gameId), ["900003"], `window from ${w.fromUtc}: earlier games excluded`);
  assert.ok(excluded.OUTSIDE_WINDOW >= 1);
  const [e] = entries;
  assert.equal(e.homeTeamId, NYM);
  assert.equal(e.awayTeamId, NYY);
  assert.equal(e.final, null, "scheduled game has no final");
  assert.equal(e.priorMeetings, 3);
  assert.equal(e.indexable, false, "MLB matchups are noindex by policy");
  assert.ok(!("upcoming" in e) && !JSON.stringify(e).includes("pcoming"), "Upcoming is never baked into the registry");
  // Sides that disagree on home/away are not a matchup.
  const skew = team("MLB", NYY, "New York Yankees", [["900003", "2026-09-20T23:05:00Z", "MLB-2026", "H", NYM, "S", null, null, null]]);
  const r2 = matchupRegistry("MLB", [mets, skew]);
  assert.equal(r2.entries.length, 0);
  assert.equal(r2.excluded.SIDES_DISAGREE, 1);
  // Composition: entering this game only.
  const m = buildMatchup({ entry: e, home: mets, away: yankees });
  assert.equal(m.headToHead.record.meetings, 3);
  assert.equal(m.home.seasonToDate.finals, 2, "only 2026 finals before the game");
  assert.equal(m.home.priorSeason.seasonId, "MLB-2025");
  assert.deepEqual(m.forecastRef, { sport: "MLB", gameId: "900003" });
  assert.ok(!("forecast" in m));
  // Durability: a registry that would drop a previously published id is refused.
  const input = (prev) => ({ researchContentSha256: "probe", index: [], teams: { MLB: [], NFL: [], EPL: [] }, players: { NFL: [], EPL: [], MLB: [], UFC: [] }, labels: {}, previousMatchupIds: prev });
  assert.throws(() => assembleCompareProjection(input({ MLB: ["900003"] })), /would DROP 1 published page/);
  assert.doesNotThrow(() => assembleCompareProjection(input({})));
});

// ── CP10 ───────────────────────────────────────────────────────────────────────────────────────────
test("CP10 stat families mirror research columns, keys are sport-scoped, order is stable product order", () => {
  assert.equal(assertFamiliesMatchResearch(), true);
  for (const [sport, list] of Object.entries(STAT_FAMILIES)) {
    list.forEach((f, i) => {
      assert.equal(f.key, `${sport}.${f.column}`);
      assert.equal(f.order, i);
      assert.equal(f.comparable, true);
      assert.equal(familyBySlug(sport, statSlug(f))?.key, f.key, "slug round trip");
    });
  }
  assert.deepEqual(STAT_FAMILIES.NFL.slice(0, 4).map((f) => f.column), ["receivingYards", "receptions", "rushingYards", "passingYards"]);
  assert.equal(new Set(Object.values(STAT_FAMILIES).flat().map((f) => f.key)).size, Object.values(STAT_FAMILIES).flat().length);
});

// ── CP11 ───────────────────────────────────────────────────────────────────────────────────────────
test("CP11 comparisons carry no evaluative field", () => {
  const keys = (o, acc = new Set()) => { if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { acc.add(k); keys(v, acc); } return acc; };
  const all = [...keys(buildTeamComparison({ a: mets, b: yankees })), ...keys(buildPlayerComparison({ a: wrA, b: wrB }))].map((k) => k.toLowerCase());
  for (const term of EVALUATIVE_TERMS) assert.ok(!all.some((k) => k.includes(term)), `field containing "${term}"`);
  for (const f of ["forecast", "probability", "edge", "winner", "rank"]) assert.ok(FORBIDDEN_COMPARE_FIELDS.includes(f));
});
