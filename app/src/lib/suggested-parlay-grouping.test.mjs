/**
 * Tests for suggested-parlay-grouping — the "All view = union of NBA+MLB+Mixed"
 * fix that guarantees All ≥ each child tab.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sectionSlipsForSport,
  countSportViews,
  allCoversChildren,
  capForDisplay,
  availabilityReason,
  availabilityNote,
  slipKey,
} from "./suggested-parlay-grouping.ts";

// Synthetic optimizer-shaped slips. nba/mlb/multi disjoint by composition.
const nbaSlip = (i) => ({ slipId: `opt_low_nba_${i}`, legs: [{ sport: "nba", playerId: `n${i}`, market: "points", line: 20 }] });
const mlbSlip = (i) => ({ slipId: `opt_low_mlb_${i}`, legs: [{ sport: "mlb", playerId: `m${i}`, market: "batter_hits", line: 1.5 }] });
const multiSlip = (i) => ({ slipId: `opt_low_multi_${i}`, legs: [{ sport: "nba", playerId: `n${i}`, market: "points", line: 20 }, { sport: "mlb", playerId: `m${i}`, market: "batter_hits", line: 1.5 }] });

// One risk section where the STORED `all` is a capped curation (1 slip) but the
// sport buckets have many — the exact bug shape.
const section = {
  all: [nbaSlip(1)],                              // stored capped "all" = 1
  nba: [nbaSlip(1), nbaSlip(2), nbaSlip(3)],      // 3
  mlb: [mlbSlip(1), mlbSlip(2), mlbSlip(3), mlbSlip(4), mlbSlip(5)], // 5
  multi: [multiSlip(1), multiSlip(2)],            // 2
};

// 1. "all" view is the UNION of nba+mlb+multi, NOT the stored capped bucket
test("all view = union of nba+mlb+multi (not the stored all bucket)", () => {
  const all = sectionSlipsForSport(section, "all");
  assert.equal(all.length, 3 + 5 + 2); // 10, not the stored 1
  assert.notEqual(all.length, section.all.length);
});

// 2/3/4. single-sport views
test("nba/mlb/multi views return their own buckets", () => {
  assert.equal(sectionSlipsForSport(section, "nba").length, 3);
  assert.equal(sectionSlipsForSport(section, "mlb").length, 5);
  assert.equal(sectionSlipsForSport(section, "multi").length, 2);
});

// 5. all never less than child buckets (the reported bug)
test("all count >= each child count across risks", () => {
  const sections = { low: section, medium: { nba: [], mlb: [mlbSlip(6)], multi: [multiSlip(3)] } };
  const c = countSportViews(sections);
  assert.ok(allCoversChildren(c), `all(${c.all}) must cover nba(${c.nba}) mlb(${c.mlb}) multi(${c.multi})`);
  assert.ok(c.all >= c.nba && c.all >= c.mlb && c.all >= c.multi);
});

// 6. risk-section preservation (each risk counted independently)
test("counts aggregate across risk sections", () => {
  const sections = {
    low: { nba: [nbaSlip(1)], mlb: [mlbSlip(1)], multi: [] },
    high: { nba: [], mlb: [mlbSlip(2)], multi: [multiSlip(1)] },
  };
  const c = countSportViews(sections);
  assert.equal(c.mlb, 2); // low + high
  assert.equal(c.nba, 1);
  assert.equal(c.all, 4); // 1 nba + 2 mlb + 1 multi, all distinct
});

// 7. display cap (3–5)
test("capForDisplay caps to the window without fabricating", () => {
  const ten = sectionSlipsForSport(section, "all");
  assert.equal(capForDisplay(ten, 5).length, 5);
  assert.equal(capForDisplay([mlbSlip(1)], 5).length, 1); // fewer than cap → unchanged
});

// 8/9. availability reasons
test("availability reason: ok / limited / empty", () => {
  assert.equal(availabilityReason(5), "ok");
  assert.equal(availabilityReason(3), "ok");
  assert.equal(availabilityReason(2), "limited");
  assert.equal(availabilityReason(0), "empty");
  assert.equal(availabilityNote(5), null);
  assert.ok(availabilityNote(2).includes("Only 2"));
  assert.ok(availabilityNote(0).toLowerCase().includes("no qualifying"));
});

// 10. duplicate prevention within a view
test("dedup removes duplicate slipIds within a view", () => {
  const dup = { nba: [nbaSlip(1), nbaSlip(1), nbaSlip(2)], mlb: [], multi: [] };
  assert.equal(sectionSlipsForSport(dup, "nba").length, 2);
  assert.equal(sectionSlipsForSport(dup, "all").length, 2);
});

// 11. mixed cards appear in all but not in nba/mlb single-sport views
test("mixed appears in all + multi, not in nba/mlb views", () => {
  const all = sectionSlipsForSport(section, "all").map(slipKey);
  assert.ok(all.includes("opt_low_multi_1"));
  assert.ok(!sectionSlipsForSport(section, "nba").map(slipKey).includes("opt_low_multi_1"));
  assert.ok(!sectionSlipsForSport(section, "mlb").map(slipKey).includes("opt_low_multi_1"));
  assert.ok(sectionSlipsForSport(section, "multi").map(slipKey).includes("opt_low_multi_1"));
});

// 12. empty / null sections are safe
test("null/empty sections return empty, no throw", () => {
  assert.deepEqual(sectionSlipsForSport(null, "all"), []);
  assert.deepEqual(sectionSlipsForSport(undefined, "nba"), []);
  const c = countSportViews(null);
  assert.deepEqual(c, { all: 0, nba: 0, mlb: 0, multi: 0 });
  assert.ok(allCoversChildren(c));
});

// slipKey: content-hash fallback when no id
test("slipKey falls back to a leg content hash", () => {
  const a = slipKey({ legs: [{ playerId: "x", market: "pts", line: 20 }] });
  const b = slipKey({ legs: [{ playerId: "x", market: "pts", line: 20 }] });
  assert.equal(a, b);
  assert.notEqual(a, slipKey({ legs: [{ playerId: "y", market: "pts", line: 20 }] }));
});
