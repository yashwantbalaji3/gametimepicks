/**
 * Period facts (quarters, OT, tie) are what overtime and score-shape grades will settle against, so
 * they hold the repo's rule that missing is not false: OT is a boolean only when the official
 * linescores are present and add up to the official final.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { officialFromEspnSummary, periodsFromEspnSummary } from "./week-reconciliation.mjs";

const summary = ({ home, away, homeLines, awayLines, period, completed = true, name = "STATUS_FINAL" }) => ({
  header: {
    competitions: [{
      status: { period, type: { completed, name } },
      competitors: [
        { homeAway: "home", score: String(home), ...(homeLines ? { linescores: homeLines.map((v) => ({ value: v })) } : {}) },
        { homeAway: "away", score: String(away), ...(awayLines ? { linescores: awayLines.map((v) => ({ displayValue: String(v) })) } : {}) },
      ],
    }],
  },
  boxscore: { players: [] },
});

test("a regulation final: four periods, no OT, not a tie", () => {
  const p = periodsFromEspnSummary(summary({ home: 30, away: 23, homeLines: [7, 10, 3, 10], awayLines: [3, 7, 6, 7], period: 4 }));
  assert.deepEqual(p.periods, { home: [7, 10, 3, 10], away: [3, 7, 6, 7] });
  assert.equal(p.finalPeriod, 4);
  assert.equal(p.overtime, false);
  assert.equal(p.tie, false);
  assert.equal(p.note, null);
});

test("an overtime final is OT", () => {
  const p = periodsFromEspnSummary(summary({ home: 26, away: 20, homeLines: [7, 3, 7, 3, 6], awayLines: [0, 10, 3, 7, 0], period: 5 }));
  assert.equal(p.finalPeriod, 5);
  assert.equal(p.overtime, true);
  assert.equal(p.tie, false);
});

test("an overtime tie is OT and a tie", () => {
  const p = periodsFromEspnSummary(summary({ home: 20, away: 20, homeLines: [7, 3, 7, 3, 0], awayLines: [0, 10, 3, 7, 0], period: 5 }));
  assert.equal(p.overtime, true);
  assert.equal(p.tie, true);
});

test("missing linescores leave OT missing, never false", () => {
  const p = periodsFromEspnSummary(summary({ home: 30, away: 23, period: 4 }));
  assert.equal(p.periods, null);
  assert.equal(p.overtime, null);
  assert.match(p.note, /absent/);
});

test("linescores that do not add up to the official final are refused", () => {
  const p = periodsFromEspnSummary(summary({ home: 30, away: 23, homeLines: [7, 10, 3, 9], awayLines: [3, 7, 6, 7], period: 4 }));
  assert.equal(p.periods, null);
  assert.equal(p.overtime, null);
  assert.match(p.note, /do not sum/);
});

test("a status period that disagrees with the linescores leaves OT missing", () => {
  const p = periodsFromEspnSummary(summary({ home: 30, away: 23, homeLines: [7, 10, 3, 10], awayLines: [3, 7, 6, 7], period: 5 }));
  assert.equal(p.overtime, null);
  assert.match(p.note, /disagrees/);
});

test("a game that is not final has no period facts", () => {
  assert.equal(periodsFromEspnSummary(summary({ home: 7, away: 3, homeLines: [7], awayLines: [3], period: 1, completed: false, name: "STATUS_IN_PROGRESS" })), null);
  assert.equal(periodsFromEspnSummary(null), null);
});

test("additive only: officialFromEspnSummary output is unchanged by linescores", () => {
  const withLines = officialFromEspnSummary(summary({ home: 30, away: 23, homeLines: [7, 10, 3, 10], awayLines: [3, 7, 6, 7], period: 4 }));
  const without = officialFromEspnSummary(summary({ home: 30, away: 23, period: 4 }));
  assert.deepEqual(withLines, without);
  assert.deepEqual(Object.keys(withLines).sort(), ["finalScore", "players", "scorers", "state"]);
});
