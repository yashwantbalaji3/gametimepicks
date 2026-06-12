import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPublicProjection, isParlayEligibleLeg, isPublicSuggestedCard,
  isBankBuilderCandidate, getPublicGateReason, friendlyStatusLabel,
} from "./public-visibility.ts";

test("isPublicProjection only when public=true", () => {
  assert.equal(isPublicProjection({ public: true }), true);
  assert.equal(isPublicProjection({ public: false }), false);
  assert.equal(isPublicProjection(null), false);
});

test("isParlayEligibleLeg only when parlayEligible=true", () => {
  assert.equal(isParlayEligibleLeg({ parlayEligible: true }), true);
  assert.equal(isParlayEligibleLeg({ parlayEligible: false }), false);
});

test("isPublicSuggestedCard needs legs + public", () => {
  assert.equal(isPublicSuggestedCard({ isPublic: true, legs: [1] }), true);
  assert.equal(isPublicSuggestedCard({ isPublic: true, legs: [] }), false);
  assert.equal(isPublicSuggestedCard({ isPublic: false, legs: [1] }), false);
});

test("isBankBuilderCandidate requires explicit flag", () => {
  assert.equal(isBankBuilderCandidate({ isPublic: true, legs: [1], bankBuilderEligible: true }), true);
  assert.equal(isBankBuilderCandidate({ isPublic: true, legs: [1], bankBuilderEligible: false }), false);
});

test("getPublicGateReason is user-friendly, never raw jargon", () => {
  assert.equal(getPublicGateReason({ parlayEligible: true }), null);
  assert.equal(getPublicGateReason({ parlayEligible: false, lineupStatus: "pre_lineup_unknown" }), "Player evidence pending");
  assert.equal(getPublicGateReason({ parlayEligible: false, projectionStatus: "gated_low_edge" }), "Edge below card threshold");
  assert.equal(getPublicGateReason({ parlayEligible: false, projectionStatus: "unavailable_from_provider" }), "Market unavailable from current provider");
});

test("friendlyStatusLabel maps known + de-snakes unknown", () => {
  assert.equal(friendlyStatusLabel("waiting_on_lineups"), "Lineups pending");
  assert.equal(friendlyStatusLabel("some_new_status"), "some new status");
});
