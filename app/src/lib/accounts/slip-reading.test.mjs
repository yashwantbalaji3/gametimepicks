import test from "node:test";
import assert from "node:assert/strict";
import { validateReading, toBetSlipRow, READING_PROMPT, SLIP_READING_SCHEMA } from "./slip-reading.mjs";

const leg = (o = {}) => ({ player: "Aaron Judge", market: "Hits", side: "Over", line: 0.5, odds: -140, event: "NYY @ BOS", startsAt: null, ...o });

test("the instruction forbids guessing and forbids deriving one field from another", () => {
  assert.match(READING_PROMPT, /never guess/i);
  assert.match(READING_PROMPT, /Never calculate a missing value/i);
  assert.match(READING_PROMPT, /Return ONLY JSON/i);
  assert.ok(Object.keys(SLIP_READING_SCHEMA).includes("legs"));
});

test("a reading that is not a slip, or not an object, fails with a reason", () => {
  assert.equal(validateReading(null).ok, false);
  assert.match(validateReading("{}").errors[0], /not a JSON object/);
  const n = validateReading({ legs: [], notASlip: true });
  assert.equal(n.notASlip, true);
  assert.match(n.errors[0], /does not look like a betting slip/);
  assert.match(validateReading({ legs: [] }).errors[0], /no legs/);
});

test("an unreadable value becomes null with a review note — never an invented number", () => {
  const r = validateReading({ legs: [leg({ odds: null })], stake: null });
  assert.equal(r.ok, true, "an incomplete reading still reaches the confirmation screen");
  assert.equal(r.normalised.legs[0].odds, null);
  assert.equal(r.normalised.stake, null);
  assert.ok(r.review.some((x) => /no price read/.test(x)));
  assert.ok(r.review.some((x) => /stake was not legible/.test(x)));
});

test("a decimal price is converted and the conversion is disclosed", () => {
  const r = validateReading({ legs: [leg({ odds: 2.5 })], stake: 10 });
  assert.equal(r.normalised.legs[0].odds, 150);
  assert.ok(r.review.some((x) => /read as decimal 2\.5, converted to \+150/.test(x)));
});

test("our arithmetic is ours: computed fields sit apart from what the image said", () => {
  const r = validateReading({ legs: [leg({ odds: 100 }), leg({ player: "B", event: "LAD @ SF", odds: 100 })], stake: 10, payout: 40 });
  assert.equal(r.normalised.computedDecimal, 4);
  assert.equal(r.normalised.computedPayout, 40);
  assert.equal(r.normalised.statedPayout, 40, "what the image said is kept separately");
  assert.equal(r.normalised.priceAmerican, null, "a ticket price that was not shown is not back-filled");
});

test("a price that disagrees with the legs is disclosed — and read differently on a same-game parlay", () => {
  const cross = validateReading({ legs: [leg({ odds: 100, event: "A @ B" }), leg({ player: "C", odds: 100, event: "C @ D" })], stake: 10, priceAmerican: 200 });
  assert.ok(cross.review.some((x) => /check the odds read from each leg/.test(x)));
  const sgp = validateReading({ legs: [leg({ odds: 100, event: "A @ B" }), leg({ player: "C", odds: 100, event: "A @ B" })], stake: 10, priceAmerican: 200 });
  assert.ok(sgp.review.some((x) => /same-game parlay, which books reprice/.test(x)), "a correctly repriced SGP must not look like an error");
});

test("every reading requires its owner's confirmation, and saving without it is refused", () => {
  const r = validateReading({ legs: [leg()], stake: 25 });
  assert.equal(r.normalised.confirmationRequired, true);
  assert.throws(() => toBetSlipRow(r.normalised, { userId: "u1", source: "screenshot" }), /confirms it/);
  assert.throws(() => toBetSlipRow(r.normalised, { userId: null, source: "screenshot", confirmedAt: "2026-09-12T01:00:00Z" }), /exactly one account/);
  assert.throws(() => toBetSlipRow(r.normalised, { userId: "u1", source: "guessed", confirmedAt: "x" }), /unknown slip source/);
  const row = toBetSlipRow(r.normalised, { userId: "u1", source: "screenshot", imagePath: "u1/abc.png", confirmedAt: "2026-09-12T01:00:00Z" });
  assert.equal(row.user_id, "u1");
  assert.equal(row.status, "pending", "a saved slip is unsettled until official results say otherwise");
  assert.equal(row.image_path, "u1/abc.png");
  assert.equal(row.legs.length, 1);
});
