import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateJointGame, OTHER } from "./joint-game-sim-v3.mjs";

const fit = {
  gamesim: { marginSlope: 0.05, sigmaMargin: 10, sigmaTotal: 9, muTotal: 48 },
  volume: { pass: { a0: 30, a1: -0.1, sigma: 3 }, rush: { a0: 25, a1: 0.1, sigma: 3 } },
  dispersion: { recShape: 2, rushShape: 2, allocKappa: {}, gameSigma: {} },
  league: { catchRate: 0.65, ypr: 11, ypc: 4 },
};
const args = {
  event: { providerEventId: "correctness-fixture", home: { abbr: "A" }, away: { abbr: "B" }, seasonType: 2 },
  teamAbbr: "A", fit, bridge: { lambdaIntercept: 0, lambdaPerPoint: 0.12 },
  strengthState: { ratingFor: () => 1500 }, artifactDate: "2026-09-08", runs: 400, diagnostics: true,
  players: [
    { playerId: "q1", qbShare: 0.45, carryShare: 0.05, ypc: 4, tdShare: 0.05, tdRushFrac: 1 },
    { playerId: "q2", qbShare: 0.35, carryShare: 0.05, ypc: 4, tdShare: 0.05, tdRushFrac: 1 },
    { playerId: "r1", targetShare: 0.65, catchRate: 0.7, ypr: 12, tdShare: 0.6, tdRushFrac: 0 },
    { playerId: "b1", carryShare: 0.6, ypc: 4, targetShare: 0.1, catchRate: 0.7, ypr: 6, tdShare: 0.2, tdRushFrac: 0.8 },
  ],
};

test("multi-QB passing touchdowns are whole counts per draw", () => {
  const sim = simulateJointGame(args);
  assert.equal(sim.state, "SIMULATED", sim.reason);
  for (const id of ["q1", "q2"]) {
    assert.ok(sim.__draws.acc[id].passTd.every(Number.isInteger), `${id} has fractional passing TDs`);
  }
});

test("a zero-catch, zero-carry scorer cannot receive an offensive touchdown", () => {
  const sim = simulateJointGame({ ...args, players: [
    { playerId: "q", qbShare: 1 },
    { playerId: "r", targetShare: 1, catchRate: 0, ypr: 10, tdShare: 1, tdRushFrac: 0 },
  ] });
  assert.equal(sim.state, "SIMULATED", sim.reason);
  assert.ok(sim.__draws.acc.r.tdCount.every(v => v === 0), "TDs assigned without a touch");
});

test("every draw reconciles named and unallocated passing, receiving, rushing and scoring", () => {
  const sim = simulateJointGame(args);
  assert.equal(sim.state, "SIMULATED", sim.reason);
  const { acc, teamAcc: t } = sim.__draws;
  for (let i = 0; i < sim.runs; i++) {
    const sum = k => Object.values(acc).reduce((s, p) => s + p[k][i], 0);
    assert.equal(sum("passAtt"), t.passAtt[i]);
    assert.equal(sum("targets"), t.passAtt[i]);
    assert.equal(sum("completions"), sum("receptions"));
    assert.equal(sum("passYds"), sum("recYds"));
    assert.equal(sum("passTd"), sum("recTd"));
    assert.equal(sum("rushTd") + sum("recTd"), t.offTd[i]);
    assert.equal(sum("carries"), t.rushAtt[i]);
    assert.equal(t.offTd[i] * 6 + t.conversionPoints[i] + t.otherPoints[i], t.own[i]);
    for (const p of Object.values(acc)) {
      assert.ok(p.completions[i] <= p.passAtt[i]);
      assert.ok(p.recTd[i] <= p.receptions[i]);
      assert.ok(p.rushTd[i] <= p.carries[i]);
    }
  }
  assert.ok(acc[OTHER].passYds.some(v => v > 0), "other QB passing is not stolen by named QBs");
});

test("no named passer preserves all team passing in OTHER", () => {
  const sim = simulateJointGame({ ...args, players: args.players.filter(p => !p.qbShare) });
  assert.equal(sim.state, "SIMULATED", sim.reason);
  assert.deepEqual(sim.__draws.acc[OTHER].passYds, sim.__draws.teamAcc.passYds);
});

test("seeded replay is input-order invariant and pairs both team score streams", () => {
  const a = simulateJointGame(args);
  const b = simulateJointGame({ ...args, players: [...args.players].reverse() });
  assert.equal(JSON.stringify(a), JSON.stringify(b)); // summary read-out closures are not data
  assert.deepEqual(a.__draws, b.__draws);
  const other = simulateJointGame({ ...args, teamAbbr: "B" });
  assert.deepEqual(a.__draws.teamAcc.own, other.__draws.teamAcc.opp);
  assert.deepEqual(a.__draws.teamAcc.opp, other.__draws.teamAcc.own);
});

test("invalid identities, shares, rates and runs refuse rather than publishing NaN", () => {
  for (const override of [
    { players: [...args.players, args.players[0]] },
    { players: [{ playerId: "a", qbShare: 1 }, { playerId: "b", qbShare: 1 }] },
    { players: [{ playerId: "a", catchRate: NaN }] },
    { runs: 0 }, { runs: 1.5 },
  ]) assert.equal(simulateJointGame({ ...args, ...override }).state, "REFUSED");
});

test("accepted target-share deflation frees mass to OTHER without losing team attempts", () => {
  const base = simulateJointGame(args);
  const adjusted = simulateJointGame({ ...args, fit: { ...fit, dispersion: { ...fit.dispersion, targetShareDeflation: 0.5 } } });
  assert.equal(adjusted.state, "SIMULATED", adjusted.reason);
  const sum = xs => xs.reduce((a, b) => a + b, 0);
  assert.ok(sum(adjusted.__draws.acc[OTHER].targets) > sum(base.__draws.acc[OTHER].targets));
  for (const value of [0, -1, 1.1, NaN]) {
    assert.equal(simulateJointGame({ ...args, fit: { ...fit, dispersion: { ...fit.dispersion, targetShareDeflation: value } } }).state, "REFUSED");
  }
});
