/**
 * Tests for the evidence-store contract. Enforces: publishedAt + capturedAt required, impossible provenance rejected,
 * social_unverified retained but not "established", stable provenance hash. Run: npx tsx --test src/lib/event-markets/evidence-store.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { validateEvidence, isEstablishedEvidence, provenanceHash } from "./evidence-store.ts";

const base = {
  evidenceId: "ev-1", marketId: "m-1", source: "Reporter", sourceUrl: "http://x", publisher: "Outlet",
  publishedAt: "2026-07-20T14:00:00Z", capturedAt: "2026-07-20T14:05:00Z", reliabilityTier: "tier1_reporter",
  entities: ["player-x"], claim: "Team A made the strongest offer", directionByOutcome: { "team-a": 0.6 },
  confidence: 0.7, expiresAt: null,
};

test("1 · a well-formed item is valid + gets a provenance hash", () => {
  const r = validateEvidence(base);
  assert.equal(r.valid, true);
  assert.equal(r.reasons.length, 0);
  assert.ok(r.provenanceHash && r.provenanceHash.length === 32);
});

test("2 · missing publishedAt ⇒ invalid (an untimed claim is not usable evidence)", () => {
  const r = validateEvidence({ ...base, publishedAt: null });
  assert.equal(r.valid, false);
  assert.match(r.reasons.join(" "), /publishedAt/);
});

test("3 · missing capturedAt ⇒ invalid (no provenance)", () => {
  assert.equal(validateEvidence({ ...base, capturedAt: undefined }).valid, false);
});

test("4 · captured BEFORE published ⇒ invalid (impossible provenance)", () => {
  const r = validateEvidence({ ...base, capturedAt: "2026-07-20T13:00:00Z" });
  assert.equal(r.valid, false);
  assert.match(r.reasons.join(" "), /captured before/);
});

test("5 · missing expiresAt key (decay policy) ⇒ invalid; explicit null is OK", () => {
  const { expiresAt, ...noExpiry } = base;
  assert.equal(validateEvidence(noExpiry).valid, false);
  assert.equal(validateEvidence({ ...base, expiresAt: null }).valid, true);
});

test("6 · confidence out of [0,1] ⇒ invalid", () => {
  assert.equal(validateEvidence({ ...base, confidence: 1.5 }).valid, false);
});

test("7 · a social_unverified item can be valid but is NOT established evidence", () => {
  const social = { ...base, reliabilityTier: "social_unverified" };
  assert.equal(validateEvidence(social).valid, true, "retained (not deleted)");
  assert.equal(isEstablishedEvidence(social), false, "but never treated as established fact");
  assert.equal(isEstablishedEvidence(base), true);
});

test("8 · provenance hash is stable + independent of our capture-time metadata", () => {
  const h1 = provenanceHash(base);
  const h2 = provenanceHash({ ...base, capturedAt: "2026-07-20T23:59:00Z" }); // different capture time
  assert.equal(h1, h2, "same source claim ⇒ same provenance hash");
  const h3 = provenanceHash({ ...base, claim: "A DIFFERENT claim" });
  assert.notEqual(h1, h3);
});
