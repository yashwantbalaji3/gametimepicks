/**
 * Session 13 · NFL Simulation Engine V2 (SHADOW) — coherence, determinism, derivation-from-the-same-runs, no market
 * input, started-game refusal, receipt contract. Every mutation probe applies a real mutation and has a control.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { compileParams, N_PERIODS, N_PSTAT, N_TSTAT, PSTAT, TEAM_STAT, prepareTeamPlayers, quarterOf, runRng, simulateGame, tiltedTable } from "./engine.mjs";
import { checkRun } from "./coherence.mjs";
import { calibrate, runBatch } from "./simulate.mjs";
import { buildNflSimulationReceipt, playersFromRoleShares, REPRESENTATIVE_LABEL, validateSimulationReceipt } from "./receipt.mjs";

const ROOT = path.resolve(process.cwd(), "..");
const PARAMS = path.join(ROOT, "data/internal/research/nfl/sim-v2/drive-params-2015-2025.json");
const compiled = compileParams(JSON.parse(fs.readFileSync(PARAMS, "utf8")));

const team = (tag, qbShare = 1) => ({
  players: [
    { playerId: `${tag}-qb`, name: "QB", position: "QB", passShare: qbShare, targetShare: 0, carryShare: 0.12, catchRate: null, ypr: null, ypc: 4.8 },
    { playerId: `${tag}-rb`, name: "RB", position: "RB", passShare: 0, targetShare: 0.12, carryShare: 0.6, catchRate: 0.78, ypr: 7.5, ypc: 4.3 },
    { playerId: `${tag}-wr1`, name: "WR1", position: "WR", passShare: 0, targetShare: 0.27, carryShare: 0.02, catchRate: 0.64, ypr: 13.2, ypc: 6 },
    { playerId: `${tag}-wr2`, name: "WR2", position: "WR", passShare: 0, targetShare: 0.2, carryShare: 0, catchRate: 0.62, ypr: 12.4, ypc: null },
    { playerId: `${tag}-te`, name: "TE", position: "TE", passShare: 0, targetShare: 0.18, carryShare: 0, catchRate: 0.7, ypr: 10.1, ypc: null },
  ],
});
const prep = [prepareTeamPlayers(team("h")), prepareTeamPlayers(team("a"))];

test("every run of a batch is coherent — with and without players", () => {
  const b0 = runBatch({ compiled, thetas: [0.1, -0.1], baseSeed: "0badc0de", runs: 1500 });
  assert.equal(b0.failedRuns, 0, JSON.stringify(b0.failureCodes));
  const b1 = runBatch({ compiled, thetas: [0.1, -0.1], players: prep, baseSeed: "0badc0de", runs: 1500 });
  assert.equal(b1.failedRuns, 0, JSON.stringify(b1.failureCodes));
  // The same team stream with or without player allocation? No — allocation draws extra randoms. But every run's
  // score still equals its own periods and scoring events (checked inside runBatch); spot-check OT ⇔ regulation tie.
  let ot = 0;
  for (let i = 0; i < b1.runs; i++) {
    const reg = (s) => [0, 1, 2, 3].reduce((a, p) => a + b1.periods[(i * 2 + s) * N_PERIODS + p], 0);
    if (b1.ot[i]) { ot++; assert.equal(reg(0), reg(1), `run ${i}: OT without a regulation tie`); }
  }
  assert.ok(ot > 10 && ot < 150, `OT runs ${ot}/1500 is implausible`);
});

test("determinism: same params + seed + runs → identical batches; a run replays alone by index", () => {
  const a = runBatch({ compiled, thetas: [0.2, 0], players: prep, baseSeed: "12345678", runs: 300 });
  const b = runBatch({ compiled, thetas: [0.2, 0], players: prep, baseSeed: "12345678", runs: 300 });
  assert.deepEqual(a.scores, b.scores);
  assert.deepEqual(a.players[0], b.players[0]);
  const c = runBatch({ compiled, thetas: [0.2, 0], players: prep, baseSeed: "12345679", runs: 300 });
  assert.notDeepEqual(a.scores, c.scores, "control: a different seed changes the batch");
  const tables = [tiltedTable(compiled, 0.2), tiltedTable(compiled, 0)];
  const out = { team: [new Float64Array(N_TSTAT), new Float64Array(N_TSTAT)], period: [new Float64Array(N_PERIODS), new Float64Array(N_PERIODS)], players: [new Float64Array((prep[0].n + 1) * N_PSTAT), new Float64Array((prep[1].n + 1) * N_PSTAT)] };
  const run = simulateGame({ compiled, tables, players: prep, rng: runRng("12345678", 137), out });
  assert.deepEqual(run.score, [a.scores[274], a.scores[275]], "run 137 replays exactly");
});

test("calibration hits model-owned anchors; the market is never an input", () => {
  const cal = calibrate({ compiled, anchors: { home: 27.5, away: 19.5 }, baseSeed: "cafef00d", runs: 1200 });
  assert.ok(Math.abs(cal.achieved[0] - 27.5) < 0.4 && Math.abs(cal.achieved[1] - 19.5) < 0.4, JSON.stringify(cal));
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  const files = ["engine.mjs", "simulate.mjs", "coherence.mjs", "receipt.mjs"].map((f) => path.join(process.cwd(), "src/lib/sports/nfl/sim-v2", f));
  files.push(path.join(process.cwd(), "scripts/nfl/build-nfl-sim-v2-shadow.mjs"), path.join(ROOT, "scripts/research/nfl/fit-drive-sim-v2.mjs"));
  const MARKET = /marketComparison|moneyline|spread_line|total_line|overOdds|yesOdds|impliedProbability|sportsbook|odds-api/i;
  for (const f of files) assert.ok(!MARKET.test(strip(fs.readFileSync(f, "utf8"))), `${path.basename(f)} reads a market field`);
  assert.ok(MARKET.test(strip("const p = r.marketComparison.marketHomeWinPct;")), "probe: the scan catches a market read");
});

// ── the coherence checker catches every broken invariant (probes on a real run's buffers) ──────────────────────
function realRun() {
  const tables = [tiltedTable(compiled, 0.3), tiltedTable(compiled, 0.3)];
  for (let i = 0; i < 400; i++) {
    const out = { team: [new Float64Array(N_TSTAT), new Float64Array(N_TSTAT)], period: [new Float64Array(N_PERIODS), new Float64Array(N_PERIODS)], players: [new Float64Array((prep[0].n + 1) * N_PSTAT), new Float64Array((prep[1].n + 1) * N_PSTAT)] };
    const run = simulateGame({ compiled, tables, players: prep, rng: runRng("feedbeef", i), out });
    if (out.team[0][TEAM_STAT.passTd] >= 1 && out.team[0][TEAM_STAT.rushAtt] >= 3 && run.firstTd) return { out, run };
  }
  throw new Error("no suitable run");
}
const clone = ({ out, run }) => ({
  team: out.team.map((a) => Float64Array.from(a)), period: out.period.map((a) => Float64Array.from(a)), players: out.players.map((a) => Float64Array.from(a)),
  slots: [prep[0].n, prep[1].n], run: { ...run, score: [...run.score], firstTd: run.firstTd ? { ...run.firstTd } : null },
});

test("probe battery: each broken invariant is caught; the untouched run passes", () => {
  const base = realRun();
  assert.deepEqual(checkRun(clone(base)), [], "control");
  const wr = 2; // WR1 slot on the home team
  const probes = {
    "receiving TD without a team passing TD": (c) => { c.players[0][wr * N_PSTAT + PSTAT.recTd] += 1; c.players[0][wr * N_PSTAT + PSTAT.rec] += 1; c.players[0][wr * N_PSTAT + PSTAT.targets] += 1; },
    "team points ≠ scoring events": (c) => { c.team[0][TEAM_STAT.pts] += 1; c.period[0][0] += 1; c.run.score[0] += 1; },
    "quarters ≠ final": (c) => { c.period[0][1] += 3; },
    "first TD scorer did not score": (c) => {
      const s = c.run.firstTd.side;
      const other = c.run.firstTd.slot === 4 ? 3 : 4;
      for (let k = 0; k < N_PSTAT; k++) if (k === PSTAT.recTd || k === PSTAT.rushTd) c.players[s][other * N_PSTAT + k] = 0;
      c.run.firstTd.slot = other;
    },
    "Σ player carries > team carries": (c) => { c.players[0][1 * N_PSTAT + PSTAT.rushAtt] += 2; },
    "receptions > completions": (c) => { c.players[0][wr * N_PSTAT + PSTAT.rec] += 1; c.players[0][wr * N_PSTAT + PSTAT.targets] += 1; c.team[0][TEAM_STAT.passAtt] += 1; c.players[0][0 * N_PSTAT + PSTAT.passAtt] += 1; },
    "OT points without OT": (c) => { c.period[1][4] += 3; c.team[1][TEAM_STAT.pts] += 3; c.team[1][TEAM_STAT.fgMade] += 1; c.team[1][TEAM_STAT.fgAtt] += 1; c.run.score[1] += 3; c.run.ot = false; },
    "passer TDs ≠ team passing TDs (two team scores for one TD)": (c) => { c.players[0][0 * N_PSTAT + PSTAT.passTd] += 1; },
  };
  for (const [name, mutate] of Object.entries(probes)) {
    const c = clone(base);
    const before = JSON.stringify([...c.team[0], ...c.period[0], ...c.players[0], ...c.period[1]]) + JSON.stringify(c.run);
    mutate(c);
    assert.notEqual(JSON.stringify([...c.team[0], ...c.period[0], ...c.players[0], ...c.period[1]]) + JSON.stringify(c.run), before, `${name}: mutation applied`);
    assert.ok(checkRun(c).length > 0, `${name}: caught`);
  }
});

// ── receipt: derived from the same runs; representative runs are runs, not forecasts ─────────────────────────────
function smallReceipt() {
  const anchors = { home: 24, away: 21, source: "test", modelVersion: { forecastModel: "t" } };
  const calibration = calibrate({ compiled, anchors, baseSeed: "a1b2c3d4", runs: 600 });
  const batch = runBatch({ compiled, thetas: calibration.thetas, players: prep, baseSeed: "a1b2c3d4", runs: 1000 });
  const receipt = buildNflSimulationReceipt({
    event: { eventId: "999", kickoffUtc: "2031-10-05T17:00Z", home: { abbr: "HOM" }, away: { abbr: "AWY" } },
    compiled, paramsRef: { file: "x" }, anchors, calibration, prep, batch, baseSeed: "a1b2c3d4", inputHash: "0", generatedAt: "2031-10-05T12:00:00Z", inputs: {},
  });
  return { receipt, batch };
}

test("receipt: ATD / 2+ TD / first TD / quarters come from the same runs; representative runs replay their index", () => {
  const { receipt, batch } = smallReceipt();
  assert.deepEqual(validateSimulationReceipt(receipt), []);
  const n = prep[0].n;
  for (const pl of receipt.playerStatDistributions.filter((x) => x.team === "HOM" && x.playerId !== "OTHER")) {
    const slot = prep[0].slots.findIndex((s) => s.playerId === pl.playerId);
    let k = 0;
    for (let i = 0; i < batch.runs; i++) {
      const b = (i * (n + 1) + slot) * N_PSTAT;
      if (batch.players[0][b + PSTAT.recTd] + batch.players[0][b + PSTAT.rushTd] >= 1) k++;
    }
    assert.equal(pl.anytimeTd, Number((k / batch.runs).toFixed(4)), `${pl.playerId} ATD is a count over the runs`);
  }
  const ftSum = receipt.scoringEventDistributions.firstTdScorer.reduce((a, x) => a + x.probability, 0) + receipt.scoringEventDistributions.teamFirstTd.none;
  assert.ok(Math.abs(ftSum - 1) < 2e-3, `first-TD distribution + no-TD sums to 1 (${ftSum})`);
  const q = receipt.periodAggregates;
  assert.ok(Math.abs(q.slice(0, 4).reduce((a, x) => a + x.home.mean, 0) - receipt.aggregate.score.home.mean) < 0.05 + receipt.aggregate.overtimeProbability * 10, "quarter means sum to the full-game mean (up to OT points)");
  for (const rep of receipt.representativeRuns) {
    assert.equal(rep.label, REPRESENTATIVE_LABEL);
    assert.deepEqual([rep.final.home, rep.final.away], [batch.scores[2 * rep.runIndex], batch.scores[2 * rep.runIndex + 1]], `${rep.kind} is run ${rep.runIndex}`);
    assert.equal(rep.quarters.home.reduce((a, b) => a + b, 0), rep.final.home);
  }
});

test("receipt validator probes: unlabelled representative, market input, incoherent runs, public self-promotion, 2+ > ATD", () => {
  const { receipt } = smallReceipt();
  assert.deepEqual(validateSimulationReceipt(receipt), [], "control");
  const muts = {
    "representative presented as the forecast": (r) => { r.representativeRuns[0].label = "THE PREDICTION"; },
    "market used as an input": (r) => { r.marketReceiptId = "odds-receipt-1"; },
    "an incoherent run": (r) => { r.validation.failedRuns = 1; },
    "self-promoted to PUBLIC": (r) => { r.promotionState = "PUBLIC"; },
    "2+ TD above anytime TD": (r) => { r.playerStatDistributions[0].twoPlusTd = (r.playerStatDistributions[0].anytimeTd ?? 0) + 0.1; },
    "representative names no real run": (r) => { r.representativeRuns[0].runIndex = r.runCount + 5; },
  };
  for (const [name, m] of Object.entries(muts)) {
    const r = JSON.parse(JSON.stringify(receipt));
    m(r);
    assert.ok(validateSimulationReceipt(r).length > 0, `${name}: caught`);
  }
});

test("availability + one starter: blocked players get no opportunity; a backup QB keeps no passing", () => {
  const block = {
    passAttempts: { players: [{ playerId: "qb1", name: "A", position: "QB", share: 0.6 }, { playerId: "qb2", name: "B", position: "QB", share: 0.4 }] },
    targets: { players: [{ playerId: "wr1", name: "W1", position: "WR", share: 0.3 }, { playerId: "wr2", name: "W2", position: "WR", share: 0.2 }] },
    rushAttempts: { players: [{ playerId: "rb1", name: "R", position: "RB", share: 0.5 }, { playerId: "qb2", name: "B", position: "QB", share: 0.1 }] },
    rates: { players: [] },
  };
  const ok = playersFromRoleShares(block, new Set(), { starterQb: "qb2" });
  assert.equal(ok.players.find((p) => p.playerId === "qb2").passShare, 1, "the board's starter takes all passing");
  assert.equal(ok.players.find((p) => p.playerId === "qb1").passShare, 0);
  const blocked = playersFromRoleShares(block, new Set(["wr1"]));
  assert.equal(blocked.players.some((p) => p.playerId === "wr1"), false, "a blocked player is not in the game");
  assert.ok(Math.abs(blocked.players.find((p) => p.playerId === "wr2").targetShare - 0.5) < 1e-9, "his share moves pro rata to available named players");
  const t = prepareTeamPlayers(blocked);
  const b = runBatch({ compiled, thetas: [0, 0], players: [t, t], baseSeed: "77777777", runs: 200 });
  assert.equal(b.failedRuns, 0);
});

test("the shadow producer refuses a started game and never rewrites a receipt (control: an unstarted game runs)", () => {
  const script = path.join(process.cwd(), "scripts/nfl/build-nfl-sim-v2-shadow.mjs");
  const run = (now) => execFileSync("node", [script, "--now", now, "--event", "401872979", "--runs", "200", "--dry-run"], { encoding: "utf8" });
  assert.match(run("2026-10-05T12:00:00Z"), /401872979 ATL @ NO/, "control: before kickoff the game simulates");
  assert.doesNotMatch(run("2026-10-06T00:15:00Z"), /401872979 ATL @ NO/, "at kickoff it is never simulated");
  assert.equal(quarterOf(2700), 1);
  assert.equal(quarterOf(1800), 2);
  assert.equal(quarterOf(0), 4);
});

test("the forward shadow ledger is SCHEDULED: after every event window + hourly, add-only commit (probes catch each break)", () => {
  const raw = fs.readFileSync(path.join(ROOT, ".github/workflows/nfl-sim-v2-shadow.yml"), "utf8");
  const strip = (y) => y.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  const ok = (y) => {
    const s = strip(y);
    return /workflows: \[nfl-event-window\]/.test(s) && /- cron: "/.test(s) && /node app\/scripts\/nfl\/build-nfl-sim-v2-shadow\.mjs --now/.test(s)
      && /git add data\/internal\/research\/nfl\/sim-v2\/shadow\//.test(s) && /grep -v '\^A'/.test(s) && !/continue-on-error|\|\|\s*true/.test(s) && !/rebase/.test(s.replace(/never rebase/g, ""));
  };
  assert.ok(ok(raw), "control: the real workflow");
  const muts = {
    "unscheduled": raw.replace(/node app\/scripts\/nfl\/build-nfl-sim-v2-shadow\.mjs --now[^\n]*/, "echo skipped"),
    "no write-once guard": raw.replace(/grep -v '\^A'/, "true"),
    "never staged": raw.replace("git add data/internal/research/nfl/sim-v2/shadow/", "true"),
    "swallowed": raw.replace(/build-nfl-sim-v2-shadow\.mjs --now "\$\(date -u \+%Y-%m-%dT%H:%M:%SZ\)"/, (m) => `${m} || true`),
    "not after the event window": raw.replace("workflows: [nfl-event-window]", "workflows: [nothing]"),
  };
  for (const [name, m] of Object.entries(muts)) {
    assert.notEqual(m, raw, `${name}: mutation applied`);
    assert.equal(ok(m), false, `${name}: caught`);
  }
});
