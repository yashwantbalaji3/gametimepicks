/**
 * NFL sim-v2 · CONSERVATION (engine parity plan §4, PD 2026-11-10). The NFL invariants, over 1,000 seeded games played
 * one by one (with their drive log) and over every committed shadow receipt.
 *   Σ passer passTd = team passTd = Σ receivers' recTd · team TD = passTd + rushTd + DEF/ST TD
 *   score = 6·TD + XP + 2·2pt + 3·FG + 2·safety · Σ rec = cmp ≤ att · Σ recYds = passYds
 *   firstTd is the earliest TD of ANY kind, defensive included (MKT-01: a pick-six first ⇒ team = the defence, no player)
 *   P(2+) ≤ P(1+) · team-first-TD probabilities (incl. "none") sum to 1 · same seed ⇒ byte-identical receipt
 * Run (from app/): npx tsx --test src/lib/sports/nfl/sim-v2/conservation.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { compileParams, prepareTeamPlayers, runRng, simulateGame, tiltedTable, N_PERIODS, N_PSTAT, N_TSTAT, PSTAT, TEAM_STAT } from "./engine.mjs";
import { calibrate, runBatch } from "./simulate.mjs";
import { buildNflSimulationReceipt, validateSimulationReceipt, COUNT_PMF_FAMILIES, DEF_ST_SCORER } from "./receipt.mjs";
import { readShadowReceipts } from "./public-receipt.mjs";

const ROOT = path.resolve(process.cwd(), "..");
const compiled = compileParams(JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/sim-v2/drive-params-2015-2025.json"), "utf8")));
const team = (tag) => ({
  players: [
    { playerId: `${tag}-qb`, name: "QB", position: "QB", passShare: 1, targetShare: 0, carryShare: 0.12, catchRate: null, ypr: null, ypc: 4.8 },
    { playerId: `${tag}-rb`, name: "RB", position: "RB", passShare: 0, targetShare: 0.12, carryShare: 0.6, catchRate: 0.78, ypr: 7.5, ypc: 4.3 },
    { playerId: `${tag}-wr1`, name: "WR1", position: "WR", passShare: 0, targetShare: 0.3, carryShare: 0.02, catchRate: 0.64, ypr: 13.2, ypc: 6 },
    { playerId: `${tag}-wr2`, name: "WR2", position: "WR", passShare: 0, targetShare: 0.22, carryShare: 0, catchRate: 0.62, ypr: 12.4, ypc: null },
    { playerId: `${tag}-te`, name: "TE", position: "TE", passShare: 0, targetShare: 0.18, carryShare: 0, catchRate: 0.7, ypr: 10.1, ypc: null },
  ],
});
const prep = [prepareTeamPlayers(team("h")), prepareTeamPlayers(team("a"))];
const tables = [tiltedTable(compiled, 0.05), tiltedTable(compiled, -0.05)];
const SEED = "c0ffee01";
const N_GAMES = 1000;

function play(i) {
  const out = { team: [new Float64Array(N_TSTAT), new Float64Array(N_TSTAT)], period: [new Float64Array(N_PERIODS), new Float64Array(N_PERIODS)], players: [new Float64Array((prep[0].n + 1) * N_PSTAT), new Float64Array((prep[1].n + 1) * N_PSTAT)] };
  const events = [];
  const run = simulateGame({ compiled, tables, players: prep, rng: runRng(SEED, i), out, events });
  return { out, events, run };
}
const sumP = (out, side, k) => { let a = 0; for (let s = 0; s <= prep[side].n; s++) a += out.players[side][s * N_PSTAT + PSTAT[k]]; return a; };

test(`§4 NFL invariants hold on every one of ${N_GAMES} seeded games`, () => {
  let defFirst = 0;
  for (let i = 0; i < N_GAMES; i++) {
    const { out, events, run } = play(i);
    for (const side of [0, 1]) {
      const t = (k) => out.team[side][TEAM_STAT[k]];
      const at = `game ${i} side ${side}`;
      assert.equal(sumP(out, side, "passTd"), t("passTd"), `${at}: Σ QB passTd = team passTd`);
      assert.equal(sumP(out, side, "recTd"), t("passTd"), `${at}: Σ receivers' recTd = team passTd`);
      assert.equal(sumP(out, side, "rushTd"), t("rushTd"), `${at}: Σ rushTd`);
      const td = t("passTd") + t("rushTd") + t("defTd");
      assert.equal(t("pts"), 6 * td + t("xpMade") + 2 * t("twoMade") + 3 * t("fgMade") + 2 * t("safetiesFor"), `${at}: score = 6·TD + XP + 2·2pt + 3·FG + 2·safety`);
      assert.equal(t("pts"), run.score[side], `${at}: team points = the run's score`);
      assert.equal(sumP(out, side, "rec"), t("cmp"), `${at}: Σ rec = cmp`);
      assert.ok(t("cmp") <= t("passAtt"), `${at}: cmp ≤ att`);
      assert.equal(sumP(out, side, "recYds"), t("passYds"), `${at}: Σ recYds = passYds`);
    }
    // the first TD is the earliest TD of any kind, read from the drive log
    const first = events.find((e) => e.result === "TD" || e.result === "OPP_TD") ?? null;
    if (!first) assert.equal(run.firstTd, null, `game ${i}: no TD ⇒ no first TD`);
    else if (first.result === "TD") { assert.equal(run.firstTd.side, first.offense, `game ${i}: offensive first TD side`); assert.notEqual(run.firstTd.type, "DEF"); }
    else {
      defFirst += 1;
      assert.deepEqual(run.firstTd, { side: 1 - first.offense, slot: -1, type: "DEF" }, `game ${i}: a defensive TD first ⇒ team = the defence, no player (MKT-01)`);
    }
  }
  assert.ok(defFirst > 0, "the 1,000 games include defensive-TD-first games (the MKT-01 case is exercised)");
});

test("MKT-01 fixture: a pick-six as the first TD ⇒ firstTd names the defence and no player; the receipt buckets it as DEF/ST", () => {
  // the first seeded game whose first TD is a defensive return (deterministic: found by index, never random)
  let i = 0, g = null;
  for (; i < 5000; i++) { g = play(i); const f = g.events.find((e) => e.result === "TD" || e.result === "OPP_TD"); if (f?.result === "OPP_TD") break; }
  assert.ok(i < 5000, "a defensive-TD-first game exists in the seed stream");
  const first = g.events.find((e) => e.result === "OPP_TD");
  assert.deepEqual(g.run.firstTd, { side: 1 - first.offense, slot: -1, type: "DEF" });
  assert.ok(g.out.team[1 - first.offense][TEAM_STAT.defTd] >= 1);
  // and through a batch + receipt: the DEF/ST row exists and the team-first-TD buckets add up
  const batch = runBatch({ compiled, thetas: [0.05, -0.05], players: prep, baseSeed: SEED, runs: i + 1 });
  assert.equal(batch.failedRuns, 0, JSON.stringify(batch.failureCodes));
  assert.equal(batch.firstTd[3 * i + 2], 2, "the batch records the run's first TD as DEF");
});

function receiptFor(seed, runs = 1500) {
  const anchors = { home: 24, away: 21, source: "conservation test", modelVersion: { forecastModel: "t" } };
  const calibration = calibrate({ compiled, anchors, baseSeed: seed, runs: 600 });
  const batch = runBatch({ compiled, thetas: calibration.thetas, players: prep, baseSeed: seed, runs });
  return buildNflSimulationReceipt({ event: { eventId: "999", kickoffUtc: "2031-10-05T17:00Z", home: { abbr: "HOM" }, away: { abbr: "AWY" } }, compiled, paramsRef: { file: "x" }, anchors, calibration, prep, batch, baseSeed: seed, inputHash: "0", generatedAt: "2031-10-05T12:00:00Z", inputs: {} });
}
const R = receiptFor(SEED);

test("receipt @2.1: count PMFs per player sum to 1 and agree with ATD / 2+ (P(2+) ≤ P(1+)); team-first-TD incl. none sums to 1", () => {
  assert.equal(R.schemaVersion, "simulation-receipt@2.1");
  assert.deepEqual(validateSimulationReceipt(R), []);
  const qb = R.playerStatDistributions.find((p) => p.playerId === "h-qb");
  assert.ok(qb.countPmf.passTd && qb.countPmf.int, "the QB carries pass TD and interception PMFs");
  for (const p of R.playerStatDistributions) {
    for (const k of Object.keys(p.countPmf ?? {})) {
      assert.ok(COUNT_PMF_FAMILIES.includes(k));
      const pmf = p.countPmf[k];
      assert.ok(Math.abs(pmf.reduce((a, b) => a + b, 0) - 1) <= 0.005, `${p.playerId} ${k}`);
      const ge1 = 1 - pmf[0], ge2 = 1 - pmf[0] - pmf[1];
      assert.ok(ge2 <= ge1 + 1e-9, `${p.playerId} ${k}: P(2+) ≤ P(1+)`);
    }
    assert.ok(p.twoPlusTd <= p.anytimeTd);
  }
  const t = R.scoringEventDistributions.teamFirstTd;
  assert.ok(Math.abs(t.home + t.away + t.none - 1) <= 0.002, "home + away + none = 1");
  const by = R.scoringEventDistributions.teamFirstTdByType;
  assert.ok(Math.abs(by.home.offense + by.home.defenseSpecialTeams - t.home) <= 0.002);
  assert.ok(Math.abs(by.away.offense + by.away.defenseSpecialTeams - t.away) <= 0.002);
  const scorers = R.scoringEventDistributions.firstTdScorer;
  assert.ok(scorers.some((s) => s.playerId === DEF_ST_SCORER.playerId), "defensive first TDs are their own bucket");
  assert.ok(Math.abs(scorers.reduce((a, s) => a + s.probability, 0) + t.none - 1) <= 0.01, "Σ first-TD scorers + none = 1");
});

test("same seed ⇒ byte-identical receipt; a different seed changes it", () => {
  assert.equal(JSON.stringify(receiptFor(SEED)), JSON.stringify(R));
  assert.notEqual(receiptFor("c0ffee02").artifactHash, R.artifactHash);
});

test("every committed shadow receipt: valid, probabilities sum to 1, P(2+ TD) ≤ P(anytime), team-first-TD sums to 1", () => {
  const all = readShadowReceipts(ROOT);
  assert.ok(all.length > 100, "the committed shadow receipts are read");
  const bad = [];
  for (const { file, receipt: r } of all) {
    const p = validateSimulationReceipt(r);
    const t = r.scoringEventDistributions?.teamFirstTd;
    if (t && Math.abs(t.home + t.away + t.none - 1) > 0.002) p.push("teamFirstTd does not sum to 1");
    for (const pl of r.playerStatDistributions ?? []) for (const [k, pmf] of Object.entries(pl.countPmf ?? {})) if (1 - pmf[0] - pmf[1] > 1 - pmf[0] + 1e-9) p.push(`${pl.playerId} ${k}: P(2+) > P(1+)`);
    if (p.length) bad.push(`${file}: ${p.join("; ")}`);
  }
  assert.deepEqual(bad, []);
});
