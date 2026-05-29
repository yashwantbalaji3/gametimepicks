/**
 * Tests for the Build My Card selection helpers. Pure state
 * transitions + tray summary math — guards the deterministic-key,
 * duplicate-prevention, and null-odds ("—") invariants from
 * `docs/PARLAY_LAB_BUILDER_DESIGN_2026-05-30.md` §2.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slipSelectionKey,
  isSlipSelected,
  selectSlip,
  deselectSlip,
  toggleSlip,
  clearSlips,
  summarizeSelectedSlip,
  summarizeSelectedSlips,
} from "./selected-slips.ts";

/** Build a slip with N legs whose `oddsForSide` is known so combined
 *  odds compute. Pass `odds: null` on a leg to simulate a missing
 *  price (odds become unavailable). */
function fakeSlip(slipId, { legs = 2, odds = -110, status = "pending" } = {}) {
  const legList = Array.from({ length: legs }, (_, i) => ({
    sport: "mlb",
    gameId: null,
    gameDate: "2026-05-29",
    playerId: i + 1,
    playerName: `Player ${i + 1}`,
    team: "BOS",
    opponent: "NYY",
    market: "batter_hits",
    side: "Over",
    line: 0.5,
    projection: 1.1,
    edgePct: 5,
    confidence: "Strong",
    bookmaker: "draftkings",
    oddsForSide: odds,
  }));
  return {
    slipId,
    riskProfile: "balanced",
    sport: "mlb",
    status,
    legs: legList,
    score: 1,
    sameGame: false,
    hasAnomalyLeg: false,
  };
}

test("slipSelectionKey returns the slipId verbatim (deterministic)", () => {
  assert.equal(slipSelectionKey({ slipId: "abc-123" }), "abc-123");
  // Stable across calls.
  assert.equal(slipSelectionKey({ slipId: "abc-123" }), "abc-123");
});

test("selectSlip adds a slip; isSlipSelected reflects it", () => {
  const a = fakeSlip("a");
  const next = selectSlip([], a);
  assert.equal(next.length, 1);
  assert.ok(isSlipSelected(next, "a"));
  assert.ok(!isSlipSelected(next, "b"));
});

test("selectSlip is idempotent — no duplicate copies of the same slip", () => {
  const a = fakeSlip("a");
  let sel = selectSlip([], a);
  sel = selectSlip(sel, a); // add same id again
  sel = selectSlip(sel, fakeSlip("a")); // different instance, same id
  assert.equal(sel.length, 1, "duplicate slipId must not be added twice");
});

test("selectSlip does not mutate the input array", () => {
  const start = [];
  const next = selectSlip(start, fakeSlip("a"));
  assert.equal(start.length, 0, "input array must stay untouched");
  assert.equal(next.length, 1);
});

test("deselectSlip removes by id and preserves the rest in order", () => {
  let sel = [fakeSlip("a"), fakeSlip("b"), fakeSlip("c")];
  sel = deselectSlip(sel, "b");
  assert.deepEqual(sel.map((s) => s.slipId), ["a", "c"]);
});

test("toggleSlip adds when absent, removes when present", () => {
  const a = fakeSlip("a");
  let sel = toggleSlip([], a);
  assert.ok(isSlipSelected(sel, "a"));
  sel = toggleSlip(sel, a);
  assert.ok(!isSlipSelected(sel, "a"));
});

test("toggleSlip removes the stored copy even when given a stale instance", () => {
  const a1 = fakeSlip("a");
  let sel = selectSlip([], a1);
  // A fresh instance with the same id (e.g. rebuilt after a filter change).
  const a2 = fakeSlip("a");
  sel = toggleSlip(sel, a2);
  assert.equal(sel.length, 0);
});

test("clearSlips returns an empty array", () => {
  assert.deepEqual(clearSlips(), []);
});

test("selection order is preserved (newest appended last)", () => {
  let sel = selectSlip([], fakeSlip("a"));
  sel = selectSlip(sel, fakeSlip("b"));
  sel = selectSlip(sel, fakeSlip("c"));
  assert.deepEqual(sel.map((s) => s.slipId), ["a", "b", "c"]);
});

test("summarizeSelectedSlip computes combined odds + section for priced legs", () => {
  const s = summarizeSelectedSlip(fakeSlip("a", { legs: 2, odds: -110 }));
  assert.equal(s.slipId, "a");
  assert.equal(s.legCount, 2);
  assert.equal(s.oddsUnavailable, false);
  assert.ok(typeof s.combinedAmerican === "number");
  assert.ok(s.sectionKey != null);
  assert.ok(s.sectionLabel != null);
});

test("summarizeSelectedSlip surfaces null odds honestly (renders as —)", () => {
  const s = summarizeSelectedSlip(fakeSlip("a", { legs: 2, odds: null }));
  assert.equal(s.oddsUnavailable, true);
  assert.equal(s.combinedAmerican, null);
  assert.equal(s.sectionKey, null);
  assert.equal(s.sectionLabel, null);
});

test("summarizeSelectedSlip carries slip status through (pending stays pending)", () => {
  assert.equal(summarizeSelectedSlip(fakeSlip("a", { status: "pending" })).status, "pending");
  assert.equal(summarizeSelectedSlip(fakeSlip("b", { status: "win" })).status, "win");
});

test("summarizeSelectedSlips empty state → count 0", () => {
  const sum = summarizeSelectedSlips([]);
  assert.equal(sum.count, 0);
  assert.equal(sum.summaries.length, 0);
  assert.equal(sum.withoutOdds, 0);
});

test("summarizeSelectedSlips counts slips missing odds", () => {
  const sel = [
    fakeSlip("a", { odds: -110 }),
    fakeSlip("b", { odds: null }),
    fakeSlip("c", { odds: null }),
  ];
  const sum = summarizeSelectedSlips(sel);
  assert.equal(sum.count, 3);
  assert.equal(sum.withoutOdds, 2);
});
