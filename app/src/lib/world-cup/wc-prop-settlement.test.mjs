/**
 * WC player-prop settlement grading — deterministic, honest, validated against a REAL finished match.
 * Real data: 2022 World Cup third-place playoff, Croatia 2-1 Morocco (API-Football fixture 979138,
 * 2022-12-17), official per-player statistics. The current API-Football plan is FREE (2022-2024 only),
 * which is why validation uses 2022 real data, not the 2026 semifinals (plan-blocked + future).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { gradeWcPlayerProp, DETERMINISTIC_MARKETS, buildPropSettlementLedger, normName } from "./wc-prop-settlement.ts";

// ── Real finished-match validation (Croatia 2-1 Morocco, 2022 WC 3rd place) ──────────────────
const REAL = {
  gvardiol: { goals: 1, shots: 1, shotsOnTarget: 1, assists: 0 }, // scored
  orsic: { goals: 1, shots: 3, shotsOnTarget: 1, assists: 0 }, // scored, 3 shots
  ennesyri: { goals: 0, shots: 3, shotsOnTarget: 1, assists: 0 }, // did NOT score, 3 shots
};

test("REAL MATCH: anytime goalscorer grades correctly (Gvardiol scored, En-Nesyri did not)", () => {
  assert.equal(gradeWcPlayerProp({ market: "player_goal_scorer_anytime", pick: "Yes", line: null }, REAL.gvardiol).result, "win");
  assert.equal(gradeWcPlayerProp({ market: "player_goal_scorer_anytime", pick: "Yes", line: null }, REAL.ennesyri).result, "loss");
  assert.equal(gradeWcPlayerProp({ market: "player_goal_scorer_anytime", pick: "No", line: null }, REAL.ennesyri).result, "win");
});

test("REAL MATCH: shots + SOT + assists over/under grade correctly", () => {
  assert.equal(gradeWcPlayerProp({ market: "player_shots", pick: "Over", line: 1.5 }, REAL.orsic).result, "win"); // 3 > 1.5
  assert.equal(gradeWcPlayerProp({ market: "player_shots", pick: "Over", line: 2.5 }, REAL.gvardiol).result, "loss"); // 1 < 2.5
  assert.equal(gradeWcPlayerProp({ market: "player_shots_on_target", pick: "Over", line: 0.5 }, REAL.ennesyri).result, "win"); // 1 > 0.5
  assert.equal(gradeWcPlayerProp({ market: "player_assists", pick: "Over", line: 0.5 }, REAL.gvardiol).result, "loss"); // 0 assists
});

// ── Deterministic edge cases ──────────────────────────────────────────────────────────────────
test("void on an exact integer tie; ungradable when the stat is missing (never guesses)", () => {
  assert.equal(gradeWcPlayerProp({ market: "player_shots", pick: "Over", line: 3 }, { goals: 0, shots: 3, shotsOnTarget: 1, assists: 0 }).result, "void");
  assert.equal(gradeWcPlayerProp({ market: "player_shots", pick: "Over", line: 1.5 }, { goals: null, shots: null, shotsOnTarget: null, assists: null }).result, "ungradable");
});

test("all four exposed markets grade deterministically given complete stats", () => {
  const stats = { goals: 2, shots: 5, shotsOnTarget: 3, assists: 1 };
  for (const market of DETERMINISTIC_MARKETS) {
    const g = gradeWcPlayerProp({ market, pick: market === "player_goal_scorer_anytime" ? "Yes" : "Over", line: market === "player_goal_scorer_anytime" ? null : 0.5 }, stats);
    assert.notEqual(g.result, "ungradable", `${market} grades with complete stats`);
    assert.equal(g.result, "win", `${market} wins on these stats`);
  }
});

test("ledger builder grades into a SEPARATE paper/model ledger (never money); unmatched player → ungradable", () => {
  const props = [
    { player: "Joško Gvardiol", market: "player_goal_scorer_anytime", pick: "Yes", line: null },
    { player: "Ghost Player", market: "player_shots", pick: "Over", line: 1.5 }, // no stats → ungradable
  ];
  const statsByPlayer = { [normName("Joško Gvardiol")]: REAL.gvardiol };
  const led = buildPropSettlementLedger("Croatia vs Morocco", props, statsByPlayer);
  assert.equal(led.scope, "paper_model_only", "ledger is explicitly paper/model — never official money");
  assert.equal(led.summary.win, 1);
  assert.equal(led.summary.ungradable, 1, "a player with no stats grades ungradable, never guessed");
  assert.equal(led.summary.graded, 1);
});
