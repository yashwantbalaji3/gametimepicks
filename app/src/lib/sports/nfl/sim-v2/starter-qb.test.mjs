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
  assert.deepEqual(simStarterDecision(board([{ team: "BAL", state: "APPLIED", tier: "B_ALL_CLUB_HISTORY", starter: { playerId: "nfl-athlete-1", name: "Backup" }, passers: ["nfl-athlete-1"] }]), "BAL"), { state: SIM_STARTER.STARTER, starterQb: "nfl-athlete-1", starterName: "Backup", tier: "B_ALL_CLUB_HISTORY", basis: null, reason: null });
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

test("STARTER: the board's starter carries the team's passing; one outside the pool (traded) is added — never a punter rescaled up", () => {
  const ok = playersFromRoleShares(block, injured, starterOptions({ state: SIM_STARTER.STARTER, starterQb: "nfl-athlete-1" }));
  const qb1 = ok.players.find((p) => p.playerId === "nfl-athlete-1").passShare;
  assert.ok(Math.abs(qb1 - 0.98) < 1e-9, "1 − the non-QBs' own raw trick-play shares");
  assert.equal(ok.players.find((p) => p.playerId === "nfl-athlete-9").passShare, 0.01, "the punter keeps his raw share, unrescaled");
  const traded = playersFromRoleShares(block, injured, starterOptions({ state: SIM_STARTER.STARTER, starterQb: "nfl-athlete-404", starterName: "Traded In" }));
  const t = traded.players.find((p) => p.playerId === "nfl-athlete-404");
  assert.ok(t && t.name === "Traded In" && Math.abs(t.passShare - 0.98) < 1e-9);
  assert.equal(traded.players.find((p) => p.playerId === "nfl-athlete-1").passShare, 0, "the backup passes nothing");
  assert.equal(traded.players.find((p) => p.playerId === "nfl-athlete-1").carryShare, 0, "his carries go to the starter");
  assert.ok(Math.abs(t.carryShare - 0.08) < 1e-9);
  const prep = prepareTeamPlayers(traded);
  assert.equal(prep.slots[prep.scrambler].playerId, "nfl-athlete-404", "the starter is the scrambler");
});

test("determinism: same board + shares → identical inputs", () => {
  const d = simStarterDecision(board([{ team: "BAL", state: "WITHHELD_STARTER_NOT_CONFIRMED", reason: "x" }]), "BAL");
  assert.equal(JSON.stringify(playersFromRoleShares(block, injured, starterOptions(d))), JSON.stringify(playersFromRoleShares(block, injured, starterOptions(d))));
});
