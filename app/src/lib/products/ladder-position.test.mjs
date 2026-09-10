/**
 * Guards for the receipt-derived ladder position. Every rule in ladder-position.mjs has a case, and
 * the REAL DATA cases pin the defect to the write-once receipts, which never change.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { currentRunSteps, laneSteps, positionFromReceipts, readReceipts } from "./ladder-position.mjs";
import { MOONSHOT_LADDER, MOONSHOT_SEED } from "../moonshot/moonshot-ladder.mjs";

const BB = [
  { step: 1, start: 100, goal: 200 }, { step: 2, start: 200, goal: 700 }, { step: 3, start: 700, goal: 1400 },
  { step: 4, start: 1400, goal: 3500 }, { step: 5, start: 3500, goal: 10000 },
];
const row = (date, lane, step, stake, result, potentialReturn, status) => ({ date, lanes: [{ product: "bank-builder", lane, step, stake, result, potentialReturn, ...(status ? { status } : {}) }] });
const pos = (receipts, lane = "A") => positionFromReceipts({ receipts, product: "bank-builder", lane, ladder: BB, seed: 100 });

test("no placed card yet → Step 1 with the seed", () => {
  const p = pos([]);
  assert.deepEqual([p.state, p.nextStep, p.rolledStake, p.targetReturn, p.cycle], ["ready", 1, 100, 200, 1]);
});

test("THE RULE · a won step carries its REAL payout to the next rung", () => {
  const p = pos([row("2026-09-09", "B", 1, 100, "won", 208.33)], "B");
  assert.equal(p.nextStep, 2);
  assert.equal(p.rolledStake, 208.33, "the real payout, not the nominal $200");
  assert.equal(p.targetReturn, 700);
  assert.ok(Math.abs(p.targetMultiplier - 700 / 208.33) < 1e-9);
});

test("THE RULE · any loss restarts the lane at Step 1 with the seed, in a new cycle", () => {
  const p = pos([row("2026-09-08", "A", 1, 100, "won", 204), row("2026-09-09", "A", 2, 204, "lost", 720)]);
  assert.deepEqual([p.nextStep, p.rolledStake, p.cycle], [1, 100, 2]);
});

test("a placed card still pending HOLDS the lane — no card on top of an unsettled balance", () => {
  const p = pos([row("2026-09-09", "A", 1, 100, "won", 204), row("2026-09-10", "A", 2, 204, "pending", 720, "active")]);
  assert.equal(p.state, "held");
  assert.equal(p.basis.date, "2026-09-10");
});

test("a row never placed (candidate / awaiting) is not a step", () => {
  const p = pos([row("2026-09-09", "A", 1, 100, "won", 204), row("2026-09-10", "A", 1, 100, "pending", 190, "candidate")]);
  assert.deepEqual([p.state, p.nextStep], ["ready", 2]);
});

test("LEGACY · a pending row without status is ambiguous and skipped, never read as held", () => {
  const p = pos([row("2026-09-05", "A", 1, 100, "pending", 190), row("2026-09-06", "A", 1, 100, "won", 204)]);
  assert.deepEqual([p.state, p.nextStep], ["ready", 2]);
  assert.equal(laneSteps([row("2026-09-05", "A", 1, 100, "pending", 190)], "bank-builder", "A").length, 0);
});

test("void / push → the same rung again with the same balance", () => {
  const p = pos([row("2026-09-08", "A", 1, 100, "won", 204), row("2026-09-09", "A", 2, 204, "void", 720)]);
  assert.deepEqual([p.nextStep, p.rolledStake], [2, 204]);
});

test("clearing the FINAL rung completes the run and starts a new cycle at the seed", () => {
  const p = pos([row("2026-09-09", "A", 5, 3600, "won", 10400)]);
  assert.deepEqual([p.nextStep, p.rolledStake, p.cycle, p.basis.completed], [1, 100, 2, true]);
});

test("MOONSHOT · Day 1 $25 → Day 2 → Day 3 → complete, and an overshoot skips the rung it cleared", () => {
  const m = (receipts) => positionFromReceipts({ receipts, product: "moonshot", lane: "A", ladder: MOONSHOT_LADDER, seed: MOONSHOT_SEED });
  const mrow = (date, step, stake, result, ret) => ({ date, lanes: [{ product: "moonshot", lane: "A", step, stake, result, potentialReturn: ret, status: result === "pending" ? "active" : result }] });
  assert.deepEqual([m([]).nextStep, m([]).rolledStake, m([]).targetReturn], [1, 25, 100]);
  const d2 = m([mrow("2026-09-11", 1, 25, "won", 104)]);
  assert.deepEqual([d2.nextStep, d2.rolledStake, d2.targetReturn], [2, 104, 400]);
  const d3 = m([mrow("2026-09-11", 1, 25, "won", 104), mrow("2026-09-12", 2, 104, "won", 420)]);
  assert.deepEqual([d3.nextStep, d3.rolledStake, d3.targetReturn], [3, 420, 1000]);
  const done = m([mrow("2026-09-11", 1, 25, "won", 104), mrow("2026-09-12", 2, 104, "won", 420), mrow("2026-09-13", 3, 420, "won", 1050)]);
  assert.deepEqual([done.nextStep, done.rolledStake, done.cycle], [1, 25, 2]);
  const skip = m([mrow("2026-09-11", 1, 25, "won", 450)]); // $450 already clears Day 2's $400 goal
  assert.deepEqual([skip.nextStep, skip.rolledStake], [3, 450]);
});

test("REAL DATA · the defect, pinned to write-once receipts: a win on 09-06 means Step 2 on 09-07", () => {
  const root = path.resolve(process.cwd(), "public", "data");
  const receipts = readReceipts(root, "2026-09-07");
  const a = positionFromReceipts({ receipts, product: "bank-builder", lane: "A", ladder: BB, seed: 100 });
  assert.equal(a.basis?.date, "2026-09-06");
  assert.equal(a.basis?.result, "won", "Lane A won on 2026-09-06 (official)");
  assert.equal(a.nextStep, 2, "so its next card is Step 2 — the old generator dealt Step 1 at $100");
  assert.ok(a.rolledStake > 100, "carrying the real payout");
});

test("readReceipts never shows a generation its own day", () => {
  const root = path.resolve(process.cwd(), "public", "data");
  assert.ok(readReceipts(root, "2026-09-07").every((r) => r.date < "2026-09-07"));
});

test("currentRunSteps · only the wins since the last restart are the run's cleared rungs", () => {
  const rs = [row("2026-09-06", "A", 1, 100, "won", 204), row("2026-09-07", "A", 2, 204, "lost", 700), row("2026-09-08", "A", 1, 100, "won", 210), row("2026-09-09", "A", 2, 210, "won", 735)];
  assert.deepEqual(currentRunSteps(rs, "bank-builder", "A", BB).map((r) => r.date), ["2026-09-08", "2026-09-09"]);
  assert.deepEqual(currentRunSteps([row("2026-09-09", "A", 5, 3600, "won", 10400)], "bank-builder", "A", BB), [], "a completed ladder starts a fresh run");
});
