/**
 * TODAY'S TOP 10 CONTAINS ONLY TODAY.
 *
 * Every producer feeding this board reads an artifact keyed by `date` and then trusts that
 * everything inside it belongs to that day. Nothing checked the trust: `date` chose the FILE, and
 * the only per-row time test was `start > now` — which rejects a started or prior-day event by
 * accident, because those are in the past, while letting TOMORROW's event straight through, since a
 * future start passes a future-start test.
 *
 * Today's Top 10 is the most prominent thing on the site. A row from another day sitting in it is
 * not cosmetic, and it would look completely normal.
 *
 * Each case here injects one corruption and proves the gate fires on it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { refuseWrongDay, buildTop10Board } from "./top10-picks.ts";

const DATE = "2026-08-28";

/** A minimal candidate — only `startsAt` and `id` matter to the gate. */
const pick = (id, startsAt) => ({ id, startsAt, sport: "mlb", kind: "prop", score: 0.5 });

test("a pick on the selected ET day is kept", () => {
  const r = refuseWrongDay([pick("a", "2026-08-28T23:05:00Z")], DATE);
  assert.deepEqual(r.kept.map((p) => p.id), ["a"]);
  assert.deepEqual(r.refused, []);
});

test("CORRUPTION · tomorrow's event is refused — the case `start > now` cannot catch", () => {
  /*
   * The whole reason this gate exists. A future start passes a future-start test, so before this,
   * a lean for tomorrow sitting in today's board file would have ranked onto today's board.
   */
  const r = refuseWrongDay([pick("t", "2026-08-29T23:05:00Z")], DATE);
  assert.deepEqual(r.kept, []);
  assert.equal(r.refused[0].reason, "event is on a later day");
  assert.equal(r.refused[0].day, "2026-08-29");
});

test("CORRUPTION · yesterday's event is refused, and named as earlier", () => {
  const r = refuseWrongDay([pick("y", "2026-08-27T23:05:00Z")], DATE);
  assert.deepEqual(r.kept, []);
  assert.equal(r.refused[0].reason, "event is on an earlier day");
});

test("CORRUPTION · a row with no readable start is refused, not assumed", () => {
  // An unfalsifiable date is not the selected date.
  for (const bad of [null, undefined, "", "sometime tonight"]) {
    const r = refuseWrongDay([pick("x", bad)], DATE);
    assert.deepEqual(r.kept, [], `"${bad}" must not be kept`);
    assert.match(r.refused[0].reason, /cannot say when it starts/);
    assert.equal(r.refused[0].day, null);
  }
});

test("THE ET DAY, NOT THE UTC DATE · a late game whose UTC date is tomorrow still belongs to tonight", () => {
  /*
   * 2026-08-29T01:45Z is 9:45 PM ET on the 28th. Reading the calendar date off the ISO string would
   * refuse it as "tomorrow" and quietly drop every West-Coast night game from the board.
   */
  const r = refuseWrongDay([pick("late", "2026-08-29T01:45:00Z")], DATE);
  assert.deepEqual(r.kept.map((p) => p.id), ["late"]);
});

test("…and the mirror: an early-morning UTC instant that is still the PREVIOUS evening in ET", () => {
  const r = refuseWrongDay([pick("prev", "2026-08-28T02:00:00Z")], DATE);
  assert.deepEqual(r.kept, [], "9:00 PM ET on the 27th is not the 28th");
  assert.equal(r.refused[0].day, "2026-08-27");
});

test("a mixed batch partitions exactly — nothing is silently lost", () => {
  const picks = [
    pick("today-a", "2026-08-28T17:05:00Z"),
    pick("tomorrow", "2026-08-29T23:05:00Z"),
    pick("today-b", "2026-08-29T01:45:00Z"),
    pick("yesterday", "2026-08-27T18:00:00Z"),
    pick("undated", null),
  ];
  const r = refuseWrongDay(picks, DATE);
  assert.equal(r.kept.length + r.refused.length, picks.length);
  assert.deepEqual(r.kept.map((p) => p.id).sort(), ["today-a", "today-b"]);
  assert.equal(r.refused.length, 3);
});

test("the refusal carries the day it actually belonged to, so a defect is diagnosable", () => {
  // "Refused" alone tells an operator nothing about which upstream artifact went wrong.
  const r = refuseWrongDay([pick("t", "2026-08-30T18:00:00Z")], DATE);
  assert.equal(r.refused[0].day, "2026-08-30");
  assert.equal(r.refused[0].id, "t");
});

/* ── AGAINST THE LIVE BOARD ───────────────────────────────────────────────────────────────────── */

test("LIVE · every row on every tab of the current board is on the board's own date", () => {
  /*
   * The assertion the charter asks for, run against whatever the tree currently holds. An empty
   * board passes trivially and honestly — there is nothing on it to be wrong.
   */
  const root = path.join(process.cwd(), "public", "data");
  const dir = path.join(root, "mlb", "boards");
  if (!fs.existsSync(dir)) return;
  const dates = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
  if (!dates.length) return;

  // Check the newest few boards, not just today's — a date defect on any of them is the same defect.
  for (const date of dates.slice(-3)) {
    const board = buildTop10Board(root, date, Date.parse(`${date}T12:00:00Z`));
    for (const tab of ["overall", "safe", "props", "team"]) {
      const rows = board[tab] ?? [];
      const wrong = refuseWrongDay(rows, date).refused;
      assert.deepEqual(wrong, [], `${date} · ${tab}: rows off the board's date:\n  ${wrong.map((w) => `${w.id} → ${w.day}`).join("\n  ")}`);
    }
    assert.ok(Array.isArray(board.refusedWrongDay), `${date}: the board publishes its refusals`);
  }
});
