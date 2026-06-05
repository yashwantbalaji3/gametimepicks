/**
 * Tests for the public-suggestion volume-discipline policy
 * (`parlay-volume-discipline.ts`).
 *
 * Behavioural tests pin EXPLICIT caps so they lock the capping LOGIC
 * (per-section, total, player/market/game exposure, no padding, order
 * preservation) independent of the editorial default numbers. Separate tests
 * document the current default + Mixed cap values. Nothing here is a
 * performance claim.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyVolumeDiscipline,
  PUBLIC_VOLUME_CAPS,
  MIXED_VOLUME_CAPS,
  capsForSuggestedView,
} from "./parlay-volume-discipline.ts";

// Explicit fixture caps so behaviour tests don't depend on editorial defaults.
const FIXED_CAPS = {
  perSection: { low: 3, medium: 3, high: 2, longshot: 1 },
  totalMax: 9,
  maxPlayerExposure: 2,
  maxMarketExposure: 4,
  maxGameExposure: 3,
};

// distinct slip with N legs, each a different player/market/game by default
let _id = 0;
const slip = (legs) => ({ slipId: `s${_id++}`, legs });
const leg = (o) => ({ playerId: ++_id, playerName: `P${_id}`, market: `m${_id}`, gameId: `g${_id}`, ...o });
const distinctSlip = () => slip([leg({}), leg({})]);
const fill = (n) => Array.from({ length: n }, distinctSlip);

test("per-section caps applied (fixed caps low 3, medium 3, high 2, longshot 1)", () => {
  const r = applyVolumeDiscipline({ low: fill(10), medium: fill(10), high: fill(10), longshot: fill(10) }, FIXED_CAPS);
  assert.equal(r.sections.low.length, 3);
  assert.equal(r.sections.medium.length, 3);
  assert.equal(r.sections.high.length, 2);
  assert.equal(r.sections.longshot.length, 1);
  assert.equal(r.keptTotal, 9);
});

test("total cap is respected even if per-section would allow more", () => {
  const caps = { ...FIXED_CAPS, totalMax: 4 };
  const r = applyVolumeDiscipline({ low: fill(10), medium: fill(10), high: fill(10), longshot: fill(10) }, caps);
  assert.equal(r.keptTotal, 4);
  // fills Low first (3), then 1 from Medium
  assert.equal(r.sections.low.length, 3);
  assert.equal(r.sections.medium.length, 1);
});

test("no padding: empty input → empty output, never invented", () => {
  const r = applyVolumeDiscipline({});
  assert.equal(r.keptTotal, 0);
  assert.deepEqual([r.sections.low, r.sections.medium, r.sections.high, r.sections.longshot], [[], [], [], []]);
});

test("a section can be empty (fewer cards, not padded)", () => {
  const r = applyVolumeDiscipline({ low: fill(2), medium: [], high: [], longshot: [] }, FIXED_CAPS);
  assert.equal(r.sections.low.length, 2);
  assert.equal(r.sections.medium.length, 0);
});

test("repeated-PLAYER exposure cap skips appearances beyond the cap", () => {
  const dupe = () => slip([leg({ playerId: 99, playerName: "Star" }), leg({})]);
  // 4 low slips all featuring player 99; only maxPlayerExposure (2) may publish
  const r = applyVolumeDiscipline({ low: [dupe(), dupe(), dupe(), dupe()], medium: [], high: [], longshot: [] }, FIXED_CAPS);
  const starCount = r.sections.low.filter((s) => s.legs.some((l) => l.playerId === 99)).length;
  assert.equal(starCount, 2, "player 99 capped at maxPlayerExposure published slips");
});

test("repeated-MARKET exposure cap", () => {
  const sameMkt = () => slip([leg({ market: "batter_hits" }), leg({ market: "batter_hits" })]);
  const caps = { ...FIXED_CAPS, perSection: { low: 9, medium: 0, high: 0, longshot: 0 }, totalMax: 9 };
  const r = applyVolumeDiscipline({ low: [sameMkt(), sameMkt(), sameMkt(), sameMkt(), sameMkt()] }, caps);
  // batter_hits may appear in at most maxMarketExposure (4) published slips
  assert.ok(r.sections.low.length <= 4, `kept ${r.sections.low.length} should be <=4`);
});

test("same-GAME exposure cap", () => {
  const sameGame = () => slip([leg({ gameId: "GAME1" }), leg({ gameId: "GAME1" })]);
  const caps = { ...FIXED_CAPS, perSection: { low: 9, medium: 0, high: 0, longshot: 0 }, totalMax: 9 };
  const r = applyVolumeDiscipline({ low: [sameGame(), sameGame(), sameGame(), sameGame(), sameGame()] }, caps);
  assert.ok(r.sections.low.length <= 3, `kept ${r.sections.low.length} should be <=3 (maxGameExposure)`);
});

test("preserves within-section order (keeps the first N)", () => {
  const a = slip([leg({})]); const b = slip([leg({})]); const c = slip([leg({})]); const d = slip([leg({})]);
  // fixed cap low=3 → keeps first three in order
  const r = applyVolumeDiscipline({ low: [a, b, c, d], medium: [], high: [], longshot: [] }, FIXED_CAPS);
  assert.deepEqual(r.sections.low.map((s) => s.slipId), [a.slipId, b.slipId, c.slipId]);
});

test("deterministic: same input + caps → identical output", () => {
  const input = { low: fill(5), medium: fill(5), high: fill(5), longshot: fill(5) };
  const r1 = applyVolumeDiscipline(input, FIXED_CAPS);
  const r2 = applyVolumeDiscipline(input, FIXED_CAPS);
  assert.deepEqual(
    Object.fromEntries(Object.entries(r1.sections).map(([k, v]) => [k, v.map((s) => s.slipId)])),
    Object.fromEntries(Object.entries(r2.sections).map(([k, v]) => [k, v.map((s) => s.slipId)])),
  );
});

// --- current editorial cap values (depth fix 2026-06-05) -------------------
test("default PUBLIC caps: per-section sum == totalMax (15) — deeper publishing", () => {
  const c = PUBLIC_VOLUME_CAPS;
  assert.equal(c.perSection.low + c.perSection.medium + c.perSection.high + c.perSection.longshot, c.totalMax);
  assert.equal(c.totalMax, 15);
});

test("MIXED caps relax game exposure (cross-sport slips share a thin slate's games)", () => {
  assert.ok(MIXED_VOLUME_CAPS.maxGameExposure >= MIXED_VOLUME_CAPS.totalMax, "mixed game-exposure does not bottleneck");
  // diversity still enforced by the per-player cap
  assert.ok(MIXED_VOLUME_CAPS.maxPlayerExposure <= 3);
});

test("capsForSuggestedView routes multi→MIXED, others→PUBLIC", () => {
  assert.equal(capsForSuggestedView("multi"), MIXED_VOLUME_CAPS);
  assert.equal(capsForSuggestedView("mlb"), PUBLIC_VOLUME_CAPS);
  assert.equal(capsForSuggestedView("nba"), PUBLIC_VOLUME_CAPS);
  assert.equal(capsForSuggestedView("all"), PUBLIC_VOLUME_CAPS);
  assert.equal(capsForSuggestedView(undefined), PUBLIC_VOLUME_CAPS);
});
