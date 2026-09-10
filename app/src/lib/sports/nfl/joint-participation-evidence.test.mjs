import { test } from "node:test";
import assert from "node:assert/strict";
import { applyJointParticipation, participationAwareQuarterback } from "./joint-participation-evidence.mjs";
const chart = { timestamp: "2026-09-08T10:00:00Z", quarterbacks: [{ playerId: "1", rank: 1 }, { playerId: "2", rank: 2 }] };
const row = (id, state) => ({ playerId: `nfl-athlete-${id}`, state });
test("out starter does not override available backup solely through rank", () => {
  const result = participationAwareQuarterback(chart, { players: [row(1, "INACTIVE"), row(2, "ACTIVE_PROJECTED")] });
  assert.equal(result.playerId, "nfl-athlete-2");
  assert.equal(result.depthRank, 2);
  assert.deepEqual(result.excluded, ["nfl-athlete-1"]);
});
test("uncertain starter requires scenarios, not an invented backup promotion", () => {
  for (const state of ["QUESTIONABLE", "UNKNOWN", "ROLE_UNCERTAIN"]) {
    assert.equal(participationAwareQuarterback(chart, { players: [row(1, state), row(2, "ACTIVE_PROJECTED")] }).state, "PARTICIPATION_UNCERTAIN");
  }
});
test("missing current roster and ambiguous chart do not create a starter", () => {
  assert.equal(participationAwareQuarterback(chart, { players: [] }).state, "NO_ELIGIBLE_DEPTH_QB");
  assert.equal(participationAwareQuarterback({ quarterbacks: [{ playerId: "1", rank: 1 }, { playerId: "2", rank: 1 }] }, { players: [row(1, "ACTIVE_PROJECTED")] }).state, "AMBIGUOUS");
});
test("out and off-team shares are removed without redistribution; uncertainty stays visible", () => {
  const players = [1, 2, 3].map(id => ({ playerId: `nfl-athlete-${id}`, qbShare: 0.2, carryShare: 0.1, targetShare: 0.1, tdShare: 0.1 }));
  const before = structuredClone(players);
  const result = applyJointParticipation(players, { players: [row(1, "INACTIVE"), row(2, "QUESTIONABLE")] });
  assert.deepEqual(players, before);
  assert.equal(result.players[0].qbShare, 0);
  assert.equal(result.players[2].qbShare, 0);
  assert.equal(result.players[1].qbShare, 0.2);
  assert.equal(result.removedMass.qbShare, 0.4);
  assert.equal(result.uncertaintyResolved, false);
});
