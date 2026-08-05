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

/**
 * WCAG 1.4.1 (Use of Color) — Program 137. The launch gate's accessibility criterion is that a
 * status is never communicated by colour alone. The existing guards prove every status HAS a
 * label; they do not prove the label is what distinguishes it. Two statuses sharing the label
 * "Pending" and differing only by a green vs amber tone would satisfy every check above while
 * being literally invisible to a user who cannot see the difference.
 */
test("no two statuses are distinguishable by tone alone — the label always carries the meaning", () => {
  const byLabel = new Map();
  for (const s of ALL_PRODUCT_STATUSES) {
    const { label } = statusMeta(s);
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push(s);
  }
  const collisions = [...byLabel.entries()].filter(([, ss]) => ss.length > 1);
  assert.deepEqual(
    collisions.map(([label, ss]) => `${label}: ${ss.join(", ")}`),
    [],
    "these statuses share a label and differ only by colour",
  );
});

test("no status label is a bare colour word", () => {
  for (const s of ALL_PRODUCT_STATUSES) {
    assert.doesNotMatch(
      statusMeta(s).label,
      /^(green|red|amber|yellow|orange|grey|gray)$/i,
      `${s}: a colour name is not a status`,
    );
  }
});
