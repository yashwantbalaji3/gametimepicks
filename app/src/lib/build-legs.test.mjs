import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWcLegs, buildOptimizerLegs } from "./build-legs.ts";

test("buildWcLegs only includes parlay-eligible legs, regulation-only", () => {
  const proj = { matches: [
    { id: "e1", date: "2026-06-11", matchId: 1, homeTeam: "A", awayTeam: "B", market: "double_chance",
      pickLabel: "A or Draw", americanOdds: 190, public: true, parlayEligible: true, riskTier: "Medium", projectionStatus: "parlay_eligible", confidence: "Low" },
    { id: "v1", date: "2026-06-11", matchId: 1, homeTeam: "A", awayTeam: "B", market: "moneyline_90",
      pickLabel: "Draw", americanOdds: 300, public: true, parlayEligible: false, riskTier: "Low", projectionStatus: "public_projection_no_edge", confidence: "Low" },
  ] };
  const legs = buildWcLegs(proj, null);
  assert.equal(legs.length, 1);            // only the eligible one
  assert.equal(legs[0].sport, "world_cup");
  assert.equal(legs[0].regulationOnly, true);
});

test("buildWcLegs player props carry photo + pre-lineup flag", () => {
  const players = { date: "2026-06-11", matches: [
    { id: "pl1", matchId: 1, market: "player_shots", line: 2, pick: "over", americanOdds: 125, public: true,
      parlayEligible: true, riskTier: "Medium", projectionStatus: "parlay_eligible", lineupStatus: "pre_lineup_likely",
      player: { id: 7, name: "Son", team: "South Korea", position: "Attacker", photo: "x" } },
  ] };
  const legs = buildWcLegs(null, players);
  assert.equal(legs.length, 1);
  assert.equal(legs[0].prelineup, true);
  assert.equal(legs[0].photo, "x");
  assert.equal(legs[0].bankBuilderEligible, false); // player props never Bank Builder
});

test("buildOptimizerLegs dedupes + tiers by odds", () => {
  const slips = [
    { legs: [{ sport: "mlb", gameId: "g1", playerName: "Seager", marketLabel: "Hits", side: "Under", line: 1.5, oddsForSide: -238 }] },
    { legs: [{ sport: "mlb", gameId: "g1", playerName: "Seager", marketLabel: "Hits", side: "Under", line: 1.5, oddsForSide: -238 },
             { sport: "mlb", gameId: "g2", playerName: "Bregman", marketLabel: "TB", side: "Over", line: 1.5, oddsForSide: 200 }] },
  ];
  const legs = buildOptimizerLegs(slips);
  assert.equal(legs.length, 2);            // Seager deduped
  assert.equal(legs.find((l) => l.label.includes("Seager")).riskTier, "Low"); // -238 → Low
  assert.equal(legs.find((l) => l.label.includes("Bregman")).riskTier, "High"); // +200 → High
});

test("buildOptimizerLegs drops legs without odds + non-nba/mlb", () => {
  assert.equal(buildOptimizerLegs([{ legs: [{ sport: "mlb", playerName: "X", oddsForSide: null }] }]).length, 0);
  assert.equal(buildOptimizerLegs([{ legs: [{ sport: "ufc", playerName: "Y", oddsForSide: -110 }] }]).length, 0);
});
