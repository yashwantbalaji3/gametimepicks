/**
 * Tests for the leg game-time formatter introduced in PR
 * `feature/leg-game-time-threading`.
 *
 * Locks the precedence rule:
 *   1. ISO `commenceTime` (MLB) → formatted to ET.
 *   2. Pre-formatted `gameTime` (NBA tipoff string).
 *   3. Date-only fallback.
 *
 * And the honesty rule: when nothing usable exists we return "" — we
 * never fabricate a TBD or sniff the system clock.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatLegDateLabel,
  formatLegGameTime,
} from "./leg-game-time.ts";

test("formatLegDateLabel: valid YYYY-MM-DD → 'May 28'", () => {
  assert.equal(formatLegDateLabel("2026-05-28"), "May 28");
  assert.equal(formatLegDateLabel("2026-01-01"), "Jan 1");
});

test("formatLegDateLabel: bad input → empty string", () => {
  assert.equal(formatLegDateLabel(null), "");
  assert.equal(formatLegDateLabel(undefined), "");
  assert.equal(formatLegDateLabel(""), "");
  assert.equal(formatLegDateLabel("not-a-date"), "");
  assert.equal(formatLegDateLabel("2026-13-40"), "");
});

test("formatLegGameTime: MLB ISO UTC → 'May 28 · 1:10 PM ET'", () => {
  // 17:10 UTC = 13:10 ET (EDT, May 28 is in EDT)
  const s = formatLegGameTime({
    gameDate: "2026-05-28",
    commenceTime: "2026-05-28T17:10:00Z",
  });
  assert.equal(s, "May 28 · 1:10 PM ET");
});

test("formatLegGameTime: ISO UTC late slot → ET PM", () => {
  // 23:05 UTC = 7:05 PM ET (EDT)
  const s = formatLegGameTime({
    gameDate: "2026-05-28",
    commenceTime: "2026-05-28T23:05:00Z",
  });
  assert.equal(s, "May 28 · 7:05 PM ET");
});

test("formatLegGameTime: NBA pre-formatted gameTime is used verbatim", () => {
  const s = formatLegGameTime({
    gameDate: "2026-05-28",
    gameTime: "8:30 PM ET",
  });
  assert.equal(s, "May 28 · 8:30 PM ET");
});

test("formatLegGameTime: commenceTime wins over gameTime when both present", () => {
  const s = formatLegGameTime({
    gameDate: "2026-05-28",
    commenceTime: "2026-05-28T23:05:00Z",
    gameTime: "8:30 PM ET",
  });
  // ISO path (7:05 PM) takes priority over the NBA-style pre-formatted
  // chip — but since the NBA path doesn't emit ISO today, this only
  // matters defensively.
  assert.equal(s, "May 28 · 7:05 PM ET");
});

test("formatLegGameTime: bad ISO falls back to gameTime", () => {
  const s = formatLegGameTime({
    gameDate: "2026-05-28",
    commenceTime: "not-an-iso",
    gameTime: "8:30 PM ET",
  });
  assert.equal(s, "May 28 · 8:30 PM ET");
});

test("formatLegGameTime: both times missing → date-only", () => {
  assert.equal(
    formatLegGameTime({ gameDate: "2026-05-28" }),
    "May 28",
  );
});

test("formatLegGameTime: nothing usable → empty string", () => {
  assert.equal(formatLegGameTime({}), "");
  assert.equal(formatLegGameTime({ gameDate: "" }), "");
});

test("formatLegGameTime: never throws on hostile input", () => {
  assert.doesNotThrow(() =>
    formatLegGameTime({
      gameDate: "2026-05-28",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      commenceTime: 12345,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gameTime: {},
    }),
  );
});

test("formatLegGameTime: NBA fallback when no ISO", () => {
  const s = formatLegGameTime({
    gameDate: "2026-05-28",
    commenceTime: null,
    gameTime: "8:30 PM ET",
  });
  assert.equal(s, "May 28 · 8:30 PM ET");
});

test("formatLegGameTime: whitespace-only treated as missing", () => {
  const s = formatLegGameTime({
    gameDate: "2026-05-28",
    commenceTime: "   ",
    gameTime: "   ",
  });
  assert.equal(s, "May 28");
});
