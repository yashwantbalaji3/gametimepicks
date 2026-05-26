/**
 * Tests for the live-parlay loader stub.
 *
 * Today the loader is a no-op (no live file ever exists), so these
 * tests lock the contract: returns null for missing file, and the
 * staleness check rejects old timestamps.
 *
 * Run: npx tsx --test app/src/lib/live-parlays.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { isLiveTrackingActive } from "./live-parlays.ts";

test("isLiveTrackingActive returns false when state is null", () => {
  assert.equal(isLiveTrackingActive(null), false);
});

test("isLiveTrackingActive returns false when generatedAt missing", () => {
  // @ts-expect-error — intentional partial state
  assert.equal(isLiveTrackingActive({ date: "2026-05-26" }), false);
});

test("isLiveTrackingActive returns true for fresh timestamp (<30 min)", () => {
  const fresh = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago
  assert.equal(
    isLiveTrackingActive({
      date: "2026-05-26",
      generatedAt: fresh,
      lastPollSource: "manual",
      games: {},
      slips: [],
    }),
    true,
  );
});

test("isLiveTrackingActive returns false for stale timestamp (>30 min)", () => {
  const stale = new Date(Date.now() - 45 * 60 * 1000).toISOString(); // 45 min ago
  assert.equal(
    isLiveTrackingActive({
      date: "2026-05-26",
      generatedAt: stale,
      lastPollSource: "manual",
      games: {},
      slips: [],
    }),
    false,
  );
});

test("isLiveTrackingActive returns false for malformed timestamp", () => {
  assert.equal(
    isLiveTrackingActive({
      date: "2026-05-26",
      generatedAt: "not-an-iso-date",
      lastPollSource: "manual",
      games: {},
      slips: [],
    }),
    false,
  );
});
