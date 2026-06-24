import { test } from "node:test";
import assert from "node:assert/strict";
import { getGameDetail } from "../game-detail.ts";
import { getGameSpecificCardsForGame } from "./game-specific-cards.ts";

test("engine game-specific cards map to the correct WC fixture (current slate), bucketed by risk", () => {
  // Current slate is June 24. Scotland vs Brazil is pre-event at 12:00Z (kickoff 22:00Z).
  const d = getGameDetail("world-cup", "scotland-vs-brazil-2026-06-24");
  assert.ok(d, "fixture resolves");
  const g = getGameSpecificCardsForGame({ matchId: d.matchId, homeTeam: d.homeTeam, awayTeam: d.awayTeam }, "2026-06-24T12:00:00Z");
  assert.ok(g.total > 0, "at least one engine card mapped to the fixture");
  // every mapped card is bucketed and carries legs.
  for (const c of g.cards) {
    assert.ok(["low", "medium", "high", "longshot"].includes(c.riskLevel), "card has a risk level");
    assert.ok(c.legs.length >= 2, "same-game card has >= 2 legs");
  }
});

test("cards never leak across fixtures (Scotland-Brazil cards != Switzerland-Canada cards)", () => {
  const sco = getGameDetail("world-cup", "scotland-vs-brazil-2026-06-24");
  const sui = getGameDetail("world-cup", "switzerland-vs-canada-2026-06-24");
  const scoCards = new Set(getGameSpecificCardsForGame({ matchId: sco.matchId, homeTeam: sco.homeTeam, awayTeam: sco.awayTeam }, "2026-06-24T12:00:00Z").cards.map((c) => c.parlayId));
  const suiCards = getGameSpecificCardsForGame({ matchId: sui.matchId, homeTeam: sui.homeTeam, awayTeam: sui.awayTeam }, "2026-06-24T12:00:00Z").cards.map((c) => c.parlayId);
  // Both fixtures produce cards, so this is a real (non-vacuous) cross-fixture leak check.
  assert.ok(scoCards.size > 0 && suiCards.length > 0, "both fixtures produce cards");
  assert.ok(suiCards.every((id) => !scoCards.has(id)), "no shared card id across the two fixtures");
});

test("a fixture with no engine cards (started game) yields an honest empty result", () => {
  // A nonsense fixture matches nothing — total 0, never fabricated.
  const g = getGameSpecificCardsForGame({ matchId: "no-such-id", homeTeam: "Nowhere", awayTeam: "Nobody" });
  assert.equal(g.total, 0);
  assert.deepEqual(g.byRisk, {});
});
