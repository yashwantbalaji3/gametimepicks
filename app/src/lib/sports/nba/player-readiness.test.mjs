import test from "node:test";
import assert from "node:assert/strict";
import { assessPlayer } from "./player-readiness.mjs";
const base = { n: 6, teamGames: 7, missedLast: false, missedTwo: false, injured: false, medians: { pts: 20, reb: 5, ast: 4 }, recent: { pts: 20, reb: 5, ast: 4 }, lines: {} };
test("real 2026-11-02 rows", () => {
  assert.equal(assessPlayer({ ...base, mu: 48, cur: 32.7 }).state, "BLOCKED");
  assert.equal(assessPlayer({ ...base, mu: 17.3, cur: 32.4 }).reasons[0], "B_GAP");
  assert.equal(assessPlayer({ ...base, n: 0, cur: null, mu: 18.8 }).reasons[0], "B_ELIG");
});
test("every market inherits a bad minutes tier", () => {
  const r = assessPlayer({ ...base, mu: 28.7, cur: 37.7 });
  assert.deepEqual(Object.values(r.cells).map((c) => c.state), ["REVIEW", "REVIEW", "REVIEW"]);
});
test("Mitchell: minutes pass, the points gap to recent and to the line does not", () => {
  const r = assessPlayer({ ...base, mu: 40.3, cur: 32.3, medians: { pts: 30.5, reb: 5.3, ast: 3.5 }, recent: { pts: 22.7, reb: 5.3, ast: 4.5 }, lines: { pts: 22.5 } });
  assert.deepEqual(r.cells.pts.reasons, ["R_STAT", "R_LINE"]);
  assert.equal(r.cells.reb.state, "PASS");
});
test("an injury tag alone leaves numbers visible but the row in REVIEW", () => {
  const r = assessPlayer({ ...base, mu: 30, cur: 30, injured: true });
  assert.equal(r.state, "REVIEW"); assert.equal(r.cells.pts.state, "PASS");
});
