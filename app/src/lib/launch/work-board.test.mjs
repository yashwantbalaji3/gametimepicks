/**
 * Work-board guards (Program 153 · Release E).
 *
 * Run: npx tsx --test src/lib/launch/work-board.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildWorkBoard, BOARD_STATES } from "./work-board.mjs";
import { SPORT_ASSESSMENTS } from "../sports/sport-assessments.mjs";

test("the board is a pure function of committed truth — same inputs, same bytes, no clock", () => {
  const a = JSON.stringify(buildWorkBoard());
  const b = JSON.stringify(buildWorkBoard());
  assert.equal(a, b);
});

test("every PARTIAL non-MLB stage is a visible IN_PROGRESS card; BLOCKED_EXTERNAL is a visible blocked card", () => {
  const board = buildWorkBoard();
  const ids = new Set([...Object.values(board.columns).flat(), ...board.founderQueue].map((t) => t.id));
  for (const [sport, a] of Object.entries(SPORT_ASSESSMENTS)) {
    if (sport === "mlb") continue;
    for (const [stage, s] of Object.entries(a.stages)) {
      if (s.status === "PARTIAL" || s.status === "BLOCKED_EXTERNAL") {
        assert.ok(ids.has(`stage-${sport}-${stage}`), `${sport}.${stage} must appear on the board — silent work is unmanaged work`);
      }
    }
  }
});

test("no ticket exists without owner + next action + acceptance; founder cards never sit in engineering columns", () => {
  const board = buildWorkBoard();
  for (const t of [...Object.values(board.columns).flat(), ...board.founderQueue]) {
    assert.ok(t.owner && t.nextAction && t.acceptance, `${t.id}: decoration ticket`);
    assert.ok(BOARD_STATES.includes(t.state), t.id);
  }
  for (const t of Object.values(board.columns).flat()) assert.equal(t.owner, "ENGINEERING");
  for (const t of board.founderQueue) assert.equal(t.owner, "FOUNDER");
});

test("dedup by stable id — one underlying issue, one card (a duplicate throws, never renders twice)", () => {
  assert.throws(() => buildWorkBoard({
    roadmap: [
      { horizon: "NOW", items: [{ outcome: "x", owner: "ENGINEERING", acceptance: "some acceptance text here" }, { outcome: "y", owner: "ENGINEERING", acceptance: "some acceptance text here" }] },
      { horizon: "NOW", items: [] },
    ].map((h, i) => (i === 1 ? { horizon: "NOW", items: [{ outcome: "z", owner: "ENGINEERING", acceptance: "some acceptance text here" }] } : h)),
  }), /duplicate ticket id/);
});

test("there is NO close/done mechanism — closing happens only by receipts changing the inputs", () => {
  const board = buildWorkBoard();
  assert.ok(!("DONE" in board.columns) && !BOARD_STATES.includes("DONE"),
    "a DONE column would invite checkbox-closing; shipped work leaves the board via the roadmap pruning contract");
  const src = String(buildWorkBoard.toString());
  assert.ok(!/Date\.now|new Date\(\)/.test(src), "no clock — age comes from receipts, not render time");
});

test("cadence receipt work is P0 and names the time-gated next action", () => {
  const board = buildWorkBoard();
  const cadence = board.sprints.today.find((t) => /receipt/.test(t.nextAction));
  assert.ok(cadence, "the cadence follow-through must be on today's list while receipt 2/2 is pending");
  assert.match(cadence.nextAction, /second scheduled/);
});
