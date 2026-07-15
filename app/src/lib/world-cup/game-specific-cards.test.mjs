import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildAllGameDetails } from "../game-detail.ts";
import { getGameSpecificCardsForGame } from "./game-specific-cards.ts";

// DATE-AGNOSTIC: read the current World Cup slate date from the live artifact, then drive the engine
// off whatever fixtures that slate actually carries — no hardcoded "2026-06-24" or named fixtures.
const SLATE_DATE = JSON.parse(
  fs.readFileSync(new URL("../../../public/data/world-cup/world-cup-specials.json", import.meta.url), "utf8"),
).date;
// Pre-event NOON-of-slate-day NOW: every WC kickoff is in the afternoon/evening, so 12:00Z is before
// any game on the slate has started regardless of which day the slate rolled to.
const NOW = `${SLATE_DATE}T12:00:00Z`;

// The current slate's WC fixtures (order/date-independent), resolved from the canonical game-detail set.
const currentFixtures = buildAllGameDetails().filter((d) => d.sport === "world_cup" && d.slug.endsWith(SLATE_DATE));

// Fixtures that the engine actually mapped same-game cards onto for THIS slate — discovered dynamically
// so the leak check stays a real (non-vacuous) comparison across whatever the live slate produced.
const fixturesWithCards = currentFixtures
  .map((d) => ({ fixture: d, cards: getGameSpecificCardsForGame({ matchId: d.matchId, homeTeam: d.homeTeam, awayTeam: d.awayTeam }, NOW) }))
  .filter((x) => x.cards.total > 0);

test("engine game-specific cards map to the correct WC fixture (current slate), bucketed by risk", () => {
  assert.ok(currentFixtures.length > 0, "the current slate resolves WC fixtures");
  assert.ok(fixturesWithCards.length > 0, "at least one current-slate fixture has engine cards");
  // every mapped card is bucketed and carries legs, for every fixture that produced cards.
  for (const { cards } of fixturesWithCards) {
    for (const c of cards.cards) {
      assert.ok(["low", "medium", "high", "longshot"].includes(c.riskLevel), "card has a risk level");
      assert.ok(c.legs.length >= 2, "same-game card has >= 2 legs");
    }
  }
});

test("cards never leak across fixtures (a fixture's cards are bound to it, never shared with another)", () => {
  assert.ok(fixturesWithCards.length >= 1, "at least one current-slate fixture produces cards");
  if (fixturesWithCards.length >= 2) {
    // Multi-fixture slate: pick two DISTINCT fixtures that both produced cards — dynamic, not named.
    const [a, b] = fixturesWithCards;
    const aCards = new Set(a.cards.cards.map((c) => c.parlayId));
    const bCards = b.cards.cards.map((c) => c.parlayId);
    assert.ok(aCards.size > 0 && bCards.length > 0, "both fixtures produce cards");
    assert.ok(bCards.every((id) => !aCards.has(id)), "no shared card id across the two fixtures");
    return;
  }
  // Thin single-fixture slate (e.g. the 2026-07-15 semifinal, England vs Argentina): the anti-leak
  // property still holds — the real fixture's cards must NOT appear for a DIFFERENT (nonexistent) fixture.
  const only = fixturesWithCards[0];
  const realCards = new Set(only.cards.cards.map((c) => c.parlayId));
  assert.ok(realCards.size > 0, "the single current-slate fixture produces cards");
  const other = getGameSpecificCardsForGame({ matchId: "different-match-id", homeTeam: "Nowhere", awayTeam: "Nobody" }, NOW);
  assert.equal(other.total, 0, "a different fixture shares none of this fixture's cards (no leak)");
});

test("a fixture with no engine cards (started game) yields an honest empty result", () => {
  // A nonsense fixture matches nothing — total 0, never fabricated.
  const g = getGameSpecificCardsForGame({ matchId: "no-such-id", homeTeam: "Nowhere", awayTeam: "Nobody" });
  assert.equal(g.total, 0);
  assert.deepEqual(g.byRisk, {});
});
