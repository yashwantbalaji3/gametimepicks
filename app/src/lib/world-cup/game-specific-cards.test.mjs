import { test } from "node:test";
import assert from "node:assert/strict";
import { getGameDetail } from "../game-detail.ts";
import { getGameSpecificCardsForGame } from "./game-specific-cards.ts";

test("engine game-specific cards map to the correct WC fixture (current slate), bucketed by risk", () => {
  const d = getGameDetail("world-cup", "belgium-vs-iran-2026-06-21");
  assert.ok(d, "fixture resolves");
  const g = getGameSpecificCardsForGame({ matchId: d.matchId, homeTeam: d.homeTeam, awayTeam: d.awayTeam }, "2026-06-21T08:00:00Z");
  assert.ok(g.total > 0, "at least one engine card mapped to the fixture");
  // every mapped card is bucketed and carries legs.
  for (const c of g.cards) {
    assert.ok(["low", "medium", "high", "longshot"].includes(c.riskLevel), "card has a risk level");
    assert.ok(c.legs.length >= 2, "same-game card has >= 2 legs");
  }
});

test("cards never leak across fixtures (Belgium-Iran cards != Uruguay-Cape Verde cards)", () => {
  const ned = getGameDetail("world-cup", "belgium-vs-iran-2026-06-21");
  const ger = getGameDetail("world-cup", "uruguay-vs-cape-verde-2026-06-21");
  const nedCards = new Set(getGameSpecificCardsForGame({ matchId: ned.matchId, homeTeam: ned.homeTeam, awayTeam: ned.awayTeam }, "2026-06-21T08:00:00Z").cards.map((c) => c.parlayId));
  const gerCards = getGameSpecificCardsForGame({ matchId: ger.matchId, homeTeam: ger.homeTeam, awayTeam: ger.awayTeam }, "2026-06-21T08:00:00Z").cards.map((c) => c.parlayId);
  assert.ok(gerCards.every((id) => !nedCards.has(id)), "no shared card id across the two fixtures");
});

test("a fixture with no engine cards (started game) yields an honest empty result", () => {
  // A nonsense fixture matches nothing — total 0, never fabricated.
  const g = getGameSpecificCardsForGame({ matchId: "no-such-id", homeTeam: "Nowhere", awayTeam: "Nobody" });
  assert.equal(g.total, 0);
  assert.deepEqual(g.byRisk, {});
});
