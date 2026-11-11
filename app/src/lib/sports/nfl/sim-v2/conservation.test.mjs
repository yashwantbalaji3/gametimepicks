/**
 * NFL sim-v2 · CONSERVATION (engine parity plan §4, PD 2026-11-10). The NFL invariants, over 1,000 seeded games played
 * one by one (with their drive log) and over every committed shadow receipt.
 *   Σ passer passTd = team passTd = Σ receivers' recTd · team TD = passTd + rushTd + DEF/ST TD
 *   score = 6·TD + XP + 2·2pt + 3·FG + 2·safety · Σ rec = cmp ≤ att · Σ recYds = passYds
 *   firstTd is the earliest TD of ANY kind, defensive included (MKT-01: a pick-six first ⇒ team = the defence, no player)
 *   P(2+) ≤ P(1+) · team-first-TD probabilities (incl. "none") sum to 1 · same seed ⇒ byte-identical receipt
 * Founder decision 3 (2026-11-10): the passing identities also hold with TWO QBs and a NON-QB passer (the away fixture);
 * any run replays by index to the same box; @2.2 exact run counts cover every run and give exact line probabilities.
 * Historical outcome bias is NOT tested here (it belongs to the grader, after pre-registration).
 * Run (from app/): npx tsx --test src/lib/sports/nfl/sim-v2/conservation.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { compileParams, prepareTeamPlayers, runRng, simulateGame, tiltedTable, N_PERIODS, N_PSTAT, N_TSTAT, PSTAT, TEAM_STAT } from "./engine.mjs";
import { calibrate, runBatch } from "./simulate.mjs";
import { buildNflSimulationReceipt, validateSimulationReceipt, exactOver, COUNT_PMF_FAMILIES, DEF_ST_SCORER, EXACT_COUNT_FAMILIES } from "./receipt.mjs";
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
// away: two QBs and a WR who throws (trick plays / injury relief) — every passer must reconcile, not only the starter
const multiPasser = (tag) => {
  const t = team(tag);
  t.players[0].passShare = 0.8;
  t.players.splice(1, 0, { playerId: `${tag}-qb2`, name: "QB2", position: "QB", passShare: 0.15, targetShare: 0, carryShare: 0.02, catchRate: null, ypr: null, ypc: 4.5 });
  t.players[3].passShare = 0.05; // wr1 (after the splice)
  return t;
};
const prep = [prepareTeamPlayers(team("h")), prepareTeamPlayers(multiPasser("a"))];
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
  const passers = new Map(); // away slot → games in which it threw a pass
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
      assert.equal(sumP(out, side, "passYds"), t("passYds"), `${at}: Σ passer passYds = team passYds`);
      assert.equal(sumP(out, side, "cmp"), t("cmp"), `${at}: Σ passer cmp = team cmp`);
      assert.equal(sumP(out, side, "passAtt"), t("passAtt"), `${at}: Σ passer att = team att`);
      assert.equal(sumP(out, side, "int"), t("int"), `${at}: Σ passer int = team int`);
      for (let s = 0; s <= prep[side].n; s++) {
        const v = (k) => out.players[side][s * N_PSTAT + PSTAT[k]];
        assert.ok(v("cmp") <= v("passAtt") && v("passTd") <= v("cmp"), `${at} slot ${s}: per-passer cmp ≤ att, passTd ≤ cmp`);
        if (side === 1 && v("passAtt") > 0) passers.set(s, (passers.get(s) ?? 0) + 1);
      }
    }
    // score = the scoring events in the drive log, defensive TDs included
    for (const side of [0, 1]) {
      const tdEvents = events.filter((e) => (e.result === "TD" && e.offense === side) || (e.result === "OPP_TD" && e.offense === 1 - side)).length;
      assert.equal(out.team[side][TEAM_STAT.passTd] + out.team[side][TEAM_STAT.rushTd] + out.team[side][TEAM_STAT.defTd], tdEvents, `game ${i} side ${side}: team TDs = TD events in the drive log (incl. DEF/ST)`);
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
  assert.ok(passers.size >= 3, `both away QBs and the WR passed in some game (slots ${[...passers.keys()]})`);
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

test("receipt @2.2: count PMFs per player sum to 1 and agree with ATD / 2+ (P(2+) ≤ P(1+)); team-first-TD incl. none sums to 1", () => {
  assert.equal(R.schemaVersion, "simulation-receipt@2.2");
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

test("receipt @2.2: exact run counts cover every run, agree with the PMFs, and give exact half-yard line probabilities", () => {
  const n = R.runCount;
  assert.deepEqual(R.provenance, { baseSeed: R.baseSeed, runCount: n, artifactHash: R.artifactHash, engine: R.simulationEngine, engineVersion: R.simulationEngineVersion, schema: "simulation-receipt@2.2" });
  const awayPassers = R.playerStatDistributions.filter((p) => p.team === "AWY" && p.exactCounts?.passYds).map((p) => p.playerId).sort();
  assert.deepEqual(awayPassers, ["a-qb", "a-qb2", "a-wr1"], "every player who threw in some run carries passing counts; non-passers do not");
  for (const p of R.playerStatDistributions) {
    for (const [k, counts] of Object.entries(p.exactCounts ?? {})) {
      assert.ok(EXACT_COUNT_FAMILIES.includes(k));
      assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), n, `${p.playerId} ${k}: covers every run`);
      for (const v of Object.keys(counts)) assert.ok(Number.isInteger(Number(v)), `${p.playerId} ${k}: integer support (${v})`);
    }
    for (const [k, pmf] of Object.entries(p.countPmf ?? {})) {
      const c = p.exactCounts?.[k];
      if (!c) continue;
      for (let j = 0; j < 6; j++) assert.ok(Math.abs((c[String(j)] ?? 0) / n - pmf[j]) <= 0.00006, `${p.playerId} ${k}=${j}: PMF = counts / runs`);
    }
  }
  // exact P(over x.5) straight from the runs, recomputed independently from the batch arrays
  const anchors = { home: 24, away: 21, source: "conservation test", modelVersion: { forecastModel: "t" } };
  const cal = calibrate({ compiled, anchors, baseSeed: SEED, runs: 600 });
  const batch = runBatch({ compiled, thetas: cal.thetas, players: prep, baseSeed: SEED, runs: 1500 });
  const qb = R.playerStatDistributions.find((p) => p.playerId === "h-qb");
  for (const line of [199.5, 224.5, 249.5]) {
    let above = 0;
    for (let i = 0; i < n; i++) if (batch.players[0][(i * (prep[0].n + 1) + 0) * N_PSTAT + PSTAT.passYds] > line) above += 1;
    assert.equal(exactOver(qb.exactCounts.passYds, line, n), above / n, `P(passYds > ${line})`);
  }
  // a receipt that loses a run fails validation
  const broken = structuredClone(R);
  const pc = broken.playerStatDistributions.find((p) => p.playerId === "h-qb").exactCounts.passAtt;
  pc[Object.keys(pc)[0]] -= 1;
  assert.ok(validateSimulationReceipt(broken).some((m) => /exact counts cover/.test(m)));
});

test("deterministic replay: any run re-simulated alone by its index gives the batch's box for that run", () => {
  const batch = runBatch({ compiled, thetas: [0.05, -0.05], players: prep, baseSeed: SEED, runs: 200 });
  for (const i of [0, 1, 57, 199]) {
    const { out, run } = play(i);
    assert.deepEqual([batch.scores[2 * i], batch.scores[2 * i + 1]], run.score, `run ${i}: score`);
    for (const side of [0, 1]) {
      const w = (prep[side].n + 1) * N_PSTAT;
      assert.deepEqual([...batch.players[side].subarray(i * w, (i + 1) * w)], [...Float32Array.from(out.players[side])], `run ${i} side ${side}: player box`);
    }
    assert.deepEqual(play(i).events, play(i).events, `run ${i}: the drive log replays`);
  }
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

/* Founder decision 2026-11-11 (§3): the board's starter is the simulation's passer — a TRADED starter added from outside
   the role-share pool (playersFromRoleShares strictStarter), or no named passer for a withheld (tier d) starter — and
   the passing identities still reconcile on every run: the starter's passing, team pass TDs, receivers' TDs and yards,
   and the score come from the same simulated plays. */
test("starter rule: a traded starter added to the pool, and a withheld team (OTHER passes), reconcile on every seeded game", async () => {
  const { playersFromRoleShares } = await import("./receipt.mjs");
  const block = {
    passAttempts: { players: [{ playerId: "bk", name: "Backup", position: "QB", share: 0.36 }, { playerId: "ir", name: "Injured", position: "QB", share: 0.6 }, { playerId: "rb", name: "RB", position: "RB", share: 0.01 }] },
    targets: { players: [{ playerId: "wr", name: "WR", position: "WR", share: 0.55 }, { playerId: "te", name: "TE", position: "TE", share: 0.25 }, { playerId: "rb", name: "RB", position: "RB", share: 0.15 }] },
    rushAttempts: { players: [{ playerId: "rb", name: "RB", position: "RB", share: 0.7 }, { playerId: "bk", name: "Backup", position: "QB", share: 0.06 }] },
    rates: { players: [] },
  };
  const injured = new Set(["ir"]);
  const traded = prepareTeamPlayers(playersFromRoleShares(block, injured, { starterQb: "new-qb", starterName: "Traded In", strictStarter: true }));
  const withheld = prepareTeamPlayers(playersFromRoleShares(block, injured, { withholdPassers: true }));
  const p2 = [traded, withheld];
  const sum = (out, side, k) => { let a = 0; for (let s = 0; s <= p2[side].n; s++) a += out.players[side][s * N_PSTAT + PSTAT[k]]; return a; };
  const starterSlot = traded.slots.findIndex((x) => x.playerId === "new-qb");
  assert.ok(starterSlot >= 0, "the traded starter holds a slot");
  let starterShareOfAtt = 0, teamAtt = 0;
  for (let i = 0; i < 300; i++) {
    const out = { team: [new Float64Array(N_TSTAT), new Float64Array(N_TSTAT)], period: [new Float64Array(N_PERIODS), new Float64Array(N_PERIODS)], players: [new Float64Array((traded.n + 1) * N_PSTAT), new Float64Array((withheld.n + 1) * N_PSTAT)] };
    const run = simulateGame({ compiled, tables, players: p2, rng: runRng("5ab1e5ee", i), out, events: [] });
    for (const side of [0, 1]) {
      const t = (k) => out.team[side][TEAM_STAT[k]];
      assert.equal(sum(out, side, "passAtt"), t("passAtt"), `run ${i} side ${side}: Σ passer attempts = team`);
      assert.equal(sum(out, side, "passYds"), t("passYds"), `run ${i} side ${side}: Σ passer yards = team`);
      assert.equal(sum(out, side, "recYds"), t("passYds"), `run ${i} side ${side}: Σ receiving yards = team passing`);
      assert.equal(sum(out, side, "passTd"), t("passTd"), `run ${i} side ${side}: Σ passer TDs = team`);
      assert.equal(sum(out, side, "recTd"), t("passTd"), `run ${i} side ${side}: Σ receiving TDs = team passing TDs`);
      assert.equal(run.score[side], t("pts"), `run ${i} side ${side}: score = team points`);
    }
    starterShareOfAtt += out.players[0][starterSlot * N_PSTAT + PSTAT.passAtt];
    teamAtt += out.team[0][TEAM_STAT.passAtt];
    const bk = withheld.slots.findIndex((x) => x.playerId === "bk");
    assert.equal(out.players[1][bk * N_PSTAT + PSTAT.passAtt], 0, `run ${i}: a withheld team's backup never passes`);
    assert.equal(out.players[0][traded.slots.findIndex((x) => x.playerId === "bk") * N_PSTAT + PSTAT.passAtt], 0, `run ${i}: the replaced backup never passes`);
  }
  assert.ok(starterShareOfAtt / teamAtt > 0.95, "the traded starter throws the team's passes");
});

/* PD decision B (2026-11-11): the QB-efficiency input conditions the simulated starter on the board's projection. It is a
   weight on completion gains in the drive's yard split: no draw, no drive result, so the official-anchored score cannot
   move; passing/rushing reconciliation still holds on every run. */
test("QB-efficiency weight: weight 1 is byte-identical; any weight leaves every run's score and drives unchanged; conservation holds", async () => {
  const { runBatch: rb, calibratePassWeights } = await import("./simulate.mjs");
  const base = rb({ compiled, thetas: [0.05, -0.05], players: prep, baseSeed: SEED, runs: 300 });
  const one = rb({ compiled, thetas: [0.05, -0.05], players: prep, baseSeed: SEED, runs: 300, passWeight: [1, 1] });
  assert.deepEqual([...one.team], [...base.team]);
  assert.deepEqual([...one.players[0]], [...base.players[0]]);
  const w = rb({ compiled, thetas: [0.05, -0.05], players: prep, baseSeed: SEED, runs: 300, passWeight: [2.5, 0.5] });
  assert.equal(w.failedRuns, 0, "the coherence contract holds on every weighted run");
  assert.deepEqual([...w.scores], [...base.scores], "every run's score is unchanged");
  for (let i = 0; i < 300; i++) for (const k of ["drives", "plays", "passAtt", "cmp", "passTd", "rushAtt", "pts"]) for (const s of [0, 1]) {
    assert.equal(w.team[(i * 2 + s) * N_TSTAT + TEAM_STAT[k]], base.team[(i * 2 + s) * N_TSTAT + TEAM_STAT[k]], `run ${i} side ${s} ${k} unchanged`);
  }
  const tot = (b, s, k) => { let a = 0; for (let i = 0; i < 300; i++) a += b.team[(i * 2 + s) * N_TSTAT + TEAM_STAT[k]]; return a; };
  assert.ok(tot(w, 0, "passYds") > tot(base, 0, "passYds") && tot(w, 0, "rushYds") < tot(base, 0, "rushYds"), "weight > 1 moves yards from rushing to passing");
  assert.ok(tot(w, 1, "passYds") < tot(base, 1, "passYds"), "weight < 1 moves them back");
  const q = calibratePassWeights({ compiled, thetas: [0.05, -0.05], players: prep, baseSeed: SEED, targets: [260, null], starterSlots: [0, -1], runs: 600 });
  assert.ok(Math.abs(q.achieved[0] - 260) <= 1 || q.bounded[0], `the starter's mean reaches its target (${q.achieved[0]})`);
  assert.equal(q.weights[1], 1, "no target ⇒ weight 1");
});

/* Founder D3 (development only): the joint challenger anchors team yardage, not points — the score follows from the same
   drives, and every run still reconciles. */
test("joint challenger: calibrateToYards reaches the yardage target; the weighted joint batch is coherent on every run", async () => {
  const { calibrateToYards, runBatch: rb } = await import("./simulate.mjs");
  const base = rb({ compiled, thetas: [0, 0], baseSeed: SEED, runs: 600, check: false });
  const yds = (b, s) => { let a = 0; for (let i = 0; i < b.runs; i++) a += b.team[(i * 2 + s) * N_TSTAT + TEAM_STAT.passYds] + b.team[(i * 2 + s) * N_TSTAT + TEAM_STAT.rushYds]; return a / b.runs; };
  const targets = [yds(base, 0) + 40, yds(base, 1) - 30];
  const j = calibrateToYards({ compiled, targets, baseSeed: SEED, runs: 600 });
  assert.ok(Math.abs(j.achieved[0] - targets[0]) <= 2 && Math.abs(j.achieved[1] - targets[1]) <= 2, `yards ${j.achieved} vs ${targets}`);
  assert.ok(j.thetas[0] > 0 && j.thetas[1] < 0, "more yardage needs a stronger offence tilt");
  const b = rb({ compiled, thetas: j.thetas, players: prep, baseSeed: SEED, runs: 300, passWeight: [1.4, 0.8] });
  assert.equal(b.failedRuns, 0, "QB, receivers, rushers, TDs and score reconcile on every joint run");
});
