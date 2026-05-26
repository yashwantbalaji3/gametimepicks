/**
 * Tests for the centralized result-icon helpers.
 *
 * Run: npx tsx --test app/src/lib/result-icons.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeResult,
  getResultIcon,
  getResultGlyph,
  getResultLabel,
  getResultTone,
  isDecisive,
} from "./result-icons.ts";

test("normalizeResult maps known statuses to canonical kinds", () => {
  assert.equal(normalizeResult("win"), "win");
  assert.equal(normalizeResult("Win"), "win");
  assert.equal(normalizeResult("HIT"), "win");
  assert.equal(normalizeResult("loss"), "loss");
  assert.equal(normalizeResult("miss"), "loss");
  assert.equal(normalizeResult("push"), "push");
  assert.equal(normalizeResult("pending"), "pending");
  assert.equal(normalizeResult("unresolved"), "pending");
  assert.equal(normalizeResult("stats_unavailable"), "pending");
  assert.equal(normalizeResult("dnp"), "pending");
  assert.equal(normalizeResult("void"), "pending");
  assert.equal(normalizeResult(null), "pending");
  assert.equal(normalizeResult(undefined), "pending");
  assert.equal(normalizeResult(""), "pending");
});

test("normalizeResult NEVER promotes unknown to win/loss", () => {
  // Defensive contract — typos should never silently count as
  // wins/losses and skew the audit.
  assert.equal(normalizeResult("nope"), "unknown");
  assert.equal(normalizeResult("123"), "unknown");
  assert.equal(normalizeResult({}), "unknown");
});

test("getResultIcon returns ✅ ❌ ➖ — glyphs", () => {
  assert.equal(getResultGlyph("win"), "✅");
  assert.equal(getResultGlyph("loss"), "❌");
  assert.equal(getResultGlyph("push"), "➖");
  assert.equal(getResultGlyph("pending"), "—");
  assert.equal(getResultGlyph("unknown-garbage"), "—");
});

test("getResultLabel returns user-facing words", () => {
  assert.equal(getResultLabel("win"), "Hit");
  assert.equal(getResultLabel("loss"), "Miss");
  assert.equal(getResultLabel("push"), "Push");
  assert.equal(getResultLabel("pending"), "Pending");
});

test("getResultIcon includes a screen-reader aria label", () => {
  const meta = getResultIcon("win");
  assert.equal(typeof meta.ariaLabel, "string");
  assert.ok(meta.ariaLabel.length > 0);
});

test("getResultTone returns a CSS custom-property reference", () => {
  // Should always be a `var(--...)` token so consumers can paint
  // without hard-coding hex values.
  assert.match(getResultTone("win"), /^var\(--/);
  assert.match(getResultTone("loss"), /^var\(--/);
  assert.match(getResultTone("push"), /^var\(--/);
  assert.match(getResultTone("pending"), /^var\(--/);
});

test("isDecisive — only win/loss count, push and pending do not", () => {
  assert.equal(isDecisive("win"), true);
  assert.equal(isDecisive("loss"), true);
  assert.equal(isDecisive("push"), false,
    "Push is explicitly excluded from decisive");
  assert.equal(isDecisive("pending"), false,
    "Pending is explicitly excluded from decisive");
  assert.equal(isDecisive("stats_unavailable"), false);
  assert.equal(isDecisive(null), false);
});
