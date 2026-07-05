/**
 * LADDER POLICY v2 — spec tests. The policy layer is PURE (no I/O): these pin the profit-preserving
 * cash-out schedule, the safety-narrowing market/leg rules, the "safe under target" floor, and that
 * generating policies can never touch canonical money (portfolio.json byte-identical across calls).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { bankBuilderStepPolicy, moonshotLadderPolicy, MARKET_RELIABILITY } from "./ladder-policy.ts";

test("Steps 1-2 are growth steps: NO cash-out yet, 2-3 legs, full roll forward", () => {
  const s1 = bankBuilderStepPolicy(1, 100);
  const s2 = bankBuilderStepPolicy(2, 200);
  for (const s of [s1, s2]) {
    assert.equal(s.cashOutPct, 0, `step ${s.step} has no cash-out requirement`);
    assert.equal(s.cashOut(999), 0);
    assert.equal(s.rollForward(999), 999, "everything rolls in the growth phase");
    assert.equal(s.maxLegs, 3);
  }
  assert.ok(s1.targetPayout[1] >= 200 && s1.targetMultiple === 2.0, "step 1 targets ~2x ($100→~$200)");
  assert.ok(s2.targetMultiple === 3.5, "step 2 targets ~3.5x (~$200→~$700)");
});

test("Step 3 EXTRACTS profit on a win (25% of winnings) and rolls the rest", () => {
  const s3 = bankBuilderStepPolicy(3, 700);
  assert.equal(s3.cashOutPct, 0.25);
  // $700 → $1,600 win: winnings $900 → extract $225-... exact: 900*0.25 = $225; mission range $300-400
  // corresponds to a bigger win — verify the RULE, not one scenario: extraction grows with the win.
  assert.equal(s3.cashOut(1600), 225);
  assert.equal(s3.rollForward(1600), 1375);
  const bigger = s3.cashOut(2100); // $1,400 winnings → $350 extracted (inside the mission's $300-400 example)
  assert.equal(bigger, 350);
  assert.equal(s3.rollForward(2100), 1750);
  // Cash-out + roll always reconcile exactly to the payout (no money leaks in the spec).
  for (const p of [900, 1234.56, 1600, 2100]) {
    assert.equal(Math.round((s3.cashOut(p) + s3.rollForward(p)) * 100) / 100, p);
  }
});

test("Steps 4-7 keep extracting (rising pct) and get SAFER: fewer legs, narrower markets, lower multiples", () => {
  const pcts = [4, 5, 6, 7].map((n) => bankBuilderStepPolicy(n, 1000).cashOutPct);
  assert.deepEqual(pcts, [0.30, 0.35, 0.40, 0.40], "cash-out share rises with the ladder");
  let prevMult = bankBuilderStepPolicy(3, 1000).targetMultiple;
  for (const n of [4, 5, 6, 7]) {
    const s = bankBuilderStepPolicy(n, 1000);
    assert.ok(s.targetMultiple <= prevMult, `step ${n} multiple ${s.targetMultiple} never exceeds step ${n - 1}`);
    assert.equal(s.maxLegs, 2, "steps 3+ are 2-leg cards (settled: 2-leg 12-7 vs 3-leg 2-2)");
    prevMult = s.targetMultiple;
  }
  // Step 7 is DC/DNB only; BTTS (1-3 settled) is out of the allowed set from Step 3 onward.
  assert.deepEqual(bankBuilderStepPolicy(7, 1000).allowedMarkets, ["double_chance", "draw_no_bet"]);
  for (const n of [3, 4, 5, 6, 7]) {
    assert.ok(!bankBuilderStepPolicy(n, 1000).allowedMarkets.includes("btts"), `step ${n} never allows BTTS`);
  }
});

test("NO player props anywhere in the policy vocabulary; reliability weights match settled evidence order", () => {
  const s = bankBuilderStepPolicy(1, 100);
  assert.ok(s.allowedMarkets.every((m) => !/player|prop|shots|goalscorer/i.test(m)), "team/game markets only");
  assert.ok(MARKET_RELIABILITY.double_chance > MARKET_RELIABILITY.moneyline_90, "DC (8-0) above ML (8-2)");
  assert.ok(MARKET_RELIABILITY.moneyline_90 > MARKET_RELIABILITY.match_total_goals, "ML above totals (draw-traps)");
  assert.ok(MARKET_RELIABILITY.match_total_goals > MARKET_RELIABILITY.btts, "totals above BTTS (1-3)");
});

test('"safe under target": a card may miss the rung — the floor is 60% of the intended edge, never weak filler', () => {
  const s3 = bankBuilderStepPolicy(3, 700);
  // target 2.3x → $1,610; min acceptable = 700 * (1 + 1.3*0.6) = $1,246 — an honest under-target card is OK.
  assert.ok(s3.minAcceptablePayout < s3.stake * s3.targetMultiple, "floor sits below the full target");
  assert.ok(s3.minAcceptablePayout > s3.stake, "but always above the stake (never a pointless card)");
  assert.equal(s3.minAcceptablePayout, 1246);
  // Elevated recent risk shaves the target (survive the restart, don't re-chase the old rung).
  assert.ok(bankBuilderStepPolicy(3, 700, "elevated").targetMultiple < s3.targetMultiple);
});

test("Moonshot 3-day ladder: $25→$100→$400→$1,500; no props by default; explicit opt-in only", () => {
  const d1 = moonshotLadderPolicy(1, 25);
  const d2 = moonshotLadderPolicy(2, 100);
  const d3 = moonshotLadderPolicy(3, 400);
  assert.equal(d1.targetPayout, 100); assert.equal(d1.targetMultiple, 4);
  assert.equal(d2.targetPayout, 400); assert.equal(d2.targetMultiple, 4);
  assert.equal(d3.targetPayout, 1500); assert.equal(d3.targetMultiple, 3.75);
  for (const d of [d1, d2, d3]) {
    assert.equal(d.playerPropsAllowed, false, `day ${d.day} defaults to NO player props`);
    assert.ok(d.legRange[0] >= 3 && d.legRange[1] <= 6, "3-6 legs by design");
    assert.match(d.note, /NO-PLAY, never a forced card/i, "no-play discipline in the spec itself");
  }
  assert.equal(moonshotLadderPolicy(1, 25, true).playerPropsAllowed, true, "props only via explicit labeled opt-in");
});

test("policy generation NEVER touches canonical money (pure functions; portfolio.json byte-identical)", () => {
  const before = fs.readFileSync("public/data/mr-dub/portfolio.json");
  for (let step = 1; step <= 7; step++) bankBuilderStepPolicy(step, 100 * step);
  for (const day of [1, 2, 3]) moonshotLadderPolicy(day, 25 * day);
  const after = fs.readFileSync("public/data/mr-dub/portfolio.json");
  assert.ok(before.equals(after), "canonical portfolio untouched by policy calls");
});
