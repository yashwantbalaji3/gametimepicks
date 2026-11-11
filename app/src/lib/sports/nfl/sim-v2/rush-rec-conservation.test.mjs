/**
 * NFL sim-v2 · RUSHING / RECEIVING CONSERVATION (NFL completion row C, PD 2026-11-11). Inside every simulated game:
 *   Σ player rushAtt / rushYds / rushTd = team · Σ rec = cmp · Σ recYds = passYds · Σ recTd = passTd
 *   a quarterback's rushing is counted ONCE: every carry and scramble in the play log is credited to exactly one slot,
 *   scrambles to the QB1-rule scrambler, and the per-slot sums of the log equal the engine's accumulators
 * over 1,000 seeded games with the incumbent split AND 1,000 with the MKT-02 challenger split (α ≠ 1), and over every
 * committed shadow receipt (per-player means add up to the team means). Receipt @2.3 exact counts for the six
 * families cover every run and give the batch's own line probabilities. Historical accuracy is NOT tested here.
 * Run (from app/): npx tsx --test src/lib/sports/nfl/sim-v2/rush-rec-conservation.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { compileParams, prepareTeamPlayers, runRng, simulateGame, tiltedTable, N_PERIODS, N_PSTAT, N_TSTAT, PSTAT, TEAM_STAT } from "./engine.mjs";
import { calibrate, runBatch } from "./simulate.mjs";
import { buildNflSimulationReceipt, exactOver, validateSimulationReceipt, RUSH_REC_FAMILIES, SIMULATION_RECEIPT_SCHEMA } from "./receipt.mjs";
import { readShadowReceipts } from "./public-receipt.mjs";

const ROOT = path.resolve(process.cwd(), "..");
const compiled = compileParams(JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/sim-v2/drive-params-2015-2025.json"), "utf8")));
// a mobile QB (designed carries AND scrambles) and two backs, so QB rushing is exercised both ways
const team = (tag) => ({
  players: [
    { playerId: `${tag}-qb`, name: "QB", position: "QB", passShare: 1, targetShare: 0, carryShare: 0.15, catchRate: null, ypr: null, ypc: 5.6 },
    { playerId: `${tag}-rb1`, name: "RB1", position: "RB", passShare: 0, targetShare: 0.12, carryShare: 0.5, catchRate: 0.78, ypr: 7.5, ypc: 4.3 },
    { playerId: `${tag}-rb2`, name: "RB2", position: "RB", passShare: 0, targetShare: 0.05, carryShare: 0.2, catchRate: 0.75, ypr: 6.8, ypc: 4.1 },
    { playerId: `${tag}-wr1`, name: "WR1", position: "WR", passShare: 0, targetShare: 0.3, carryShare: 0.03, catchRate: 0.64, ypr: 13.2, ypc: 6 },
    { playerId: `${tag}-wr2`, name: "WR2", position: "WR", passShare: 0, targetShare: 0.22, carryShare: 0, catchRate: 0.62, ypr: 12.4, ypc: null },
    { playerId: `${tag}-te`, name: "TE", position: "TE", passShare: 0, targetShare: 0.18, carryShare: 0, catchRate: 0.7, ypr: 10.1, ypc: null },
  ],
});
const prep = [prepareTeamPlayers(team("h")), prepareTeamPlayers(team("a"))];
const tables = [tiltedTable(compiled, 0.1), tiltedTable(compiled, -0.1)];
const SEED = "5eed0c11";
const N_GAMES = 1000;
const CHALLENGER = { passGainWeight: 1.54 };

function play(i, yardageSplit = null) {
  const out = { team: [new Float64Array(N_TSTAT), new Float64Array(N_TSTAT)], period: [new Float64Array(N_PERIODS), new Float64Array(N_PERIODS)], players: [new Float64Array((prep[0].n + 1) * N_PSTAT), new Float64Array((prep[1].n + 1) * N_PSTAT)] };
  const plays = [];
  const run = simulateGame({ compiled, tables, players: prep, rng: runRng(SEED, i), out, plays, yardageSplit });
  return { out, plays, run };
}
const sumP = (out, side, k) => { let a = 0; for (let s = 0; s <= prep[side].n; s++) a += out.players[side][s * N_PSTAT + PSTAT[k]]; return a; };
const at = (out, side, slot, k) => out.players[side][slot * N_PSTAT + PSTAT[k]];

function checkGame({ out, plays }, label) {
  for (const side of [0, 1]) {
    const t = (k) => out.team[side][TEAM_STAT[k]];
    const g = `${label} side ${side}`;
    assert.equal(sumP(out, side, "rushAtt"), t("rushAtt"), `${g}: Σ rushAtt = team`);
    assert.equal(sumP(out, side, "rushYds"), t("rushYds"), `${g}: Σ rushYds = team`);
    assert.equal(sumP(out, side, "rushTd"), t("rushTd"), `${g}: Σ rushTd = team`);
    assert.equal(sumP(out, side, "rec"), t("cmp"), `${g}: Σ rec = cmp`);
    assert.equal(sumP(out, side, "recYds"), t("passYds"), `${g}: Σ recYds = passYds`);
    assert.equal(sumP(out, side, "recTd"), t("passTd"), `${g}: Σ recTd = passTd`);
    // the play log, folded per slot: each carry / scramble credited once, to one slot, with its yards and TD
    const mine = plays.filter((p) => p.o === side && (p.k === "RUSH" || p.k === "SCRAMBLE"));
    assert.equal(mine.length, t("rushAtt"), `${g}: team carries = RUSH + SCRAMBLE plays (sacks and kneels are not carries)`);
    assert.equal(plays.filter((p) => p.o === side && p.k === "SCRAMBLE").length, t("scrambles"));
    for (let s = 0; s <= prep[side].n; s++) {
      const by = mine.filter((p) => p.r === s);
      assert.equal(by.length, at(out, side, s, "rushAtt"), `${g} slot ${s}: carries from the log = accumulator`);
      assert.equal(by.reduce((a, p) => a + p.y, 0), at(out, side, s, "rushYds"), `${g} slot ${s}: rushing yards from the log`);
      assert.equal(by.reduce((a, p) => a + (p.td ?? 0), 0), at(out, side, s, "rushTd"), `${g} slot ${s}: rushing TDs from the log`);
      const caught = plays.filter((p) => p.o === side && p.k === "PASS" && p.c === 1 && p.t === s);
      assert.equal(caught.length, at(out, side, s, "rec"), `${g} slot ${s}: receptions from the log`);
      assert.equal(caught.reduce((a, p) => a + p.y, 0), at(out, side, s, "recYds"), `${g} slot ${s}: receiving yards from the log`);
    }
    for (const p of mine.filter((x) => x.k === "SCRAMBLE")) assert.equal(p.r, prep[side].scrambler, `${g}: a scramble is the QB's carry`);
  }
}

test(`rushing / receiving identities and QB rushing counted once, on every one of ${N_GAMES} seeded games (incumbent split)`, () => {
  let qbCarries = 0, qbScrambles = 0;
  for (let i = 0; i < N_GAMES; i++) {
    const g = play(i);
    checkGame(g, `game ${i}`);
    qbScrambles += g.plays.filter((p) => p.k === "SCRAMBLE" && p.o === 0).length;
    qbCarries += g.plays.filter((p) => p.k === "RUSH" && p.o === 0 && p.r === 0).length;
  }
  assert.ok(qbCarries > 0 && qbScrambles > 0, "the QB both carries and scrambles in these games");
});

test(`the MKT-02 challenger split: the same identities on ${N_GAMES} games; only the pass/rush yardage split moves`, () => {
  let movedToPass = 0;
  for (let i = 0; i < N_GAMES; i++) {
    const inc = play(i);
    const ch = play(i, CHALLENGER);
    checkGame(ch, `challenger game ${i}`);
    assert.deepEqual(ch.run, inc.run, `game ${i}: the score, OT and first TD do not move`);
    for (const side of [0, 1]) {
      const t = (g, k) => g.out.team[side][TEAM_STAT[k]];
      for (const k of ["pts", "passAtt", "cmp", "rushAtt", "passTd", "rushTd", "int", "sacks", "sackYds", "plays", "drives"]) assert.equal(t(ch, k), t(inc, k), `game ${i} side ${side}: ${k} unchanged`);
      assert.equal(t(ch, "passYds") + t(ch, "rushYds"), t(inc, "passYds") + t(inc, "rushYds"), `game ${i} side ${side}: total yards unchanged (the split only)`);
      movedToPass += t(ch, "passYds") - t(inc, "passYds");
    }
  }
  assert.ok(movedToPass > 0, "α > 1 moves yards from runs to passes on balance");
});

test("α = 1 is the incumbent bit for bit (null and { passGainWeight: 1 } give the same run)", () => {
  for (const i of [0, 3, 77, 512]) {
    const a = play(i), b = play(i, { passGainWeight: 1 });
    assert.deepEqual(b.run, a.run);
    for (const side of [0, 1]) assert.deepEqual([...b.out.players[side]], [...a.out.players[side]]);
  }
});

function receiptFor(seed, yardageSplit = null) {
  const anchors = { home: 24, away: 21, source: "rush/rec conservation test", modelVersion: { forecastModel: "t" } };
  const calibration = calibrate({ compiled, anchors, baseSeed: seed, runs: 600 });
  const batch = runBatch({ compiled, thetas: calibration.thetas, players: prep, baseSeed: seed, runs: 1500, yardageSplit });
  const R = buildNflSimulationReceipt({ event: { eventId: "998", kickoffUtc: "2031-10-05T17:00Z", home: { abbr: "HOM" }, away: { abbr: "AWY" } }, compiled, paramsRef: { file: "x" }, anchors, calibration, prep, batch, baseSeed: seed, inputHash: "0", generatedAt: "2031-10-05T12:00:00Z", inputs: {}, challenger: yardageSplit ? { challengerId: "t", yardageSplit } : null });
  return { R, batch };
}

test("receipt @2.3: exact counts for the six rush / receiving families cover every run and give the batch's own line probabilities", () => {
  const { R, batch } = receiptFor(SEED);
  assert.equal(R.schemaVersion, SIMULATION_RECEIPT_SCHEMA);
  assert.equal(SIMULATION_RECEIPT_SCHEMA, "simulation-receipt@2.3");
  assert.deepEqual(validateSimulationReceipt(R), []);
  const n = R.runCount;
  for (const side of [0, 1]) {
    const rows = R.playerStatDistributions.filter((p) => p.team === (side === 0 ? "HOM" : "AWY"));
    for (const k of RUSH_REC_FAMILIES) {
      // exact expectation additivity: Σ over player rows of E[k] from the counts = the team mean from the batch
      let fromCounts = 0;
      for (const p of rows) for (const [v, c] of Object.entries(p.exactCounts?.[k] ?? {})) fromCounts += Number(v) * c;
      const tk = { rushAtt: "rushAtt", rushYds: "rushYds", rushTd: "rushTd", rec: "cmp", recYds: "passYds", recTd: "passTd" }[k];
      let team = 0;
      for (let i = 0; i < n; i++) team += batch.team[(i * 2 + side) * N_TSTAT + TEAM_STAT[tk]];
      assert.equal(fromCounts, team, `side ${side} ${k}: Σ player counts·value = Σ team ${tk} over the runs`);
    }
    for (const p of rows) for (const k of RUSH_REC_FAMILIES) if (p.stats[k]) assert.equal(Object.values(p.exactCounts[k]).reduce((a, b) => a + b, 0), n, `${p.playerId} ${k}`);
  }
  // exact P(rushYds > 59.5) and P(recYds > 49.5) recomputed from the batch arrays
  const rb = R.playerStatDistributions.find((p) => p.playerId === "h-rb1");
  const wr = R.playerStatDistributions.find((p) => p.playerId === "h-wr1");
  const val = (slot, k, i) => batch.players[0][(i * (prep[0].n + 1) + slot) * N_PSTAT + PSTAT[k]];
  for (const [row, slot, k, line] of [[rb, 1, "rushYds", 59.5], [wr, 3, "recYds", 49.5], [rb, 1, "rushAtt", 14.5], [wr, 3, "rec", 4.5]]) {
    let above = 0;
    for (let i = 0; i < n; i++) if (val(slot, k, i) > line) above += 1;
    assert.equal(exactOver(row.exactCounts[k], line, n), above / n, `${row.playerId} P(${k} > ${line})`);
  }
  assert.ok(Object.keys(rb.exactCounts.rushYds).some((v) => Number(v) < 0), "negative rushing yards are kept");
  const { R: C } = receiptFor(SEED, CHALLENGER);
  assert.deepEqual(C.challenger, { challengerId: "t", yardageSplit: CHALLENGER });
  assert.ok(!("challenger" in R), "incumbent receipts carry no challenger field");
  assert.deepEqual(C.aggregate.winProbability, R.aggregate.winProbability, "same seed: the challenger's games have the incumbent's scores");
});

test("same seed ⇒ byte-identical @2.3 receipt (incumbent and challenger)", () => {
  assert.equal(JSON.stringify(receiptFor(SEED).R), JSON.stringify(receiptFor(SEED).R));
  assert.equal(JSON.stringify(receiptFor(SEED, CHALLENGER).R), JSON.stringify(receiptFor(SEED, CHALLENGER).R));
});

test("every committed shadow receipt: per-player rushing / receiving means add up to the team means", () => {
  const all = readShadowReceipts(ROOT);
  assert.ok(all.length > 100);
  const bad = [];
  const pairs = [["rushAtt", "rushAtt"], ["rushYds", "rushYds"], ["rushTd", "rushTd"], ["rec", "cmp"], ["recYds", "passYds"], ["recTd", "passTd"]];
  for (const { file, receipt: r } of all) {
    if (!r.playerStatDistributions?.length) continue;
    for (const [side, abbr] of [["home", r.home?.abbr], ["away", r.away?.abbr]]) {
      const rows = r.playerStatDistributions.filter((p) => p.team === abbr);
      for (const [pk, tk] of pairs) {
        const sum = rows.reduce((a, p) => a + (p.stats?.[pk]?.mean ?? 0), 0);
        const teamMean = r.teamStatDistributions?.[side]?.[tk]?.mean;
        // means are stored to 2 decimals: allow half a cent per row plus the team's own rounding
        if (teamMean == null || Math.abs(sum - teamMean) > 0.005 * (rows.length + 1) + 1e-9) bad.push(`${file} ${side} ${pk}: Σ players ${sum.toFixed(3)} vs team ${teamMean}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
