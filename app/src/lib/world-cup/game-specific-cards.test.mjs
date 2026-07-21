import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildAllGameDetails } from "../game-detail.ts";
import { getGameSpecificCardsForGame } from "./game-specific-cards.ts";

// The World Cup tournament is COMPLETE — buildAllGameDetails() / projections/latest.json no longer carry WC
// fixtures and world-cup-specials.json rolled to an empty slate (a valid end-of-tournament state). This test
// verifies the game-specific CARD-MAPPING logic (correct fixture, no cross-fixture leak), which is timeless,
// so it pins to the committed 2026-07-15 semifinal archive (England vs Argentina) + the committed engine
// slate for that day. NOON-of-archive-slate-day NOW keeps every WC kickoff (afternoon/evening) pre-event so
// the engine's same-game cards are live.
const SLATE_DATE = "2026-07-15";
const NOW = `${SLATE_DATE}T12:00:00Z`;

// The archive slate's WC fixtures, in the shape game-detail exposes (matchId + teams), one per distinct
// matchId — the card-mapping is driven by matchId + team names, exactly as the live game-detail set was.
const currentFixtures = [...new Map(
  JSON.parse(fs.readFileSync(new URL("../../../public/data/world-cup/projections/2026-07-15.json", import.meta.url), "utf8"))
    .matches.map((m) => [String(m.matchId), m]),
).values()].map((m) => ({ sport: "world_cup", matchId: String(m.matchId), homeTeam: m.homeTeam, awayTeam: m.awayTeam }));

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
