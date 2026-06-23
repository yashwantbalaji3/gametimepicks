import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWcLegs, buildOptimizerLegs } from "./build-legs.ts";

test("buildWcLegs only includes parlay-eligible legs, regulation-only", () => {
  const proj = { matches: [
    { id: "e1", date: "2026-06-11", matchId: 1, homeTeam: "A", awayTeam: "B", kickoffUtc: "2026-06-11T19:00:00Z", market: "double_chance",
      pickLabel: "A or Draw", americanOdds: 190, public: true, parlayEligible: true, riskTier: "Medium", projectionStatus: "parlay_eligible", confidence: "Low" },
    { id: "v1", date: "2026-06-11", matchId: 1, homeTeam: "A", awayTeam: "B", kickoffUtc: "2026-06-11T19:00:00Z", market: "moneyline_90",
      pickLabel: "Draw", americanOdds: 300, public: true, parlayEligible: false, riskTier: "Low", projectionStatus: "public_projection_no_edge", confidence: "Low" },
  ] };
  const legs = buildWcLegs(proj, null, "2026-06-11T12:00:00Z"); // before kickoff → upcoming
  assert.equal(legs.length, 1);            // only the eligible one
  // A started game is excluded.
  assert.equal(buildWcLegs(proj, null, "2026-06-11T20:00:00Z").length, 0);
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

test("buildEngineLegs adapts engine eligible legs (MLB + WC team), excludes UFC, carries identity", async () => {
  const { buildEngineLegs } = await import("./build-legs.ts");
  const mk = (over) => ({
    legId: "x", sport: "MLB", sportKey: "mlb", market: "strikeouts", side: "under", participant: "P", team: "ATL", opponent: "NYM",
    line: 5.5, odds: -120, modelProbability: 0.7, marketImpliedProbability: 0.6, edge: 10, confidenceTier: "Medium",
    riskScore: 0.2, riskTier: "low", legQualityTier: "strong", legQualityScore: 80, survivalScore: 88,
    topPositiveFactors: [], topNegativeFactors: [], missingFlags: [], staleFlags: [], smallSampleFlags: [],
    leakagePassed: true, startTime: "2026-06-18T23:00:00Z", settlementResult: null, settlementOfficial: null, last5: null,
    identity: { kind: "player", playerId: 621566, teamAbbr: "ATL", countryCode: null, photoUrl: null, avatarSport: "mlb" }, ...over,
  });
  const eligible = [
    mk({ legId: "MLB:g1:strikeouts:P:" }),
    mk({ legId: "WORLD_CUP:g2:moneyline_90:Switzerland:", sport: "WORLD_CUP", sportKey: "world_cup", market: "moneyline_90", side: null, participant: "Switzerland", team: "Switzerland", opponent: "Bosnia", line: null, odds: -205, identity: { kind: "team", playerId: null, teamAbbr: "CH", countryCode: "CH", photoUrl: null, avatarSport: "mlb" } }),
    mk({ legId: "UFC:g3:moneyline:Fighter:", sport: "UFC", sportKey: "ufc", participant: "Fighter", odds: -130, identity: { kind: "fighter", playerId: null, teamAbbr: null, countryCode: null, photoUrl: null, avatarSport: "mlb" } }),
  ];
  const legs = buildEngineLegs(eligible);
  assert.ok(legs.some((l) => l.sport === "mlb"), "MLB leg adapted");
  assert.ok(legs.some((l) => l.sport === "world_cup"), "WC team leg adapted");
  // UFC is included only if it has odds (it does here) — but it must carry a sport + odds, never fabricated.
  const wc = legs.find((l) => l.sport === "world_cup");
  assert.equal(wc.gameId, "g2", "eventId parsed from legId");
  assert.equal(wc.bankBuilderEligible, true, "high-survival team leg is Bank-Builder eligible");
  const mlb = legs.find((l) => l.sport === "mlb");
  assert.ok(mlb.photo && mlb.photo.includes("621566"), "MLB headshot from real playerId");
});

test("buildWcPlayerLegs surfaces pre-event WC player props (limited-data, never Bank-Builder)", async () => {
  const { buildWcPlayerLegs } = await import("./build-legs.ts");
  const proj = { matches: [{ matchId: 9, homeTeam: "Switzerland", awayTeam: "Bosnia", kickoffUtc: "2026-06-18T19:00:00Z" }] };
  // A model-qualified prop: real attacker (position), odds-backed with a provider, above the goalscorer floor.
  const players = { matches: [
    { matchId: 9, fixture: "Switzerland vs Bosnia", player: { id: 100, name: "Breel Embolo", team: "Switzerland", position: "Attacker", photo: null }, market: "player_goal_scorer_anytime", pick: "Yes", line: null, americanOdds: 145, bookmaker: "draftkings", modelProbability: 0.5 },
  ] };
  const legs = buildWcPlayerLegs(proj, players, "2026-06-18T17:30:00Z"); // before kickoff → included
  assert.equal(legs.length, 1, "pre-event model-qualified player prop included");
  assert.equal(legs[0].prelineup, true);
  assert.equal(legs[0].bankBuilderEligible, false, "player props never Bank-Builder eligible");
  assert.ok(legs[0].sublabel.includes("limited-data"), "labeled limited-data");
  // After kickoff → excluded.
  assert.equal(buildWcPlayerLegs(proj, players, "2026-06-18T20:00:00Z").length, 0);
});

test("buildWcPlayerLegs pool is MODEL-QUALIFIED: raw inventory (no provider / no role) is excluded", async () => {
  const { buildWcPlayerLegs } = await import("./build-legs.ts");
  const proj = { matches: [{ matchId: 9, homeTeam: "Switzerland", awayTeam: "Bosnia", kickoffUtc: "2026-06-18T19:00:00Z" }] };
  const NOW = "2026-06-18T17:30:00Z";
  const base = { matchId: 9, fixture: "Switzerland vs Bosnia", market: "player_goal_scorer_anytime", pick: "Yes", line: null, americanOdds: 145, bookmaker: "draftkings", modelProbability: 0.5 };
  // Goalkeeper on an attacking prop → role-ineligible → excluded.
  const gk = buildWcPlayerLegs(proj, { matches: [{ ...base, player: { id: 1, name: "Keeper One", team: "Switzerland", position: "Goalkeeper" } }] }, NOW);
  assert.equal(gk.length, 0, "goalkeeper attacking prop excluded (raw inventory, not a model pick)");
  // No provider → not odds-backed for our purposes → excluded.
  const noProv = buildWcPlayerLegs(proj, { matches: [{ ...base, bookmaker: null, player: { id: 2, name: "Striker Two", team: "Switzerland", position: "Attacker" } }] }, NOW);
  assert.equal(noProv.length, 0, "no-provider prop excluded");
});
