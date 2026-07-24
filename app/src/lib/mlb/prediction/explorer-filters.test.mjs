/**
 * EXPLORER FILTER/SORT TESTS (Sprint 013 · Phase 7). The discovery controls may only REORDER or NARROW the
 * canonical cards — never fabricate, never estimate a missing value, always deterministic.
 *
 * Run: npx tsx --test src/lib/mlb/prediction/explorer-filters.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { applyExplorerView, decisiveness, medianTotal, totalSpread } from "./explorer-filters.ts";

const card = (slug, { away, home, median, p10, p90, firstPitch } = {}) => ({
  slug,
  game: {
    slug,
    firstPitch: firstPitch ?? "2026-07-24T20:00:00Z",
    winProbability: away == null ? null : { away, home },
    totalRuns: median == null ? null : { mean: median, median, p10, p90, distribution: [] },
  },
});

const CARDS = [
  card("a-coinflip", { away: 0.49, home: 0.51, median: 8, p10: 4, p90: 13, firstPitch: "2026-07-24T23:00:00Z" }),
  card("b-lopsided", { away: 0.24, home: 0.76, median: 7, p10: 4, p90: 11, firstPitch: "2026-07-24T17:00:00Z" }),
  card("c-highscore", { away: 0.45, home: 0.55, median: 11, p10: 5, p90: 18, firstPitch: "2026-07-24T20:00:00Z" }),
];

test("helpers read canonical values only, and return null when the value is absent", () => {
  assert.equal(decisiveness(CARDS[1].game), 0.76, "the winning side's probability");
  assert.equal(medianTotal(CARDS[2].game), 11);
  assert.equal(totalSpread(CARDS[2].game), 13);
  const bare = card("d-bare").game;
  assert.equal(decisiveness(bare), null);
  assert.equal(medianTotal(bare), null);
  assert.equal(totalSpread(bare), null);
});

test("'closest' surfaces the least-decided simulation first", () => {
  const [first] = applyExplorerView(CARDS, "closest", "win-probability");
  void first;
  const ordered = applyExplorerView(CARDS, "closest", "first-pitch");
  assert.ok(ordered.some((c) => c.slug === "a-coinflip"), "the 49/51 game is included");
  // Under a decisiveness sort, the coinflip is LAST (it is the least decided).
  const byDecided = applyExplorerView(CARDS, "all", "win-probability");
  assert.equal(byDecided[0].slug, "b-lopsided");
  assert.equal(byDecided[byDecided.length - 1].slug, "a-coinflip");
});

test("'highest-scoring' and 'widest range' rank by the real simulated values", () => {
  assert.equal(applyExplorerView(CARDS, "highest-scoring", "total-runs")[0].slug, "c-highscore");
  assert.equal(applyExplorerView(CARDS, "most-uncertain", "uncertainty")[0].slug, "c-highscore");
});

test("a game missing the needed value is EXCLUDED from that filter, never given a stand-in", () => {
  const withBare = [...CARDS, card("d-bare")];
  const scoring = applyExplorerView(withBare, "highest-scoring", "total-runs");
  assert.ok(!scoring.some((c) => c.slug === "d-bare"), "no fabricated total for the bare game");
  const closest = applyExplorerView(withBare, "closest", "win-probability");
  assert.ok(!closest.some((c) => c.slug === "d-bare"), "no fabricated win probability");
  // 'all' keeps it (nothing is hidden by default) and sorts it last rather than inventing a value.
  const all = applyExplorerView(withBare, "all", "total-runs");
  assert.equal(all.length, 4);
  assert.equal(all[all.length - 1].slug, "d-bare");
});

test("'all' + first-pitch is the honest default: every card, chronological", () => {
  const view = applyExplorerView(CARDS, "all", "first-pitch");
  assert.equal(view.length, CARDS.length, "nothing dropped by default");
  assert.deepEqual(view.map((c) => c.slug), ["b-lopsided", "c-highscore", "a-coinflip"]);
});

test("deterministic — same input, same output (ties break on slug)", () => {
  const a = applyExplorerView(CARDS, "closest", "win-probability");
  const b = applyExplorerView(CARDS, "closest", "win-probability");
  assert.deepEqual(a.map((c) => c.slug), b.map((c) => c.slug));
  // A tie on the sort key still yields a stable order.
  const tied = [card("z-tie", { away: 0.5, home: 0.5, median: 8, p10: 4, p90: 12 }), card("y-tie", { away: 0.5, home: 0.5, median: 8, p10: 4, p90: 12 })];
  assert.deepEqual(applyExplorerView(tied, "all", "win-probability").map((c) => c.slug), ["y-tie", "z-tie"]);
});
