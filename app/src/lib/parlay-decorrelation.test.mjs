/**
 * Tests for the parlay decorrelation helpers (`parlay-decorrelation.ts`).
 *
 * These lock the structural correlation math + the PROPOSED per-section
 * caps. The helpers are pure and read ONLY pregame leg structure (game,
 * market, side, team, player) — never results or dates — so they cannot
 * introduce same-slate leakage. None of this is wired into live selection.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  slipCorrelationProfile,
  evaluateSlipDecorrelation,
  PROPOSED_SECTION_DECORRELATION_CAPS,
  PUBLIC_SECTION_DECORRELATION_CAPS_TODAY,
} from "./parlay-decorrelation.ts";

const leg = (o) => ({
  gameId: "g1",
  market: "batter_hits",
  side: "Over",
  team: "NYM",
  playerId: 1,
  playerName: "A",
  ...o,
});

test("profile counts same-game / market / team / direction / dup-player", () => {
  const legs = [
    leg({ gameId: "g1", market: "batter_hits", team: "NYM", playerId: 1, side: "Over" }),
    leg({ gameId: "g1", market: "batter_hits", team: "NYM", playerId: 2, side: "Over" }),
    leg({ gameId: "g2", market: "batter_total_bases", team: "BOS", playerId: 3, side: "Under" }),
  ];
  const p = slipCorrelationProfile(legs);
  assert.equal(p.legs, 3);
  assert.equal(p.maxLegsInOneGame, 2); // g1 twice
  assert.equal(p.maxLegsInOneMarket, 2); // batter_hits twice
  assert.equal(p.maxLegsInOneTeam, 2); // NYM twice
  assert.equal(p.overCount, 2);
  assert.equal(p.underCount, 1);
  assert.equal(p.hasDuplicatePlayer, false);
});

test("duplicate player detected by id then by name", () => {
  const byId = slipCorrelationProfile([leg({ playerId: 5 }), leg({ playerId: 5, gameId: "g2" })]);
  assert.equal(byId.hasDuplicatePlayer, true);
  const byName = slipCorrelationProfile([
    leg({ playerId: null, playerName: "Soto" }),
    leg({ playerId: null, playerName: "Soto", gameId: "g2" }),
  ]);
  assert.equal(byName.hasDuplicatePlayer, true);
});

test("empty slip is identity-safe (no throws, zero counts)", () => {
  const p = slipCorrelationProfile([]);
  assert.deepEqual(
    [p.legs, p.maxLegsInOneGame, p.maxLegsInOneMarket, p.overCount, p.underCount],
    [0, 0, 0, 0, 0],
  );
});

test("Low caps reject a 2x same-market same-game Over stack", () => {
  const legs = [
    leg({ gameId: "g1", market: "batter_hits", playerId: 1 }),
    leg({ gameId: "g1", market: "batter_hits", playerId: 2 }),
  ];
  const low = evaluateSlipDecorrelation(legs, PROPOSED_SECTION_DECORRELATION_CAPS.low);
  assert.equal(low.passes, false);
  // fails both same-game (>1) and same-market (>1) for Low
  assert.ok(low.failures.some((f) => /game/.test(f)));
  assert.ok(low.failures.some((f) => /market/.test(f)));
  // ...but today's permissive caps accept it (no same-market cap, same-game ≤2)
  const today = evaluateSlipDecorrelation(legs, PUBLIC_SECTION_DECORRELATION_CAPS_TODAY);
  assert.equal(today.passes, true);
});

test("a diversified 2-leg slip passes Low caps", () => {
  const legs = [
    leg({ gameId: "g1", market: "batter_hits", team: "NYM", playerId: 1 }),
    leg({ gameId: "g2", market: "batter_total_bases", team: "BOS", playerId: 2 }),
  ];
  const low = evaluateSlipDecorrelation(legs, PROPOSED_SECTION_DECORRELATION_CAPS.low);
  assert.equal(low.passes, true);
  assert.deepEqual(low.failures, []);
});

test("proposed caps tighten monotonically Low ≤ Medium ≤ High ≤ Longshot", () => {
  const order = ["low", "medium", "high", "longshot"];
  for (let i = 1; i < order.length; i++) {
    const a = PROPOSED_SECTION_DECORRELATION_CAPS[order[i - 1]];
    const b = PROPOSED_SECTION_DECORRELATION_CAPS[order[i]];
    assert.ok(a.maxSameGame <= b.maxSameGame, `${order[i - 1]} sameGame ≤ ${order[i]}`);
    assert.ok(a.maxSameMarket <= b.maxSameMarket, `${order[i - 1]} sameMarket ≤ ${order[i]}`);
    assert.ok(a.maxSameTeam <= b.maxSameTeam, `${order[i - 1]} sameTeam ≤ ${order[i]}`);
  }
});

test("proposed Low is strictly tighter than today's public caps", () => {
  const low = PROPOSED_SECTION_DECORRELATION_CAPS.low;
  assert.ok(low.maxSameGame < PUBLIC_SECTION_DECORRELATION_CAPS_TODAY.maxSameGame);
  assert.ok(low.maxSameMarket < PUBLIC_SECTION_DECORRELATION_CAPS_TODAY.maxSameMarket);
});

test("no duplicate players allowed in any proposed section", () => {
  for (const k of Object.keys(PROPOSED_SECTION_DECORRELATION_CAPS)) {
    assert.equal(PROPOSED_SECTION_DECORRELATION_CAPS[k].allowDuplicatePlayer, false);
  }
});
