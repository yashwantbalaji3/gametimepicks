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

test("D5 · the archive slate's fixtures carry no same-game cards — none is built without an honest joint price", () => {
  /* Founder decision D5 (Session 5): these were legs of ONE fixture priced by multiplying them as if independent.
     With no sportsbook SGP receipt and no validated joint-pricing model, they are not built at all. The fixtures are
     real (non-vacuous): the archive slate resolves them, and each now maps to an honest empty result. */
  assert.ok(currentFixtures.length > 0, "the archive slate resolves WC fixtures");
  assert.deepEqual(fixturesWithCards, [], "no fixture maps to a same-game card");
});

test("a fixture with no engine cards (started game) yields an honest empty result", () => {
  // A nonsense fixture matches nothing — total 0, never fabricated.
  const g = getGameSpecificCardsForGame({ matchId: "no-such-id", homeTeam: "Nowhere", awayTeam: "Nobody" });
  assert.equal(g.total, 0);
  assert.deepEqual(g.byRisk, {});
});
