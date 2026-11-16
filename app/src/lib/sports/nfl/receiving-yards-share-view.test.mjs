/**
 * N8 receiving-yards parity fix — regression guards. Small frozen fixtures only: no live slate, no wall clock.
 *
 *   (a) a fixture team whose listed target shares sum above 1: the served path (current.json) reproduces the defect —
 *       every receiver scaled by 1/Σroster — and the receiving-yards view restores the evaluator's raw share;
 *   (b) every other role-share consumer is byte-identical: the role-share builder is untouched, the view script never
 *       writes current.json, no served-series fingerprint component moves, and the merge leaves every
 *       non-receiving-yards market (receptions included) untouched;
 *   (c) team coherence: Σ shares + residual = 1, Σ expected targets ≤ expected pass attempts, per simulated game too;
 *   (d) served receiving yards ≈ targets × catch rate × yards per catch under the run's own inputs;
 *   (e) the pipeline version / qualification fields are present and claim no forward validation;
 *   (f) series identity: the served series keeps grading pre-fix boards and never counts a post-fix one; the fix is
 *       its own series.
 *
 * Builders are spawned with process.execPath on .mjs files that import only .mjs (never a .ts import).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

import {
  viewBlockFromRaw, receivingYardsShares, expectedTargets, composeReceivingYardsRoleRates, mergeReceivingYards,
  receivingYardsPipelineOf, RECYDS_PIPELINE_VERSION, RECYDS_QUALIFICATION,
} from "./receiving-yards-share-view.mjs";
import { decayedShare } from "./role-shares.mjs";
import { simulatePlayerProps, loadPlayerPropsFit, allocateOpportunities } from "./player-props-v1.mjs";
import { mulberry32 } from "./game-sim.mjs";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const THRESH = { qbShare: 0.3, carryShare: 0.05, targetShare: 0.05 }; // run-nfl-event-window.mjs / evaluator THRESH
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const readText = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
/* s1 froze whole files (incl. the orchestrator); s2 (the served series) freezes components — both are committed data. */
const S1_PROTOCOL = JSON.parse(readText("data/internal/research/nfl/reports/player-props-v1-reception-yds-forward-protocol.json"));
const FIX_PROTOCOL_PATH = "data/internal/research/nfl/reports/player-props-v1-reception-yds-forward-protocol-s4-r2.json";
const REPORTS = path.join(ROOT, "data/internal/research/nfl/reports");
/** Every registered, still-active receiving-yards series other than the fix's own (the served one(s)). */
const servedProtocols = () => fs.readdirSync(REPORTS).filter((f) => /^player-props-v1-reception-yds-forward-protocol.*\.json$/.test(f))
  .map((f) => ({ path: `data/internal/research/nfl/reports/${f}`, doc: JSON.parse(fs.readFileSync(path.join(REPORTS, f), "utf8")) }))
  .filter((p) => p.path !== FIX_PROTOCOL_PATH && !p.doc.status);
const s1Sha = (p) => S1_PROTOCOL.model.frozenFiles.find((f) => f.path === p).sha256;

// ── frozen fixture corpus: one team (AAA) whose listed shares sum above 1, its four 2026 games ───────────────────
const ROSTER_ABBRS = ["AAA", "BBB", ...Array.from({ length: 30 }, (_, i) => `T${String(i + 3).padStart(2, "0")}`)];
const AAA = { QB1: 101, WR1: 102, WR2: 103, TE1: 104, RB1: 105, ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`D${i + 1}`, 110 + i])) };
const BBB = { QB9: 201, WR9: 202, RB9: 203 };
const POS = { QB1: "QB", WR1: "WR", WR2: "WR", TE1: "TE", RB1: "RB", QB9: "QB", WR9: "WR", RB9: "RB" };
const row = (team, ids, key, s) => ({ playerId: `nfl-athlete-${ids[key]}`, name: key, teamAbbr: team, passAtt: 0, passCmp: 0, passYds: 0, passInt: 0, rushAtt: 0, rushYds: 0, targets: 0, rec: 0, recYds: 0, rushTd: 0, recTd: 0, ...s });
const fixtureGames = [1, 2, 3, 4].map((week) => {
  const aaa = [
    row("AAA", AAA, "QB1", { passAtt: 34, passCmp: 22, passYds: 240 }),
    row("AAA", AAA, "WR1", { targets: 9, rec: 6, recYds: 81 }),
    row("AAA", AAA, "TE1", { targets: 5, rec: 4, recYds: 40, recTd: week === 2 ? 1 : 0 }),
    row("AAA", AAA, "RB1", { rushAtt: 18, rushYds: 77, targets: 3, rec: 2, recYds: 14, rushTd: week === 3 ? 1 : 0 }),
    /* WR2 played weeks 1–2 and stays rostered (injured): shares from games played keep him listed. */
    ...(week <= 2 ? [row("AAA", AAA, "WR2", { targets: 9, rec: 5, recYds: 66 })] : []),
    /* depth receivers: one target each in one game — listed (≥ MIN_SHARE 0.005), never modelled (< 0.05). */
    ...[1, 2, 3].map((k) => row("AAA", AAA, `D${(week - 1) * 3 + k}`, { targets: 1, rec: 1, recYds: 6 })),
  ];
  const bbb = [
    row("BBB", BBB, "QB9", { passAtt: 30, passCmp: 19, passYds: 210 }),
    row("BBB", BBB, "WR9", { targets: 10, rec: 6, recYds: 70 }),
    row("BBB", BBB, "RB9", { rushAtt: 22, rushYds: 90, targets: 4, rec: 3, recYds: 20 }),
  ];
  return { providerEventId: `fx-${week}`, dateUtc: `2026-09-${String(6 + 7 * (week - 1)).padStart(2, "0")}T17:00:00Z`, season: 2026, seasonType: 2, week, players: [...aaa, ...bbb] };
});
/* three 2024 games so the builder's walk-forward grid has selection points (its params then come from the data) */
const fixture2024 = [1, 2, 3].map((week) => ({
  providerEventId: `fx24-${week}`, dateUtc: `2024-09-${String(8 + 7 * (week - 1)).padStart(2, "0")}T17:00:00Z`, season: 2024, seasonType: 2, week,
  players: [
    row("AAA", AAA, "QB1", { passAtt: 32, passCmp: 20, passYds: 220 }),
    row("AAA", AAA, "WR1", { targets: 8 + week, rec: 6, recYds: 75 }),
    row("AAA", AAA, "TE1", { targets: 6 - week, rec: 3, recYds: 30 }),
    row("AAA", AAA, "RB1", { rushAtt: 20, rushYds: 80, targets: 3, rec: 2, recYds: 12, rushTd: week === 1 ? 1 : 0 }),
    row("BBB", BBB, "QB9", { passAtt: 29, passCmp: 18, passYds: 200 }),
    row("BBB", BBB, "WR9", { targets: 9, rec: 6, recYds: 66, recTd: week === 2 ? 1 : 0 }),
    row("BBB", BBB, "RB9", { rushAtt: 21, rushYds: 85, targets: 3 + week, rec: 3, recYds: 18 }),
  ],
}));
const rosterDoc = {
  schemaVersion: 1, sport: "nfl", generatedAt: "2026-10-01T12:00:00Z", sourceAsOf: "2026-10-01T12:00:00Z",
  teams: ROSTER_ABBRS.map((abbr) => ({
    teamAbbr: abbr,
    players: Object.entries(abbr === "AAA" ? AAA : abbr === "BBB" ? BBB : {}).map(([k, id]) => ({ id: String(id), fullName: k, position: { abbreviation: POS[k] ?? "WR" }, status: { type: "active" } })),
  })),
};
const evalFit = JSON.parse(readText("data/internal/research/nfl/reports/player-props-v1-evaluation.json"));

/** Lay out a minimal tree for the role-share builder and run it; returns the bytes it wrote. */
const runNode = (script, args, cwd) => {
  try { execFileSync(process.execPath, [script, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }); }
  catch (e) { throw new Error(`${path.basename(script)} failed: ${e.stderr || e.message}`); }
};
function runBuilder() {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), "n8-rsv-"));
  try {
    const put = (p, text) => { fs.mkdirSync(path.dirname(path.join(T, p)), { recursive: true }); fs.writeFileSync(path.join(T, p), text); };
    for (const p of ["scripts/nfl/build-nfl-role-shares.mjs", "scripts/nfl/build-nfl-recyds-share-view.mjs", "src/lib/sports/nfl/receiving-yards-share-view.mjs"]) put(`app/${p}`, fs.readFileSync(path.join(APP, p), "utf8"));
    put("app/src/lib/sports/nfl/role-shares.mjs", fs.readFileSync(path.join(APP, "src/lib/sports/nfl/role-shares.mjs"), "utf8"));
    put("app/public/data/nfl/rosters/latest.json", JSON.stringify(rosterDoc));
    for (const s of [2023, 2024, 2025]) put(`data/internal/research/nfl/player-events-v1/${s}.json`, JSON.stringify({ season: s, contentHash: `fx-${s}`, games: s === 2024 ? fixture2024 : [] }));
    put("data/internal/research/nfl/player-events-v1/2026.json", JSON.stringify({ season: 2026, contentHash: "fx-2026", games: fixtureGames }));
    put("data/internal/research/nfl/reports/scoring-bridge-v1.json", JSON.stringify({ corpusAccounting: [2023, 2024, 2025].map((s) => ({ season: s, contentHash: `fx-${s}` })) }));
    put("data/internal/research/nfl/reports/player-props-v1-evaluation.json", JSON.stringify({ fit: { league: evalFit.fit.league, rates: evalFit.fit.rates } }));
    runNode(path.join(T, "app/scripts/nfl/build-nfl-role-shares.mjs"), ["--now", "2026-10-01T12:30:00Z"], path.join(T, "app"));
    const out = (p) => { try { return fs.readFileSync(path.join(T, p), "utf8"); } catch { return null; } };
    const current = out("data/internal/research/nfl/role-shares-v1/current.json");
    const receipt = out("data/internal/research/nfl/reports/role-shares-v1.json");
    const viewBefore = out("data/internal/research/nfl/role-shares-v1/receiving-yards-view.json");
    if (!PRE_FIX) runNode(path.join(T, "app/scripts/nfl/build-nfl-recyds-share-view.mjs"), [], path.join(T, "app"));
    return {
      s1: { current, receipt, view: viewBefore },
      s2: { current: out("data/internal/research/nfl/role-shares-v1/current.json"), receipt: out("data/internal/research/nfl/reports/role-shares-v1.json"), view: out("data/internal/research/nfl/role-shares-v1/receiving-yards-view.json") },
    };
  } finally { fs.rmSync(T, { recursive: true, force: true }); }
}
/* FAIL-BEFORE MODE: N8_PIPELINE=base reproduces the pre-fix pipeline exactly as the base branch has it — no view
   script exists, and the orchestrator's composeRoleRates (an unchanged served-series fingerprint declaration, test
   (b)/(f)) feeds the engine current.json's shares. Tests (a) and (c) must FAIL in that mode and pass by default. */
const PRE_FIX = process.env.N8_PIPELINE === "base";
let built = null;
/* s1 = what the served pipeline has (the builder's outputs alone); s2 = after the view script ran on the same tree. */
const builds = () => (built ??= runBuilder());

/** The evaluator's share for one fixture player: decayedShare over his games, with the artifact's own params. */
function evaluatorShare(current, key) {
  const id = `nfl-athlete-${AAA[key]}`;
  const obs = [];
  for (const g of [...fixture2024, ...fixtureGames]) {
    const rows = g.players.filter((p) => p.teamAbbr === "AAA");
    const tot = rows.reduce((s, p) => s + p.targets, 0);
    const r = rows.find((p) => p.playerId === id);
    if (r) obs.push({ share: r.targets / tot, season: g.season });
  }
  const hl = current.params.halfLifeGames === "inf" ? Infinity : current.params.halfLifeGames;
  return decayedShare({ observations: obs, predictSeason: 2026, halfLifeGames: hl, shrinkK: current.params.shrinkK, boundaryDecay: current.params.boundaryDecay }).share;
}
/** composeRoleRates of run-nfl-event-window.mjs (the s1 composition the engine receives), on a current.json. */
function sharedRoleRates(current, team) {
  const fam = current.teams[team];
  const ratesById = new Map(fam.rates.players.map((r) => [r.playerId, r]));
  const share = (family, playerId) => fam[family].players.find((p) => p.playerId === playerId)?.share ?? 0;
  const names = new Map();
  for (const f of ["passAttempts", "rushAttempts", "targets"]) for (const p of fam[f].players) names.set(p.playerId, { name: p.name, shareBasis: p.shareBasis });
  const players = [];
  for (const [playerId, meta] of names) {
    const rates = ratesById.get(playerId);
    if (!rates) continue;
    const qbShare = share("passAttempts", playerId), carryShare = share("rushAttempts", playerId), targetShare = share("targets", playerId);
    const families = new Set();
    if (qbShare >= THRESH.qbShare) families.add("passAttempts");
    if (carryShare >= THRESH.carryShare) families.add("rushAttempts");
    if (targetShare >= THRESH.targetShare) families.add("targets");
    if (!families.size) continue;
    players.push({ playerId, name: meta.name, shareBasis: meta.shareBasis, families, qbShare, carryShare, targetShare, share: Math.max(qbShare, carryShare, targetShare), compRate: rates.compRate, ypcmp: rates.ypcmp, intRate: rates.intRate, catchRate: rates.catchRate, ypr: rates.ypr, ypc: rates.ypc });
  }
  return { players };
}

/** The target shares the engine receives for receiving yards, on the pipeline under test. */
function servedReceivingYardsRoleRates(team) {
  const { s2 } = builds();
  const cur = JSON.parse(s2.current);
  if (PRE_FIX) return sharedRoleRates(cur, team);
  const composed = composeReceivingYardsRoleRates({ base: sharedRoleRates(cur, team), currentTeam: cur.teams[team], viewTeam: JSON.parse(s2.view).teams[team], thresholds: THRESH });
  assert.equal(composed.state, "READY");
  return composed.roleRates;
}

test("(a) Σ listed > 1: the receiving-yards engine receives the evaluator's share for every modelled receiver", () => {
  const cur = JSON.parse(builds().s2.current);
  const served = servedReceivingYardsRoleRates("AAA");
  for (const key of ["WR1", "WR2", "TE1", "RB1"]) {
    const raw = Number(evaluatorShare(cur, key).toFixed(8));
    const got = served.players.find((p) => p.playerId === `nfl-athlete-${AAA[key]}`)?.targetShare;
    assert.equal(got, raw, `${key}: served ${got} vs evaluated ${raw} (ratio ${(raw / got).toFixed(4)})`);
  }
});

test("(a) the defect, reproduced: the pre-fix path serves raw/Σroster; the share view restores the raw share", () => {
  const { s1, s2 } = builds();
  const cur = JSON.parse(s2.current);
  const view = JSON.parse(s2.view);
  const block = view.teams.AAA.targets;
  assert.ok(block.listedSum > 1.05, `fixture precondition: AAA's listed target shares sum above 1 (got ${block.listedSum})`);
  const shares = receivingYardsShares({ viewBlock: block, threshold: THRESH.targetShare });
  assert.ok(shares.modelledRawSum < 1, `fixture precondition: the modelled receivers alone sum below 1 (got ${shares.modelledRawSum})`);
  /* s1 — the served path: current.json is normalised, so the engine sees raw / Σroster. */
  const servedS1 = sharedRoleRates(JSON.parse(s1.current), "AAA").players.find((p) => p.playerId === `nfl-athlete-${AAA.WR1}`).targetShare;
  /* s2 — the corrected path. */
  const composed = composeReceivingYardsRoleRates({ base: sharedRoleRates(cur, "AAA"), currentTeam: cur.teams.AAA, viewTeam: view.teams.AAA, thresholds: THRESH });
  assert.equal(composed.state, "READY");
  for (const key of ["WR1", "WR2", "TE1", "RB1"]) {
    const raw = Number(evaluatorShare(cur, key).toFixed(8));
    const served1 = sharedRoleRates(JSON.parse(s1.current), "AAA").players.find((p) => p.playerId === `nfl-athlete-${AAA[key]}`)?.targetShare;
    const served2 = composed.roleRates.players.find((p) => p.playerId === `nfl-athlete-${AAA[key]}`)?.targetShare;
    assert.ok(Math.abs(served1 - raw / block.listedSum) < 1e-7, `${key}: s1 serves raw/Σroster (${served1} vs ${raw / block.listedSum})`);
    assert.notEqual(served1, raw, `${key}: the defect — s1 differs from the evaluated share`);
    assert.equal(served2, raw, `${key}: s2 serves the evaluator's share exactly`);
  }
  assert.ok(servedS1 < evaluatorShare(cur, "WR1") * 0.95, "the s1 shortfall on the top receiver is the full roster factor");
  /* the depth receivers stay listed but are never modelled — they are why Σroster > 1 while Σmodelled < 1 */
  assert.ok(shares.players.filter((p) => !p.modelled).length >= 10);
});

test("(a) modelled receivers above 1: scaled among themselves only — the engine's own Dirichlet rule, made explicit", () => {
  const block = viewBlockFromRaw([{ playerId: "a", share: 0.5 }, { playerId: "b", share: 0.4 }, { playerId: "c", share: 0.3 }, { playerId: "d", share: 0.03 }]);
  const s = receivingYardsShares({ viewBlock: block, threshold: 0.05 });
  assert.ok(Math.abs(s.modelledRawSum - 1.2) < 1e-12);
  assert.ok(Math.abs(s.scale - 1 / 1.2) < 1e-12);
  assert.deepEqual(s.players.map((p) => Number(p.share.toFixed(10))), [0.4166666667, 0.3333333333, 0.25, 0]);
  assert.ok(Math.abs(s.allocated - 1) < 1e-12 && s.residual === 0);
  /* below 1: untouched raw shares, explicit residual */
  const t = receivingYardsShares({ viewBlock: viewBlockFromRaw([{ playerId: "a", share: 0.3 }, { playerId: "b", share: 0.2 }]), threshold: 0.05 });
  assert.equal(t.scale, 1);
  assert.deepEqual(t.players.map((p) => p.share), [0.3, 0.2]);
  assert.ok(Math.abs(t.residual - 0.5) < 1e-12);
});

test("(b) every other role-share consumer is byte-identical: shared artifacts, orchestrator, merge", () => {
  /* the builder, estimator, engine and evaluator are untouched (the s1 protocol froze them as whole files) */
  for (const f of ["app/scripts/nfl/build-nfl-role-shares.mjs", "app/src/lib/sports/nfl/role-shares.mjs", "app/src/lib/sports/nfl/player-props-v1.mjs", "app/scripts/nfl/evaluate-nfl-player-props.mjs", "data/internal/research/nfl/reports/player-props-v1-evaluation.json"]) {
    assert.equal(sha(readText(f)), s1Sha(f), `${f} is unchanged`);
  }
  /* no fingerprint component of any active served series moves: the fix sits entirely outside them */
  return import("./props-v1-forward-registration.mjs").then((R) => {
    const served = servedProtocols();
    assert.ok(served.length >= 1, "at least one served series is registered");
    for (const p of served) {
      const tree = Object.fromEntries(p.doc.model.frozenFiles.map((f) => [R.componentId(f), R.fingerprintComponent(f, (() => { try { return readText(f.path); } catch { return null; } })())]));
      assert.deepEqual(R.fingerprintDrift(p.doc.model.frozenFiles, tree), [], `${p.path}: no served component drifts`);
    }
    mergeChecks();
  });
});

function mergeChecks() {
  const { s1, s2 } = builds();
  assert.equal(s2.current, s1.current, "role-shares-v1/current.json — read by anytime TD, sim-v2, vault, participation, lane status — is byte-identical");
  assert.equal(s2.receipt, s1.receipt, "reports/role-shares-v1.json is byte-identical");
  assert.equal(s1.view, null, "the role-share builder writes no view");
  assert.ok(s2.view);
  assert.deepEqual(JSON.parse(s2.view).unreproducedTeams, [], "the view reproduces current.json for every team");
  /* only the role-share builder and the orchestrator read or write the view */
  const users = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!["node_modules", ".next", "__fixtures__", "out"].includes(e.name)) walk(p); } else if (/\.(mjs|ts|tsx)$/.test(e.name) && !e.name.includes(".test.") && fs.readFileSync(p, "utf8").includes("receiving-yards-view.json")) users.push(path.relative(APP, p)); } };
  walk(path.join(APP, "scripts")); walk(path.join(APP, "src"));
  assert.deepEqual(users.sort(), ["scripts/nfl/build-nfl-recyds-share-view.mjs", "scripts/nfl/run-nfl-event-window.mjs"]);

  /* merge: every non-receiving-yards market is the shared run's own object, receptions included */
  const fit = loadPlayerPropsFit({ fs, path, cwd: APP });
  const cur = JSON.parse(s2.current);
  const view = JSON.parse(s2.view);
  const event = { providerEventId: "fx-5", home: { abbr: "AAA" }, away: { abbr: "BBB" }, seasonType: 2 };
  const strengthState = { ratingFor: () => 1500 };
  const base = sharedRoleRates(cur, "AAA");
  const shared = simulatePlayerProps({ event, teamAbbr: "AAA", fit, strengthState, roleRates: base, artifactDate: "2026-10-01", runs: 1500 });
  const sharedJson = JSON.stringify(shared);
  const composed = composeReceivingYardsRoleRates({ base, currentTeam: cur.teams.AAA, viewTeam: view.teams.AAA, thresholds: THRESH });
  const recyds = simulatePlayerProps({ event, teamAbbr: "AAA", fit, strengthState, roleRates: composed.roleRates, artifactDate: "2026-10-01", runs: 1500 });
  const merged = mergeReceivingYards({ base: shared, recyds, composed });
  assert.equal(JSON.stringify(shared), sharedJson, "the shared run is not mutated");
  for (const p of shared.players) {
    const m = merged.players.find((x) => x.playerId === p.playerId);
    for (const [k, v] of Object.entries(p.markets)) if (k !== "player_reception_yds") assert.equal(m.markets[k], v, `${p.playerId} ${k} is the shared run's own object`);
  }
  const { receivingYards, players, ...restMerged } = merged;
  const { players: _p, ...restShared } = shared;
  assert.deepEqual(restMerged, restShared, "team score check, reconciliation and seed basis untouched");
  assert.notDeepEqual(merged.players.find((p) => p.playerId === `nfl-athlete-${AAA.WR1}`).markets.player_reception_yds, shared.players.find((p) => p.playerId === `nfl-athlete-${AAA.WR1}`).markets.player_reception_yds, "receiving yards did change");
}

test("(b) no change when nothing was normalised: the view run reproduces the shared run byte-for-byte", () => {
  const fit = loadPlayerPropsFit({ fs, path, cwd: APP });
  const { s2 } = builds();
  const cur = JSON.parse(s2.current);
  const view = JSON.parse(s2.view);
  assert.ok(view.teams.BBB.targets.listedSum <= 1, "fixture precondition: BBB is not normalised");
  const event = { providerEventId: "fx-5", home: { abbr: "AAA" }, away: { abbr: "BBB" }, seasonType: 2 };
  const base = sharedRoleRates(cur, "BBB");
  const shared = simulatePlayerProps({ event, teamAbbr: "BBB", fit, strengthState: { ratingFor: () => 1500 }, roleRates: base, artifactDate: "2026-10-01", runs: 1500 });
  const composed = composeReceivingYardsRoleRates({ base, currentTeam: cur.teams.BBB, viewTeam: view.teams.BBB, thresholds: THRESH });
  const recyds = simulatePlayerProps({ event, teamAbbr: "BBB", fit, strengthState: { ratingFor: () => 1500 }, roleRates: composed.roleRates, artifactDate: "2026-10-01", runs: 1500 });
  assert.equal(JSON.stringify(recyds.players), JSON.stringify(shared.players));
});

test("(c) team coherence: Σ shares + residual = 1, Σ expected targets ≤ pass attempts, Σ allocated ≤ total every game", () => {
  /* on the pipeline under test: the engine's modelled receivers carry the evaluated target mass (Σ raw × attempts),
     never more than the attempts, and the rest is an explicit residual */
  {
    const cur = JSON.parse(builds().s2.current);
    const served = servedReceivingYardsRoleRates("AAA").players.filter((p) => p.families.has("targets"));
    const evaluatedMass = ["WR1", "WR2", "TE1", "RB1"].reduce((a, k) => a + Number(evaluatorShare(cur, k).toFixed(8)), 0);
    const servedMass = served.reduce((a, p) => a + p.targetShare, 0);
    assert.ok(servedMass <= 1 + 1e-12, "Σ modelled shares ≤ 1");
    assert.ok(Math.abs(servedMass * 33.19 - evaluatedMass * 33.19) < 1e-6, `Σ expected targets ${(servedMass * 33.19).toFixed(3)} vs evaluated ${(evaluatedMass * 33.19).toFixed(3)} of 33.19 attempts (ratio ${(evaluatedMass / servedMass).toFixed(4)})`);
  }
  const { s2 } = builds();
  const view = JSON.parse(s2.view);
  for (const team of ["AAA", "BBB"]) {
    const s = receivingYardsShares({ viewBlock: view.teams[team].targets, threshold: THRESH.targetShare });
    assert.ok(Math.abs(s.allocated + s.residual - 1) < 1e-12 && s.residual >= 0, `${team}: shares + residual = 1`);
    const e = expectedTargets({ shares: s, expectedPassAttempts: 33.19 });
    assert.ok(e.sum <= 33.19 + 1e-9 && e.residualTargets >= -1e-9, `${team}: Σ expected targets ≤ pass attempts`);
  }
  /* the Σ>1 case: modelled raw shares 1.2 → scaled to 1, residual 0, Σ expected targets = pass attempts exactly */
  const over = receivingYardsShares({ viewBlock: viewBlockFromRaw([{ playerId: "a", share: 0.6 }, { playerId: "b", share: 0.4 }, { playerId: "c", share: 0.2 }, { playerId: "d", share: 0.04 }]), threshold: 0.05 });
  const eo = expectedTargets({ shares: over, expectedPassAttempts: 35 });
  assert.ok(Math.abs(eo.sum - 35) < 1e-9 && Math.abs(eo.residualTargets) < 1e-9);
  /* per simulated game: the engine's multinomial never allocates more targets than attempts, and its long-run
     allocation matches share × attempts */
  const rng = mulberry32(20261115);
  const players = over.players.filter((p) => p.modelled).map((p) => ({ playerId: p.playerId, share: p.share }));
  const tally = new Map(players.map((p) => [p.playerId, 0]));
  const N = 4000;
  for (let i = 0; i < N; i += 1) {
    const { allocated, other } = allocateOpportunities(rng, 35, players);
    const sum = [...allocated.values()].reduce((a, b) => a + b, 0);
    assert.ok(sum + other === 35 && sum <= 35);
    for (const [k, v] of allocated) tally.set(k, tally.get(k) + v);
  }
  for (const p of players) assert.ok(Math.abs(tally.get(p.playerId) / N - p.share * 35) < 0.35, `${p.playerId}: mean allocation ≈ share × attempts`);
});

test("(d) receiving yards ≈ targets × catch rate × yards per catch, under the run's own inputs", () => {
  const fit = loadPlayerPropsFit({ fs, path, cwd: APP });
  const { s2 } = builds();
  const cur = JSON.parse(s2.current);
  const view = JSON.parse(s2.view);
  const event = { providerEventId: "fx-6", home: { abbr: "AAA" }, away: { abbr: "BBB" }, seasonType: 2 };
  const base = sharedRoleRates(cur, "AAA");
  const strengthState = { ratingFor: () => 1500 };
  const shared = simulatePlayerProps({ event, teamAbbr: "AAA", fit, strengthState, roleRates: base, artifactDate: "2026-10-01", runs: 4000 });
  const composed = composeReceivingYardsRoleRates({ base, currentTeam: cur.teams.AAA, viewTeam: view.teams.AAA, thresholds: THRESH });
  const recyds = simulatePlayerProps({ event, teamAbbr: "AAA", fit, strengthState, roleRates: composed.roleRates, artifactDate: "2026-10-01", runs: 4000 });
  const merged = mergeReceivingYards({ base: shared, recyds, composed });
  const receivers = merged.receivingYards.receivers;
  assert.ok(receivers.length >= 4);
  /* Implied team attempts per receiver = E[receptions] / (share × catch rate); one team, one attempt count. */
  const implied = receivers.map((r) => recyds.players.find((p) => p.playerId === r.playerId).markets.player_receptions.mean / (r.share * r.catchRate));
  const meanImplied = implied.reduce((a, b) => a + b, 0) / implied.length;
  assert.ok(meanImplied > fit.volume.pass.a0 - 6 && meanImplied < fit.volume.pass.a0 + 6, `implied attempts ${meanImplied} near the fitted a0 ${fit.volume.pass.a0}`);
  for (const r of receivers) {
    const d = merged.players.find((p) => p.playerId === r.playerId).markets.player_reception_yds;
    const expected = r.share * meanImplied * r.catchRate * r.ypr;
    assert.ok(Math.abs(d.mean - expected) / expected < 0.1, `${r.playerId}: mean ${d.mean} vs share × attempts × catch × ypr ${expected.toFixed(2)}`);
  }
});

test("(e) pipeline version and qualification are explicit; refusal withholds the market instead of falling back", () => {
  assert.equal(RECYDS_PIPELINE_VERSION, "props-v1+recyds-share-view-v1");
  assert.equal(RECYDS_QUALIFICATION.evidence, "RETROSPECTIVE_ONLY");
  assert.match(RECYDS_QUALIFICATION.forwardValidation, /^NONE\b/);
  assert.doesNotMatch(JSON.stringify(RECYDS_QUALIFICATION) + RECYDS_PIPELINE_VERSION, /data\/internal|PRIVATE/, "public board text: no internal paths");
  for (const v of Object.values(RECYDS_QUALIFICATION)) assert.doesNotMatch(v, /forward[- ]validated|FORWARD_HOLDING|validated forward/i);
  const base = { state: "SIMULATED", players: [{ playerId: "x", markets: { player_reception_yds: { mean: 1 }, player_receptions: { mean: 0.1 } } }] };
  const ok = { state: "READY", roleRates: { players: [{ playerId: "x", families: new Set(["targets"]), targetShare: 0.2, catchRate: 0.6, ypr: 11 }] }, shares: { players: [{ playerId: "x", rawShare: 0.2 }], modelledRawSum: 0.2, scale: 1, allocated: 0.2, residual: 0.8 } };
  const merged = mergeReceivingYards({ base, composed: ok, recyds: { state: "SIMULATED", seedBasis: "s", players: [{ playerId: "x", markets: { player_reception_yds: { mean: 2 } } }] } });
  assert.equal(merged.receivingYards.pipelineVersion, RECYDS_PIPELINE_VERSION);
  assert.equal(receivingYardsPipelineOf(merged), RECYDS_PIPELINE_VERSION);
  assert.equal(merged.players[0].markets.player_reception_yds.mean, 2);
  assert.equal(receivingYardsPipelineOf(base), null, "an s1 artifact names no pipeline (its board stays unchanged)");
  const refused = mergeReceivingYards({ base, composed: { state: "REFUSED", reason: "view missing" }, recyds: null });
  assert.equal(refused.receivingYards.state, "REFUSED");
  assert.equal(refused.players[0].markets.player_reception_yds, undefined, "no silent fallback to the normalised shares");
  assert.equal(refused.players[0].markets.player_receptions.mean, 0.1);
  assert.equal(receivingYardsPipelineOf(refused), null);
  /* the board stamps the version on the family and on every receiving-yards row */
  const board = fs.readFileSync(path.join(APP, "scripts/nfl/build-nfl-player-board.mjs"), "utf8");
  assert.match(board, /receivingYardsFamilyAnnotation\(\{ family: families\.player_reception_yds/);
  assert.match(board, /if \(m === "player_reception_yds" && recydsPipeline\) markets\[m\]\.pipelineVersion = recydsPipeline;/);
});

test("(g) withholding is loud: a refused team gets the standard withheld reason; no team left ⇒ family WITHHELD", async () => {
  const { receivingYardsFamilyAnnotation, recydsWithheldReason } = await import("./receiving-yards-share-view.mjs");
  const fam = () => ({ label: "Receiving yards", state: "PUBLISHED", basis: "props-v1 evaluation: n=3575, all promotion bars pass" });
  const ok = { props: { state: "SIMULATED", receivingYards: { state: "SIMULATED", pipelineVersion: RECYDS_PIPELINE_VERSION } } };
  const refused = { props: { state: "SIMULATED", receivingYards: { state: "REFUSED", pipelineVersion: RECYDS_PIPELINE_VERSION, reason: "receiving-yards share view missing — player_reception_yds withheld" } } };
  /* pre-fix artifact: nothing changes */
  assert.deepEqual(receivingYardsFamilyAnnotation({ family: fam(), perTeam: { AAA: { props: { state: "SIMULATED" } } } }), {});
  /* both fine */
  const a = receivingYardsFamilyAnnotation({ family: fam(), perTeam: { AAA: ok, BBB: ok } });
  assert.equal(a.pipelineVersion, RECYDS_PIPELINE_VERSION); assert.equal(a.withheldTeams, undefined); assert.equal(a.state, undefined);
  /* one refused: named, standard reason (the board UI rewrites a leading "withheld"), family still PUBLISHED */
  const b = receivingYardsFamilyAnnotation({ family: fam(), perTeam: { AAA: ok, BBB: refused } });
  assert.deepEqual(b.withheldTeams.map((w) => [w.team, w.reason]), [["BBB", recydsWithheldReason("BBB")]]);
  assert.match(b.withheldTeams[0].reason, /^withheld for BBB: /);
  assert.equal(b.state, undefined);
  /* all refused: family WITHHELD with the reason — never PUBLISHED with no rows */
  const c = receivingYardsFamilyAnnotation({ family: fam(), perTeam: { AAA: refused, BBB: refused } });
  assert.equal(c.state, "WITHHELD"); assert.match(c.reason, /^withheld for AAA: .* · withheld for BBB: /);
  assert.doesNotMatch(JSON.stringify(c), /data\/internal/);
  /* existing withheldTeams entries are kept */
  const d = receivingYardsFamilyAnnotation({ family: { ...fam(), withheldTeams: [{ team: "CCC", sum: 1.2, reason: "withheld for CCC: x" }] }, perTeam: { AAA: ok, BBB: refused } });
  assert.deepEqual(d.withheldTeams.map((w) => w.team), ["CCC", "BBB"]);
  /* the event window and both builders emit ::error:: lines the run log / annotations surface */
  for (const [file, re] of [["scripts/nfl/run-nfl-event-window.mjs", /::error::RECYDS_WITHHELD/], ["scripts/nfl/build-nfl-player-board.mjs", /::error::player board .*RECYDS_WITHHELD/], ["scripts/nfl/build-nfl-recyds-share-view.mjs", /::error::RECYDS_VIEW_UNREPRODUCED/]]) {
    assert.match(fs.readFileSync(path.join(APP, file), "utf8"), re, file);
  }
  assert.match(readText(".github/workflows/nfl-event-window.yml"), /::error::RECYDS_VIEW_MISSING/);
});

test("(f) series identity: the served series keeps grading pre-fix boards and never counts a post-fix board", async () => {
  const R = await import("./props-v1-forward-registration.mjs");
  const at = (f) => { try { return fs.readFileSync(path.join(ROOT, f.path), "utf8"); } catch { return null; } };
  const tree = (protocol) => Object.fromEntries(protocol.model.frozenFiles.map((f) => [R.componentId(f), R.fingerprintComponent(f, at(f))]));
  /* The fix sits OUTSIDE every served component (test (b)), so a post-fix board would hash to the served version:
     the board's own label is what keeps it out. Pre-fix boards carry no label and grade exactly as before. */
  const FIX = JSON.parse(readText(FIX_PROTOCOL_PATH));
  assert.equal(R.registeredPipelineVersion(FIX), FIX.series.pipelineVersion);
  assert.deepEqual(R.fingerprintDrift(FIX.model.frozenFiles, tree(FIX)), [], "the fix series' pinned fingerprint is this tree's");
  assert.equal(FIX.series.boardPipelineLabel, RECYDS_PIPELINE_VERSION);
  const idsFix = new Set(FIX.model.frozenFiles.map(R.componentId));
  for (const id of ["app/src/lib/sports/nfl/receiving-yards-share-view.mjs", "app/scripts/nfl/build-nfl-recyds-share-view.mjs", "app/scripts/nfl/run-nfl-event-window.mjs#receivingYardsProps", "app/scripts/nfl/run-nfl-event-window.mjs#recydsViewReason"]) assert.ok(idsFix.has(id), `the fix series freezes ${id}`);
  const ctx = (protocol) => ({ asOf: "2026-12-01T00:00:00Z", model: protocol.model, series: protocol.series });
  const ev = (family, pipelineVersion) => ({ eventId: "e", kickoffUtc: "2026-11-20T01:15Z", hasBoard: true, final: true, sheetMissing: [], servedRows: 5,
    revision: { commit: "c", committedAt: "2026-11-19T20:00:00Z", generatedAt: "2026-11-19T19:59:00Z", family, servedModel: "props-v1", pipelineVersion } });
  const preFix = { state: "PUBLISHED", basis: "props-v1 evaluation: n=3575, all promotion bars pass" };
  const postFix = { ...preFix, pipelineVersion: RECYDS_PIPELINE_VERSION, qualification: RECYDS_QUALIFICATION };
  for (const { path: p, doc } of servedProtocols()) {
    assert.notEqual(doc.series.id, FIX.series.id);
    assert.notEqual(doc.series.outputDir, FIX.series.outputDir, "never the same output directory");
    assert.equal(doc.series.boardPipelineLabel ?? null, null, `${p}: a served series names no board label`);
    assert.equal(R.classifyEvent(ev(preFix, doc.series.pipelineVersion), ctx(doc)), R.EVENT_CODE.GRADED, `${p} still grades a pre-fix board`);
    assert.equal(R.classifyEvent(ev(postFix, doc.series.pipelineVersion), ctx(doc)), R.EVENT_CODE.OTHER_PIPELINE_VERSION, `${p} never counts a post-fix board, even at its own fingerprint`);
    assert.equal(R.classifyEvent(ev(postFix, doc.series.pipelineVersion), ctx(FIX)), R.EVENT_CODE.OTHER_PIPELINE_VERSION, "the fix series never counts a served-fingerprint board");
  }
  assert.equal(R.classifyEvent(ev(postFix, FIX.series.pipelineVersion), ctx(FIX)), R.EVENT_CODE.GRADED);
  assert.equal(R.classifyEvent(ev(preFix, FIX.series.pipelineVersion), ctx(FIX)), R.EVENT_CODE.OTHER_PIPELINE_VERSION, "the fix series never counts an unlabelled board");
  assert.match(R.PINNED_REGISTRATIONS[FIX_PROTOCOL_PATH] ?? "", /^[0-9a-f]{40}$/, "the fix series' registration commit is pinned in code");
});
