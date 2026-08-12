/**
 * Today-board guards (Program 167 · Release B): the five-phase daily loop is PRESENTATION over
 * the work board — same ids, exactly-once placement, structural mapping, no clock of its own.
 *
 * Run: npx tsx --test src/lib/launch/today-board.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTodayBoard, topActions, PHASES } from "./today-board.mjs";
import { buildWorkBoard } from "./work-board.mjs";
import { REALITY_GATED_WATCHES } from "./watches.mjs";

const NOW = "2026-08-12T18:00:00Z";

test("five phases, fixed order, release phase never invents cards", () => {
  const t = buildTodayBoard({ nowIso: NOW });
  assert.deepEqual(t.phases.map((p) => p.id), ["OBSERVE", "VERIFY", "BUILD", "RELEASE", "CLOSE"]);
  assert.deepEqual(PHASES.map((p) => p.id), t.phases.map((p) => p.id));
  const release = t.phases[3];
  assert.equal(release.cards.length, 0, "RELEASE renders discipline, not invented cards");
  assert.match(release.standing, /full gate/i);
});

test("every engineering card appears in exactly one phase with its board id", () => {
  const board = buildWorkBoard();
  const t = buildTodayBoard({ board, nowIso: NOW });
  const boardIds = Object.values(board.columns).flat().map((c) => c.id).sort();
  const placedIds = t.phases.flatMap((p) => p.cards.map((c) => c.id)).sort();
  assert.deepEqual(placedIds, boardIds, "no card dropped, none duplicated, no new ids minted");
});

test("mapping is structural: state decides the phase", () => {
  const t = buildTodayBoard({ nowIso: NOW });
  for (const c of t.phases[0].cards) assert.equal(c.state, "REALITY_GATED");
  for (const c of t.phases[1].cards) assert.equal(c.state, "IN_PROGRESS");
  for (const c of t.phases[2].cards) assert.ok(c.state === "READY" || c.state === "NEW", c.id);
  for (const c of t.phases[4].cards) assert.equal(c.state, "BLOCKED");
});

test("observe carries the countdown and sorts due-first", () => {
  const t = buildTodayBoard({ nowIso: NOW });
  const cards = t.phases[0].cards;
  assert.ok(cards.length >= 1, "watches exist as committed data");
  for (const c of cards) {
    if (REALITY_GATED_WATCHES.some((w) => w.id === c.id)) {
      assert.ok(c.watch, `${c.id} carries its countdown view`);
      assert.equal(typeof c.watch.hoursUntil, "number");
    }
  }
  const firstNotDue = cards.findIndex((c) => !c.watch?.due);
  if (firstNotDue !== -1) {
    for (const later of cards.slice(firstNotDue)) {
      assert.ok(!later.watch?.due, "due watches all sort before not-due watches");
    }
  }
});

test("the clock is a required parameter — no hidden Date.now()", () => {
  assert.throws(() => buildTodayBoard({}), /nowIso required/);
});

test("topActions: ordered, bounded, every entry has an exact next action", () => {
  const top = topActions({ nowIso: NOW, limit: 3 });
  assert.ok(top.length <= 3);
  assert.ok(top.length > 0, "an operating system with zero next actions is a rendering bug, not a clean desk");
  for (const a of top) {
    assert.ok(a.id && a.title && a.nextAction && a.acceptance, JSON.stringify(a));
    assert.ok(["OBSERVE", "VERIFY", "BUILD", "RELEASE", "CLOSE"].includes(a.phase));
  }
  // deterministic
  assert.deepEqual(top, topActions({ nowIso: NOW, limit: 3 }));
});

test("overdue/due watches outrank everything in topActions", () => {
  // 2026-08-15: the Aug-13/14 watches are due (not yet overdue by >24h for the 14th's)
  const top = topActions({ nowIso: "2026-08-14T05:00:00Z", limit: 3 });
  assert.equal(top[0].phase, "OBSERVE", "a due observation leads the list");
});
