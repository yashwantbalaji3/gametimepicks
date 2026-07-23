/**
 * UFC leakage-safe feature-eligibility tests (Phase 7). Pins timestamp eligibility (capturedAt < first bell),
 * chronological feature construction (source fights strictly earlier than the bout — no post-fight career stats), and
 * the bout-identity join key that prevents a rematch from joining a past fight's result (the two confirmed leakage
 * bugs). Run: npx tsx --test src/lib/ufc/feature-eligibility.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ufcFeatureEligible, boutJoinKey } from "./feature-eligibility.ts";

const BOUT_START = "2026-07-11T23:00:00Z";

test("1 · captured before the first bell + all source fights earlier ⇒ eligible", () => {
  const r = ufcFeatureEligible({ capturedAt: "2026-07-11T18:00:00Z", boutStartTime: BOUT_START, sourceFightDates: ["2026-03-01", "2025-11-15"] });
  assert.equal(r.eligible, true);
});

test("2 · captured at/after the first bell ⇒ ineligible (leakage)", () => {
  assert.equal(ufcFeatureEligible({ capturedAt: "2026-07-11T23:30:00Z", boutStartTime: BOUT_START }).eligible, false);
  assert.equal(ufcFeatureEligible({ capturedAt: BOUT_START, boutStartTime: BOUT_START }).eligible, false, "equality is ineligible");
});

test("3 · a source fight ON/AFTER the bout date ⇒ ineligible (post-fight career stats — the confirmed leak)", () => {
  const r = ufcFeatureEligible({ capturedAt: "2026-07-11T18:00:00Z", boutStartTime: BOUT_START, sourceFightDates: ["2026-07-11"] });
  assert.equal(r.eligible, false);
  assert.match(r.reason, /not strictly earlier/);
});

test("4 · missing capture/bout time or an undated source fight ⇒ ineligible (unprovable timing)", () => {
  assert.equal(ufcFeatureEligible({ capturedAt: null, boutStartTime: BOUT_START }).eligible, false);
  assert.equal(ufcFeatureEligible({ capturedAt: "2026-07-11T18:00:00Z", boutStartTime: null }).eligible, false);
  assert.equal(ufcFeatureEligible({ capturedAt: "2026-07-11T18:00:00Z", boutStartTime: BOUT_START, sourceFightDates: [null] }).eligible, false);
});

test("5 · a REMATCH gets a DISTINCT join key from the earlier fight (no cross-date result collision)", () => {
  const first = boutJoinKey({ fighters: ["Pereira", "Prochazka"], eventDate: "2023-11-11" });
  const rematch = boutJoinKey({ fighters: ["Prochazka", "Pereira"], eventDate: "2026-06-14" });
  assert.notEqual(first, rematch, "same fighters, different dates ⇒ different keys");
  // order-independent within a single bout
  assert.equal(boutJoinKey({ fighters: ["A", "B"], eventDate: "2026-01-01" }), boutJoinKey({ fighters: ["B", "A"], eventDate: "2026-01-01" }));
});

test("6 · a native boutId is preferred as the join key when present", () => {
  assert.equal(boutJoinKey({ boutId: "ufc-317-main" }), "id:ufc-317-main");
});
