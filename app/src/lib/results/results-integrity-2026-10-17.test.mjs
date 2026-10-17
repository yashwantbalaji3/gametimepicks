/**
 * RESULTS INTEGRITY REVIEW (2026-10-17) — presentation/computation fixes, each pinned on committed data or the
 * source that renders it. No grade, forecast or committed artifact changes; no canonical metric moves.
 *
 *   1. /mlb/board/<date> settled banner counts the day's leans OF RECORD (was the raw comparison report:
 *      2026-09-22 said 283–266 on 549 while /results/date and /results/model-audit said 273–258 on 531).
 *   2. The NFL forward-test status sums n across families; it is labelled as forecasts, never "player-games".
 *   3. The lifetime audit note's sample sentence follows sampleStateFor (it said "still on an early sample" at 49,606).
 *   4. /results/nfl week table: a rate under the 30 floor carries "too few to judge".
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const { getMlbComparisonReport, getMlbSettledLeansForDate, mlbDayRecordOfRecord } = await import("../data-mlb-results.ts");
const { lifetimeSampleSentence } = await import("../results-audit-notes.ts");
const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("1 · 2026-09-22: the board banner's record is the day's record of record, not the raw report", () => {
  const report = getMlbComparisonReport("2026-09-22");
  assert.ok(report, "the committed 09-22 comparison report exists");
  assert.equal(`${report.wins}–${report.losses}`, "283–266", "the raw report still counts the superseded 824785 copies (unchanged, historical)");
  const rec = mlbDayRecordOfRecord(getMlbSettledLeansForDate("2026-09-22"));
  assert.equal(`${rec.wins}–${rec.losses}`, "273–258", "of record: the same count /results/date/2026-09-22 and /results/model-audit show");
  assert.equal(rec.decisive, 531);
  const body = src("src/components/mlb/mlb-board-body.tsx");
  assert.match(body, /mlbDayRecordOfRecord\(getMlbSettledLeansForDate\(date\)\)/, "the banner reads the record of record");
  assert.doesNotMatch(body, /const w = mlbReport\.wins;/, "never the raw report alone");
});

test("1b · mlbDayRecordOfRecord: pushes and voids are never decisive; empty is null, not 0–0", () => {
  assert.equal(mlbDayRecordOfRecord([]), null);
  const r = mlbDayRecordOfRecord([{ outcome: "Win" }, { outcome: "Loss" }, { outcome: "Push" }, { outcome: "Void" }, { outcome: "Win" }]);
  assert.deepEqual(r, { wins: 2, losses: 1, pushes: 1, voids: 1, decisive: 3, hitRate: 2 / 3 });
});

test("2 · the NFL forward-test sum is labelled as forecasts across families, never as player-games", () => {
  const s = src("src/lib/command-center/model-status.ts");
  assert.doesNotMatch(s, /\$\{fwdN\} player-games/, "a sum over families is not a count of player-games");
  assert.match(s, /\$\{fwdN\} forecasts graded so far across \$\{forward\.length\} families/);
});

test("3 · the lifetime audit note says what its sample supports", () => {
  assert.match(lifetimeSampleSentence(12), /far too few/i);
  assert.match(lifetimeSampleSentence(120), /still a small sample/i);
  const big = lifetimeSampleSentence(49606);
  assert.doesNotMatch(big, /early sample|small sample|too few/i, "49,606 decisive picks is not an early sample");
  assert.match(big, /not evidence the model out-predicts the market/i, "a large sample still earns no market claim");
  assert.doesNotMatch(src("src/lib/results-audit-notes.ts"), /The audit is still on an early sample/);
});

test("4 · /results/nfl: a week-table rate under the floor carries the small-sample note", () => {
  const page = src("src/app/results/nfl/page.tsx");
  assert.match(page, /sampleStateFor\(p\.checks\) === SAMPLE_STATE\.TOO_SMALL \? <div className="f" data-sample="too-small">too few to judge<\/div>/);
});
