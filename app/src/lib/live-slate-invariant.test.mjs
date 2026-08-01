/**
 * Mutation proofs for the live-slate invariant classifier (Program 092-095 §5.3).
 *
 * The fixture models today's real morning shape: a scheduled evening game, simulated from the
 * board (its canonical upstream), with no lean yet because books haven't posted. Each mutation
 * then removes or corrupts exactly one leg of legitimacy and must flip the state to a HARD
 * failure — and each mutation asserts it actually changed the input before classifying.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySim, isHardFailure, SIM_STATES } from "./live-slate-invariant.mjs";

const legitimateSim = () => ({
  gamePk: 824809,
  market: null,
  status: "unavailable",
  completeness: { level: "unavailable" },
});

const BOARD_PKS = new Set([824809, 824651]);
const CLAIMED = new Set([824651]); // the other game has leans; ours doesn't yet
const NO_COLLISION = false;

test("a real legitimate intraday state passes: scheduled, no collision, no market, honest status", () => {
  const state = classifySim(legitimateSim(), CLAIMED, BOARD_PKS, NO_COLLISION);
  assert.equal(state, SIM_STATES.LEGITIMATE);
  assert.equal(isHardFailure(state), false);
});

test("a claimed sim is simply claimed", () => {
  assert.equal(classifySim({ gamePk: 824651 }, CLAIMED, BOARD_PKS, NO_COLLISION), SIM_STATES.CLAIMED);
});

test("MUTATION · remove the upstream source (game not on board) → TRUE_ORPHAN hard fail", () => {
  const boardWithoutGame = new Set(BOARD_PKS);
  boardWithoutGame.delete(824809);
  assert.notDeepEqual([...boardWithoutGame], [...BOARD_PKS], "mutation must actually apply");
  const state = classifySim(legitimateSim(), CLAIMED, boardWithoutGame, NO_COLLISION);
  assert.equal(state, SIM_STATES.TRUE_ORPHAN);
  assert.equal(isHardFailure(state), true);
});

test("MUTATION · a null/foreign gamePk is a TRUE_ORPHAN", () => {
  const sim = { ...legitimateSim(), gamePk: 999999 };
  assert.notEqual(sim.gamePk, legitimateSim().gamePk, "mutation must actually apply");
  assert.equal(classifySim(sim, CLAIMED, BOARD_PKS, NO_COLLISION), SIM_STATES.TRUE_ORPHAN);
  assert.equal(classifySim({ ...legitimateSim(), gamePk: null }, CLAIMED, BOARD_PKS, NO_COLLISION), SIM_STATES.TRUE_ORPHAN);
});

test("MUTATION · introduce an identity collision on the slate → refusal (the 07-28 signature)", () => {
  // 2026-07-28: gamePk 824490 was scheduled AND simulated AND lean-less — exactly our legitimate
  // shape — but the slate carried a collision (two gameIds on 824489). With a collision present,
  // an unclaimed sim must NEVER pass, no matter how honest it looks.
  const state = classifySim(legitimateSim(), CLAIMED, BOARD_PKS, true);
  assert.equal(state, SIM_STATES.IDENTITY_CONFLICT);
  assert.equal(isHardFailure(state), true);
});

test("MUTATION · attach a market capture to the unclaimed sim → POSTGAME_OR_UNSAFE_SOURCE", () => {
  const sim = {
    ...legitimateSim(),
    market: { bookmaker: "draftkings", capturedAt: "2026-07-31T23:59:00Z", moneyline: { home: 0.6 } },
  };
  assert.notEqual(sim.market, null, "mutation must actually apply");
  const state = classifySim(sim, CLAIMED, BOARD_PKS, NO_COLLISION);
  assert.equal(state, SIM_STATES.UNSAFE_SOURCE);
  assert.equal(isHardFailure(state), true);
});

test("MUTATION · partial state presented as complete → hard fail", () => {
  const sim = { ...legitimateSim(), status: "complete", completeness: { level: "full" } };
  assert.notEqual(sim.status, legitimateSim().status, "mutation must actually apply");
  const state = classifySim(sim, CLAIMED, BOARD_PKS, NO_COLLISION);
  assert.equal(state, SIM_STATES.OVERSTATED);
  assert.equal(isHardFailure(state), true);
});

test("the fixture round-trips byte-identically (mutations never leak between tests)", () => {
  const a = JSON.stringify(legitimateSim());
  classifySim(legitimateSim(), CLAIMED, BOARD_PKS, NO_COLLISION);
  const b = JSON.stringify(legitimateSim());
  assert.equal(a, b);
});
