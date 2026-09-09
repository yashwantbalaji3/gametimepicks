import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, quarterbackSnapshotsFromCsv, projectedQuarterbackAt } from "./depth-chart-snapshots.mjs";
const header = "dt,team,player_name,espn_id,pos_abb,pos_rank";
test("CSV preserves quoted names, escapes and line endings", () => {
  assert.deepEqual(parseCsv('a,b\r\n"A, B","Q""B"\r\n'), [["a", "b"], ["A, B", 'Q"B']]);
  assert.throws(() => parseCsv('"bad'));
});
test("as-of lookup cannot use a future or exact-cutoff snapshot", () => {
  const { snapshots } = quarterbackSnapshotsFromCsv(`${header}\n2025-09-01T07:00:00Z,WAS,Earlier,1,QB,1\n2025-09-02T07:00:00Z,WAS,Later,2,QB,1`);
  const found = projectedQuarterbackAt(snapshots, { team: "WSH", cutoffIso: "2025-09-02T07:00:00Z" });
  assert.equal(found.playerId, "1");
  assert.equal(projectedQuarterbackAt(snapshots, { team: "WSH", cutoffIso: "2025-08-31T00:00:00Z" }).state, "MISSING");
  assert.equal(projectedQuarterbackAt(snapshots, { team: "WSH", cutoffIso: "2025-10-01T00:00:00Z" }).state, "STALE");
});
test("duplicate formation rows collapse; ambiguous leaders never guess", () => {
  const row = "2025-09-01T07:00:00Z,LA,One,1,QB,1";
  const d = quarterbackSnapshotsFromCsv(`${header}\n${row}\n${row}`);
  assert.equal(d.snapshots[0].quarterbacks.length, 1);
  const ambiguous = quarterbackSnapshotsFromCsv(`${header}\n${row}\n2025-09-01T07:00:00Z,LA,Two,2,QB,1`);
  assert.equal(projectedQuarterbackAt(ambiguous.snapshots, { team: "LAR", cutoffIso: "2025-09-02T00:00:00Z" }).state, "AMBIGUOUS");
  assert.throws(() => quarterbackSnapshotsFromCsv("season,week,player\n2024,1,a"));
});
