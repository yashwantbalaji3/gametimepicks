import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeWcCards, normalizeWcProjections, normalizeWcPlayerProps, normalizeOptimizerSlips, normalizeUfcCards } from "./normalize.ts";

test("normalizeWcCards maps to the public card contract", () => {
  const out = normalizeWcCards({ date: "2026-06-11", cardCount: 1, byRisk: {}, cards: [
    { id: "c1", riskTier: "Low", title: "T", legs: [{ pick: "Over 2.5", match: "A vs B", americanOdds: 125 }],
      combinedAmericanOdds: 125, defaultStake: 25, whyThisCard: ["w"], dataCaveats: ["x"] },
  ] });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].sports, ["world_cup"]);
  assert.equal(out[0].cardType, "single_sport");
  assert.equal(out[0].legs[0].label, "Over 2.5");
  assert.equal(out[0].combinedAmericanOdds, 125);
  assert.equal(out[0].isPublic, true);
});

test("normalizeWcProjections carries public + eligibility flags", () => {
  const out = normalizeWcProjections({ matches: [
    { id: "p1", date: "2026-06-11", matchId: 1, homeTeam: "A", awayTeam: "B", market: "double_chance",
      pickLabel: "A or Draw", americanOdds: 190, modelProbability: 0.33, marketProbability: 0.30, edgePct: 3,
      confidence: "Low", riskTier: "Medium", public: true, parlayEligible: true, projectionStatus: "parlay_eligible" },
  ] });
  assert.equal(out[0].marketLabel, "Double chance");
  assert.equal(out[0].parlayEligible, true);
  assert.equal(out[0].participantType, "team");
});

test("normalizeWcPlayerProps preserves player + lineup status", () => {
  const out = normalizeWcPlayerProps({ matches: [
    { id: "pl1", date: "2026-06-11", matchId: 1, market: "player_shots", line: 2, pick: "over", americanOdds: 125,
      modelProbability: 0.5, marketProbability: 0.48, edgePct: 2, parlayEligible: false, public: true,
      projectionStatus: "pre_lineup_public_projection", riskTier: "Medium", lineupStatus: "pre_lineup_likely",
      player: { id: 7, name: "Son Heung-Min", team: "South Korea", position: "Attacker", photo: "x" } },
  ] });
  assert.equal(out[0].participantType, "player");
  assert.equal(out[0].player.name, "Son Heung-Min");
  assert.equal(out[0].lineupStatus, "pre_lineup_likely");
  assert.equal(out[0].marketLabel, "Shots");
});

test("normalizeOptimizerSlips computes combined odds + maps risk profile", () => {
  const out = normalizeOptimizerSlips([
    { slipId: "s1", riskProfile: "conservative", sport: "mlb",
      legs: [{ playerName: "A", marketLabel: "Hits", side: "Under", line: 1.5, oddsForSide: -120 },
             { playerName: "B", marketLabel: "Hits", side: "Over", line: 0.5, oddsForSide: 150 }] },
  ], { date: "2026-06-11" });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].sports, ["mlb"]);
  assert.equal(out[0].riskTier, "Low");
  assert.equal(out[0].legs.length, 2);
  assert.ok(out[0].combinedAmericanOdds !== 0);
});

test("normalizeOptimizerSlips drops legs without odds + skips empty cards", () => {
  const out = normalizeOptimizerSlips([
    { slipId: "s2", riskProfile: "balanced", sport: "nba", legs: [{ playerName: "X", oddsForSide: null }] },
  ], { date: "2026-06-11" });
  assert.equal(out.length, 0);
});

test("normalizeUfcCards is model-only (no odds) + needs publicReady", () => {
  const out = normalizeUfcCards({ publicReady: true, cards: [
    { riskLabel: "Conservative card", legs: [{ fighter: "Mauricio Ruffy", modelProbability: 0.84 }], modelCombinedProbability: 0.67 },
  ] }, "2026-06-11");
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].sports, ["ufc"]);
  assert.equal(out[0].combinedAmericanOdds, 0);
  assert.equal(out[0].legs[0].label, "Mauricio Ruffy");
  assert.equal(normalizeUfcCards({ publicReady: false, cards: [] }, "x").length, 0);
});
