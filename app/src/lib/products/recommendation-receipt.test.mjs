/**
 * THE RECOMMENDATION RECEIPT (§13) and ProductEligibleLeg V2 (§14).
 *
 * Measured against the real 371-leg optimizer pool on 2026-09-26 and then pinned synthetically,
 * because the pool is regenerated daily and a test that reads it would pass or fail on the calendar.
 *
 *   legs                                                    371
 *   legs whose UPSTREAM lean carries a model probability    371 / 371
 *   probabilityBasis                                        MODEL_DEMOTED × 371
 *   eligible for a probability-dependent product            0 / 371
 *   eligible for a projection-only product                  0 / 371
 *
 * ⚠ THE AUDIT SAID "0 of 371 legs carry a probability". The sharper truth is that the probability
 * EXISTS for every one of them and is discarded in the projection step — the same shape as MLB's
 * StatsAPI identity surviving to the optimizer while published predictions carry null, and the NFL
 * board's frozen DraftKings line never reaching the tracked row. Three findings, one defect class.
 *
 * Run: cd app && npx tsx --test src/lib/products/recommendation-receipt.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  PROBABILITY_BASIS as B, makeRecommendationReceipt, probabilityBasisFor, probabilityIsUsable,
} from "./recommendation-receipt.mjs";
import { INELIGIBILITY as I, eligibilityOf, partitionPool, correlationTagsFor } from "./product-eligible-leg.mjs";

const receipt = (o = {}) => makeRecommendationReceipt({
  receiptId: "r1", sport: "nfl", eventId: "401872960",
  participantId: "nfl-athlete-3043078", participantName: "Derrick Henry",
  marketFamily: "anytime_td", side: "Yes",
  sportsbook: "draftkings", line: 0.5, price: -255, marketCapturedAt: "2026-09-26T16:49:46Z",
  modelProjection: 0.75, modelProbability: 0.7516, probabilityBasis: B.MODEL_VALIDATED,
  availabilityState: "ACTIVE_CONFIRMED", roleState: "STARTER",
  publishedAt: "2026-09-26T16:50:00Z", product: "bank-builder",
  ...o,
});

/* ── §13 · the basis is an enum because null collapses four different facts ──────────────────── */

test("§13 · the four bases are decided from the registries, not from a caller's opinion", () => {
  assert.equal(probabilityBasisFor({ modelProbability: 0.62 }).basis, B.MODEL_VALIDATED);
  assert.equal(probabilityBasisFor({ modelProbability: null }).basis, B.NO_VALIDATED_MAPPING);
  assert.equal(probabilityBasisFor({ modelProbability: 0.62, familyPublished: false }).basis, B.ABSENT);
  const demoted = probabilityBasisFor({ modelProbability: 0.62, calibrationVerdict: "DEMOTE_TO_MARKET_CONTEXT" });
  assert.equal(demoted.basis, B.MODEL_DEMOTED);
  assert.match(demoted.reason, /DEMOTE_TO_MARKET_CONTEXT/);
  assert.equal(probabilityIsUsable(B.MODEL_VALIDATED), true);
  for (const b of [B.MODEL_DEMOTED, B.NO_VALIDATED_MAPPING, B.ABSENT]) assert.equal(probabilityIsUsable(b), false);
});

test("🔴 §13 · a DEMOTED probability is preserved but UNREADABLE as the model's", () => {
  /*
   * This is the field that keeps a demoted model out of a product. The number exists — 523 of 569
   * MLB leans publish one — and writing it into `modelProbability` as though it were usable is
   * exactly how a market that loses to the market on 18,659 settled leans reaches a card.
   */
  const r = receipt({ probabilityBasis: B.MODEL_DEMOTED, modelProbability: 0.6264,
                      probabilityReason: "the market's calibration verdict is DEMOTE_TO_MARKET_CONTEXT" });
  assert.equal(r.modelProbability, null, "a demoted probability must not be readable as the model's");
  assert.equal(r.unusableProbability, 0.6264, "and must not be silently lost either");
  assert.match(r.unusableProbabilityReason, /DEMOTE/);
});

test("🔴 §13 · a market-implied probability can never occupy the model's field", () => {
  const r = receipt({ probabilityBasis: B.NO_VALIDATED_MAPPING, modelProbability: null,
                      marketImpliedProbability: 0.71, marketImpliedIsDevigged: true });
  assert.equal(r.modelProbability, null);
  assert.equal(r.marketImpliedProbability, 0.71, "the market's number is recorded, as the market's");
  assert.equal(r.marketImpliedIsDevigged, true);
  // And it does not make the leg probability-eligible.
  assert.equal(probabilityIsUsable(r.probabilityBasis), false);
  assert.ok(eligibilityOf(r, { probabilityRequired: true }).reasons.includes(I.NO_MODEL_PROBABILITY));
});

test("§3 · an unread price is null, never -110", () => {
  const r = receipt({ price: undefined, line: undefined, sportsbook: undefined });
  assert.equal(r.price, null);
  assert.equal(r.line, null);
  assert.equal(r.sportsbook, null);
  assert.ok(eligibilityOf(r, {}).reasons.includes(I.NO_FROZEN_MARKET));
});

test("a market is a book AND a line AND a price — two of three is not a market", () => {
  for (const missing of [{ sportsbook: null }, { line: null }, { price: null }]) {
    assert.ok(eligibilityOf(receipt(missing), {}).reasons.includes(I.NO_FROZEN_MARKET),
      `partial market accepted: ${JSON.stringify(missing)}`);
  }
});

/* ── §14 · eligibility ──────────────────────────────────────────────────────────────────────── */

test("§14 · a clean leg is eligible, and says on what basis", () => {
  const e = eligibilityOf(receipt(), { probabilityRequired: true, modelState: "PUBLISHED", roleRequired: true });
  assert.equal(e.eligible, true, JSON.stringify(e.reasons));
  assert.equal(e.basis.probabilityUsable, true);
  assert.equal(e.basis.availabilityState, "ACTIVE_CONFIRMED");
  assert.equal(e.basis.roleState, "STARTER");
});

test("§14 · EVERY reason is returned, not the first — a bad leg is not fixed three times", () => {
  const bad = receipt({
    participantId: null, probabilityBasis: B.MODEL_DEMOTED, modelProbability: 0.6,
    sportsbook: null, availabilityState: "UNKNOWN", roleState: "UNKNOWN",
  });
  const e = eligibilityOf(bad, { probabilityRequired: true, modelState: "ESTIMATE", roleRequired: true });
  for (const r of [I.IDENTITY_UNRESOLVED, I.MARKET_NOT_PUBLISHED, I.MODEL_NOT_VALIDATED,
                   I.NO_MODEL_PROBABILITY, I.NO_FROZEN_MARKET, I.AVAILABILITY_UNKNOWN, I.ROLE_UNKNOWN]) {
    assert.ok(e.reasons.includes(r), `missing reason ${r} — got ${e.reasons.join(", ")}`);
  }
  assert.ok(e.reasons.length >= 7);
});

test("🔴 §14 · a DEMOTED market is refused even by a product that never multiplies probabilities", () => {
  /*
   * The projection and the demoted probability come out of the same fitted model. A product that
   * ranks on projections alone is not insulated from a model that loses to the market.
   */
  const r = receipt({ probabilityBasis: B.MODEL_DEMOTED, modelProbability: 0.62 });
  const e = eligibilityOf(r, { probabilityRequired: false, modelState: "PUBLISHED" });
  assert.equal(e.eligible, false);
  assert.ok(e.reasons.includes(I.MODEL_NOT_VALIDATED));
});

test("§14 · probability is required only where the product needs it", () => {
  const r = receipt({ probabilityBasis: B.NO_VALIDATED_MAPPING, modelProbability: null });
  assert.equal(eligibilityOf(r, { probabilityRequired: true, modelState: "PUBLISHED" }).eligible, false);
  assert.equal(eligibilityOf(r, { probabilityRequired: false, modelState: "PUBLISHED" }).eligible, true,
    "a projection-ranked product must not be blocked by a probability it never uses");
});

test("🔴 §3 · UNKNOWN availability is its OWN refusal, never a quiet pass", () => {
  assert.ok(eligibilityOf(receipt({ availabilityState: "UNKNOWN" }), {}).reasons.includes(I.AVAILABILITY_UNKNOWN));
  for (const s of ["OUT", "QUESTIONABLE"]) {
    assert.ok(eligibilityOf(receipt({ availabilityState: s }), {}).reasons.includes(I.UNAVAILABLE));
  }
  // An unrecognised state degrades to UNKNOWN rather than travelling on as available.
  assert.equal(receipt({ availabilityState: "PROBABLY_FINE" }).availabilityState, "UNKNOWN");
});

test("🔴 fail-closed clock · an UNKNOWN start time is not 'has not started'", () => {
  const now = Date.parse("2026-09-27T21:00:00Z");
  const before = eligibilityOf(receipt(), { nowMs: now, eventStartsAtMs: Date.parse("2026-09-27T22:00:00Z") });
  assert.equal(before.reasons.includes(I.EVENT_STARTED), false);
  const after = eligibilityOf(receipt(), { nowMs: now, eventStartsAtMs: Date.parse("2026-09-27T20:00:00Z") });
  assert.ok(after.reasons.includes(I.EVENT_STARTED));
  /* The Phase 6 defect: a static artifact offered 40 games that had already kicked off. An absent
     kickoff must refuse, not shrug. */
  const unknown = eligibilityOf(receipt(), { nowMs: now, eventStartsAtMs: null });
  assert.ok(unknown.reasons.includes(I.EVENT_STARTED), "an unknown start time must fail closed");
});

test("§14 · staleness is bounded by the product, and an unmeasured age does not refuse", () => {
  assert.ok(eligibilityOf(receipt(), { freshnessMs: 9e6, maxFreshnessMs: 3.6e6 }).reasons.includes(I.STALE));
  assert.equal(eligibilityOf(receipt(), { freshnessMs: 1e6, maxFreshnessMs: 3.6e6 }).reasons.includes(I.STALE), false);
  assert.equal(eligibilityOf(receipt(), { freshnessMs: null, maxFreshnessMs: 3.6e6 }).reasons.includes(I.STALE), false);
});

test("§14 · a market with no settlement path is refused", () => {
  assert.ok(eligibilityOf(receipt(), { settlementSupported: false }).reasons.includes(I.NO_SETTLEMENT_PATH));
});

test("§15 · correlation tags describe; nothing here computes a joint probability", () => {
  const t = correlationTagsFor(receipt());
  assert.ok(t.includes("sport:nfl"));
  assert.ok(t.includes("event:401872960"));
  assert.ok(t.includes("participant:nfl-athlete-3043078"));
  assert.ok(t.includes("family:anytime_td"));
});

test("partitionPool keeps every refusal reason so a producer can report the shape of its losses", () => {
  const pool = [
    receipt(),
    receipt({ receiptId: "r2", probabilityBasis: B.MODEL_DEMOTED, modelProbability: 0.6 }),
    receipt({ receiptId: "r3", availabilityState: "UNKNOWN" }),
  ];
  const { eligible, refused, counts } = partitionPool(pool, { probabilityRequired: true, modelState: "PUBLISHED" });
  assert.equal(eligible.length, 1);
  assert.equal(refused.length, 2);
  assert.equal(counts[I.MODEL_NOT_VALIDATED], 1);
  assert.equal(counts[I.NO_MODEL_PROBABILITY], 1);
  assert.equal(counts[I.AVAILABILITY_UNKNOWN], 1);
});

test("this module never selects and never writes — enforced by absence", () => {
  const rec = Object.keys(makeRecommendationReceipt({ sport: "x" }));
  assert.equal(rec.includes("rank"), false);
  assert.equal(rec.includes("score"), false);
  assert.equal(rec.includes("selected"), false);
});
