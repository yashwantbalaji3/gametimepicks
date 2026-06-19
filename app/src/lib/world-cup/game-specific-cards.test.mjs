import { test } from "node:test";
import assert from "node:assert/strict";
import { getGameDetail } from "../game-detail.ts";
import { getGameSpecificCardsForGame } from "./game-specific-cards.ts";

test("engine game-specific cards map to the correct WC fixture (current slate), bucketed by risk", () => {
  const d = getGameDetail("world-cup", "usa-vs-australia-2026-06-19");
  assert.ok(d, "fixture resolves");
  const g = getGameSpecificCardsForGame({ matchId: d.matchId, homeTeam: d.homeTeam, awayTeam: d.awayTeam }, "2026-06-19T15:00:00Z");
  assert.ok(g.total > 0, "at least one engine card mapped to the fixture");
  // every mapped card is bucketed and carries legs.
  for (const c of g.cards) {
    assert.ok(["low", "medium", "high", "longshot"].includes(c.riskLevel), "card has a risk level");
    assert.ok(c.legs.length >= 2, "same-game card has >= 2 legs");
  }
});

test("cards never leak across fixtures (USA-Australia cards != Scotland-Morocco cards)", () => {
  const usa = getGameDetail("world-cup", "usa-vs-australia-2026-06-19");
  const sco = getGameDetail("world-cup", "scotland-vs-morocco-2026-06-19");
  const usaCards = new Set(getGameSpecificCardsForGame({ matchId: usa.matchId, homeTeam: usa.homeTeam, awayTeam: usa.awayTeam }, "2026-06-19T15:00:00Z").cards.map((c) => c.parlayId));
  const scoCards = getGameSpecificCardsForGame({ matchId: sco.matchId, homeTeam: sco.homeTeam, awayTeam: sco.awayTeam }, "2026-06-19T15:00:00Z").cards.map((c) => c.parlayId);
  assert.ok(scoCards.every((id) => !usaCards.has(id)), "no shared card id across the two fixtures");
});

test("a fixture with no engine cards (started game) yields an honest empty result", () => {
  // A nonsense fixture matches nothing — total 0, never fabricated.
  const g = getGameSpecificCardsForGame({ matchId: "no-such-id", homeTeam: "Nowhere", awayTeam: "Nobody" });
  assert.equal(g.total, 0);
  assert.deepEqual(g.byRisk, {});
});
