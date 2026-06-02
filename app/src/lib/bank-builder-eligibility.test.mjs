/**
 * Tests for bank-builder-eligibility (PR 4). Locks the honest, specific
 * empty-reason diagnosis — never a performance/"good enough to win" framing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnoseBuilderPool } from "./bank-builder-eligibility.ts";

// A pending, fully-unsettled 2-leg slip priced near +100 (two -110 legs ≈ +265
// is High; use longer/shorter to land near +100). Two ~ -250 legs → ~ +95.
function slip({ status = "pending", legs } = {}) {
  return { slipId: "s", status, legs };
}
// Two -200 legs → decimal 1.5 × 1.5 = 2.25 → combined +125 (inside the
// fallback +100 band of +60…+180).
const nearPlus100 = slip({ legs: [{ oddsForSide: -200 }, { oddsForSide: -200 }] });
const tooLong = slip({ legs: [{ oddsForSide: -110 }, { oddsForSide: -110 }, { oddsForSide: -110 }, { oddsForSide: -110 }] });
const settled = slip({ status: "win", legs: [{ oddsForSide: -200 }, { oddsForSide: -200 }] });
const gradedLeg = slip({ legs: [{ oddsForSide: -200, result: "loss" }, { oddsForSide: -200 }] });
const noPrice = slip({ legs: [{ oddsForSide: null }, { oddsForSide: -200 }] });

test("empty pool → 'no published cards' reason", () => {
  const d = diagnoseBuilderPool([]);
  assert.equal(d.total, 0);
  assert.deepEqual(d.reasons, ["No published cards for this slate yet."]);
});

test("all settled → 'already started or settled' reason; pending=0", () => {
  const d = diagnoseBuilderPool([settled, gradedLeg]);
  assert.equal(d.pending, 0);
  assert.match(d.reasons[0], /already started or settled/);
});

test("pending but unpriced → 'no complete price' reason", () => {
  const d = diagnoseBuilderPool([noPrice]);
  assert.equal(d.pending, 1);
  assert.equal(d.priced, 0);
  assert.match(d.reasons[0], /complete price/);
});

test("priced but none near +100 → 'no card priced near +100' reason", () => {
  const d = diagnoseBuilderPool([tooLong]);
  assert.equal(d.priced, 1);
  assert.equal(d.inBand, 0);
  assert.match(d.reasons[0], /priced near \+100/);
});

test("a qualifying near-+100 card → inBand ≥1 and NO empty reasons", () => {
  const d = diagnoseBuilderPool([nearPlus100]);
  assert.ok(d.inBand >= 1, `expected inBand>=1, got ${d.inBand}`);
  assert.deepEqual(d.reasons, []);
});

test("reasons never use performance / 'good enough to win' framing", () => {
  const blobs = [
    diagnoseBuilderPool([]),
    diagnoseBuilderPool([settled]),
    diagnoseBuilderPool([noPrice]),
    diagnoseBuilderPool([tooLong]),
  ].flatMap((d) => d.reasons).join(" ").toLowerCase();
  for (const w of ["win", "likely", "good enough", "guaranteed", "lock", "sure thing"]) {
    assert.ok(!blobs.includes(w), `reason must not contain "${w}"`);
  }
});
