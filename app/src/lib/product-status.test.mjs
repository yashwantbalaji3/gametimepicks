/**
 * Shared product-status vocabulary — every status maps to a label + a known tone. Guards against a status
 * silently losing its mapping (which would make a product render as a blank/mis-toned badge).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { statusMeta, ALL_PRODUCT_STATUSES } from "./product-status.ts";

const TONES = new Set(["positive", "live", "neutral", "info", "warn", "muted", "danger"]);

test("every product status has a non-empty label and a valid tone", () => {
  for (const s of ALL_PRODUCT_STATUSES) {
    const m = statusMeta(s);
    assert.ok(m.label && m.label.length > 0, `${s} has a label`);
    assert.ok(TONES.has(m.tone), `${s} tone "${m.tone}" is a known tone`);
  }
});

test("key statuses map to the expected honest labels + tones", () => {
  assert.deepEqual(statusMeta("active"), { label: "Active", tone: "positive" });
  assert.deepEqual(statusMeta("awaiting_refresh"), { label: "Awaiting refresh", tone: "warn" });
  assert.deepEqual(statusMeta("no_qualified_play"), { label: "No qualified play", tone: "muted" });
  assert.deepEqual(statusMeta("retired"), { label: "Retired", tone: "muted" });
  assert.deepEqual(statusMeta("live"), { label: "Live", tone: "live" });
});

test("retired is never a positive/live tone (a retired product must not look active)", () => {
  const m = statusMeta("retired");
  assert.ok(m.tone !== "positive" && m.tone !== "live");
});

test("unknown status falls back to a muted badge instead of throwing", () => {
  const m = statusMeta(/** @type {any} */ ("totally_unknown"));
  assert.equal(m.tone, "muted");
  assert.ok(m.label.length > 0);
});

test("the vocabulary covers all 16 documented statuses", () => {
  assert.equal(ALL_PRODUCT_STATUSES.length, 16);
});
