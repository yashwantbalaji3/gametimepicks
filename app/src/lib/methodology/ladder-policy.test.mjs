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

// ── v2.1 DOLLAR-SCHEDULE ladder (the operator's 7-step template, reconciled) ─────────────────────
import { bankBuilderV2StepPolicy, moonshotV2LadderPolicy } from "./ladder-policy.ts";

test("v2.1 ladder RECONCILES exactly: every roll-forward = target − lock, and it feeds the next step", () => {
  let cum = 0;
  for (let n = 1; n <= 7; n++) {
    const s = bankBuilderV2StepPolicy(n);
    assert.equal(s.rollForward, Math.round((s.target - s.lock) * 100) / 100, `step ${n} lock math reconciles`);
    if (n < 7) {
      const next = bankBuilderV2StepPolicy(n + 1);
      assert.equal(next.roll, s.rollForward, `step ${n} roll-forward ($${s.rollForward}) IS step ${n + 1}'s roll — the template's $3,500→$3,000 break is fixed`);
    }
    cum += s.lock;
  }
  // Completed ladder: $2,100 locked along the way + the $8,280 final = $10,380 — crosses $10K.
  assert.equal(cum, 2100);
  assert.equal(bankBuilderV2StepPolicy(7).target, 8280);
  assert.ok(cum + bankBuilderV2StepPolicy(7).target >= 10000, "completed ladder realizes ≥ $10K total");
});

test("v2.1: Step 2 locks the seed back ($100 → freeroll); Step 3 locks $200; multiplier never rises after Step 3", () => {
  assert.equal(bankBuilderV2StepPolicy(1).lock, 0, "step 1 is pure growth");
  assert.equal(bankBuilderV2StepPolicy(2).lock, 100, "step 2 recovers the full $100 seed");
  assert.equal(bankBuilderV2StepPolicy(3).lock, 200);
  let prev = bankBuilderV2StepPolicy(3).targetMultiple;
  for (const n of [4, 5, 6, 7]) {
    const m = bankBuilderV2StepPolicy(n).targetMultiple;
    assert.ok(m <= prev, `step ${n} multiple ${m} ≤ step ${n - 1} (${prev}) — later steps get safer, never richer`);
    prev = m;
  }
  // Safety also narrows structurally: ≤2 legs from Step 3, BTTS out from Step 3, DC/DNB-only Step 7.
  for (const n of [3, 4, 5, 6, 7]) {
    const s = bankBuilderV2StepPolicy(n);
    assert.equal(s.maxLegs, 2);
    assert.ok(!s.allowedMarkets.includes("btts"));
    assert.ok(s.allowedMarkets.every((m) => !/player|prop/i.test(m)), "team/game markets only");
  }
  assert.deepEqual(bankBuilderV2StepPolicy(7).allowedMarkets, ["double_chance", "draw_no_bet"]);
});

test("v2.1: under-target rolls SCALE the schedule proportionally (safe-under-target keeps reconciling)", () => {
  // Step 3 entered with $360 instead of the canonical $400 (a safe-under-target Step-2 win).
  const s = bankBuilderV2StepPolicy(3, 360);
  assert.equal(s.roll, 360);
  assert.equal(s.target, 900);          // 1000 × 0.9
  assert.equal(s.lock, 180);            // 200 × 0.9
  assert.equal(s.rollForward, 720);     // 800 × 0.9 — the chain stays consistent
  assert.ok(s.minAcceptablePayout > s.roll && s.minAcceptablePayout < s.target, "safe-under-target floor sits between roll and target");
});

test("Moonshot v2: 25→100 lock 25 · 75→375 lock 75 · 300→1,500 completes — reconciles, freerolls from Day 2", () => {
  const d1 = moonshotV2LadderPolicy(1), d2 = moonshotV2LadderPolicy(2), d3 = moonshotV2LadderPolicy(3);
  assert.equal(d1.lock, 25, "Day-1 win locks the seed back");
  assert.equal(d1.rollForward, 75);
  assert.equal(d2.roll, d1.rollForward, "Day 2 rides exactly the Day-1 roll-forward");
  assert.equal(d2.rollForward, 300);
  assert.equal(d3.roll, d2.rollForward);
  assert.equal(d3.target, 1500);
  assert.equal(d3.cumulativeLocked, 100, "$100 locked before the Day-3 swing");
  for (const d of [d1, d2, d3]) assert.equal(d.playerPropsAllowed, false, "props only via explicit opt-in");
  assert.equal(moonshotV2LadderPolicy(2, 75, true).playerPropsAllowed, true);
});

test("policy generation NEVER touches canonical money (pure functions; portfolio.json byte-identical)", () => {
  const before = fs.readFileSync("public/data/mr-dub/portfolio.json");
  for (let step = 1; step <= 7; step++) bankBuilderStepPolicy(step, 100 * step);
  for (const day of [1, 2, 3]) moonshotLadderPolicy(day, 25 * day);
  const after = fs.readFileSync("public/data/mr-dub/portfolio.json");
  assert.ok(before.equals(after), "canonical portfolio untouched by policy calls");
});
