import test from "node:test";
import assert from "node:assert/strict";
import { actualFor, gradeLeg, gamePkOf, playerOf, isSettleableMarket, normName } from "./mlb-prop-grading.mjs";
import { LEG } from "./lifecycle.mjs";

test("total bases weights extra-base hits, it does not count hits", () => {
  // 3 hits: 1 double, 1 home run, 1 single = 2 + 4 + 1 = 7. A grader that returned `hits` would say 3.
  assert.equal(actualFor("batter_total_bases", { batting: { hits: 3, doubles: 1, triples: 0, homeRuns: 1 } }), 7);
  assert.equal(actualFor("batter_hits", { batting: { hits: 3 } }), 3);
  assert.equal(actualFor("batter_hits_runs_rbis", { batting: { hits: 1, runs: 2, rbi: 3 } }), 6);
  assert.equal(actualFor("pitcher_strikeouts", { pitching: { strikeOuts: 8 } }), 8);
});

test("a player who did not bat yields null, not zero", () => {
  // Zero would grade every Under as a WIN off a scratch. Null routes to UNAVAILABLE.
  assert.equal(actualFor("batter_hits", { batting: {} }), null);
  assert.equal(actualFor("batter_total_bases", { batting: {} }), null);
  assert.equal(actualFor("unsupported_market", { batting: { hits: 2 } }), null);
});

test("nothing grades before the game is final", () => {
  const r = gradeLeg({ market: "batter_hits", side: "under", line: 1.5, stats: { batting: { hits: 0 } }, gameIsFinal: false });
  assert.equal(r.result, LEG.PENDING);
  assert.equal(r.actual, null);
});

test("a missing player is UNAVAILABLE, distinctly from PENDING and never a loss", () => {
  const r = gradeLeg({ market: "batter_hits", side: "over", line: 1.5, stats: null, gameIsFinal: true });
  assert.equal(r.result, LEG.UNAVAILABLE);
  assert.notEqual(r.result, LEG.LOST);
  assert.match(r.note, /scratch/);
});

test("over and under grade in opposite directions off the same box score", () => {
  const stats = { batting: { hits: 2, doubles: 0, triples: 0, homeRuns: 0 } };
  assert.equal(gradeLeg({ market: "batter_hits", side: "over",  line: 1.5, stats, gameIsFinal: true }).result, LEG.WON);
  assert.equal(gradeLeg({ market: "batter_hits", side: "under", line: 1.5, stats, gameIsFinal: true }).result, LEG.LOST);
});

test("exactly on the line is a push, on either side", () => {
  const stats = { pitching: { strikeOuts: 5 } };
  assert.equal(gradeLeg({ market: "pitcher_strikeouts", side: "over",  line: 5, stats, gameIsFinal: true }).result, LEG.PUSH);
  assert.equal(gradeLeg({ market: "pitcher_strikeouts", side: "under", line: 5, stats, gameIsFinal: true }).result, LEG.PUSH);
});

test("a leg with no numeric line is UNAVAILABLE rather than compared against NaN", () => {
  const r = gradeLeg({ market: "batter_hits", side: "over", line: undefined, stats: { batting: { hits: 2 } }, gameIsFinal: true });
  assert.equal(r.result, LEG.UNAVAILABLE);   // NaN comparisons are false, which would read as a LOSS
});

test("gamePk and player are recovered from BOTH real artifact shapes", () => {
  assert.equal(gamePkOf({ legId: "MLB:824320:batter_hits:Kyle_Tucker:under", eventId: "824320" }), "824320");
  assert.equal(gamePkOf({ legId: "moonshot:mlb:824725:batter_total_bases:Gabriel_Moreno" }), "824725");
  assert.equal(gamePkOf({ legId: "no-digits-here" }), "");
  assert.equal(playerOf({ participantName: "Kyle Tucker" }), "Kyle Tucker");
  assert.equal(playerOf({ participant: "Gabriel Moreno Over 1.5 Total Bases" }), "Gabriel Moreno");
});

test("accents and punctuation do not prevent a box-score match", () => {
  assert.equal(normName("José Ramírez"), normName("Jose Ramirez"));
  assert.equal(normName("Ronald Acuña Jr."), "ronald acuna jr");
});

test("only the four markets we can actually settle are settleable", () => {
  for (const m of ["pitcher_strikeouts", "batter_hits", "batter_total_bases", "batter_hits_runs_rbis"]) {
    assert.equal(isSettleableMarket(m), true, m);
  }
  for (const m of ["batter_home_runs", "player_shots", "", undefined]) assert.equal(isSettleableMarket(m), false, String(m));
});
