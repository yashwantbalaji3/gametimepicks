/**
 * Odds-availability classifier guards (Program 167 · Release C).
 * Run: npx tsx --test src/lib/sports/odds/availability.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveOddsAvailability, ODDS_LANE_STATES, AUTHORIZATION_REQUIRED_LINE } from "./availability.mjs";

const NOW = "2026-08-12T18:00:00Z";

test("no snapshot, no key, no proofs → AUTHORIZATION_REQUIRED with the exact line", () => {
  const r = deriveOddsAvailability({ sport: "nfl", nowIso: NOW });
  assert.equal(r.state, "AUTHORIZATION_REQUIRED");
  assert.ok(r.reason.includes(AUTHORIZATION_REQUIRED_LINE));
  assert.equal(r.dryRunReady, false);
});

test("key present but unauthorized → AUTHORIZATION_REQUIRED with dry-run available", () => {
  const r = deriveOddsAvailability({ sport: "nfl", nowIso: NOW, secretState: "PRESENT" });
  assert.equal(r.state, "AUTHORIZATION_REQUIRED");
  assert.equal(r.dryRunReady, true);
});

test("zero-quota proof without key → DISCOVERABLE_ZERO_QUOTA naming the proof", () => {
  const r = deriveOddsAvailability({ sport: "ufc", nowIso: NOW, zeroQuotaDiscoveryProofPath: "docs/ODDS_ZERO_QUOTA_PROOF.md" });
  assert.equal(r.state, "DISCOVERABLE_ZERO_QUOTA");
  assert.match(r.reason, /ODDS_ZERO_QUOTA_PROOF/);
});

test("authorization receipt + key → DRY_RUN_READY; receipt without key stays honest about where capture runs", () => {
  const withKey = deriveOddsAvailability({ sport: "nfl", nowIso: NOW, secretState: "PRESENT", authorizationReceiptPath: "docs/receipts/odds-auth-2026-08-12.md" });
  assert.equal(withKey.state, "DRY_RUN_READY");
  const withoutKey = deriveOddsAvailability({ sport: "nfl", nowIso: NOW, secretState: "BLOCKED_EXTERNAL", authorizationReceiptPath: "docs/receipts/odds-auth-2026-08-12.md" });
  assert.equal(withoutKey.state, "AUTHORIZATION_REQUIRED");
  assert.match(withoutKey.reason, /CI/);
});

test("valid fresh pre-start snapshot → CAPTURED with age", () => {
  const r = deriveOddsAvailability({
    sport: "nfl", nowIso: NOW,
    snapshot: { capturedAt: "2026-08-12T16:00:00Z", valid: true },
    eventStartUtc: "2026-08-13T23:00:00Z",
  });
  assert.equal(r.state, "CAPTURED");
  assert.equal(r.ageHours, 2);
});

test("age beyond the bound → STALE; validator failure → QUARANTINED; provider failure → SOURCE_ERROR", () => {
  assert.equal(deriveOddsAvailability({ sport: "nfl", nowIso: NOW, snapshot: { capturedAt: "2026-08-12T08:00:00Z", valid: true } }).state, "STALE");
  assert.equal(deriveOddsAvailability({ sport: "nfl", nowIso: NOW, snapshot: { capturedAt: "2026-08-12T16:00:00Z", valid: false, errors: ["dataClass wrong"] } }).state, "QUARANTINED");
  assert.equal(deriveOddsAvailability({ sport: "nfl", nowIso: NOW, snapshot: { sourceError: "HTTP 503" } }).state, "SOURCE_ERROR");
});

test("post-start capture can never read as CAPTURED", () => {
  const r = deriveOddsAvailability({
    sport: "ufc", nowIso: "2026-08-16T02:00:00Z",
    snapshot: { capturedAt: "2026-08-15T23:30:00Z", valid: true },
    eventStartUtc: "2026-08-15T21:00:00Z",
  });
  assert.equal(r.state, "QUARANTINED");
  assert.match(r.reason, /AFTER event start/);
});

test("every emitted state is in the contract list; clock is required", () => {
  for (const r of [
    deriveOddsAvailability({ sport: "nfl", nowIso: NOW }),
    deriveOddsAvailability({ sport: "nfl", nowIso: NOW, secretState: "PRESENT" }),
  ]) assert.ok(ODDS_LANE_STATES.includes(r.state));
  assert.throws(() => deriveOddsAvailability({ sport: "nfl" }), /nowIso required/);
});
