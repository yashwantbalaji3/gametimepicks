/**
 * Tests for projection-availability helpers (PR 1 — projections fallback
 * clarity). Locks the actionable-vs-prop-line distinction and the honest
 * default-date selection (latest actionable slate over a future props-only
 * shell).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isActionableProjection,
  classifyProjectionEntry,
  getActionableProjectionCount,
  getPropLineCount,
  summarizeProjectionEntries,
  selectDefaultProjectionDate,
} from "./projection-availability.ts";

const actionable = { projection: 1.1, confidence: "High", side: "Over", line: 0.5 };
const actionableUnder = { projection: 0.2, confidence: "Medium", side: "Under", line: 1.5 };
const insufficientWithLine = { projection: null, confidence: "insufficient_data", side: "Pass", line: 5.5 };
const passNoProj = { projection: null, confidence: "trends_pending", side: "Pass", line: 2.5 };
const noProjNoLine = { projection: null, confidence: "insufficient_data", side: "", line: null };

test("actionable = real projection + Over/Under + non-insufficient confidence", () => {
  assert.equal(isActionableProjection(actionable), true);
  assert.equal(isActionableProjection(actionableUnder), true);
});

test("projection:null + insufficient_data is NOT actionable (it's a prop line)", () => {
  assert.equal(isActionableProjection(insufficientWithLine), false);
  assert.equal(classifyProjectionEntry(insufficientWithLine), "prop_line");
});

test("Pass with no projection is NOT actionable", () => {
  assert.equal(isActionableProjection(passNoProj), false);
  assert.equal(classifyProjectionEntry(passNoProj), "prop_line"); // has a line
});

test("no projection AND no line classifies as insufficient", () => {
  assert.equal(classifyProjectionEntry(noProjNoLine), "insufficient");
  assert.equal(isActionableProjection(noProjNoLine), false);
});

test("an Over with projection but insufficient_data confidence is not actionable", () => {
  assert.equal(isActionableProjection({ projection: 1.0, confidence: "insufficient_data", side: "Over", line: 0.5 }), false);
});

test("counts separate actionable vs prop lines vs insufficient", () => {
  const entries = [actionable, actionableUnder, insufficientWithLine, passNoProj, noProjNoLine];
  assert.equal(getActionableProjectionCount(entries), 2);
  assert.equal(getPropLineCount(entries), 2); // insufficientWithLine + passNoProj
  const s = summarizeProjectionEntries(entries);
  assert.deepEqual(s, { actionable: 2, propLines: 2, insufficient: 1, total: 5 });
});

test("a props-only board (all insufficient, like June-3) summarizes to 0 actionable", () => {
  const board = Array.from({ length: 80 }, () => ({ projection: null, confidence: "insufficient_data", side: "Pass", line: 5.5 }));
  const s = summarizeProjectionEntries(board);
  assert.equal(s.actionable, 0);
  assert.equal(s.propLines, 80); // "80 prop lines", NOT "80 projections"
});

// --- default-date selection (the June-2/June-3 scenario) -------------------
const TODAY = "2026-06-02";
// June-1 = real MLB slate (actionable); June-2 = no board; June-3 = props-only.
const scenario = [
  { date: "2026-06-01", actionableCount: 330, propLineCount: 26 },
  { date: "2026-06-03", actionableCount: 0, propLineCount: 80 },
];

test("does NOT default to the future props-only board when a latest actionable slate exists", () => {
  const choice = selectDefaultProjectionDate(scenario, TODAY);
  assert.equal(choice.date, "2026-06-01");
  assert.equal(choice.mode, "latest_actionable");
});

test("prefers today when today has actionable projections", () => {
  const withToday = [...scenario, { date: TODAY, actionableCount: 200, propLineCount: 10 }];
  const choice = selectDefaultProjectionDate(withToday, TODAY);
  assert.equal(choice.date, TODAY);
  assert.equal(choice.mode, "today_actionable");
});

test("falls back to upcoming actionable when nothing past is actionable", () => {
  const choice = selectDefaultProjectionDate(
    [{ date: "2026-06-03", actionableCount: 50, propLineCount: 5 }],
    TODAY,
  );
  assert.equal(choice.date, "2026-06-03");
  assert.equal(choice.mode, "upcoming_actionable");
});

test("future props-only board is labeled upcoming_lines (not actionable)", () => {
  const choice = selectDefaultProjectionDate(
    [{ date: "2026-06-03", actionableCount: 0, propLineCount: 80 }],
    TODAY,
  );
  assert.equal(choice.date, "2026-06-03");
  assert.equal(choice.mode, "upcoming_lines");
});

test("no actionable anywhere + today present → today_empty", () => {
  const choice = selectDefaultProjectionDate(
    [{ date: TODAY, actionableCount: 0, propLineCount: 0 }],
    TODAY,
  );
  assert.equal(choice.date, TODAY);
  assert.equal(choice.mode, "today_empty");
});

test("empty list → none", () => {
  assert.deepEqual(selectDefaultProjectionDate([], TODAY), { date: null, mode: "none" });
});
