/**
 * Week 10 (PD 2026-11-11): the simulation's starting QB is the board's decision — depth-chart QB1, or WITHHELD —
 * never the largest raw role share (which made BAL Fagnano and NYG Winston simulated starters).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { SIM_STARTER, simStarterDecision, starterOptions } from "./starter-qb.mjs";
import { playersFromRoleShares } from "./receipt.mjs";
import { prepareTeamPlayers } from "./engine.mjs";

const block = {
  passAttempts: { players: [
    { playerId: "nfl-athlete-1", name: "Backup", position: "QB", share: 0.36 },
    { playerId: "nfl-athlete-2", name: "Injured", position: "QB", share: 0.6 },
    { playerId: "nfl-athlete-9", name: "Punter", position: "P", share: 0.01 },
    { playerId: "nfl-athlete-5", name: "RB", position: "RB", share: 0.01 },
  ] },
  targets: { players: [{ playerId: "nfl-athlete-7", name: "WR", position: "WR", share: 0.4 }, { playerId: "nfl-athlete-5", name: "RB", position: "RB", share: 0.1 }] },
  rushAttempts: { players: [{ playerId: "nfl-athlete-5", name: "RB", position: "RB", share: 0.6 }, { playerId: "nfl-athlete-1", name: "Backup", position: "QB", share: 0.08 }] },
  rates: { players: [] },
};
const injured = new Set(["nfl-athlete-2"]);
const board = (rules) => ({ integrity: { qbStarter: rules } });

test("decision: APPLIED / single passer → that starter; anything else → WITHHELD with the board's reason", () => {
  assert.deepEqual(simStarterDecision(board([{ team: "BAL", state: "APPLIED", starter: { playerId: "nfl-athlete-1" }, passers: ["nfl-athlete-1"] }]), "BAL"), { state: SIM_STARTER.STARTER, starterQb: "nfl-athlete-1", reason: null });
  assert.equal(simStarterDecision(board([{ team: "BAL", state: "SINGLE_PASSER", passers: ["nfl-athlete-1"] }]), "BAL").starterQb, "nfl-athlete-1");
  const w = simStarterDecision(board([{ team: "BAL", state: "WITHHELD_STARTER_NOT_CONFIRMED", reason: "withheld for BAL: starting QB not confirmed", passers: [] }]), "BAL");
  assert.equal(w.state, SIM_STARTER.WITHHELD);
  assert.match(w.reason, /starting QB not confirmed/);
  for (const b of [null, board([]), board([{ team: "BAL", state: "SINGLE_PASSER", passers: [] }]), board([{ team: "BAL", state: "UNRESOLVED", passers: ["a", "b"] }])]) {
    assert.equal(simStarterDecision(b, "BAL").state, SIM_STARTER.WITHHELD);
  }
});

test("WITHHELD: no named player passes — not the backup, not a punter rescaled up — and the game still simulates", () => {
  const { players } = playersFromRoleShares(block, injured, starterOptions({ state: SIM_STARTER.WITHHELD }));
  assert.ok(players.every((p) => p.passShare === 0), "every pass attempt goes to OTHER");
  assert.equal(players.find((p) => p.playerId === "nfl-athlete-1").carryShare, 0, "a non-starting QB carries no share");
  assert.equal(players.find((p) => p.playerId === "nfl-athlete-5").carryShare, 0.6, "other families are untouched — nothing is rescaled into the vacated QB carries");
  const prep = prepareTeamPlayers({ players });
  assert.equal(prep.scrambler, prep.n, "scrambles go to OTHER too");
  /* control: the legacy call (no decision) still picks the largest share — the behaviour this replaces */
  const legacy = playersFromRoleShares(block, injured);
  assert.equal(legacy.players.find((p) => p.playerId === "nfl-athlete-1").passShare > 0.9, true);
});

test("STARTER: the chart QB1 takes all passing; a strict starter missing from the pool is WITHHELD, never the largest share", () => {
  const ok = playersFromRoleShares(block, injured, starterOptions({ state: SIM_STARTER.STARTER, starterQb: "nfl-athlete-1" }));
  const qb1 = ok.players.find((p) => p.playerId === "nfl-athlete-1").passShare;
  assert.ok(qb1 > 0.9 && ok.players.every((p) => p.playerId === "nfl-athlete-1" || p.passShare < 0.05), "QB1 holds the team's passing (non-QB trick-play shares stay as they were)");
  const missing = playersFromRoleShares(block, injured, starterOptions({ state: SIM_STARTER.STARTER, starterQb: "nfl-athlete-404" }));
  assert.ok(missing.players.every((p) => p.passShare === 0));
});

test("determinism: same board + shares → identical inputs", () => {
  const d = simStarterDecision(board([{ team: "BAL", state: "WITHHELD_STARTER_NOT_CONFIRMED", reason: "x" }]), "BAL");
  assert.equal(JSON.stringify(playersFromRoleShares(block, injured, starterOptions(d))), JSON.stringify(playersFromRoleShares(block, injured, starterOptions(d))));
});
