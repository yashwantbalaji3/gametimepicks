import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileJointRoster, conditionQuarterbackShares } from "./joint-roster-reconciliation.mjs";

test("overfull historical estimates reconcile explicitly without stealing underallocated mass", () => {
  const input = [{ playerId: "a", qbShare: 0.9, targetShare: 0.2 }, { playerId: "b", qbShare: 0.6, targetShare: 0.1 }];
  const copy = structuredClone(input);
  const out = reconcileJointRoster(input);
  assert.deepEqual(input, copy);
  assert.ok(Math.abs(out.players.reduce((s, p) => s + p.qbShare, 0) - 1) < 1e-12);
  assert.deepEqual(out.players.map(p => p.targetShare), [0.2, 0.1]);
  assert.equal(out.adjustments.length, 1);
  assert.equal(out.adjustments[0].before, 1.5);
  assert.equal(out.adjustments[0].family, "qbShare");
});

test("invalid weights refuse rather than normalizing corrupted inputs", () => {
  for (const v of [NaN, Infinity, -0.1, 1.1]) assert.throws(() => reconcileJointRoster([{ playerId: "a", carryShare: v }]));
  assert.deepEqual(reconcileJointRoster([]), { players: [], adjustments: [] });
});

test("depth conditioner preserves missing backup mass and never guesses a missing starter", () => {
  const rows = [{ playerId: "q", qbShare: 0.6, carryShare: 0.1 }, { playerId: "b", qbShare: 0.2 }];
  const depth = { state: "PROJECTED_DEPTH_STARTER", playerId: "q" };
  const out = conditionQuarterbackShares(rows, depth, 0.95);
  assert.equal(out.players[0].qbShare, 0.95);
  assert.ok(Math.abs(out.players[1].qbShare - 0.01) < 1e-12);
  assert.equal(out.players[0].carryShare, 0.1);
  assert.equal(rows[0].qbShare, 0.6);
  assert.equal(conditionQuarterbackShares(rows, { ...depth, playerId: "missing" }, 0.95).applied, false);
  assert.equal(conditionQuarterbackShares(rows, { state: "STALE" }, 0.95).applied, false);
});
