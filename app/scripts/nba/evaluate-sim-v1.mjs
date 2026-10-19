/**
 * NBA sim v1 — DEVELOPMENT-SEASON EVALUATION (v0 vs v1 vs Elo) and the simulation-count benchmark. Read-only harness
 * beside diagnose-sim-dispersion.mjs (which stays v0-only and unchanged).
 * NBA REGULAR SEASON — SHADOW CANDIDATE · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * Sample: every 2024-25 regular-season game (corpus season 2025) ≥ 30 days into the season with a box score — the
 * same rule as preregistration look 2. Inputs strictly as of tip: Elo through tip (corpus rows of seasons ≤ 2025
 * only), box scores strictly before tip (docs of seasons ≤ 2025 only — the 2025-26 assessment season is never loaded),
 * no injuries feed (it did not exist; unknown is simulated, as in look 2). Pools: v0 = its own box-score-history pool
 * (minutes-model.mjs, exactly the v0 artifact path); v1 = the historical roster proxy of sim-v1-profile.mjs (no
 * roster captures exist for past seasons).
 *
 * v1's parameters were fitted on 2023-24 only (calibrate-sim-v1.mjs) and frozen before this ran; nothing here feeds
 * back into a parameter.
 *
 * Run (from app/):
 *   node scripts/nba/evaluate-sim-v1.mjs [--games N] [--sims-v1 4000] [--sims-v0 1000] [--write]
 *   node scripts/nba/evaluate-sim-v1.mjs --benchmark          (simulation-count stability + runtime; no outcomes read)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildTeamRatings, ratingFor, winProbability } from "../../src/lib/sports/nba/team-rating.mjs";
import { expectedMinutes } from "../../src/lib/sports/nba/minutes-model.mjs";
import { simulateGame, NBA_SIM_MODEL_VERSION } from "../../src/lib/sports/nba/game-sim.mjs";
import { simulateGameV1, NBA_SIM_V1_MODEL_VERSION, V1_PARAMS } from "../../src/lib/sports/nba/game-sim-v1.mjs";
import { indexBoxscores, leagueMeans, buildSideProfile, historicalRosterProxy, PROFILE_PARAMS } from "../../src/lib/sports/nba/sim-v1-profile.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const SEASON = 2025; // development season — the ONLY outcomes this harness reads
const MIN_DAYS = 30;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : Number(argv[i + 1]); };
const GAMES = opt("--games", 100000);
const SIMS_V1 = opt("--sims-v1", 4000);
const SIMS_V0 = opt("--sims-v0", 1000);
const WRITE = argv.includes("--write");
const BENCH = argv.includes("--benchmark");

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const corpus = readJson(path.join(NBA, "corpus-v1.json"));
const corpusRows = (corpus.rows ?? []).filter((r) => r.season <= SEASON);
const box = fs.readdirSync(path.join(NBA, "boxscores")).filter((f) => /^\d+\.json$/.test(f)).map((f) => readJson(path.join(NBA, "boxscores", f))).filter((d) => d.season <= SEASON);
const boxById = new Map(box.map((d) => [String(d.providerEventId), d]));
const index = indexBoxscores(box);

const rows = corpusRows.filter((r) => r.season === SEASON && r.phase === 2).sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
const start = Date.parse(rows[0].dateUtc);
const eligible = rows.filter((r) => Date.parse(r.dateUtc) >= start + MIN_DAYS * 86400_000 && boxById.get(String(r.providerEventId))?.boxscoreAvailable);
const step = Math.max(1, Math.floor(eligible.length / GAMES));
const sample = eligible.filter((_, i) => i % step === 0).slice(0, GAMES);

function inputs(g) {
  const doc = boxById.get(String(g.providerEventId));
  const homeId = doc.teams.find((t) => t.homeAway === "home")?.providerTeamId, awayId = doc.teams.find((t) => t.homeAway === "away")?.providerTeamId;
  const now = g.dateUtc;
  const ratings = buildTeamRatings(corpusRows, { throughDateUtc: now, targetSeason: SEASON });
  const hr = ratingFor(ratings, g.home), ar = ratingFor(ratings, g.away);
  const eloP = winProbability(hr.rating, ar.rating, { neutralSite: g.neutralSite === true });
  const league = leagueMeans(index, { asOf: now });
  const prof = (tid) => buildSideProfile(index, { teamId: tid, rosterRows: historicalRosterProxy(index, tid, { asOf: now }).map((id) => ({ providerAthleteId: id, availability: "unknown" })), asOf: now, league });
  return { doc, homeId, awayId, now, hr, ar, eloP, league, v1Home: { name: g.home, providerTeamId: homeId, rating: hr, profile: prof(homeId) }, v1Away: { name: g.away, providerTeamId: awayId, rating: ar, profile: prof(awayId) } };
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(3)));
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(4)));
const sdOf = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1)); };

/* ─────────────── benchmark ─────────────── */
if (BENCH) {
  const games = eligible.filter((_, i) => i % Math.floor(eligible.length / 10) === 0).slice(0, 10);
  const table = [];
  const ins = games.map(inputs);
  for (const N of [1000, 2000, 5000, 10000, 20000]) {
    const pSd = [], p50Sd = [], ms = [];
    for (const x of ins) {
      const runs = [];
      for (const seed of ["a1b2c3d4", "0badf00d", "12345678", "deadbeef", "cafebabe"]) {
        const t = Date.now();
        runs.push(simulateGameV1({ providerEventId: "bench", inputAsOf: x.now, home: x.v1Home, away: x.v1Away, league: x.league, eloWinProbability: x.eloP, simulations: N, seed }));
        ms.push(Date.now() - t);
      }
      pSd.push(sdOf(runs.map((o) => o.sim.pHome)));
      for (const side of ["home", "away"]) runs[0].players[side].forEach((p, j) => { if (p.expectedMinutes >= 20) p50Sd.push(sdOf(runs.map((o) => o.players[side][j].pts.p50))); });
    }
    const row = { simulations: N, pHomeSeedSD_mean: r4(mean(pSd)), pHomeSeedSD_max: r4(Math.max(...pSd)), analyticSE_at_p05: r4(Math.sqrt(0.25 / N)), ptsP50SeedSD_mean: r3(mean(p50Sd)), ptsP50SeedSD_max: r3(Math.max(...p50Sd)), msPerGame_mean: Math.round(mean(ms)), rotationPlayers: p50Sd.length / 1 };
    table.push(row);
    console.log(JSON.stringify(row));
  }
  if (WRITE) {
    const out = path.join(NBA, "reports", "sim-v1-simcount-benchmark.json");
    fs.writeFileSync(out, JSON.stringify({ schemaVersion: 1, artifact: "nba-sim-v1-simcount-benchmark", dataClass: "PRIVATE_RESEARCH", productEligible: false, modelVersion: NBA_SIM_V1_MODEL_VERSION, generatedAt: new Date().toISOString(), games: games.map((g) => String(g.providerEventId)), seeds: 5, note: "no outcome read; seed-to-seed SD over 5 seeds per game, 10 games of 2024-25; runtime on the machine that ran it", table }, null, 1) + "\n");
    console.log(`wrote ${path.relative(path.resolve(APP, ".."), out)}`);
  }
  process.exit(0);
}

/* ─────────────── evaluation ─────────────── */
const STATS = ["pts", "reb", "ast", "threePm"];
const acc = () => ({ p: [], y: [], marginErr: [], totalErr: [], m80: [], t80: [], m50: [], t50: [], simMarginSD: [], simTotalSD: [], ot: [], players: Object.fromEntries(STATS.map((k) => [k, { absErr: [], in80: [], absErr20: [], in80_20: [] }])), minutesAbsErr: [], minutesAbsErr20: [], matched: 0, predictedButDnp: 0, playedButUnpredicted: 0 });
const A = { v0: acc(), v1: acc(), elo: { p: [], y: [] } };
const realizedOT = [];
const t0 = Date.now();
let done = 0;
for (const g of sample) {
  const x = inputs(g);
  const y = g.ftHome > g.ftAway ? 1 : 0;
  const am = g.ftHome - g.ftAway, at = g.ftHome + g.ftAway;
  realizedOT.push(g.overtime === true ? 1 : 0);
  A.elo.p.push(x.eloP); A.elo.y.push(y);
  const hm = expectedMinutes({ boxscores: box, teamProviderId: x.homeId, asOfDateUtc: x.now, injuries: null, population: "regular" });
  const awm = expectedMinutes({ boxscores: box, teamProviderId: x.awayId, asOfDateUtc: x.now, injuries: null, population: "regular" });
  const v0 = simulateGame({ providerEventId: g.providerEventId, inputAsOf: x.now, neutralSite: g.neutralSite === true, home: { name: g.home, providerTeamId: x.homeId, rating: x.hr, minutes: hm }, away: { name: g.away, providerTeamId: x.awayId, rating: x.ar, minutes: awm }, eloWinProbability: x.eloP, simulations: SIMS_V0 });
  const v1 = simulateGameV1({ providerEventId: g.providerEventId, inputAsOf: x.now, neutralSite: g.neutralSite === true, home: x.v1Home, away: x.v1Away, league: x.league, eloWinProbability: x.eloP, simulations: SIMS_V1 });
  for (const [name, o] of [["v0", v0], ["v1", v1]]) {
    const a = A[name], s = o.sim;
    a.p.push(s.pHome); a.y.push(y);
    a.marginErr.push(s.margin.mean - am); a.totalErr.push(s.total.mean - at);
    a.m80.push(am >= s.margin.p10 && am <= s.margin.p90 ? 1 : 0); a.t80.push(at >= s.total.p10 && at <= s.total.p90 ? 1 : 0);
    if (s.margin.p25 != null) { a.m50.push(am >= s.margin.p25 && am <= s.margin.p75 ? 1 : 0); a.t50.push(at >= s.total.p25 && at <= s.total.p75 ? 1 : 0); }
    a.simMarginSD.push(s.margin.sd); a.simTotalSD.push(s.total.sd);
    a.ot.push(name === "v1" ? s.overtimeRate : s.tieMass);
    for (const side of ["home", "away"]) {
      const teamId = side === "home" ? x.homeId : x.awayId;
      const pred = new Map(o.players[side].map((p) => [p.providerAthleteId, p]));
      for (const act of x.doc.players.filter((p) => String(p.providerTeamId) === String(teamId))) {
        const id = String(act.providerAthleteId);
        const pr = pred.get(id);
        if (act.didNotPlay || !Number.isInteger(act.minutes) || act.minutes <= 0) { if (pr && act.didNotPlay) a.predictedButDnp += 1; continue; }
        if (!pr || pr.expectedMinutes == null) { a.playedButUnpredicted += 1; continue; }
        a.matched += 1;
        const big = pr.expectedMinutes >= 20;
        a.minutesAbsErr.push(Math.abs(pr.expectedMinutes - act.minutes)); if (big) a.minutesAbsErr20.push(Math.abs(pr.expectedMinutes - act.minutes));
        for (const k of STATS) {
          const q = pr[k]; if (!Number.isInteger(act[k]) || !q || q.mean == null) continue;
          const e = Math.abs(q.mean - act[k]), inside = act[k] >= q.p10 && act[k] <= q.p90 ? 1 : 0;
          a.players[k].absErr.push(e); a.players[k].in80.push(inside);
          if (big) { a.players[k].absErr20.push(e); a.players[k].in80_20.push(inside); }
        }
      }
    }
  }
  done += 1;
  if (done % 100 === 0) console.log(`  ${done}/${sample.length} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

const clampP = (p) => Math.min(1 - 1e-12, Math.max(1e-12, p));
function winner(p, y) {
  const n = p.length;
  const brier = mean(p.map((q, i) => (q - y[i]) ** 2));
  const ll = mean(p.map((q, i) => -(y[i] ? Math.log(clampP(q)) : Math.log(1 - clampP(q)))));
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  p.forEach((q, i) => { const b = bins[Math.min(9, Math.floor(q * 10))]; b.n += 1; b.p += q; b.y += y[i]; });
  const ece = bins.reduce((s, b) => s + (b.n ? (b.n / n) * Math.abs(b.p / b.n - b.y / b.n) : 0), 0);
  return { n, brier: r4(brier), logLoss: r4(ll), ece: r4(ece), accuracy: r4(mean(p.map((q, i) => ((q >= 0.5 ? 1 : 0) === y[i] ? 1 : 0)))), reliability: bins.map((b, i) => ({ bin: `${i / 10}-${(i + 1) / 10}`, n: b.n, meanP: b.n ? r3(b.p / b.n) : null, hitRate: b.n ? r3(b.y / b.n) : null })) };
}
function team(a) {
  return {
    marginMAE: r3(mean(a.marginErr.map(Math.abs))), marginBias: r3(mean(a.marginErr)), totalMAE: r3(mean(a.totalErr.map(Math.abs))), totalBias: r3(mean(a.totalErr)),
    marginCoverage80: r3(mean(a.m80)), totalCoverage80: r3(mean(a.t80)), marginCoverage50: a.m50.length ? r3(mean(a.m50)) : null, totalCoverage50: a.t50.length ? r3(mean(a.t50)) : null,
    simMarginSD_mean: r3(mean(a.simMarginSD)), simTotalSD_mean: r3(mean(a.simTotalSD)), overtimeOrTieRate_mean: r4(mean(a.ot)),
  };
}
function players(a) {
  return {
    matchedRows: a.matched, predictedButDnp: a.predictedButDnp, playedButUnpredicted: a.playedButUnpredicted,
    minutesMAE: r3(mean(a.minutesAbsErr)), minutesMAE_expectedGe20: r3(mean(a.minutesAbsErr20)), rowsExpectedGe20: a.minutesAbsErr20.length,
    families: Object.fromEntries(STATS.map((k) => [k, { unconditionalMAE: r3(mean(a.players[k].absErr)), coverage80: r3(mean(a.players[k].in80)), unconditionalMAE_ge20: r3(mean(a.players[k].absErr20)), coverage80_ge20: r3(mean(a.players[k].in80_20)), n: a.players[k].absErr.length, n_ge20: a.players[k].absErr20.length }])),
  };
}
const realized = { games: sample.length, overtimeRate: r4(mean(realizedOT)), preregRealizedOT: 0.0469, marginSD: r3(sdOf(sample.map((g) => g.ftHome - g.ftAway))), totalSD: r3(sdOf(sample.map((g) => g.ftHome + g.ftAway))) };
const res = {
  elo: { winner: winner(A.elo.p, A.elo.y) },
  v0: { modelVersion: NBA_SIM_MODEL_VERSION, simulations: SIMS_V0, winner: winner(A.v0.p, A.v0.y), team: team(A.v0), players: players(A.v0) },
  v1: { modelVersion: NBA_SIM_V1_MODEL_VERSION, simulations: SIMS_V1, winner: winner(A.v1.p, A.v1.y), team: team(A.v1), players: players(A.v1) },
};
const COIN = Math.log(2);
const bars = (m) => {
  const w = res[m].winner, t = res[m].team, p = res[m].players.families;
  const inBand = (x, lo, hi) => x != null && x >= lo && x <= hi;
  return {
    winner_brier_le_0240: w.brier <= 0.24, winner_logloss_le_elo_plus_0005: w.logLoss <= res.elo.winner.logLoss + 0.005, winner_logloss_le_coin_minus_0010: w.logLoss <= COIN - 0.01, winner_ece_le_005: w.ece <= 0.05,
    margin_mae_le_125: t.marginMAE <= 12.5, margin_cov80_in_076_084: inBand(t.marginCoverage80, 0.76, 0.84), margin_absbias_le_10: Math.abs(t.marginBias) <= 1.0,
    total_mae_le_160: t.totalMAE <= 16.0, total_cov80_in_076_084: inBand(t.totalCoverage80, 0.76, 0.84), total_absbias_le_20: Math.abs(t.totalBias) <= 2.0, total_sd_gt_margin_sd: t.simTotalSD_mean > t.simMarginSD_mean,
    minutes_mae_le_60: res[m].players.minutesMAE_expectedGe20 <= 6.0,
    pts_cov80_ge20_in_076_084: inBand(p.pts.coverage80_ge20, 0.76, 0.84), reb_cov80_ge20_in_076_084: inBand(p.reb.coverage80_ge20, 0.76, 0.84), ast_cov80_ge20_in_076_084: inBand(p.ast.coverage80_ge20, 0.76, 0.84), threePm_cov80_ge20_in_074_086: inBand(p.threePm.coverage80_ge20, 0.74, 0.86),
  };
};
const report = {
  schemaVersion: 1, artifact: "nba-sim-v1-dev-evaluation", dataClass: "PRIVATE_RESEARCH", productEligible: false,
  generatedAt: new Date().toISOString(), devSeason: SEASON, minDaysIntoSeason: MIN_DAYS, sampledGames: sample.length, eligible: eligible.length,
  v1Params: V1_PARAMS, v1ProfileParams: PROFILE_PARAMS, paramsFittedOn: "corpus season 2024 (2023-24) only — data/internal/research/nba/reports/sim-v1-calibration-2024.json",
  caveats: [
    "historical development numbers on 2024-25; NOT the assessment season, NOT forward shadow — nothing here promotes or validates v1",
    "pools differ by design: v0 = box-score history; v1 = historical roster proxy (played for the team in its last 10 games and last appeared for it); no injuries feed existed",
    "player rows: v0 quantiles are unconditional over its draws (it always plays everyone); v1 quantiles are conditional on the draws in which the player played",
    "bars are the preregistration §7 SHADOW→PUBLIC bars applied to a historical sample, reported for orientation only",
  ],
  realized, results: res, bars: { v0: bars("v0"), v1: bars("v1") },
};
console.log(JSON.stringify({ realized, elo: res.elo.winner.brier, v0: { winner: { ...res.v0.winner, reliability: undefined }, team: res.v0.team, players: res.v0.players }, v1: { winner: { ...res.v1.winner, reliability: undefined }, team: res.v1.team, players: res.v1.players }, eloWinner: { ...res.elo.winner, reliability: undefined }, bars: report.bars }, null, 1));
console.log(`elapsed ${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (WRITE) {
  const out = path.join(NBA, "reports", "sim-v1-dev-evaluation.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 1) + "\n");
  console.log(`wrote ${path.relative(path.resolve(APP, ".."), out)}`);
}
