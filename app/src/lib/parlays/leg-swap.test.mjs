/**
 * The substitution rules, pinned. Each is here because the alternative was actively misleading.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { benchFor, repriceCard, bandFor, toAmerican, decimalOdds } from "./leg-swap.ts";

const c = (player, market, odds, gameId, extra = {}) => ({
  player, market, marketLabel: market, side: "Over", line: 0.5,
  americanOdds: odds, gameId, matchup: `${gameId} matchup`,
  photoUrl: null, teamAbbr: null, opponentAbbr: null, ...extra,
});

const POOL = [
  c("Same Price", "batter_hits", -180, "g2"),
  c("Way Shorter", "batter_hits", -400, "g3"),
  c("Way Longer", "batter_hits", +300, "g4"),
  c("Wrong Market", "pitcher_strikeouts", -180, "g5"),
  c("Same Game As Other Leg", "batter_hits", -175, "gOTHER"),
  c("Already On Card", "batter_hits", -185, "g6"),
];
const TARGET = { player: "Outgoing", market: "batter_hits", gameId: "g1", americanOdds: -180 };
const ON_CARD = [TARGET, { player: "Already On Card", market: "batter_hits", gameId: "gOTHER", americanOdds: -150 }];

test("substitutes like-for-like: same market only", () => {
  const bench = benchFor(POOL, TARGET, ON_CARD);
  assert.ok(bench.every((b) => b.market === "batter_hits"), "a hits leg is replaced by a hits leg");
  assert.ok(!bench.some((b) => b.player === "Wrong Market"), "a strikeouts leg is not on a hits bench");
});

test("never doubles up on a game already on the card", () => {
  // Two legs from one ballgame rise and fall together; a swap that quietly adds a second leg from
  // a game already represented makes the card more correlated than the reader can see.
  const bench = benchFor(POOL, TARGET, ON_CARD);
  assert.ok(!bench.some((b) => b.gameId === "gOTHER"), "the other leg's game is excluded");
});

test("never offers a player already on the card", () => {
  const bench = benchFor(POOL, TARGET, ON_CARD);
  assert.ok(!bench.some((b) => b.player === "Already On Card"));
});

test("orders by PRICE PROXIMITY, not by anything claiming to be better", () => {
  /*
   * The load-bearing assertion. Nothing available ranks candidates by quality honestly — model edge
   * does not predict (58.1/59.2/57.9% across edge buckets over 1,407 graded legs) and legs land
   * BELOW their own implied price in every band. Ordering by win probability would just order by
   * shortest price and nudge every substitution toward favourites.
   */
  const bench = benchFor(POOL, TARGET, ON_CARD);
  assert.equal(bench[0].player, "Same Price", "the closest price is offered first");
  const target = decimalOdds(TARGET.americanOdds);
  const gaps = bench.map((b) => Math.abs(decimalOdds(b.americanOdds) - target));
  assert.deepEqual(gaps, [...gaps].sort((a, b) => a - b), "the bench is sorted by distance from the outgoing price");
});

test("price distance is measured in decimal space, not raw American", () => {
  // +110 and −110 are neighbours in probability but 220 apart as integers. Sorting the raw number
  // would call a near-identical price a wild swing.
  const pool = [c("Just Over Even", "m", +110, "gA"), c("Far Favourite", "m", -900, "gB")];
  const bench = benchFor(pool, { player: "x", market: "m", gameId: "g0", americanOdds: -110 }, []);
  assert.equal(bench[0].player, "Just Over Even");
});

test("repricing the card reflects the substitution", () => {
  const legs = [{ americanOdds: -150 }, { americanOdds: +200 }];
  const before = toAmerican(decimalOdds(-150) * decimalOdds(200));
  const after = repriceCard(legs, 1, +400);
  assert.notEqual(after, before);
  assert.equal(after, toAmerican(decimalOdds(-150) * decimalOdds(400)));
});

test("a substitution that moves the card out of its band is detectable", () => {
  // The UI has to be able to say "this is no longer a Low-risk card" rather than silently
  // relabelling it, so band membership is derivable from the repriced number.
  assert.equal(bandFor(80), "low");
  assert.equal(bandFor(250), "medium");
  assert.equal(bandFor(500), "high");
  assert.equal(bandFor(900), "longshot");
  assert.equal(bandFor(-400), null, "shorter than the Low floor is not a sensible parlay");
});

test("the bench is a bench, not a catalogue", () => {
  const many = Array.from({ length: 40 }, (_, i) => c(`P${i}`, "batter_hits", -180 - i, `g${i + 10}`));
  assert.equal(benchFor(many, TARGET, ON_CARD).length, 6);
  assert.equal(benchFor(many, TARGET, ON_CARD, 3).length, 3);
});
