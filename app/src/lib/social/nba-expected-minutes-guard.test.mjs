import test from "node:test";
import assert from "node:assert/strict";
// Bound: 99th percentile of player-game minutes over the latest 1,200 committed box scores (26,322 rows): 41.
// Fixture rows are from the published 2026-11-02 lane; the lane itself stays frozen.
const BOUND = 41;
export const overBound = (rows) => rows.filter((r) => r.expectedMinutes > BOUND).map((r) => r.name);
test("guard flags the 2026-11-02 rows above the sourced minutes bound", () => {
  const rows = [{ name: "Shai Gilgeous-Alexander", expectedMinutes: 48 }, { name: "Rui Hachimura", expectedMinutes: 45.8 }, { name: "Ajay Mitchell", expectedMinutes: 40.9 }];
  assert.deepEqual(overBound(rows), ["Shai Gilgeous-Alexander", "Rui Hachimura"]);
});
