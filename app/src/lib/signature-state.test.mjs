/**
 * Signature-product state derivation proofs.
 *
 * The rule these enforce: a product may never claim a readiness later than its earliest unmet
 * precondition, and existence of an artifact is never evidence of currency.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveSignatureState, SIGNATURE_STATES } from "./signature-state.mjs";

const TODAY = "2026-08-04";
const base = (over = {}) => ({
  slateDate: TODAY,
  artifactDate: TODAY,
  archived: false,
  marketsPosted: true,
  candidates: 5,
  qualified: 2,
  approved: true,
  ...over,
});

test("ACTIVE only when every precondition is met", () => {
  const r = deriveSignatureState(base());
  assert.equal(r.state, SIGNATURE_STATES.ACTIVE);
  assert.match(r.actionable, /Live for today/);
});

test("AWAITING_APPROVAL when a qualified card is pending approval", () => {
  const r = deriveSignatureState(base({ approved: false }));
  assert.equal(r.state, SIGNATURE_STATES.AWAITING_APPROVAL);
  assert.match(r.reason, /pending approval/);
  assert.notEqual(r.state, SIGNATURE_STATES.ACTIVE, "approval must never be bypassed");
});

test("AWAITING_QUALIFIED_CARD when nothing clears the bar", () => {
  const none = deriveSignatureState(base({ qualified: 0 }));
  assert.equal(none.state, SIGNATURE_STATES.AWAITING_QUALIFIED_CARD);
  assert.match(none.reason, /0 of 5 candidates/);
  // …and when generation produced nothing at all.
  const zero = deriveSignatureState(base({ candidates: 0, qualified: 0 }));
  assert.equal(zero.state, SIGNATURE_STATES.AWAITING_QUALIFIED_CARD);
  assert.match(zero.reason, /no candidates/);
  assert.match(zero.actionable, /rather than lowering the bar/);
});

test("AWAITING_MARKETS when the book has posted nothing", () => {
  const r = deriveSignatureState(base({ marketsPosted: false, candidates: 0, qualified: 0 }));
  assert.equal(r.state, SIGNATURE_STATES.AWAITING_MARKETS);
});

test("ARCHIVED never looks live, even with a full current artifact", () => {
  const r = deriveSignatureState(base({ archived: true }));
  assert.equal(r.state, SIGNATURE_STATES.ARCHIVED);
  assert.notEqual(r.state, SIGNATURE_STATES.ACTIVE);
});

test("STALE · a prior-day artifact is never ACTIVE (the file-existence trap)", () => {
  // The failure this exists to prevent: yesterday's card rendering as today's product because a
  // file was present.
  const r = deriveSignatureState(base({ artifactDate: "2026-08-03" }));
  assert.equal(r.state, SIGNATURE_STATES.STALE);
  assert.match(r.reason, /2026-08-03.*2026-08-04/);
  assert.match(r.actionable, /rather than yesterday/);
});

test("STALE · a missing artifact date is stale, not active", () => {
  assert.equal(deriveSignatureState(base({ artifactDate: null })).state, SIGNATURE_STATES.STALE);
});

test("precedence: the EARLIEST unmet precondition wins", () => {
  // Stale inputs plus missing markets plus no approval → STALE, because date is checked first.
  // A product must never advertise a later readiness than its earliest failure.
  const r = deriveSignatureState(base({ artifactDate: "2026-08-02", marketsPosted: false, approved: false, qualified: 0 }));
  assert.equal(r.state, SIGNATURE_STATES.STALE);
  // Markets missing outranks qualification/approval.
  const m = deriveSignatureState(base({ marketsPosted: false, approved: false, qualified: 0 }));
  assert.equal(m.state, SIGNATURE_STATES.AWAITING_MARKETS);
});

test("products without an approval gate go straight to ACTIVE when qualified", () => {
  const r = deriveSignatureState(base({ requiresApproval: false, approved: false }));
  assert.equal(r.state, SIGNATURE_STATES.ACTIVE);
});

test("every derived state is a real repository ProductStatus key", () => {
  const src = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "product-status.ts"),
    "utf8",
  );
  for (const key of Object.values(SIGNATURE_STATES)) {
    assert.ok(
      new RegExp(`\\b${key}\\s*:`).test(src),
      `${key} must exist in product-status.ts — no parallel vocabulary`,
    );
  }
});

test("every state carries user-readable, actionable copy", () => {
  const cases = [base(), base({ approved: false }), base({ qualified: 0 }), base({ marketsPosted: false }), base({ archived: true }), base({ artifactDate: "2026-08-01" })];
  for (const c of cases) {
    const r = deriveSignatureState(c);
    assert.ok(r.actionable && r.actionable.length > 12, `${r.state} needs useful copy`);
    assert.ok(r.reason && r.reason.length > 5, `${r.state} needs a reason`);
    assert.doesNotMatch(r.actionable, /undefined|null|NaN/);
  }
});
