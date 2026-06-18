import { test } from "node:test";
import assert from "node:assert/strict";
import { worldCupPlayerModelPicks, isLimitedDataProps, isModelPickEligible } from "./player-model-picks.ts";

const mk = (over) => ({
  id: over.id ?? `${over.name}-${over.market}-${over.pick}`,
  sport: "world_cup", sportLabel: "World Cup", date: "2026-06-18", gameLabel: "Mexico vs South Korea",
  market: over.market, marketLabel: over.marketLabel ?? over.market, participantType: "player",
  player: { name: over.name, team: over.team ?? "Mexico", photo: over.photo ?? null },
  pickLabel: over.pick ?? "Yes", line: over.line ?? null, americanOdds: over.odds ?? -110,
  modelProbability: over.model ?? null, marketProbability: over.market_p ?? 0.5, edgePct: over.edge ?? 0,
  confidence: over.conf ?? "Medium", public: true, parlayEligible: false, bankBuilderEligible: false, status: "active",
});

test("model picks are ranked by likelihood when edge is 0 (limited-data WC props)", () => {
  const props = [
    mk({ name: "Striker A", market: "player_goal_scorer_anytime", market_p: 0.42, odds: 135 }),
    mk({ name: "Striker B", market: "player_goal_scorer_anytime", market_p: 0.55, odds: -120 }),
    mk({ name: "Mid C", market: "player_shots_on_target", market_p: 0.61, odds: -150, line: 0.5 }),
  ];
  const picks = worldCupPlayerModelPicks(props, 8);
  assert.equal(picks[0].player.name, "Mid C", "highest market-implied likelihood first");
  assert.equal(picks[1].player.name, "Striker B");
  assert.equal(picks[2].player.name, "Striker A");
});

test("edge dominates likelihood when a real model edge is present", () => {
  const props = [
    mk({ name: "Edgey", market: "player_shots_on_target", market_p: 0.40, edge: 9.5, odds: 120 }),
    mk({ name: "Likely", market: "player_goal_scorer_anytime", market_p: 0.70, edge: 0, odds: -200 }),
  ];
  const picks = worldCupPlayerModelPicks(props);
  assert.equal(picks[0].player.name, "Edgey", "positive edge outranks a more-likely-but-no-edge pick");
});

test("one side per player+market — the higher-probability side wins (no both-sides inventory)", () => {
  const props = [
    mk({ id: "x-over", name: "X", market: "player_shots_on_target", pick: "Over", market_p: 0.45, odds: 110, line: 0.5 }),
    mk({ id: "x-under", name: "X", market: "player_shots_on_target", pick: "Under", market_p: 0.55, odds: -130, line: 0.5 }),
  ];
  const picks = worldCupPlayerModelPicks(props);
  assert.equal(picks.length, 1, "deduped to one side");
  assert.equal(picks[0].pickLabel, "Under", "keeps the higher-probability side");
});

test("raw inventory does not appear as default top picks — limit + eligibility hold", () => {
  const props = Array.from({ length: 40 }, (_, i) =>
    mk({ name: `P${i}`, market: "player_goal_scorer_anytime", market_p: 0.3 + (i % 10) * 0.02 }));
  // a non-player (team) row and a no-odds row must be excluded
  props.push({ ...mk({ name: "TeamRow" }), participantType: "team" });
  props.push({ ...mk({ name: "NoOdds", market: "player_assists" }), americanOdds: null });
  const picks = worldCupPlayerModelPicks(props, 8);
  assert.equal(picks.length, 8, "capped at the limit (not the whole inventory)");
  assert.ok(picks.every(isModelPickEligible), "only odds-backed player props");
  assert.ok(!picks.some((p) => p.player?.name === "NoOdds"), "no-odds prop excluded");
});

test("limited-data detection: WC props with edge 0 are flagged limited-data", () => {
  assert.equal(isLimitedDataProps([mk({ name: "A", market: "player_goal_scorer_anytime", edge: 0 })]), true);
  assert.equal(isLimitedDataProps([mk({ name: "B", market: "player_shots_on_target", edge: 7.2 })]), false);
});
