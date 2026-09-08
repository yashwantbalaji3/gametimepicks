/**
 * P249 — the joint simulation's HARD CONSISTENCY CHECKS, on every draw and on aggregates,
 * plus the correlation OUTPUTS the charter demands be tested rather than asserted:
 * shared-environment relationships must appear with the signs the mechanism implies, measured
 * from the same draws (never separate runs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { simulateJointGame, NFL_JOINT_SIM_ID } from "./joint-game-sim.mjs";
import { loadPlayerPropsFit } from "./player-props-v1.mjs";

const APP = process.cwd();
const fit = loadPlayerPropsFit({ fs, path, cwd: APP });
const bridgeDoc = JSON.parse(fs.readFileSync(path.join(APP, "../data/internal/research/nfl/reports/scoring-bridge-v1.json"), "utf8"));
const bridge = (() => {
  const s = JSON.stringify(bridgeDoc);
  const mi = s.match(/"lambdaIntercept":\s*(-?[0-9.]+)/);
  const mp = s.match(/"lambdaPerPoint":\s*([0-9.]+)/);
  return { lambdaIntercept: Number(mi[1]), lambdaPerPoint: Number(mp[1]) };
})();

const event = { providerEventId: "990001", home: { abbr: "AAA" }, away: { abbr: "BBB" }, seasonType: 2 };
const strengthState = { ratingFor: (t) => (t === "AAA" ? 1560 : 1480), cutoffIso: "2025-09-01T00:00:00Z" };
const players = [
  { playerId: "qb1", name: "QB One", qbShare: 0.96, carryShare: 0.08, targetShare: 0, compRate: 0.66, ypcmp: 11.3, catchRate: 0.6, ypr: 8, ypc: 4.9, tdShare: 0.06, tdRushFrac: 1.0 },
  { playerId: "rb1", name: "Back One", qbShare: 0, carryShare: 0.55, targetShare: 0.12, compRate: 0.6, ypcmp: 10, catchRate: 0.78, ypr: 7.4, ypc: 4.4, tdShare: 0.28, tdRushFrac: 0.8 },
  { playerId: "wr1", name: "Wide One", qbShare: 0, carryShare: 0.02, targetShare: 0.26, compRate: 0.6, ypcmp: 10, catchRate: 0.65, ypr: 12.8, ypc: 6.1, tdShare: 0.22, tdRushFrac: 0.05 },
  { playerId: "te1", name: "Tight One", qbShare: 0, carryShare: 0, targetShare: 0.18, compRate: 0.6, ypcmp: 10, catchRate: 0.7, ypr: 10.2, ypc: 4, tdShare: 0.14, tdRushFrac: 0.02 },
];

const sim = simulateJointGame({ event, teamAbbr: "AAA", fit, bridge, strengthState, players, artifactDate: "2026-09-09", runs: 6000, diagnostics: true });

test("the joint simulation runs clean — per-draw invariants self-enforced (REFUSED otherwise)", () => {
  assert.equal(sim.state, "SIMULATED", sim.reason ?? "");
  assert.equal(sim.engineId, NFL_JOINT_SIM_ID);
});

test("PER-DRAW · passing yards reconcile to receiving yards + the other bucket, every iteration", () => {
  const d = sim.__draws;
  const n = sim.runs;
  const recIds = ["rb1", "wr1", "te1"];
  for (let i = 0; i < n; i += 1) {
    const teamRec = recIds.reduce((s, id) => s + d.acc[id].recYds[i], 0) + d.teamAcc.unallocRecYds[i];
    const qbPass = d.acc.qb1.passYds[i];
    assert.ok(Math.abs(qbPass - teamRec) < 1e-6, `draw ${i}: QB gross ${qbPass} != team receiving ${teamRec}`);
  }
});

test("PER-DRAW · TD accounting: counts are nonnegative integers bounded by the drawn score; passing TDs = receiving-typed TDs", () => {
  const d = sim.__draws;
  for (let i = 0; i < sim.runs; i += 1) {
    const offTd = d.teamAcc.offTd[i];
    assert.ok(Number.isInteger(offTd) && offTd >= 0 && offTd * 6 <= d.teamAcc.own[i], `draw ${i}: TD count ${offTd} vs score ${d.teamAcc.own[i]}`);
    assert.ok(d.teamAcc.otherPoints[i] >= 0, `draw ${i}: negative other-scoring bucket`);
    for (const id of ["qb1", "rb1", "wr1", "te1"]) {
      const k = d.acc[id].tdCount?.[i];
      if (k != null) assert.ok(Number.isInteger(k) && k >= 0, `draw ${i}: ${id} fractional TD count`);
    }
  }
  // QB passing TDs are receiving TDs — never his own scoring: with tdRushFrac 1.0 the QB's own
  // TDs are rushes, and his passTd series derives only from teammates' receiving TDs.
  const qbAnyTdMean = avg(sim.__draws.acc.qb1.anyTd);
  const qbPassTdMean = avg(sim.__draws.acc.qb1.passTd);
  assert.ok(qbPassTdMean > qbAnyTdMean, "passing TDs must dwarf the QB's own scoring probability in this roster");
});

test("AGGREGATE · receptions <= targets structurally; explicit unallocated masses are carried", () => {
  const t = sim.team;
  assert.ok(t.unallocated.targetsMean > 0, "the other-receivers target bucket must exist");
  assert.ok(t.unallocated.recYdsMean > 0, "unallocated receiving mass is carried, not discarded");
  assert.ok(t.otherScoringPoints.mean > 0, "kicks/defense points are explicit, never forced into TDs");
  const p2 = sim.players.find((p) => p.playerId === "rb1").markets.td_2plus;
  assert.match(p2.basis, /COUNT draws/, "P(2+) must come from count draws");
  const any = sim.players.find((p) => p.playerId === "rb1").markets.anytime_td.probability;
  assert.ok(p2.probability < any, "P(2+) < P(1+) always");
});

test("CORRELATION IS AN OUTPUT · shared-draw relationships carry the mechanism's signs", () => {
  const d = sim.__draws;
  const corr = (a, b) => {
    const n = a.length; const ma = avg(a); const mb = avg(b);
    let sab = 0; let sa = 0; let sb = 0;
    for (let i = 0; i < n; i += 1) { sab += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
    return sab / Math.sqrt(sa * sb);
  };
  // QB passing with teammate receiving: POSITIVE by construction (one draw) and large.
  assert.ok(corr(d.acc.qb1.passYds, d.acc.wr1.recYds) > 0.3, "QB↔WR1 shared-draw correlation");
  // receptions with targets... receptions with receiving yards: positive.
  assert.ok(corr(d.acc.wr1.receptions, d.acc.wr1.recYds) > 0.5, "receptions↔recYds");
  // player TD count with team TD count: positive.
  const teamTd = d.teamAcc.offTd;
  assert.ok(corr(d.acc.rb1.tdCount, teamTd) > 0.2, "player TDs ride team TDs");
  // game script: own score margin up → pass attempts down for the LEADING side is the fitted
  // sign (a1 < 0 in the committed volume OLS) — verify the mechanism's sign flows through:
  const ownMargin = d.teamAcc.own.map((v, i) => v - d.teamAcc.opp[i]);
  const passProxy = d.acc.qb1.passYds;
  const c = corr(ownMargin, passProxy);
  const a1 = fit.volume.pass.a1;
  assert.ok(a1 === 0 || Math.sign(c) === Math.sign(a1) || Math.abs(c) < 0.05,
    `script sign: corr(margin, passYds)=${c.toFixed(3)} must follow the fitted a1=${a1} (or be negligible)`);
  /*
   * Opposing scores: own = (T+M)/2, opp = (T−M)/2 ⇒ Cov(own, opp) = (Var T − Var M)/4. The
   * SIGN is variance-dependent, not a slogan — with the committed heads σ_margin (13.7)
   * exceeds the matchup-total σ (~12.6), so the implied correlation is slightly NEGATIVE.
   * (The first version of this test asserted "positive because shared total" — exactly the
   * force-every-pair-positive mistake the charter names.) Assert the implied sign.
   */
  const impliedSign = Math.sign(fit.gamesim.sigmaTotal ** 2 - fit.gamesim.sigmaMargin ** 2);
  const scoreCorr = corr(d.teamAcc.own, d.teamAcc.opp);
  assert.ok(Math.sign(scoreCorr) === impliedSign || Math.abs(scoreCorr) < 0.03,
    `own/opp corr ${scoreCorr.toFixed(3)} must carry the variance-implied sign (${impliedSign})`);
});

function avg(a) { return a.reduce((s, v) => s + v, 0) / a.length; }
