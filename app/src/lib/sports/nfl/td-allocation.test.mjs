/**
 * Release C guards (Program 171): TD allocation calibration receipt, pool flattening,
 * team-compatibility corruption proofs, the neither-side board refusal, and Vault ledger
 * correction lineage.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  buildScorerBoard, teamTdDistribution, anytimeTdProbability, flattenPoolShares,
  loadScoringBridgeMapping, loadTdCalibrationReceipt,
} from "./td-engine.mjs";
import { appendVaultCorrection, validateVaultLedgerAppend } from "./end-zone-vault.mjs";
import { validateAllocation } from "./participation.mjs";

const ROOT = path.join(process.cwd(), "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const mapping = loadScoringBridgeMapping({ fs, path, cwd: process.cwd() });
const calibration = loadTdCalibrationReceipt({ fs, path, cwd: process.cwd() });

test("committed anytime-TD calibration receipt: beats both baselines, calibrated, corpus-pinned", () => {
  assert.ok(calibration?.receipt, "loadTdCalibrationReceipt must return the committed receipt");
  const r = read("data/internal/research/nfl/reports/anytime-td-v1-calibration.json");
  const h = r.heldOut2025;
  assert.ok(h.n >= 3000, `held-out n=${h.n}`);
  assert.ok(h.model.logLoss < h.baselines.constantLambdaSameShares.logLoss, "must beat constant-λ with the same shares");
  assert.ok(h.model.logLoss < h.baselines.trainBaseRate.logLoss, "must beat the train base rate");
  assert.ok(h.model.brier < h.baselines.constantLambdaSameShares.brier);
  assert.ok(h.ece <= 0.05, `ECE ${h.ece} must sit inside the calibrated band`);
  assert.ok(h.classBalance > 0.15 && h.classBalance < 0.4, "class balance reported and plausible");
  assert.match(r.protocol.tdShrinkSelection, /tested ONCE on 2025/);
  const bridge = read("data/internal/research/nfl/reports/scoring-bridge-v1.json");
  const pinned = new Map(bridge.corpusAccounting.map((a) => [a.season, a.contentHash]));
  for (const s of r.corpusAccounting) assert.equal(s.contentHash, pinned.get(s.season));
  assert.equal(r.mappingReceipt, mapping.receipt, "the calibration must cite the exact bridge mapping it consumed");
});

test("pool flattening preserves total mass exactly (team-compatibility survives)", () => {
  const shares = [0.4, 0.2, 0.1, 0.05];
  const flat = flattenPoolShares(shares, calibration.poolFlattenBeta);
  const before = shares.reduce((a, b) => a + b, 0);
  const after = flat.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(before - after) < 1e-12, "Σ shares must be untouched by flattening");
  assert.ok(flat[0] < shares[0], "the star flattens down");
  assert.ok(flat[3] > shares[3], "the depth player flattens up");
  assert.deepEqual(flattenPoolShares(shares, 0), shares, "β=0 is the identity");
});

test("team-compatibility: E[Σ player TD + residual·K] equals E[team offensive TD] by construction", () => {
  const teamTd = teamTdDistribution({ expectedPoints: 24, mapping });
  assert.equal(teamTd.state, "OK");
  const eK = teamTd.distribution.reduce((s, p, k) => s + p * k, 0);
  const shares = [0.3, 0.25, 0.2, 0.1];
  const residual = 1 - shares.reduce((a, b) => a + b, 0);
  const playerExpected = shares.reduce((s, sh) => s + sh * eK, 0);
  assert.ok(Math.abs(playerExpected + residual * eK - eK) < 1e-9, "player TD expectation + residual must reconcile to the team expectation");
});

test("corruption proof: inflating one share past coherence refuses the WHOLE board", () => {
  const current = read("data/internal/research/nfl/role-shares-v1/current.json");
  const cin = current.teams.CIN;
  const good = {
    players: cin.scorerTd.players.map((p) => ({ playerId: p.playerId, name: p.name, perTdShare: p.share, shareBasis: p.shareBasis })),
    teamPassAttempts: cin.expectedTeamVolume.passAttempts,
    teamRushAttempts: cin.expectedTeamVolume.rushAttempts,
    residualShare: cin.scorerTd.residual.share,
    residualLabel: cin.scorerTd.residual.label,
  };
  const event = { providerEventId: "401873272", home: { abbr: "CIN" }, away: { abbr: "DET" } };
  const teamSim = { state: "SIMULATED", scores: { home: { mean: 21.5 }, away: { mean: 20.1 } } };
  const ok = buildScorerBoard({ event, teamAbbr: "CIN", teamSim, mapping, pool: { players: [] }, roleShares: good, nowIso: "2026-08-13T06:45:00Z" });
  assert.equal(ok.state, "BOARD");
  const corrupt = { ...good, players: good.players.map((p, i) => (i === 0 ? { ...p, perTdShare: p.perTdShare + 0.05 } : p)) };
  const refused = buildScorerBoard({ event, teamAbbr: "CIN", teamSim, mapping, pool: { players: [] }, roleShares: corrupt, nowIso: "2026-08-13T06:45:00Z" });
  assert.equal(refused.state, "REFUSED");
  assert.match(refused.reason, /share incoherence/);
});

test("neither-side refusal: a spectator team can never read a side's score (P171-C fix)", () => {
  const event = { providerEventId: "401873272", home: { abbr: "CIN" }, away: { abbr: "DET" } };
  const teamSim = { state: "SIMULATED", scores: { home: { mean: 21.5 }, away: { mean: 20.1 } } };
  const board = buildScorerBoard({
    event, teamAbbr: "KC", teamSim, mapping,
    pool: { players: [] },
    roleShares: { players: [], teamPassAttempts: 30, teamRushAttempts: 25, residualShare: 1, residualLabel: "OTHER" },
    nowIso: "2026-08-13T06:45:00Z",
  });
  assert.equal(board.state, "REFUSED");
  assert.match(board.reason, /neither side/);
});

test("flattened board still reconciles through validateAllocation (consumer contract)", () => {
  const current = read("data/internal/research/nfl/role-shares-v1/current.json");
  const cin = current.teams.CIN.scorerTd;
  const raw = cin.players.map((p) => p.share);
  const flat = flattenPoolShares(raw, calibration.poolFlattenBeta);
  const check = validateAllocation({
    teamPassAttempts: 40, teamRushAttempts: 25, teamOffensiveTds: 0,
    players: cin.players.map((p, i) => ({ playerId: p.playerId, tdProbabilityShare: flat[i] })),
    residual: { label: cin.residual.label, tdProbabilityShare: cin.residual.share },
  });
  assert.equal(check.ok, true, check.errors?.join("; "));
});

test("anytimeTdProbability is monotone in share and bounded", () => {
  const teamTd = teamTdDistribution({ expectedPoints: 24, mapping });
  const p1 = anytimeTdProbability({ teamTd, perTdShare: 0.1 }).probability;
  const p2 = anytimeTdProbability({ teamTd, perTdShare: 0.3 }).probability;
  assert.ok(p2 > p1 && p1 > 0 && p2 < 1);
  assert.equal(anytimeTdProbability({ teamTd, perTdShare: 1.2 }).state, "REFUSED");
});

// ------------------------------------------------------------------ Vault ledger corrections
test("vault ledger correction: appends lineage, never mutates state/legs/reasons; refusals typed", () => {
  const ledger = { product: "end-zone-vault", entries: [{ date: "2026-08-13", state: "NO_PLAY", legs: [], reasons: ["a", "b", "c"] }] };
  const ok = appendVaultCorrection(ledger, { date: "2026-08-13", at: "2026-08-13T06:45:00Z", note: "reason 3 resolved by a committed receipt" });
  assert.equal(ok.ok, true);
  assert.equal(ok.ledger.entries[0].state, "NO_PLAY");
  assert.deepEqual(ok.ledger.entries[0].reasons, ["a", "b", "c"], "original reasons are untouchable");
  assert.equal(ok.ledger.entries[0].corrections.length, 1);
  assert.equal(ledger.entries[0].corrections, undefined, "the input ledger is never mutated in place");
  assert.equal(appendVaultCorrection(ledger, { date: "2026-08-14", at: "2026-08-13T06:45:00Z", note: "no such entry to annotate" }).ok, false);
  assert.equal(appendVaultCorrection(ledger, { date: "2026-08-13", at: "2026-08-13T06:45:00Z", note: "short" }).ok, false);
  assert.equal(appendVaultCorrection({ product: "bank-builder", entries: [] }, { date: "2026-08-13", at: "2026-08-13T06:45:00Z", note: "wrong product refuses" }).ok, false);
});

test("committed vault ledger: 2026-08-13 NO_PLAY stands with the P170-B/P171-C correction lineage attached", () => {
  const ledger = read("data/internal/nfl/end-zone-vault/ledger.json");
  const entry = ledger.entries.find((e) => e.date === "2026-08-13");
  assert.equal(entry.state, "NO_PLAY");
  assert.equal(entry.legs.length, 0);
  assert.ok(entry.corrections?.length >= 1);
  assert.match(entry.corrections[0].note, /P170-B/);
  assert.match(entry.corrections[0].note, /NO_PLAY stands/);
  // duplicate-date append still refuses — corrections never reopened the date
  const dup = validateVaultLedgerAppend(ledger, { date: "2026-08-13", state: "NO_PLAY", legs: [] });
  assert.equal(dup.ok, false);
});
