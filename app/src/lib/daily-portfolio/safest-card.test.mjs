/**
 * Phase-1 safest-card selector: risk-tier framework + PROBABILITY-FIT cross-sport selection. Synthetic
 * fixtures exercise the rules; live-data smoke tests confirm June 24 generates safe cards for both rungs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { classifyRiskTier, cardTier, tierLabel } from "./risk-tiers.ts";
import { selectSafestTargetFitCard } from "./bank-builder-generation.ts";
import { selectCrossLaneBankBuilder } from "./bank-builder-correlation-review.ts";
import { loadMlbModelPicks } from "./mlb-model-picks.ts";
import { loadWorldCupModelPicks } from "../world-cup/model-qualified-picks.ts";

const root = path.join(process.cwd(), "public", "data");

// ---------- RISK TIERS ----------
test("risk tiers: batter-hit / pitcher-K / double-chance / DNB are Tier 1 (safest)", () => {
  assert.equal(classifyRiskTier({ marketKey: "batter_hits", selection: "Over 0.5 Hits" }), 1);
  assert.equal(classifyRiskTier({ marketKey: "pitcher_strikeouts", selection: "Over 5.5 Strikeouts" }), 1);
  assert.equal(classifyRiskTier({ marketKey: "double_chance", selection: "Double Chance: 1X" }), 1);
  assert.equal(classifyRiskTier({ marketKey: "draw_no_bet", selection: "Draw No Bet: Home" }), 1);
});

test("risk tiers: BTTS / Under 3.5 / Over 1.5 are Tier 2", () => {
  assert.equal(classifyRiskTier({ marketKey: "btts", selection: "Both teams to score: No" }), 2);
  assert.equal(classifyRiskTier({ marketKey: "match_total_goals", selection: "Under 3.5" }), 2);
  assert.equal(classifyRiskTier({ marketKey: "match_total_goals", selection: "Over 1.5" }), 2);
  assert.equal(classifyRiskTier({ marketKey: "moneyline_90", selection: "Match Result" }), 2);
});

test("risk tiers: bare match totals (Over 2.5) + exotic are Tier 3", () => {
  assert.equal(classifyRiskTier({ marketKey: "match_total_goals", selection: "Over 2.5" }), 3);
  assert.equal(classifyRiskTier({ marketKey: "correct_score", selection: "2-1" }), 3);
  assert.equal(cardTier([{ marketKey: "batter_hits", selection: "Over 0.5 Hits" }, { marketKey: "match_total_goals", selection: "Over 2.5" }]), 3, "card tier = worst leg");
  assert.match(tierLabel(1), /safest/i);
});

// ---------- PROBABILITY-FIT SELECTOR ----------
const leg = (id, gameId, odds, prob, marketKey = "moneyline_90", selection = "Match Result", sport = "WORLD_CUP") =>
  ({ id, sport, gameId, matchup: `${gameId} game`, kickoffUtc: "2026-06-24T20:00:00Z", kickoffEt: "4 PM ET", category: marketKey.startsWith("batter") || marketKey.startsWith("pitcher") ? "player" : "team", marketKey, marketLabel: marketKey, selection, player: null, team: null, odds, provider: "test", modelProbability: prob, edge: 0, volatility: "low", risk: "Lower-volatility", dataQuality: "A", hitRateScore: Math.round(prob * 100), upsideScore: 0 });

const RUNG = (mult) => ({ lane: "A", nextStep: 5, clearedSteps: 4, rolledStake: 1000, targetReturn: Math.round(1000 * mult), targetMultiplier: mult });

test("selector maximizes COMBINED HIT PROBABILITY among target-reaching cards (not the longest odds)", () => {
  // Two ways to reach 2.0x: a SAFE pair (−110 × +110 ≈ 2.0, prob 0.65×0.50=0.325) vs a LONGSHOT pair
  // (+150 × +150 = 6.25x, prob 0.30×0.30=0.09). Probability-fit must pick the safe pair.
  const pool = [
    leg("safe1", "g1", -110, 0.65), leg("safe2", "g2", 110, 0.50),
    leg("long1", "g3", 150, 0.30), leg("long2", "g4", 150, 0.30),
  ];
  const card = selectSafestTargetFitCard(pool, RUNG(2.0), new Set());
  assert.ok(card.fitsTarget, "reaches the 2.0x target");
  assert.deepEqual(card.legs.map((l) => l.id).sort(), ["safe1", "safe2"], "picked the higher-probability pair, not the longshots");
  assert.ok(card.estimatedHitProbability > 0.3, "hit probability reflects the safe pair");
});

test("selector escalates to a 3-leg card only when no 2-leg combo reaches a high target", () => {
  // Three safe -150 favorites (prob 0.6 each); each pair = 1.67×1.67 = 2.78x < 4x, but the triple = 4.6x ≥ 4x.
  const pool = [leg("a", "g1", -150, 0.6), leg("b", "g2", -150, 0.6), leg("c", "g3", -150, 0.6)];
  const card = selectSafestTargetFitCard(pool, RUNG(4.0), new Set());
  assert.ok(card.fitsTarget, "reaches the 4.0x target");
  assert.equal(card.legs.length, 3, "escalated to a 3-leg safe card");
});

test("selector respects excludeGames (cross-lane independence)", () => {
  const pool = [leg("a", "g1", 100, 0.5), leg("b", "g2", 100, 0.5), leg("c", "g3", 100, 0.5)];
  const card = selectSafestTargetFitCard(pool, RUNG(4.0), new Set(), new Set(["g1"]));
  for (const l of card.legs) assert.notEqual(l.gameId, "g1", "no leg from an excluded game");
});

test("cross-sport selector: a lane can mix MLB + World Cup legs to reach the target", () => {
  const pool = [
    leg("mlb1", "m1", -200, 0.66, "batter_hits", "Over 0.5 Hits", "MLB"),
    leg("wc1", "w1", 120, 0.50, "double_chance", "Double Chance: 1X", "WORLD_CUP"),
  ];
  const card = selectSafestTargetFitCard(pool, RUNG(2.5), new Set());
  assert.equal(card.legs.length, 2);
  assert.equal(new Set(card.legs.map((l) => l.sport)).size, 2, "card mixes both sports");
  assert.equal(card.crossSport, true);
});

// ---------- LIVE June 24 generation (Step 5 + Step 3) ----------
test("LIVE: June 24 cross-sport pool generates safe target-fit cards for Lane A Step 5 and Lane B Step 3", () => {
  const now = "2026-06-24T08:00:00Z";
  const wc = loadWorldCupModelPicks(root, now, "2026-06-24");
  const mlb = loadMlbModelPicks(root, now, "2026-06-24");
  assert.ok(mlb.length > 0, "MLB model pool is non-empty (cross-sport unlock)");
  const rungA = { lane: "A", nextStep: 5, clearedSteps: 4, rolledStake: 3502.57, targetReturn: 10000, targetMultiplier: 10000 / 3502.57 };
  const rungB = { lane: "B", nextStep: 3, clearedSteps: 2, rolledStake: 702.45, targetReturn: 1400, targetMultiplier: 1400 / 702.45 };
  const { laneA, laneB } = selectCrossLaneBankBuilder([...wc, ...mlb], rungA, rungB);
  for (const [g, rung] of [[laneA, rungA], [laneB, rungB]]) {
    assert.equal(g.legs.length >= 2, true, `Lane ${rung.lane} has a full card`);
    assert.ok(g.fitsTarget, `Lane ${rung.lane} reaches the $${rung.targetReturn} target`);
    assert.ok(g.estimatedHitProbability > 0 && g.estimatedHitProbability <= 1, "valid hit probability");
    assert.ok([1, 2, 3].includes(g.marketTier), "carries a risk tier");
    for (const l of g.legs) assert.ok(l.provider && l.odds >= -500 && l.odds <= 400, "real odds in window");
  }
  // Independence.
  const aGames = new Set(laneA.legs.map((l) => l.gameId));
  for (const l of laneB.legs) assert.ok(!aGames.has(l.gameId), "lanes share no game");
});
