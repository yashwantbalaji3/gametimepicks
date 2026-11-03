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
