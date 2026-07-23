/**
 * Tests for the sports event-market discovery classifier. Covers the mission's required cases: binary contract,
 * multi-outcome, "other"/residual outcome, ambiguous entity names, non-sports exclusion, game-line exclusion, and
 * cross-provider duplicate candidates. Run: npx tsx --test src/lib/event-markets/discovery.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { classifyMarket, dedupeCandidates } from "./discovery.ts";

test("1 · a BINARY event contract (playoff qualification) is a sports event market", () => {
  const r = classifyMarket({ question: "Will the New York Knicks make the playoffs?", sport: "basketball", outcomes: [{ outcomeId: "yes", label: "Yes" }, { outcomeId: "no", label: "No" }] });
  assert.equal(r.isSportsEventMarket, true);
  assert.equal(r.category, "qualification");
});

test("2 · a MULTI-OUTCOME contract (award) is classified with its outcomes", () => {
  const r = classifyMarket({ question: "Who will win NBA MVP?", outcomes: [{ outcomeId: "a", label: "Player A" }, { outcomeId: "b", label: "Player B" }, { outcomeId: "c", label: "Player C" }] });
  assert.equal(r.isSportsEventMarket, true);
  assert.equal(r.category, "award");
  assert.equal(r.descriptor.outcomes.length, 3);
});

test("3 · a residual 'other' outcome is preserved (exhaustiveness) and lifts outcome exhaustiveness", () => {
  const r = classifyMarket({ question: "Which team will sign the free agent?", outcomes: [{ outcomeId: "a", label: "Team A" }, { outcomeId: "field", label: "Field/none", isResidual: true }] });
  assert.equal(r.category, "player_movement");
  assert.ok(r.descriptor.outcomes.some((o) => o.isResidual));
});

test("4 · an ORDINARY game moneyline is EXCLUDED (belongs to the game product, not event intelligence)", () => {
  const r = classifyMarket({ question: "Yankees moneyline vs Red Sox tonight" });
  assert.equal(r.isSportsEventMarket, false);
  assert.equal(r.category, "game_line");
});

test("5 · a NON-SPORTS market is excluded", () => {
  const r = classifyMarket({ question: "Will the Fed raise rates in September?" });
  assert.equal(r.isSportsEventMarket, false);
  assert.equal(r.category, "non_sports");
});

test("6 · ambiguous entity names still classify by the event signal, entities passed through", () => {
  const r = classifyMarket({ question: "Will Jordan sign with the Panthers?", entities: ["ambiguous:jordan", "ambiguous:panthers"] });
  assert.equal(r.isSportsEventMarket, true);
  assert.equal(r.category, "player_movement");
  assert.deepEqual(r.descriptor.entities, ["ambiguous:jordan", "ambiguous:panthers"]);
});

test("7 · insider-driven contracts carry an INFORMATION_ONLY modelability read (no independent probability)", () => {
  const r = classifyMarket({ question: "Who will be the next head coach of the team?" });
  assert.equal(r.category, "personnel");
  assert.equal(r.descriptor.modelability, "INFORMATION_ONLY");
});

test("8 · duplicate cross-provider candidates dedupe by normalized question + entities", () => {
  const cands = [
    { question: "Will Player X win MVP?", entities: ["player-x"], provider: "kalshi" },
    { question: "will player x win mvp", entities: ["player-x"], provider: "polymarket" },
    { question: "Will Player Y win MVP?", entities: ["player-y"], provider: "kalshi" },
  ];
  assert.equal(dedupeCandidates(cands).length, 2, "the two Player-X markets collapse to one");
});
