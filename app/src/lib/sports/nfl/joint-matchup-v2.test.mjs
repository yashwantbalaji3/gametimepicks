import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateJointMatchup } from "./joint-matchup-v2.mjs";
const roster = [{ playerId: "qb", name: "QB", qbShare: 0.8 }, { playerId: "wr", targetShare: 0.6, catchRate: 0.65, ypr: 12, tdShare: 0.4, tdRushFrac: 0 }, { playerId: "rb", carryShare: 0.6, ypc: 4, tdShare: 0.4, tdRushFrac: 1 }];
const args = { event: { providerEventId: "matchup", home: { abbr: "H" }, away: { abbr: "A" } },
  playersByTeam: { H: roster, A: roster }, artifactDate: "2026-09-08", runs: 300,
  bridge: { lambdaIntercept: 0, lambdaPerPoint: 0.1 }, strengthState: { ratingFor: t => t === "H" ? 1530 : 1500 },
  fit: { gamesim: { marginSlope: 0.05, sigmaMargin: 10, sigmaTotal: 9, muTotal: 46 }, volume: { pass: { a0: 32, a1: -0.1, sigma: 3 }, rush: { a0: 25, a1: 0.1, sigma: 3 } }, dispersion: { recShape: 2, rushShape: 2 }, league: { catchRate: 0.65, ypr: 11, ypc: 4 } } };
test("two-team scorecard uses one shared draw and reconciles every displayed player total", () => {
  const result = simulateJointMatchup({ ...args, diagnostics: true });
  assert.equal(result.state, "SIMULATED", result.reason);
  assert.ok(Math.abs(result.outcome.homeWin + result.outcome.awayWin + result.outcome.tie - 1) < 1e-12);
  const c = result.illustrativeScorecard;
  assert.equal(c.teams.H.team.own, c.teams.A.team.opp);
  for (const [abbr, side] of Object.entries(c.teams)) {
    const sum = key => side.players.reduce((s, p) => s + p[key], 0);
    assert.equal(sum("passYds"), sum("recYds"));
    assert.equal(sum("passTd"), sum("recTd"));
    assert.equal(sum("completions"), sum("receptions"));
    assert.equal(sum("tdCount") * 6 + side.team.conversionPoints + side.team.otherPoints, side.team.own);
    for (const p of side.players) assert.equal(p.passYds, result.sides[abbr].__draws.acc[p.playerId].passYds[c.drawIndex]);
  }
});
test("default output omits draw arrays and refuses missing sides", () => {
  const result = simulateJointMatchup(args);
  assert.equal(result.sides.H.__draws, undefined);
  assert.equal(simulateJointMatchup({ ...args, playersByTeam: { H: roster } }).state, "REFUSED");
  assert.equal(simulateJointMatchup({ ...args, event: { ...args.event, away: { abbr: "H" } } }).state, "REFUSED");
});
