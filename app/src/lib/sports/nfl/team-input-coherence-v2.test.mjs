/**
 * Team-input coherence VERSION 2 (primary passer + departures) — synthetic inputs only.
 * Run (from app/): npx tsx --test src/lib/sports/nfl/team-input-coherence-v2.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { primaryPasserFrom, teamInputCoherence } from "./team-input-coherence.mjs";

const g = (d, home, away, rows) => ({ dateUtc: d, home, away, players: rows });
const qb = (id, team, att, name = `QB${id}`) => ({ playerId: `nfl-athlete-${id}`, name, teamAbbr: team, passAtt: att });
const GAMES = [
  g("2026-10-11T17:00Z", "MIN", "X", [qb(1, "MIN", 35)]),            // outside the last 4
  g("2026-10-18T17:00Z", "Y", "MIN", [qb(2, "MIN", 30)]),
  g("2026-10-25T17:00Z", "MIN", "Z", [qb(2, "MIN", 28), qb(1, "MIN", 4)]),
  g("2026-11-01T17:00Z", "W", "MIN", [qb(2, "MIN", 25)]),
  g("2026-11-08T17:00Z", "MIN", "V", [qb(1, "MIN", 33)]),
  g("2026-11-08T17:00Z", "LV", "U", [qb(7, "LV", 40, "Departed QB")]),
  g("2026-11-20T17:00Z", "MIN", "T", [qb(1, "MIN", 50)]),            // after the forecast: never read
];
const NOW = "2026-11-15T00:48:17Z";
const chart = (id) => () => ({ state: "RESOLVED", starter: { playerId: id }, snapshotAt: NOW });
const part = (rows) => ({ injuriesAsOf: NOW, excludedIneligible: rows });
const out = (id, team, status = "Out") => ({ playerId: `nfl-athlete-${id}`, name: `QB${id}`, team, market: "passAttempts", status });

test("primary passer: most attempts over the last 4 team games before the forecast; nfl-verse side codes accepted", () => {
  assert.deepEqual(primaryPasserFrom(GAMES, "MIN", NOW), { playerId: "nfl-athlete-2", name: "QB2", attempts: 83, games: 4 });
  assert.equal(primaryPasserFrom([g("2026-11-01T17:00Z", "WAS", "X", [qb(9, "WSH", 30)])], "WSH", NOW).playerId, "nfl-athlete-9");
  assert.equal(primaryPasserFrom([], "MIN", NOW), null);
});

test("v1 unchanged without primaryPasserOf: the chart's QB1 decides; version stays 1; no basis field", () => {
  const r = teamInputCoherence({ participation: part([out(2, "MIN")]), teams: ["MIN", "GB"], qb1Of: chart(1) });
  assert.deepEqual([r.state, r.version], ["NO_STARTING_QB_ABSENCE", 1]);
  const blind = teamInputCoherence({ participation: part([out(1, "MIN")]), teams: ["MIN", "GB"], qb1Of: chart(1) });
  assert.equal(blind.state, "BLIND_TO_STARTING_QB_ABSENCE");
  assert.equal("basis" in blind.absences[0], false, "byte-identical v1 output");
});

test("v2: the primary passer listed Out is material even when the chart names someone else (MIN 11-15 shape)", () => {
  const r = teamInputCoherence({ participation: part([out(2, "MIN")]), teams: ["MIN", "GB"], qb1Of: chart(1), primaryPasserOf: (t) => primaryPasserFrom(GAMES, t, NOW) });
  assert.deepEqual([r.state, r.version, r.comparisonWithheld], ["BLIND_TO_STARTING_QB_ABSENCE", 2, true]);
  assert.deepEqual(r.absences[0].basis, ["PRIMARY_PASSER_83_ATT_LAST_4"]);
});

test("v2: a backup who is neither QB1 nor primary is not material; an unreadable chart still withholds nothing", () => {
  const r = teamInputCoherence({ participation: part([out(5, "MIN")]), teams: ["MIN", "GB"], qb1Of: chart(1), primaryPasserOf: (t) => primaryPasserFrom(GAMES, t, NOW) });
  assert.equal(r.state, "NO_STARTING_QB_ABSENCE");
  const u = teamInputCoherence({ participation: part([out(5, "MIN")]), teams: ["MIN", "GB"], qb1Of: () => null, primaryPasserOf: (t) => primaryPasserFrom(GAMES, t, NOW) });
  assert.equal(u.state, "UNKNOWN");
});

test("v2 departures: the primary passer now on another roster is material; same team or unknown roster is not", () => {
  const args = { participation: part([]), teams: ["SEA", "LV"], qb1Of: chart(99), primaryPasserOf: (t) => primaryPasserFrom(GAMES, t, NOW) };
  const r = teamInputCoherence({ ...args, currentTeamOf: (id) => (id === "nfl-athlete-7" ? "MIN" : null) });
  assert.equal(r.state, "BLIND_TO_STARTING_QB_ABSENCE");
  assert.deepEqual([r.absences[0].name, r.absences[0].team, r.absences[0].status, r.absences[0].basis], ["Departed QB", "LV", "no longer on the roster (now MIN)", ["PRIMARY_PASSER_40_ATT_LAST_1", "DEPARTED"]]);
  assert.equal(teamInputCoherence({ ...args, currentTeamOf: (id) => (id === "nfl-athlete-7" ? "LV" : null) }).state, "NO_STARTING_QB_ABSENCE");
  assert.equal(teamInputCoherence({ ...args, currentTeamOf: () => null }).state, "NO_STARTING_QB_ABSENCE");
});
