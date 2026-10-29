/**
 * The Command Center's side of the shared odds contract: gated by default; a comparison only for a fresh, captured,
 * eligible-book price whose website evaluation is qualified; the colour follows the evaluator's lean (never projection
 * vs line); anything missing falls back to projection-only and holds line-dependent graphics.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { comparisonView, REFUSAL } from "../recap/odds-comparison.mjs";

const NOW = "2026-10-29T20:00:00Z";
const price = { schema: "gtp.nba.prop-price@1", line: 29.5, book: "draftkings", bookTitle: "DraftKings", overAmerican: -115, underAmerican: -105, capturedAt: "2026-10-29T19:40:00Z" };
const evaluation = (o = {}) => ({ version: "gtp.consistency.market-evaluator@1", line: 29.5, capturedAt: price.capturedAt, lean: "OVER", withheldReasons: [], eligibility: { qualified: true, blocking: [], qualification: [] }, ...o });
const base = { player: { name: "Example Player", team: "SA" }, family: "pts", projection: 36, price, evaluation: evaluation(), availability: "CAPTURED", eligibleBooks: ["draftkings", "fanduel"], now: NOW, startUtc: "2026-10-30T00:00:00Z", enabled: true };

test("odds comparison: off unless enabled (founder gate)", () => {
  const r = comparisonView({ ...base, enabled: undefined });
  assert.equal(r.mode, "projection-only");
  assert.ok(r.reasons.includes(REFUSAL.GATED));
  assert.equal(r.lineDependentHeld, true);
  assert.equal(r.view.line, undefined, "no line is shown when gated");
});

test("odds comparison: a qualified, fresh, eligible-book price shows the evaluator's lean and model − line", () => {
  const r = comparisonView(base);
  assert.equal(r.mode, "comparison");
  assert.equal(r.view.lean, "OVER");
  assert.equal(r.view.style, "over");
  assert.equal(r.view.modelMinusLine, 6.5);
  assert.equal(r.view.bookTitle, "DraftKings");
  assert.equal(r.view.quoteAgeMinutes, 20);
  assert.match(r.view.bookNote, /varies by state/);
});

test("odds comparison: the colour never comes from projection vs line", () => {
  // projection well above the line, but the price-based evaluator found no lean: neutral, not green
  const r = comparisonView({ ...base, evaluation: evaluation({ lean: "NONE", withheldReasons: ["BELOW_LEAN_THRESHOLD"], eligibility: { qualified: false, blocking: [], qualification: ["BELOW_LEAN_THRESHOLD"] } }) });
  assert.equal(r.mode, "projection-only");
  assert.equal(r.view.style, "neutral");
  assert.ok(r.reasons.includes("evaluator:BELOW_LEAN_THRESHOLD"));
});

test("odds comparison: every missing or unsafe input falls back to projection-only", () => {
  const cases = {
    [REFUSAL.NO_PRICE]: { price: null },
    "ODDS_NOT_CAPTURED:STALE": { availability: "STALE" },
    [REFUSAL.OPERATOR]: { price: { ...price, book: "bovada" }, evaluation: evaluation() },
    [REFUSAL.MISMATCH]: { evaluation: evaluation({ line: 30.5 }) },
    [REFUSAL.AFTER_START]: { startUtc: "2026-10-29T19:00:00Z" },
    [REFUSAL.EVALUATOR_UNKNOWN]: { evaluation: evaluation({ version: "something-else@9" }) },
    [REFUSAL.NOT_QUALIFIED]: { evaluation: evaluation({ eligibility: { qualified: false }, withheldReasons: ["FAMILY_NOT_PUBLISHED"] }) },
  };
  for (const [reason, patch] of Object.entries(cases)) {
    const r = comparisonView({ ...base, ...patch });
    assert.equal(r.mode, "projection-only", reason);
    assert.ok(r.reasons.includes(reason), `${reason}: ${r.reasons.join(", ")}`);
    assert.equal(r.lineDependentHeld, true);
    assert.equal(r.view.projection, 36, "the projection itself is still shown");
  }
});
