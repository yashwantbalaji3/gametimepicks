/**
 * Role-share guards (Program 171 · Release A): estimator math, stint discipline, allocation
 * coherence, the committed walk-forward receipt, and the current-team artifact — plus the
 * separation proof that historical roles never leak into participation states.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  SHARE_FAMILIES, familyNumerator, teamGameTotals, segmentStints, decayedShare,
  tvDistance, predictAllocation, realizedAllocation, validateShareBlock,
} from "./role-shares.mjs";
import { buildScorerBoard, loadScoringBridgeMapping } from "./td-engine.mjs";

const ROOT = path.join(process.cwd(), "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

test("familyNumerator: absent stat groups are zero, never NaN; scorerTd = rushTd + recTd", () => {
  const bare = { playerId: "nfl-athlete-1", teamAbbr: "CIN" };
  for (const fam of SHARE_FAMILIES) assert.equal(familyNumerator(bare, fam), 0);
  assert.equal(familyNumerator({ rushTd: 1, recTd: 2 }, "scorerTd"), 3);
  assert.equal(familyNumerator({ rushTd: null, recTd: 2 }, "scorerTd"), 2);
  assert.throws(() => familyNumerator(bare, "firstTd"), /closed/);
});

test("segmentStints: a team change starts a new stint (effective-dated membership)", () => {
  const stints = segmentStints([
    { teamAbbr: "CIN", dateUtc: "2024-09-01T00:00Z" },
    { teamAbbr: "CIN", dateUtc: "2024-09-08T00:00Z" },
    { teamAbbr: "NYJ", dateUtc: "2024-10-01T00:00Z" },
    { teamAbbr: "CIN", dateUtc: "2025-09-01T00:00Z" },
  ]);
  assert.equal(stints.length, 3);
  assert.deepEqual(stints.map((s) => s.teamAbbr), ["CIN", "NYJ", "CIN"]);
  assert.equal(stints[0].games.length, 2);
});

test("decayedShare: shrinks toward zero, decays old games, discounts season boundaries", () => {
  const obs = [{ share: 0.5, season: 2024 }, { share: 0.5, season: 2024 }];
  const noShrink = decayedShare({ observations: obs, predictSeason: 2024, halfLifeGames: Infinity, shrinkK: 0, boundaryDecay: 1 });
  assert.ok(Math.abs(noShrink.share - 0.5) < 1e-12);
  const shrunk = decayedShare({ observations: obs, predictSeason: 2024, halfLifeGames: Infinity, shrinkK: 1, boundaryDecay: 1 });
  assert.ok(shrunk.share < 0.5, "pseudo-weight must pull uncertain shares toward zero (mass flows to OTHER)");
  const crossSeason = decayedShare({ observations: obs, predictSeason: 2026, halfLifeGames: Infinity, shrinkK: 1, boundaryDecay: 0.25 });
  assert.ok(crossSeason.share < shrunk.share, "two crossed boundaries must discount evidence further");
  const empty = decayedShare({ observations: [], predictSeason: 2026, halfLifeGames: 4, shrinkK: 0, boundaryDecay: 1 });
  assert.equal(empty.share, 0);
});

test("predictAllocation: over-allocated rosters renormalize; OTHER is never negative", () => {
  const history = [
    ["a", [{ share: 0.9, season: 2025 }]],
    ["b", [{ share: 0.8, season: 2025 }]],
  ];
  const out = predictAllocation({ history, predictSeason: 2025, params: { halfLifeGames: Infinity, shrinkK: 0, boundaryDecay: 1 } });
  const sum = Object.values(out.shares).reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(out.other, 0);
});

test("tvDistance: 0 on identical allocations, 1 on disjoint ones", () => {
  assert.equal(tvDistance({ a: 0.6, OTHER: 0.4 }, { a: 0.6, OTHER: 0.4 }), 0);
  assert.equal(tvDistance({ a: 1 }, { b: 1 }), 1);
});

test("realizedAllocation: unseen players fold into OTHER; zero-opportunity games typed empty", () => {
  const rows = [
    { playerId: "known", teamAbbr: "CIN", targets: 6 },
    { playerId: "rookie", teamAbbr: "CIN", targets: 4 },
  ];
  const real = realizedAllocation({ rows, family: "targets", knownPlayerIds: new Set(["known"]) });
  assert.ok(Math.abs(real.shares.known - 0.6) < 1e-12);
  assert.ok(Math.abs(real.other - 0.4) < 1e-12);
  assert.equal(realizedAllocation({ rows: [], family: "targets", knownPlayerIds: new Set() }).empty, true);
});

test("validateShareBlock: refuses missing residual, incoherent sums, and basis-less rows", () => {
  const good = { players: [{ playerId: "a", share: 0.6, shareBasis: "corpus-role …" }], residual: { label: "OTHER", share: 0.4 } };
  assert.equal(validateShareBlock(good).ok, true);
  assert.equal(validateShareBlock({ players: good.players, residual: {} }).ok, false);
  assert.equal(validateShareBlock({ players: good.players, residual: { share: 0.5 } }).ok, false, "Σ shares + residual ≠ 1 must refuse");
  assert.equal(validateShareBlock({ players: [{ playerId: "a", share: 0.6 }], residual: { share: 0.4 } }).ok, false, "a row without a source-backed basis must refuse");
});

// ------------------------------------------------------------------ committed receipt + artifact
test("committed walk-forward receipt: pinned corpus, selection on 2023-24 only, held-out 2025 beats baselines", () => {
  const receipt = read("data/internal/research/nfl/reports/role-shares-v1.json");
  const bridge = read("data/internal/research/nfl/reports/scoring-bridge-v1.json");
  const pinned = new Map(bridge.corpusAccounting.map((a) => [a.season, a.contentHash]));
  for (const s of receipt.corpusAccounting) assert.equal(s.contentHash, pinned.get(s.season), `season ${s.season} must derive from the exact bridge corpus bytes`);
  assert.match(receipt.protocol.selection, /2023–24/);
  assert.match(receipt.protocol.selection, /preseason never fits/);
  const model = receipt.heldOut2025.model;
  assert.ok(model.n > 2000, `held-out eval must cover the 2025 season (n=${model.n})`);
  for (const [name, base] of Object.entries(receipt.heldOut2025.baselines)) {
    assert.ok(model.overall < base.overall, `model overall TV ${model.overall} must beat ${name} ${base.overall}`);
  }
  // per-family honesty: rushing/receiving/scorer roles beat every baseline; passAttempts is a
  // recorded statistical tie with last-game (same starter starts) — never claim it as a win.
  for (const fam of ["rushAttempts", "targets", "scorerTd"]) {
    for (const base of Object.values(receipt.heldOut2025.baselines)) {
      assert.ok(model.perFamily[fam] < base.perFamily[fam], `${fam} must beat every baseline`);
    }
  }
});

test("current role-share artifact: every team/family block reconciles with a mandatory residual", () => {
  const current = read("data/internal/research/nfl/role-shares-v1/current.json");
  const teams = Object.keys(current.teams);
  assert.equal(teams.length, 32);
  for (const team of teams) {
    for (const fam of SHARE_FAMILIES) {
      const check = validateShareBlock(current.teams[team][fam]);
      assert.equal(check.ok, true, `${team}/${fam}: ${check.errors?.join("; ")}`);
    }
    const vol = current.teams[team].expectedTeamVolume;
    assert.ok(vol.passAttempts > 20 && vol.passAttempts < 60, `${team} pass volume ${vol.passAttempts} implausible`);
    assert.ok(vol.rushAttempts > 12 && vol.rushAttempts < 50, `${team} rush volume ${vol.rushAttempts} implausible`);
  }
  assert.equal(current.predictSeason, 2026);
  assert.match(current.params.receipt, /role-shares-v1\.json/);
});

test("corruption: inflating one committed share breaks the block's reconciliation", () => {
  const current = read("data/internal/research/nfl/role-shares-v1/current.json");
  const block = JSON.parse(JSON.stringify(current.teams.CIN.targets));
  block.players[0].share += 0.05;
  assert.equal(validateShareBlock(block).ok, false, "the guard must fail on a deliberately corrupted share");
});

test("separation proof: corpus roles + preseason pool ⇒ modelled yet unpublishable scorer rows", () => {
  const current = read("data/internal/research/nfl/role-shares-v1/current.json");
  const cin = current.teams.CIN;
  const roleShares = {
    players: cin.scorerTd.players.map((p) => ({ playerId: p.playerId, name: p.name, perTdShare: p.share, shareBasis: p.shareBasis })),
    teamPassAttempts: cin.expectedTeamVolume.passAttempts,
    teamRushAttempts: cin.expectedTeamVolume.rushAttempts,
    residualShare: cin.scorerTd.residual.share,
    residualLabel: cin.scorerTd.residual.label,
  };
  const mapping = loadScoringBridgeMapping({ fs, path, cwd: process.cwd() });
  assert.ok(mapping?.receipt, "the committed scoring-bridge receipt must load");
  const board = buildScorerBoard({
    event: { providerEventId: "401873272", home: { abbr: "CIN" }, away: { abbr: "DET" } },
    teamAbbr: "CIN",
    teamSim: { state: "SIMULATED", scores: { home: { mean: 21.5 }, away: { mean: 20.1 } } },
    mapping,
    pool: { players: cin.scorerTd.players.map((p) => ({ playerId: p.playerId, state: "ROLE_UNCERTAIN" })) },
    roleShares,
    nowIso: "2026-08-13T05:20:00Z",
  });
  assert.equal(board.state, "BOARD", `role shares must reconcile inside the engine (got ${board.reason ?? board.state})`);
  assert.equal(board.counts.publishable, 0, "preseason ROLE_UNCERTAIN must keep every row unpublishable — roles are never participation");
  assert.ok(board.rows.every((r) => r.state === "MODELLED_NOT_PUBLISHABLE"));
  assert.ok(board.rows.every((r) => r.gates.roleShare === "PASS"), "corpus-derived shares carry a source-backed basis");
});
