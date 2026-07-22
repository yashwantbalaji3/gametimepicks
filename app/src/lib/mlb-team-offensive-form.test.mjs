/**
 * Guards for the pregame TEAM OFFENSIVE FORM capture (capture-mlb-pregame-team-offensive-form.mjs).
 * Pins the leakage-safe windowing: only team game-log games STRICTLY earlier than the slate are aggregated, and
 * derived rate proxies are computed from the aggregate. No modeling; internal research only.
 *
 * Run: npx tsx --test src/lib/mlb-team-offensive-form.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { windowOffense } from "../../scripts/capture-mlb-pregame-team-offensive-form.mjs";

const g = (date, stat) => ({ date, stat });
const splits = [
  g("2026-07-18", { runs: 5, hits: 10, doubles: 2, triples: 0, homeRuns: 2, strikeOuts: 8, baseOnBalls: 3, atBats: 34, plateAppearances: 38, totalBases: 18 }),
  g("2026-07-19", { runs: 1, hits: 4, doubles: 1, triples: 0, homeRuns: 0, strikeOuts: 11, baseOnBalls: 2, atBats: 32, plateAppearances: 35, totalBases: 5 }),
  g("2026-07-20", { runs: 8, hits: 12, doubles: 3, triples: 1, homeRuns: 1, strikeOuts: 6, baseOnBalls: 5, atBats: 36, plateAppearances: 42, totalBases: 20 }),
  // these MUST be excluded from a 2026-07-22 slate (leakage)
  g("2026-07-22", { runs: 99, hits: 99, doubles: 9, triples: 9, homeRuns: 9, strikeOuts: 0, baseOnBalls: 9, atBats: 40, plateAppearances: 50, totalBases: 99 }),
  g("2026-07-23", { runs: 99, hits: 99, doubles: 9, triples: 9, homeRuns: 9, strikeOuts: 0, baseOnBalls: 9, atBats: 40, plateAppearances: 50, totalBases: 99 }),
];

test("1 · leakage-safe: games on/after the slate date are NEVER aggregated", () => {
  const w = windowOffense(splits, "2026-07-22", 10);
  assert.equal(w.games, 3, "only the 3 strictly-earlier games count");
  assert.equal(w.lastDate, "2026-07-20");
  assert.ok(w.lastDate < "2026-07-22", "lastDate strictly before the slate");
  // the poisoned 99-stat games must not leak into any total
  assert.equal(w.runs, 14); assert.equal(w.hits, 26); assert.equal(w.hr, 3);
});

test("2 · window cap: last-k selects the most recent k strictly-earlier games", () => {
  const w = windowOffense(splits, "2026-07-22", 2);
  assert.equal(w.games, 2);
  assert.equal(w.firstDate, "2026-07-19");
  assert.equal(w.lastDate, "2026-07-20");
});

test("3 · derived rate proxies computed from the aggregate (not per-game averages)", () => {
  const w = windowOffense(splits, "2026-07-22", 10);
  const h = 26, bb = 10, ab = 102, tb = 43;
  assert.equal(w.tb, tb);
  assert.equal(w.slgProxy, +(tb / ab).toFixed(4));
  assert.equal(w.obpProxy, +((h + bb) / (ab + bb)).toFixed(4));
  assert.equal(w.opsProxy, +(w.obpProxy + w.slgProxy).toFixed(4));
});

test("4 · empty when no strictly-earlier games (never fabricates)", () => {
  const w = windowOffense([g("2026-07-22", { runs: 1 })], "2026-07-22", 10);
  assert.equal(w.games, 0);
  assert.equal(w.obpProxy, null);
  assert.equal(w.slgProxy, null);
});
