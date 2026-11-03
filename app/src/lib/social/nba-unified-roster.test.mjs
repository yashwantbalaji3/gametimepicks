import assert from "node:assert/strict";
import test from "node:test";

import { unifiedRoster } from "../../../scripts/social/nba-unified-roster.mjs";

const p = (name, o = {}) => ({ name, mu: 30, n: 5, cur: 30, teamGames: 5, missedLast: false, missedTwo: false, injured: false, medians: { pts: 15, reb: 5, ast: 3 }, recent: { pts: 15, reb: 5, ast: 3 }, lines: { pts: null, reb: null, ast: null }, ...o });

test("starters plus a sixth man; an Out starter is dropped, an unprojected starter reads No projection, a blocked one is Review", () => {
  const I = { AAA: { covShare: 0, sum: 0, n: 0, starters: ["1", "2", "3", "4", "9"], bench: ["5", "6"], names: { 9: "Nine Rookie" }, injAll: { 4: "Out" }, players: {
    1: p("One"), 2: p("Two", { mu: 49 }), 3: p("Three", { recent: { pts: 15, reb: 5, ast: 9 } }), 4: p("Four"), 5: p("Five", { mu: 44 }), 6: p("Six", { mu: 20, cur: 20 }),
  } } };
  const { roster, table } = unifiedRoster(I);
  assert.deepEqual(roster.AAA, ["1", { id: "2", name: "Two", review: true }, "3", { id: "9", name: "Nine Rookie", review: true, text: "No projection available" }, "6"]);
  assert.deepEqual(roster.__cells, { 3: ["ast"] });
  assert.equal(table.AAA.rows[1].hide, "ALL");
});

test("low team coverage puts every unblocked player under review", () => {
  const { table } = unifiedRoster({ AAA: { covShare: 0.2, sum: 0, n: 0, starters: ["1"], bench: [], names: {}, injAll: {}, players: { 1: p("One") } } });
  assert.equal(table.AAA.rows[0].state, "REVIEW");
  assert.ok(table.AAA.rows[0].reasons.includes("R_TEAM_COVERAGE"));
});

test("availability guard R1-R3: Out or Day-To-Day, under 3 games, minutes beyond 42 or the own range +-4 hide the row", () => {
  const I = { AAA: { covShare: 0, sum: 0, n: 0, starters: ["1", "2", "3", "4", "5", "6"], bench: ["7"], names: {}, injAll: { 1: "Day-To-Day" }, players: {
    1: p("Dtd"), 2: p("Thin", { n: 2 }), 3: p("Monk", { mu: 22.1, cur: 14.8, minLo: 8, minHi: 14 }), 4: p("Ok", { minLo: 25, minHi: 35 }),
    5: p("AD", { mu: 24.8, minLo: 31, minHi: 36 }), 6: p("Big", { mu: 42.5, cur: 38, minLo: 36, minHi: 44 }), 7: p("Bench", { mu: 20, cur: 20, minLo: 15, minHi: 25 }),
  } } };
  const { roster, table } = unifiedRoster(I);
  assert.deepEqual(roster.__guard, { 1: ["R1"], 2: ["R2"], 3: ["R3"], 5: ["R3"], 6: ["R3"] });
  assert.deepEqual(roster.AAA.map((e) => (typeof e === "object" ? `${e.id}R` : e)), ["1R", "2R", "3R", "4", "5R", "6R", "7"]);
  assert.deepEqual(table.AAA.rows[0].guard, ["R1"]);
});

test("guard never changes a number: medians and expected minutes are not in the roster file", () => {
  const { roster } = unifiedRoster({ AAA: { covShare: 0, sum: 0, n: 0, starters: ["1"], bench: [], names: {}, injAll: {}, players: { 1: p("One", { mu: 45, cur: 30 }) } } });
  assert.ok(!/15|45/.test(JSON.stringify(roster.AAA)));
});
