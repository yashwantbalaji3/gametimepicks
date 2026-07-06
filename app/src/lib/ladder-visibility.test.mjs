/**
 * LADDER VISIBILITY — the 7-step Bank Builder ladder and the 3-step Moonshot ladder must be PROMINENT,
 * not buried. Regression for "the user does not see the ladders": the BB ladder used to live inside a
 * collapsed <details> accordion on /bank-builder. These source-level checks pin that:
 *   • both ladder components render straight from the pure policy (no drift, all steps/days present),
 *   • /bank-builder renders the full ladder OUTSIDE any <details>,
 *   • /moonshot renders the full trajectory,
 *   • /today previews BOTH ladders (compact),
 *   • the v2-preview / v1-live status is stated.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");

const bbLadder = read("src/components/bank-builder/ladder-v2.tsx");
const moonLadder = read("src/components/moonshot/ladder-v2.tsx");
const bbPage = read("src/app/bank-builder/page.tsx");
const moonPage = read("src/app/moonshot/page.tsx");
const todayPage = read("src/app/today/page.tsx");

test("BB ladder component renders all 7 steps from the pure policy (roll/target/lock/roll-forward/cumulative)", () => {
  assert.match(bbLadder, /bankBuilderV2StepPolicy/, "derives from the spec (no drift)");
  assert.match(bbLadder, /STEPS = \[1, 2, 3, 4, 5, 6, 7\]/, "all 7 steps");
  for (const field of ["roll", "target", "lock", "rollForward", "cumulativeLocked", "targetMultiple", "maxLegs"]) {
    assert.match(bbLadder, new RegExp(`p\\.${field}`), `shows ${field}`);
  }
  assert.match(bbLadder, /v2 preview · live settlement runs v1/i, "states v2-preview / v1-live status");
});

test("Moonshot ladder component renders 3 days with profit-locking from the pure policy", () => {
  assert.match(moonLadder, /moonshotV2LadderPolicy/, "derives from the spec");
  assert.match(moonLadder, /DAYS = \[1, 2, 3\]/, "3 days");
  for (const field of ["roll", "target", "lock", "rollForward"]) {
    assert.match(moonLadder, new RegExp(`p\\.${field}`), `shows ${field}`);
  }
  assert.match(moonLadder, /high variance/i, "carries the volatility warning");
});

test("/bank-builder renders the 7-step ladder PROMINENTLY — never inside a <details> accordion", () => {
  assert.match(bbPage, /<BankBuilderLadderV2/, "renders the prominent ladder component");
  assert.ok(!/<details/.test(bbPage), "no collapsed <details> accordion hides the ladder anymore");
});

test("/moonshot renders the full 3-step trajectory ladder", () => {
  assert.match(moonPage, /<MoonshotLadderV2 /, "renders the trajectory ladder");
});

test("/today previews BOTH ladders (compact) so the front door surfaces the methodology", () => {
  assert.match(todayPage, /<BankBuilderLadderV2 compact/, "compact BB ladder preview on Today");
  assert.match(todayPage, /<MoonshotLadderV2 compact/, "compact Moonshot ladder preview on Today");
});
