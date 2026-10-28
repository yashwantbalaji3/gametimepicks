/**
 * W9 · audit row 26: /simulate/d/2026-10-27 read "A settled slate: 0 of 5 events are final". The past-date header is
 * built from the per-event lifecycle states (postStartState), so it says exactly what they say.
 *
 * Run: cd app && npx tsx --test src/lib/simulate/past-slate-summary.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pastSlateSummary } from "./lifecycle-state.mjs";

test("the 10-27 shape: nothing graded is never called settled or final", () => {
  const s = pastSlateSummary({ events: 5, settled: 0, awaiting: 0, started: 5 });
  assert.equal(s, "A past slate: 0 of 5 events graded · 5 started, not graded yet.");
  assert.doesNotMatch(s, /settled slate|are final/);
});

test("mixed, all-graded and empty slates", () => {
  assert.equal(pastSlateSummary({ events: 5, settled: 2, awaiting: 1, started: 2 }), "A past slate: 2 of 5 events graded · 1 final, grading pending · 2 started, not graded yet.");
  assert.equal(pastSlateSummary({ events: 3, settled: 3, awaiting: 0, started: 0 }), "All 3 events are graded.");
  assert.equal(pastSlateSummary({ events: 1, settled: 1, awaiting: 0, started: 0 }), "All 1 event is graded.");
  assert.equal(pastSlateSummary({ events: 4, settled: 1, awaiting: 0, started: 0 }), "A past slate: 1 of 4 events graded · 3 with no result yet.");
  assert.equal(pastSlateSummary({ events: 0, settled: 0, awaiting: 0, started: 0 }), "No events on this date.");
});

test("the day view counts each post-start state and the page renders the summary from them", () => {
  const dv = fs.readFileSync(path.join(process.cwd(), "src/lib/simulate/day-view.ts"), "utf8");
  assert.match(dv, /awaiting: all\.filter\(\(e\) => e\.state === "AWAITING_SETTLEMENT"\)\.length/);
  assert.match(dv, /started: all\.filter\(\(e\) => e\.state === "STARTED"\)\.length/);
  const page = fs.readFileSync(path.join(process.cwd(), "src/app/simulate/d/[date]/page.tsx"), "utf8");
  assert.match(page, /\{pastSlateSummary\(view\.totals\)\}/);
  assert.doesNotMatch(page, /A settled slate/);
});
