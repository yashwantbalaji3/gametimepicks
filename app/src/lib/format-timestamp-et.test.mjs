/**
 * NEW-1 — the footer's build stamp printed tomorrow's date for an evening ET build: the time was
 * formatted in ET, the date in the runtime's zone (UTC on the build machine).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTimestamp } from "./format.ts";

test("a 10:33 PM ET build is dated the same ET day, whatever the runtime zone", () => {
  // 2026-10-14T02:33Z is Oct 13, 10:33 PM EDT.
  assert.match(formatTimestamp("2026-10-14T02:33:00Z"), /^Oct 13, 10:33\sPM EDT$/);
  // Midday is unaffected.
  assert.match(formatTimestamp("2026-10-13T16:00:00Z"), /^Oct 13, 12:00\sPM EDT$/);
});
