import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeWcCards, normalizeWcProjections, normalizeWcPlayerProps, normalizeOptimizerSlips, normalizeUfcCards, normalizeMlbLeans, normalizeNbaLeans, normalizeUfcProjections } from "./normalize.ts";

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

test("normalizeMlbLeans maps the picked side (Under) + flags as projection view", () => {
  const out = normalizeMlbLeans({ date: "2026-06-11", leans: [
    { id: "L1", playerName: "Merrill Kelly", playerRole: "pitcher", playerTeamAbbr: "AZ",
      awayTeamAbbr: "AZ", homeTeamAbbr: "MIA", marketKey: "pitcher_strikeouts", marketLabel: "Strikeouts",
      line: 4.5, lean: "Under", confidence: "High", edgePct: 13.4, edgePctOver: -19.48, edgePctUnder: 13.4,
      modelProbOver: 0.266, modelProbUnder: 0.734, impliedOver: 0.4608, impliedUnder: 0.6,
      oddsOver: 117, oddsUnder: -150, gamePk: 823855 },
  ] });
  assert.equal(out.length, 1);
  assert.equal(out[0].sport, "mlb");
  assert.equal(out[0].participantType, "player");
  assert.equal(out[0].pickLabel, "Under 4.5");
  assert.equal(out[0].americanOdds, -150);          // Under side
  assert.equal(out[0].modelProbability, 0.734);     // Under side
  assert.equal(out[0].marketProbability, 0.6);      // Under side
  assert.equal(out[0].parlayEligible, false);       // projection view, not a card leg
  assert.equal(out[0].player.position, "pitcher");
});

test("normalizeMlbLeans handles empty + Over side", () => {
  assert.equal(normalizeMlbLeans(null).length, 0);
  const out = normalizeMlbLeans({ leans: [{ playerName: "X", lean: "Over", line: 1.5, oddsOver: 120, oddsUnder: -140, modelProbOver: 0.55, impliedOver: 0.45, marketLabel: "Hits" }] });
  assert.equal(out[0].americanOdds, 120);
  assert.equal(out[0].modelProbability, 0.55);
});

test("normalizeNbaLeans maps the leaned side + single model/implied prob, skips No Play", () => {
  const out = normalizeNbaLeans({ date: "2026-06-10", leans: [
    { id: "N1", playerName: "Dylan Harper", market: "AST", line: 3.5, lean: "Under", confidence: "Low",
      edgePct: 2.13, modelProbability: 0.4464, impliedProbability: 0.425, oddsOver: 122, oddsUnder: -156, team: "SA", opponent: "NY" },
    { id: "N2", playerName: "X", market: "PTS", line: 20.5, lean: "No Play", confidence: "insufficient_data", oddsOver: 100, oddsUnder: -120 },
  ] });
  assert.equal(out.length, 1);                       // No Play skipped
  assert.equal(out[0].sport, "nba");
  assert.equal(out[0].marketLabel, "Assists");
  assert.equal(out[0].pickLabel, "Under 3.5");
  assert.equal(out[0].americanOdds, -156);           // Under side
  assert.equal(out[0].modelProbability, 0.4464);
  assert.equal(out[0].marketProbability, 0.425);
  assert.equal(out[0].parlayEligible, false);
  assert.equal(out[0].gameLabel, "SA vs NY");
});

test("normalizeNbaLeans handles empty + Over side + market label fallback", () => {
  assert.equal(normalizeNbaLeans(null).length, 0);
  const out = normalizeNbaLeans({ leans: [{ playerName: "Y", market: "PRA", lean: "Over", line: 30.5, oddsOver: 110, modelProbability: 0.56, impliedProbability: 0.47, edgePct: 9 }] });
  assert.equal(out[0].marketLabel, "Pts+Reb+Ast");
  assert.equal(out[0].americanOdds, 110);
});

test("normalizeUfcProjections maps real moneyline odds + model/market/edge", () => {
  const out = normalizeUfcProjections({ eventName: "UFC Freedom 250", projections: [
    { fighter: "Ilia Topuria", opponent: "Justin Gaethje", oddsPrice: -160, marketImpliedProbability: 0.615, modelProbability: 0.68, label: "Topuria -160" },
  ] });
  assert.equal(out.length, 1);
  assert.equal(out[0].sport, "ufc");
  assert.equal(out[0].participantType, "fighter");
  assert.equal(out[0].marketLabel, "Moneyline");
  assert.equal(out[0].americanOdds, -160);
  assert.equal(out[0].modelProbability, 0.68);
  assert.equal(out[0].marketProbability, 0.615);
  assert.equal(out[0].edgePct, 6.5);             // (0.68 - 0.615) * 100
  assert.equal(out[0].parlayEligible, false);
  assert.equal(out[0].gameLabel, "Ilia Topuria vs Justin Gaethje");
});

test("normalizeUfcProjections handles empty/null", () => {
  assert.equal(normalizeUfcProjections(null).length, 0);
  assert.equal(normalizeUfcProjections({ projections: [] }).length, 0);
});
