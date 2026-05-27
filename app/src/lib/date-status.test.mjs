/**
 * Tests for the date-status helpers.
 *
 * Run: npx tsx --test app/src/lib/date-status.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatDateForHeader,
  isoDateInET,
  relativeLabel,
} from "./date-status.ts";

test("isoDateInET returns a YYYY-MM-DD string", () => {
  const iso = isoDateInET();
  assert.match(iso, /^\d{4}-\d{2}-\d{2}$/);
});

test("formatDateForHeader resolves 'today' when ISO equals today-ET", () => {
  const todayIso = "2026-05-27";
  const result = formatDateForHeader("2026-05-27", { nowIsoEt: todayIso });
  assert.equal(result.relative, "today");
});

test("formatDateForHeader resolves 'tomorrow' when ISO is +1 day", () => {
  const result = formatDateForHeader("2026-05-28", { nowIsoEt: "2026-05-27" });
  assert.equal(result.relative, "tomorrow");
});

test("formatDateForHeader resolves 'yesterday' when ISO is -1 day", () => {
  const result = formatDateForHeader("2026-05-26", { nowIsoEt: "2026-05-27" });
  assert.equal(result.relative, "yesterday");
});

test("formatDateForHeader emits null relative for >1 day gaps", () => {
  const result = formatDateForHeader("2026-05-20", { nowIsoEt: "2026-05-27" });
  assert.equal(result.relative, null);
});

test("formatDateForHeader pretty format includes weekday + month/day", () => {
  const result = formatDateForHeader("2026-05-27", { nowIsoEt: "2026-05-27" });
  // 2026-05-27 is a Wednesday.
  assert.ok(/Wednesday/.test(result.pretty),
    `pretty should contain weekday, got: ${result.pretty}`);
  assert.ok(/May 27/.test(result.pretty),
    `pretty should contain "May 27", got: ${result.pretty}`);
});

test("formatDateForHeader short form is concise", () => {
  const result = formatDateForHeader("2026-05-27", { nowIsoEt: "2026-05-27" });
  assert.equal(result.short, "May 27");
});

test("formatDateForHeader handles malformed input safely", () => {
  const result = formatDateForHeader("not-a-date");
  assert.equal(result.iso, "not-a-date");
  assert.equal(result.relative, null);
});

test("relativeLabel returns 'Today' / 'Tomorrow' / 'Yesterday' literals", () => {
  assert.equal(relativeLabel("today", "2026-05-27", "2026-05-27"), "Today");
  assert.equal(relativeLabel("tomorrow", "2026-05-27", "2026-05-28"), "Tomorrow");
  assert.equal(relativeLabel("yesterday", "2026-05-27", "2026-05-26"), "Yesterday");
});

test("relativeLabel returns 'Replay · not official' for replay", () => {
  const label = relativeLabel("replay", "2026-05-27", "2026-05-26");
  assert.equal(label, "Replay · not official");
});

test("relativeLabel returns 'Custom · not officially tracked' for custom", () => {
  const label = relativeLabel("custom", "2026-05-27", "2026-05-27");
  assert.equal(label, "Custom · not officially tracked");
});

test("relativeLabel falls back to days-behind for gaps > 1 with null relative", () => {
  // 4 days behind today.
  const label = relativeLabel(null, "2026-05-27", "2026-05-23");
  assert.match(label, /Latest available · 4 days behind/);
});

test("relativeLabel returns 'Official' for the official tag", () => {
  assert.equal(relativeLabel("official", "2026-05-27", "2026-05-27"), "Official");
});

test("relativeLabel returns 'Pending settlement' for pending-settlement", () => {
  assert.equal(
    relativeLabel("pending-settlement", "2026-05-27", "2026-05-27"),
    "Pending settlement",
  );
});
