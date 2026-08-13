/**
 * NFL TD-engine guards (Program 169 · Release F).
 * Run: npx tsx --test src/lib/sports/nfl/td-engine.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { teamTdDistribution, anytimeTdProbability, buildScorerBoard, settleAnytimeTd } from "./td-engine.mjs";

const MAPPING = { lambdaPerPoint: 0.11, lambdaIntercept: 0.1, receipt: "FIXTURE (synthetic — a real receipt requires the box-score corpus release)" };

test("points→TD mapping REFUSES without a committed calibration receipt", () => {
  assert.equal(teamTdDistribution({ expectedPoints: 24, mapping: null }).state, "REFUSED");
  assert.equal(teamTdDistribution({ expectedPoints: 24, mapping: { lambdaPerPoint: 0.11, lambdaIntercept: 0.1 } }).state, "REFUSED", "receipt field mandatory");
  const ok = teamTdDistribution({ expectedPoints: 24, mapping: MAPPING });
  assert.equal(ok.state, "OK");
  assert.ok(Math.abs(ok.distribution.reduce((s, p) => s + p, 0) - 1) < 1e-6);
});

test("anytime probability math: share 0 → 0; share 1 → 1 − P(K=0); monotone in share", () => {
  const teamTd = teamTdDistribution({ expectedPoints: 24, mapping: MAPPING });
  assert.equal(anytimeTdProbability({ teamTd, perTdShare: 0 }).probability, 0);
  const full = anytimeTdProbability({ teamTd, perTdShare: 1 }).probability;
  assert.ok(Math.abs(full - (1 - teamTd.distribution[0])) < 1e-6, "share=1 hits iff the team scores any TD");
  const lo = anytimeTdProbability({ teamTd, perTdShare: 0.15 }).probability;
  const hi = anytimeTdProbability({ teamTd, perTdShare: 0.3 }).probability;
  assert.ok(hi > lo);
  assert.equal(anytimeTdProbability({ teamTd, perTdShare: 1.2 }).state, "REFUSED");
});

const EVENT = { providerEventId: "999100", home: { abbr: "CIN" }, away: { abbr: "DET" } };
const SIM = { state: "SIMULATED", scores: { home: { mean: 23.5 }, away: { mean: 20.1 } } };
const POOL = { players: [
  { playerId: "p1", state: "ACTIVE_PROJECTED" },
  { playerId: "p2", state: "ROLE_UNCERTAIN" },
] };
const SHARES = {
  teamPassAttempts: 30, teamRushAttempts: 25,
  players: [
    { playerId: "p1", name: "Back One", perTdShare: 0.25, shareBasis: "snap scenario 0.6 × corpus red-zone share" },
    { playerId: "p2", name: "Wide Two", perTdShare: 0.2, shareBasis: null },
  ],
  residualShare: 0.55, residualLabel: "defense/ST/unlisted",
};

test("scorer board: every gate typed; nothing publishable without participation+basis+price+calibration", () => {
  const board = buildScorerBoard({ event: EVENT, teamAbbr: "CIN", teamSim: SIM, mapping: MAPPING, pool: POOL, roleShares: SHARES, nowIso: "2026-08-13T03:30:00Z" });
  assert.equal(board.state, "BOARD");
  assert.equal(board.counts.publishable, 0, "no authorized prices + no calibration receipt = zero publishable, everyone MODELLED_NOT_PUBLISHABLE");
  const p1 = board.rows.find((r) => r.playerId === "p1");
  assert.equal(p1.gates.participation, "PASS");
  assert.match(p1.gates.scorerPrice, /AUTH_REQUIRED/);
  const p2 = board.rows.find((r) => r.playerId === "p2");
  assert.match(p2.gates.participation, /FAIL\(ROLE_UNCERTAIN\)/);
  assert.match(p2.gates.roleShare, /FAIL/);
  assert.ok(board.residual.share === 0.55 && /ONE scoring event/.test(board.residual.note));
  assert.equal(board.publicActivation, "OFF");
});

test("share incoherence refuses the whole board (forced-100% impossible)", () => {
  const bad = buildScorerBoard({ event: EVENT, teamAbbr: "CIN", teamSim: SIM, mapping: MAPPING, pool: POOL, roleShares: { ...SHARES, residualShare: 0.1 }, nowIso: "2026-08-13T03:30:00Z" });
  assert.equal(bad.state, "REFUSED");
  assert.match(bad.reason, /reconcile to 1/);
  const noSim = buildScorerBoard({ event: EVENT, teamAbbr: "CIN", teamSim: { state: "ABSTAIN" }, mapping: MAPPING, pool: POOL, roleShares: SHARES, nowIso: "x" });
  assert.match(noSim.reason, /never modelled free-floating/);
});

test("settlement: scoring-player credit wins; passer-only credit loses; DNP voids; pending is never a loss", () => {
  const scorers = [
    { playerId: "qb1", creditType: "PASS" },
    { playerId: "wr1", creditType: "RECEIVE" },
  ];
  assert.equal(settleAnytimeTd({ playerId: "wr1", officialScorers: scorers, playerStatus: "PLAYED" }).outcome, "WIN");
  assert.equal(settleAnytimeTd({ playerId: "qb1", officialScorers: scorers, playerStatus: "PLAYED" }).outcome, "LOSS", "the passer is not the scoring player");
  assert.equal(settleAnytimeTd({ playerId: "rb1", officialScorers: scorers, playerStatus: "PLAYED" }).outcome, "LOSS");
  assert.equal(settleAnytimeTd({ playerId: "wr1", officialScorers: scorers, playerStatus: "DNP" }).outcome, "VOID");
  assert.equal(settleAnytimeTd({ playerId: "wr1", officialScorers: null, playerStatus: "PLAYED" }).outcome, "PENDING");
  assert.equal(settleAnytimeTd({ playerId: "wr1", officialScorers: scorers, playerStatus: "POSTPONED" }).outcome, "VOID");
});

test("REAL RECEIPT · the committed scoring bridge loads and unlocks the mapping gate (P170-B)", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { loadScoringBridgeMapping } = await import("./td-engine.mjs");
  const mapping = loadScoringBridgeMapping({ fs: fs.default, path: path.default, cwd: process.cwd() });
  assert.ok(mapping, "the committed receipt exists and parses");
  assert.match(mapping.receipt, /committed calibration receipt/);
  const dist = teamTdDistribution({ expectedPoints: 24, mapping });
  assert.equal(dist.state, "OK");
  assert.ok(dist.lambda > 1.5 && dist.lambda < 4, `λ(24) = ${dist.lambda} in the plausible NFL band`);
});
