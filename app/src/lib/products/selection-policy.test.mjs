/**
 * SELECTION-POLICY guards (P211 · Release B).
 *
 * 1. DRIFT: every frozen bar equals the live executor's constant — an edit to either side without
 *    a new policy version fails the build. The freeze is mechanical, not aspirational.
 * 2. SCHEMA: the candidate lanes the executor emits carry the canonical shape the receipts and
 *    activation authority rely on, and arrive as CANDIDATES (never pre-activated).
 * 3. NO_PLAY REACHABLE: an empty or thin pool yields short lanes — never a forced card, never a
 *    lowered bar. The refusal path is load-bearing and must stay reachable.
 * 4. The challenger slot is honest: absent with its reason, or a real pre-frozen policy.
 *
 * Run: npx tsx --test src/lib/products/selection-policy.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SELECTION_POLICIES, CURRENT_POLICY, CHALLENGER_POLICY } from "./selection-policy.mjs";
import {
  buildDailyLaneCandidates,
  BANK_BUILDER_MAX_ODDS,
  POOL_ODDS_MAX,
  MOONSHOT_TARGET_LEGS,
  MOONSHOT_MIN_LEGS,
  MOONSHOT_MIN_COMBINED_ODDS,
} from "../world-cup/model-qualified-picks.ts";
import { ACTIVATION_CUTOFF_MIN, MOONSHOT_MAX_EXPOSURE } from "../daily-portfolio/accounting.ts";

const bb = SELECTION_POLICIES[CURRENT_POLICY["bank-builder"]];
const ms = SELECTION_POLICIES[CURRENT_POLICY["moonshot"]];

test("DRIFT: every frozen bar equals the live executor constant", () => {
  assert.equal(bb.bars.maxLegOdds, BANK_BUILDER_MAX_ODDS);
  assert.equal(bb.bars.poolOddsMax, POOL_ODDS_MAX);
  assert.equal(bb.bars.activationCutoffMinutes, ACTIVATION_CUTOFF_MIN);
  assert.equal(ms.bars.targetLegs, MOONSHOT_TARGET_LEGS);
  assert.equal(ms.bars.minLegs, MOONSHOT_MIN_LEGS);
  assert.equal(ms.bars.minCombinedOdds, MOONSHOT_MIN_COMBINED_ODDS);
  assert.equal(ms.bars.maxExposure, MOONSHOT_MAX_EXPOSURE);
  assert.equal(ms.bars.activationCutoffMinutes, ACTIVATION_CUTOFF_MIN);
});

test("the registry is frozen data: versioned, dated, deep-frozen, and the current pointers resolve", () => {
  for (const [key, p] of Object.entries(SELECTION_POLICIES)) {
    assert.equal(key, `${p.product}@${p.version}`, "key = product@version");
    assert.match(p.frozenAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Object.isFrozen(p) && Object.isFrozen(p.bars), `${key} deep-frozen`);
  }
  for (const [product, key] of Object.entries(CURRENT_POLICY)) {
    assert.equal(SELECTION_POLICIES[key]?.product, product, `${product} pointer resolves`);
  }
});

const pick = (id, over = {}) => ({
  id, sport: "MLB", gameId: `g-${id}`, matchup: "A @ B", kickoffUtc: "2026-08-26T23:00:00Z", kickoffEt: "7:00 PM",
  category: "team", marketKey: "moneyline_90", marketLabel: "Match Result", selection: "A", player: null, team: "A",
  odds: -120, provider: "test", modelProbability: 0.6, edge: 2, volatility: "low", risk: "Lower-volatility",
  dataQuality: "ok", hitRateScore: 0.6, upsideScore: 0.2, ...over,
});

test("SCHEMA: candidate lanes carry the canonical shape and arrive as candidates, never active", () => {
  const pool = [pick("p1"), pick("p2"), pick("p3"), pick("p4"), pick("p5", { odds: 250 })];
  const lanes = buildDailyLaneCandidates(pool, "2026-08-26");
  for (const lane of [lanes.bankBuilderA, lanes.bankBuilderB, lanes.moonshotA, lanes.moonshotB]) {
    for (const k of ["id", "product", "lane", "status", "legCount", "targetLegs", "stake", "combinedOdds", "combinedDecimal", "potentialReturn", "legs"]) {
      assert.ok(k in lane, `${lane.product} ${lane.lane} carries ${k}`);
    }
    assert.equal(lane.status, "candidate", "the builder NEVER activates");
  }
  assert.equal(lanes.bankBuilderA.stake, bb.bars.seedStake);
  assert.equal(lanes.moonshotA.stake, ms.bars.stake);
  assert.equal(lanes.bankBuilderA.targetLegs, bb.bars.legsPerLane);
});

test("NO_PLAY REACHABLE: an empty pool yields zero-leg lanes — no invented card, no lowered bar", () => {
  const lanes = buildDailyLaneCandidates([], "2026-08-26");
  for (const lane of [lanes.bankBuilderA, lanes.bankBuilderB, lanes.moonshotA, lanes.moonshotB]) {
    assert.equal(lane.legCount, 0, `${lane.product} ${lane.lane} refuses to invent legs`);
    assert.equal(lane.legs.length, 0);
  }
});

test("NO_PLAY REACHABLE: a pool of only longshots leaves Bank Builder empty (the ≤+400 bar holds)", () => {
  const pool = [pick("l1", { odds: 900 }), pick("l2", { odds: 1200 })];
  const lanes = buildDailyLaneCandidates(pool, "2026-08-26");
  assert.equal(lanes.bankBuilderA.legCount, 0, "no leg over +400 sneaks into Bank Builder");
});

test("the one-leg-per-game bar holds inside a lane", () => {
  const sameGame = [pick("s1", { gameId: "g-same" }), pick("s2", { gameId: "g-same" }), pick("s3", { gameId: "g-other" })];
  const lanes = buildDailyLaneCandidates(sameGame, "2026-08-26");
  const games = lanes.bankBuilderA.legs.map((l) => l.gameId);
  assert.equal(new Set(games).size, games.length, "no duplicate game within a Bank Builder lane");
});

test("CHALLENGER slot is honest: null with a stated reason, or a resolvable pre-frozen policy", () => {
  for (const product of ["bank-builder", "moonshot"]) {
    const c = CHALLENGER_POLICY[product];
    if (c === null) {
      assert.match(CHALLENGER_POLICY.note, /pre-frozen bars/, "the absence carries its reason");
    } else {
      assert.ok(SELECTION_POLICIES[c], `challenger ${c} must be a registered frozen policy`);
      assert.notEqual(c, CURRENT_POLICY[product], "a challenger is not the champion");
    }
  }
});
