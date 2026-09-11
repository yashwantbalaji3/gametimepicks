import test from "node:test";
import assert from "node:assert/strict";
import { lastPreKickoffForecasts, gradeMatch, mergeGraded, summarize, gradedCaption, UNIFORM_LOG_LOSS } from "./grading.mjs";

const row = (eventId, kickoffUtc, probs, forecastAt) => ({ eventId, matchup: "A v B", homeClub: "A", awayClub: "B", kickoffUtc, probs, ...(forecastAt ? { forecastAt } : {}) });

test("the graded forecast is the LAST one published before kickoff — never one made after", () => {
  const m = lastPreKickoffForecasts([
    { generatedAt: "2026-09-10T09:00:00Z", rows: [row("e1", "2026-09-11T18:45:00Z", { home: 0.4, draw: 0.3, away: 0.3 })] },
    { generatedAt: "2026-09-11T09:00:00Z", rows: [row("e1", "2026-09-11T18:45:00Z", { home: 0.5, draw: 0.25, away: 0.25 })] },
    { generatedAt: "2026-09-11T20:00:00Z", rows: [row("e1", "2026-09-11T18:45:00Z", { home: 0.9, draw: 0.05, away: 0.05 })] },
  ]);
  assert.equal(m.get("e1").row.probs.home, 0.5);
  assert.equal(m.get("e1").forecastAt, "2026-09-11T09:00:00Z");
});

test("a row's own forecastAt wins over its archive's stamp (carried rows keep their pre-kickoff time)", () => {
  const m = lastPreKickoffForecasts([{ generatedAt: "2026-09-11T20:00:00Z", rows: [row("e1", "2026-09-11T18:45:00Z", { home: 0.5, draw: 0.25, away: 0.25 }, "2026-09-11T15:00:00Z")] }]);
  assert.equal(m.get("e1").forecastAt, "2026-09-11T15:00:00Z");
});

test("grading uses the standard definitions", () => {
  const g = gradeMatch({ row: row("e1", "2026-09-11T18:45:00Z", { home: 0.5, draw: 0.25, away: 0.25 }), forecastAt: "x" }, { home: 1, away: 1 });
  assert.equal(g.result, "D");
  assert.equal(g.probabilityOfResult, 0.25);
  assert.equal(g.logLoss, Number((-Math.log(0.25)).toFixed(4)));
  assert.equal(g.brier, Number((0.25 + 0.5625 + 0.0625).toFixed(4)));
});

test("append-only: an existing grade is kept, a disagreeing re-grade is refused", () => {
  const g = gradeMatch({ row: row("e1", "2026-09-11T18:45:00Z", { home: 0.5, draw: 0.25, away: 0.25 }), forecastAt: "t" }, { home: 2, away: 0 });
  const first = mergeGraded([], [g]);
  assert.equal(first.added, 1);
  assert.equal(mergeGraded(first.matches, [g]).added, 0, "re-running grades nothing new");
  const restated = { ...g, final: { home: 1, away: 1 }, result: "D" };
  assert.throws(() => mergeGraded(first.matches, [restated]), /refusing to restate/);
});

test("the caption never lets a small sample read as a verdict", () => {
  assert.equal(summarize([]).sampleState, "NONE");
  assert.equal(summarize([{ logLoss: 1, brier: 0.6 }]).sampleState, "TOO_SMALL_TO_ASSESS");
  assert.match(gradedCaption(summarize([{ logLoss: 1, brier: 0.6 }])), /far too few/);
  assert.equal(UNIFORM_LOG_LOSS, 1.0986);
});
