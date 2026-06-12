/**
 * Tests for the Bank Builder ladder helper (`bank-builder-ladder.ts`).
 * Locks the design-doc §3.2 ladder (base $100 → crown $3,000, five
 * contiguous rungs) and the pure step-resolution + formatting helpers.
 *
 * The ladder is a static, frozen definition — these tests guard against
 * an accidental edit to the dollar amounts or multipliers and verify the
 * `multiplier === goal / start` invariant the Builder Slip filter relies
 * on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BANK_BUILDER_BASE,
  BANK_BUILDER_GOAL,
  BANK_BUILDER_LADDER,
  BANK_BUILDER_STEP_COUNT,
  resolveLadderStep,
  ladderTargetAmerican,
  ladderMultiplierLabel,
  formatLadderUsd,
} from "./bank-builder-ladder.ts";

test("ladder constants match the design doc", () => {
  assert.equal(BANK_BUILDER_BASE, 100);
  assert.equal(BANK_BUILDER_GOAL, 10000);
  assert.equal(BANK_BUILDER_STEP_COUNT, 5);
  assert.equal(BANK_BUILDER_LADDER.length, 5);
});

test("ladder rungs carry the exact design-doc dollar amounts", () => {
  assert.deepEqual(
    BANK_BUILDER_LADDER.map((s) => [s.step, s.start, s.goal]),
    [
      [1, 100, 200],
      [2, 200, 700],
      [3, 700, 1400],
      [4, 1400, 3500],
      [5, 3500, 10000],
    ],
  );
});

test("each multiplier equals goal / start", () => {
  for (const rung of BANK_BUILDER_LADDER) {
    assert.ok(
      Math.abs(rung.multiplier - rung.goal / rung.start) < 1e-9,
      `step ${rung.step}: multiplier ${rung.multiplier} != ${rung.goal}/${rung.start}`,
    );
  }
});

test("multipliers match the $100→$10,000 ladder (goal/start per rung)", () => {
  assert.deepEqual(
    BANK_BUILDER_LADDER.map((s) => s.multiplier),
    [200 / 100, 700 / 200, 1400 / 700, 3500 / 1400, 10000 / 3500],
  );
});

test("rungs are contiguous — each start equals the previous goal", () => {
  for (let i = 1; i < BANK_BUILDER_LADDER.length; i++) {
    assert.equal(
      BANK_BUILDER_LADDER[i].start,
      BANK_BUILDER_LADDER[i - 1].goal,
      `gap between step ${i} and ${i + 1}`,
    );
  }
  assert.equal(BANK_BUILDER_LADDER[0].start, BANK_BUILDER_BASE);
  assert.equal(BANK_BUILDER_LADDER[4].goal, BANK_BUILDER_GOAL);
});

test("ladder definition is frozen (immutable)", () => {
  assert.ok(Object.isFrozen(BANK_BUILDER_LADDER));
  assert.ok(Object.isFrozen(BANK_BUILDER_LADDER[0]));
  assert.throws(() => {
    // @ts-ignore — intentional mutation attempt
    BANK_BUILDER_LADDER[0].goal = 999;
  });
});

test("resolveLadderStep maps a bankroll to its rung window [start, goal)", () => {
  assert.equal(resolveLadderStep(100)?.step, 1);
  assert.equal(resolveLadderStep(150)?.step, 1);
  assert.equal(resolveLadderStep(199.99)?.step, 1);
  assert.equal(resolveLadderStep(200)?.step, 2);
  assert.equal(resolveLadderStep(699)?.step, 2);
  assert.equal(resolveLadderStep(700)?.step, 3);
  assert.equal(resolveLadderStep(728.76)?.step, 3); // current public bankroll
  assert.equal(resolveLadderStep(1399)?.step, 3);
  assert.equal(resolveLadderStep(1400)?.step, 4);
  assert.equal(resolveLadderStep(3499)?.step, 4);
  assert.equal(resolveLadderStep(3500)?.step, 5);
  assert.equal(resolveLadderStep(9999)?.step, 5);
});

test("resolveLadderStep clamps sub-base bankrolls to Step 1", () => {
  assert.equal(resolveLadderStep(0)?.step, 1);
  assert.equal(resolveLadderStep(50)?.step, 1);
  assert.equal(resolveLadderStep(-100)?.step, 1);
});

test("resolveLadderStep returns null once the crown is reached", () => {
  assert.equal(resolveLadderStep(10000), null);
  assert.equal(resolveLadderStep(15000), null);
});

test("resolveLadderStep falls back to Step 1 for non-finite input", () => {
  // The non-finite guard fires before the crown check, so every
  // non-finite value (NaN, ±Infinity) resolves to the base rung rather
  // than ever being treated as "above the crown".
  assert.equal(resolveLadderStep(NaN)?.step, 1);
  assert.equal(resolveLadderStep(Infinity)?.step, 1);
  assert.equal(resolveLadderStep(-Infinity)?.step, 1);
});

test("ladderTargetAmerican converts the decimal multiplier to American", () => {
  // 2.000× decimal == +100 American (the breakeven even-money price).
  assert.equal(ladderTargetAmerican(BANK_BUILDER_LADDER[0]), 100);
  // 3.500× decimal (step 2) == +250 American.
  assert.equal(ladderTargetAmerican(BANK_BUILDER_LADDER[1]), 250);
  // 10000/3500 ≈ 2.857× decimal (step 5) == +186 American.
  assert.equal(ladderTargetAmerican(BANK_BUILDER_LADDER[4]), 186);
});

test("ladderMultiplierLabel renders three decimals", () => {
  assert.equal(ladderMultiplierLabel(BANK_BUILDER_LADDER[0]), "2.000×");
  // Step 5 climbs $3,500 → $10,000 == 2.857× decimal.
  assert.equal(ladderMultiplierLabel(BANK_BUILDER_LADDER[4]), "2.857×");
});

test("formatLadderUsd renders whole dollars with thousands separators", () => {
  assert.equal(formatLadderUsd(100), "$100");
  assert.equal(formatLadderUsd(200), "$200");
  assert.equal(formatLadderUsd(1600), "$1,600");
  assert.equal(formatLadderUsd(3000), "$3,000");
  assert.equal(formatLadderUsd(100.4), "$100");
});

test("/bank-builder run-plan rows: Today/Tomorrow/Saturday with the public 3-step run plan", () => {
  // Mirrors the exact run-plan expression in app/bank-builder/page.tsx:
  // the active rung + the next two, day-labelled, rendered as
  // `${formatLadderUsd(start)} → ${formatLadderUsd(goal)}`. With the public
  // bankroll at $728.76 the active rung is Step 3, so the rows are the
  // Today $700→$1,400 / Tomorrow $1,400→$3,500 / Saturday $3,500→$10,000 plan.
  const activeStep = resolveLadderStep(728.76);
  assert.equal(activeStep?.step, 3); // Today is Step 3, not yet $1,400
  const planRows = BANK_BUILDER_LADDER.filter((s) => s.step >= activeStep.step)
    .slice(0, 3)
    .map((s, i) => ({
      day: ["Today", "Tomorrow", "Saturday"][i],
      range: `${formatLadderUsd(s.start)} → ${formatLadderUsd(s.goal)}`,
      state: i === 0 ? "Active · pending" : "Planned",
    }));
  assert.deepEqual(planRows, [
    { day: "Today", range: "$700 → $1,400", state: "Active · pending" },
    { day: "Tomorrow", range: "$1,400 → $3,500", state: "Planned" },
    { day: "Saturday", range: "$3,500 → $10,000", state: "Planned" },
  ]);
});
