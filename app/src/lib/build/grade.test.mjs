/**
 * Grade rubric guards (Program 146 · evening R1).
 *
 * The rubric's promises: confidence only (never pick quality or profit), eligibility gated on real
 * model inputs + freshness + completeness, ungraded always carries a reason, and the honest caveat
 * cannot be edited away.
 *
 * Run: npx tsx --test src/lib/build/grade.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { gradeLeg, GRADE_RUBRIC_VERSION } from "./grade.mjs";

const TODAY = "2026-08-08";
const leg = (over = {}) => ({
  modelProbability: 0.55, sourceDate: TODAY, gameId: 101, market: "total", americanOdds: -110, ...over,
});

test("productDate is required — grading never reads the clock itself", () => {
  assert.throws(() => gradeLeg(leg(), {}), /productDate is required/);
});

test("eligibility gates: no model probability ⇒ ungraded with the tier-only reason", () => {
  const g = gradeLeg(leg({ modelProbability: null }), { productDate: TODAY });
  assert.equal(g.eligible, false);
  assert.equal(g.grade, null);
  assert.match(g.ungradedReason, /not modelled/);
  assert.match(g.explanation, /price tier is market information/);
});

test("a stale source date is never confidence — ungraded, naming both dates", () => {
  const g = gradeLeg(leg({ sourceDate: "2026-08-07" }), { productDate: TODAY });
  assert.equal(g.eligible, false);
  assert.match(g.ungradedReason, /2026-08-07.*2026-08-08/);
});

test("incomplete leg data is ungraded, not guessed around", () => {
  for (const missing of [{ gameId: null }, { market: "" }, { americanOdds: undefined }]) {
    const g = gradeLeg(leg(missing), { productDate: TODAY });
    assert.equal(g.eligible, false, JSON.stringify(missing));
    assert.match(g.ungradedReason, /incomplete/);
  }
});

test("an out-of-range probability is treated as unmodelled, never trusted", () => {
  for (const p of [0, 1, 1.2, -0.1]) {
    assert.equal(gradeLeg(leg({ modelProbability: p }), { productDate: TODAY }).eligible, false, String(p));
  }
});

test("band boundaries are exact: 0.60 ⇒ A, 0.52 ⇒ B, below ⇒ C", () => {
  assert.equal(gradeLeg(leg({ modelProbability: 0.6 }), { productDate: TODAY }).grade, "A");
  assert.equal(gradeLeg(leg({ modelProbability: 0.599 }), { productDate: TODAY }).grade, "B");
  assert.equal(gradeLeg(leg({ modelProbability: 0.52 }), { productDate: TODAY }).grade, "B");
  assert.equal(gradeLeg(leg({ modelProbability: 0.519 }), { productDate: TODAY }).grade, "C");
  assert.equal(gradeLeg(leg({ modelProbability: 0.05 }), { productDate: TODAY }).grade, "C");
});

test("THE CAVEAT · every eligible explanation carries the no-profit line, verbatim", () => {
  const g = gradeLeg(leg(), { productDate: TODAY });
  assert.match(g.explanation, /not a prediction of profit/);
  assert.match(g.explanation, /does not beat the market overall/);
  assert.equal(g.rubricVersion, GRADE_RUBRIC_VERSION);
});

test("the grade never uses forbidden vocabulary — no edge, no value, no locks", () => {
  const g = gradeLeg(leg({ modelProbability: 0.85 }), { productDate: TODAY });
  const all = [g.explanation, g.grade, JSON.stringify(g.components)].join(" ");
  assert.doesNotMatch(all, /\bedge\b|value pick|best bet|guaranteed|\block\b/i);
});

test("deterministic: same leg, same date, byte-identical result", () => {
  assert.deepEqual(gradeLeg(leg(), { productDate: TODAY }), gradeLeg(leg(), { productDate: TODAY }));
});

test("the grade derives from the MODEL's probability, never from the odds", () => {
  // Two identical model probabilities at wildly different prices grade identically — payout appeal
  // has zero influence, which is the whole Release F rule.
  const shortPrice = gradeLeg(leg({ americanOdds: -400 }), { productDate: TODAY });
  const longPrice = gradeLeg(leg({ americanOdds: +400 }), { productDate: TODAY });
  assert.equal(shortPrice.grade, longPrice.grade);
  assert.deepEqual(shortPrice.components, longPrice.components);
});
