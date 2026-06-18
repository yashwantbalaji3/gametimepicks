import { test } from "node:test";
import assert from "node:assert/strict";
import { getGameDetail } from "../game-detail.ts";
import { getGameSpecificCardsForGame } from "./game-specific-cards.ts";

test("engine game-specific cards map to the correct WC fixture (Switzerland-Bosnia), bucketed by risk", () => {
  const d = getGameDetail("world-cup", "switzerland-vs-bosnia-herzegovina-2026-06-18");
  assert.ok(d, "fixture resolves");
  const g = getGameSpecificCardsForGame({ matchId: d.matchId, homeTeam: d.homeTeam, awayTeam: d.awayTeam }, "2026-06-18T15:00:00Z");
  assert.ok(g.total > 0, "at least one engine card mapped to the fixture");
  // every mapped card is bucketed and carries legs.
  for (const c of g.cards) {
    assert.ok(["low", "medium", "high", "longshot"].includes(c.riskLevel), "card has a risk level");
    assert.ok(c.legs.length >= 2, "same-game card has >= 2 legs");
  }
});

test("cards never leak across fixtures (Switzerland cards != Canada cards)", () => {
  const sw = getGameDetail("world-cup", "switzerland-vs-bosnia-herzegovina-2026-06-18");
  const ca = getGameDetail("world-cup", "canada-vs-qatar-2026-06-18");
  const swCards = new Set(getGameSpecificCardsForGame({ matchId: sw.matchId, homeTeam: sw.homeTeam, awayTeam: sw.awayTeam }, "2026-06-18T15:00:00Z").cards.map((c) => c.parlayId));
  const caCards = getGameSpecificCardsForGame({ matchId: ca.matchId, homeTeam: ca.homeTeam, awayTeam: ca.awayTeam }, "2026-06-18T15:00:00Z").cards.map((c) => c.parlayId);
  assert.ok(caCards.every((id) => !swCards.has(id)), "no shared card id across the two fixtures");
});

test("a fixture with no engine cards (started game) yields an honest empty result", () => {
  // A nonsense fixture matches nothing — total 0, never fabricated.
  const g = getGameSpecificCardsForGame({ matchId: "no-such-id", homeTeam: "Nowhere", awayTeam: "Nobody" });
  assert.equal(g.total, 0);
  assert.deepEqual(g.byRisk, {});
});
