/**
 * Tests for the slate-label helper used by per-slip date chips.
 *
 * Run: npx tsx --test app/src/lib/slate-label.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { formatSlateChip } from "./slate-label.ts";

test("today's date → 'Today · May 27' with tone 'today'", () => {
  const chip = formatSlateChip("2026-05-27", false, { nowIsoEt: "2026-05-27" });
  assert.equal(chip.label, "Today · May 27");
  assert.equal(chip.tone, "today");
});

test("fallback date → 'Latest available · May 25' with tone 'latest-available'", () => {
  const chip = formatSlateChip("2026-05-25", true, { nowIsoEt: "2026-05-27" });
  assert.equal(chip.label, "Latest available · May 25");
  assert.equal(chip.tone, "latest-available");
});

test("historical date (not today, not fallback) → 'Weekday Month Day' with tone 'neutral'", () => {
  // 2026-05-20 is a Wednesday. Weekday short form = "Wed".
  const chip = formatSlateChip("2026-05-20", false, { nowIsoEt: "2026-05-27" });
  assert.match(chip.label, /^[A-Z][a-z]{2} May 20$/);
  assert.equal(chip.tone, "neutral");
});

test("null date → 'Date unavailable' with tone 'missing'", () => {
  const chip = formatSlateChip(null, false, { nowIsoEt: "2026-05-27" });
  assert.equal(chip.label, "Date unavailable");
  assert.equal(chip.tone, "missing");
});

test("undefined date → 'Date unavailable'", () => {
  const chip = formatSlateChip(undefined, false, { nowIsoEt: "2026-05-27" });
  assert.equal(chip.label, "Date unavailable");
  assert.equal(chip.tone, "missing");
});

test("malformed date → 'Date unavailable' (no crash)", () => {
  const chip = formatSlateChip("not-a-date", false, { nowIsoEt: "2026-05-27" });
  assert.equal(chip.label, "Date unavailable");
  assert.equal(chip.tone, "missing");
});

test("today's date with isFallback=true should still show 'Today' (today wins)", () => {
  // A snapshot dated today should always say "Today", even if the
  // caller passed isFallback (edge case — defensive).
  const chip = formatSlateChip("2026-05-27", true, { nowIsoEt: "2026-05-27" });
  assert.equal(chip.label, "Today · May 27");
  assert.equal(chip.tone, "today");
});

test("no banned copy in any tone label", () => {
  const banned = [
    /\block\b/i,
    /\bguaranteed\b/i,
    /\bfree money\b/i,
    /\brisk[\s-]?free\b/i,
    /\bcan(?:'|’)?t miss\b/i,
    /\beasy win\b/i,
    /\bno[\s-]?brainer\b/i,
    /\bsure thing\b/i,
    /\bsharp money\b/i,
  ];
  const samples = [
    formatSlateChip("2026-05-27", false, { nowIsoEt: "2026-05-27" }),
    formatSlateChip("2026-05-25", true, { nowIsoEt: "2026-05-27" }),
    formatSlateChip("2026-05-20", false, { nowIsoEt: "2026-05-27" }),
    formatSlateChip(null, false, { nowIsoEt: "2026-05-27" }),
  ];
  for (const s of samples) {
    for (const pattern of banned) {
      assert.ok(
        !pattern.test(s.label),
        `chip label "${s.label}" must not match banned pattern ${pattern}`,
      );
    }
  }
});
