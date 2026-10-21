/**
 * nba-possession-sim-v0 — DEVELOPMENT-SEASON EVALUATION vs nba-sim-v1-coherent and Elo (+ naive baselines for the new
 * STL / BLK / TOV families). Read-only research harness; writes nothing but its own report (with --write).
 * NBA RESEARCH PROTOTYPE · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * SAMPLE AND INPUTS — identical to app/scripts/nba/evaluate-sim-v1.mjs: every 2024-25 regular-season game (corpus season
 * 2025) ≥ 30 days into the season with a box score, thinned to --games N by the same every-k-th rule; Elo through tip
 * (corpus rows of seasons ≤ 2025 only), box scores strictly before tip (docs of seasons ≤ 2025 only — the 2025-26
 * assessment season is never loaded), no injuries feed, the historical roster proxy of sim-v1-profile.mjs for BOTH
 * engines (same pool, so player rows pair exactly). v1 runs with its frozen V1_PARAMS; v0-possession with its frozen
 * FITTED params (2023-24 only). Nothing here feeds back into a parameter.
 *
 * NAIVE BASELINE (player families): the player's mean per played game over his last 10 played population appearances
 * before tip (seasons S and S−1, any team); 80 % interval = Poisson(mean) 10th–90th percentiles.
 * PAIRED DIFFERENCES: (possession − v1), (possession − Elo), (possession − naive), game-clustered percentile bootstrap,
 * 2000 resamples, fixed seeds. Lower log loss / Brier / MAE is better; "established" only when the 95 % interval
 * excludes 0.
 *
 * Run (from app/, single process, low priority):
 *   nice -n 19 node scripts/nba/research/evaluate-possession-sim-v0.mjs [--games N] [--sims-v1 4000] [--sims-pos 1000] [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildTeamRatings, ratingFor, winProbability } from "../../../src/lib/sports/nba/team-rating.mjs";
import { simulateGameV1, NBA_SIM_V1_MODEL_VERSION, V1_PARAMS } from "../../../src/lib/sports/nba/game-sim-v1.mjs";
import { indexBoxscores, leagueMeans, buildSideProfile, historicalRosterProxy, inPopulation, corpusSeasonOfDate } from "../../../src/lib/sports/nba/sim-v1-profile.mjs";
import { indexExtended, leagueExtended, buildPossessionSide } from "../../../src/lib/sports/nba/research/possession-sim/profile-ext.mjs";
import { simulatePossessionGame } from "../../../src/lib/sports/nba/research/possession-sim/simulate.mjs";
import { POSSESSION_SIM_VERSION, POSSESSION_PARAMS, FITTED, FIT_REPORT } from "../../../src/lib/sports/nba/research/possession-sim/params.mjs";
import { winnerScores, pairedWinner, clusteredBootstrap, poissonQuantile } from "../../../src/lib/sports/nba/research/possession-sim/paired-metrics.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const SEASON = 2025;
const MIN_DAYS = 30;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : Number(argv[i + 1]); };
const GAMES = opt("--games", 100000);
const SIMS_V1 = opt("--sims-v1", 4000);
const SIMS_POS = opt("--sims-pos", 1000);
const WRITE = argv.includes("--write");
const OUT = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : path.join(NBA, "reports", "possession-sim-v0-dev-evaluation.json");

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const corpus = readJson(path.join(NBA, "corpus-v1.json"));
const corpusRows = (corpus.rows ?? []).filter((r) => r.season <= SEASON);
const box = fs.readdirSync(path.join(NBA, "boxscores")).filter((f) => /^\d+\.json$/.test(f)).map((f) => readJson(path.join(NBA, "boxscores", f))).filter((d) => d.season <= SEASON);
const boxById = new Map(box.map((d) => [String(d.providerEventId), d]));
const index = indexBoxscores(box);
const ext = indexExtended(box);
const FT = { theta: FITTED.AND_ONE_PER_FGM, tau: FITTED.THREE_SHOT_TRIPS_PER_MIN };

const rows = corpusRows.filter((r) => r.season === SEASON && r.phase === 2).sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
const start = Date.parse(rows[0].dateUtc);
const eligible = rows.filter((r) => Date.parse(r.dateUtc) >= start + MIN_DAYS * 86400_000 && boxById.get(String(r.providerEventId))?.boxscoreAvailable);
const step = Math.max(1, Math.floor(eligible.length / GAMES));
const sample = eligible.filter((_, i) => i % step === 0).slice(0, GAMES);

/* naive baseline: last-10 played appearances before tip (population + seasons rule of the v1 profile) */
const NAIVE_KEYS = ["pts", "reb", "ast", "threePm", "stl", "blk", "tov"];
const appsById = new Map();
for (const d of box) {
  if (!d.boxscoreAvailable || !Array.isArray(d.players)) continue;
  const t = Date.parse(d.dateUtc);
  for (const p of d.players) {
    if (p.didNotPlay || !(Number.isInteger(p.minutes) && p.minutes > 0)) continue;
    const id = String(p.providerAthleteId);
    if (!appsById.has(id)) appsById.set(id, []);
    appsById.get(id).push({ t, phase: d.phase, season: d.season, ...Object.fromEntries(NAIVE_KEYS.map((k) => [k, Number.isInteger(p[k]) ? p[k] : null])) });
  }
}
for (const a of appsById.values()) a.sort((x, y) => x.t - y.t);
function naive(id, asOf) {
  const cut = Date.parse(asOf), s = corpusSeasonOfDate(asOf);
  const apps = (appsById.get(String(id)) ?? []).filter((r) => r.t < cut && inPopulation(r.phase, "regular") && (r.season === s || r.season === s - 1)).slice(-10);
  if (!apps.length) return null;
  return Object.fromEntries(NAIVE_KEYS.map((k) => { const xs = apps.map((r) => r[k]).filter((x) => x != null); const m = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; return [k, m == null ? null : { mean: m, p10: poissonQuantile(m, 0.1), p90: poissonQuantile(m, 0.9) }]; }));
}

function inputs(g) {
  const doc = boxById.get(String(g.providerEventId));
  const homeId = String(doc.teams.find((t) => t.homeAway === "home")?.providerTeamId), awayId = String(doc.teams.find((t) => t.homeAway === "away")?.providerTeamId);
  const now = g.dateUtc;
  const ratings = buildTeamRatings(corpusRows, { throughDateUtc: now, targetSeason: SEASON });
  const hr = ratingFor(ratings, g.home), ar = ratingFor(ratings, g.away);
  const eloP = winProbability(hr.rating, ar.rating, { neutralSite: g.neutralSite === true });
  const league = leagueMeans(index, { asOf: now });
  const leagueExt = leagueExtended(ext, { asOf: now, fitted: FT });
  const prof = (tid) => buildSideProfile(index, { teamId: tid, rosterRows: historicalRosterProxy(index, tid, { asOf: now }).map((id) => ({ providerAthleteId: id, availability: "unknown" })), asOf: now, league });
  const ph = prof(homeId), pa = prof(awayId);
  return {
    doc, homeId, awayId, now, eloP, league, leagueExt,
    v1Home: { name: g.home, providerTeamId: homeId, rating: hr, profile: ph }, v1Away: { name: g.away, providerTeamId: awayId, rating: ar, profile: pa },
    posHome: { providerTeamId: homeId, side: buildPossessionSide(ext, { v1Side: ph, asOf: now, leagueExt, fitted: FT }) },
    posAway: { providerTeamId: awayId, side: buildPossessionSide(ext, { v1Side: pa, asOf: now, leagueExt, fitted: FT }) },
  };
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(3)));
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(4)));
const sdOf = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1)); };

const G = []; // per game
const P = []; // per player row
const TEAM_KEYS = ["fga", "threePa", "fta", "oreb", "dreb", "tov", "stl", "blk", "pf", "ast"];
const teamActual = Object.fromEntries(TEAM_KEYS.map((k) => [k, []])), teamSim = Object.fromEntries(TEAM_KEYS.map((k) => [k, []]));
let example = null;
const t0 = Date.now();
for (const [gi, g] of sample.entries()) {
  const x = inputs(g);
  const y = g.ftHome > g.ftAway ? 1 : 0, am = g.ftHome - g.ftAway, at = g.ftHome + g.ftAway;
  const v1 = simulateGameV1({ providerEventId: g.providerEventId, inputAsOf: x.now, neutralSite: g.neutralSite === true, home: x.v1Home, away: x.v1Away, league: x.league, eloWinProbability: x.eloP, simulations: SIMS_V1 });
  const pos = simulatePossessionGame({ providerEventId: g.providerEventId, inputAsOf: x.now, neutralSite: g.neutralSite === true, home: x.posHome, away: x.posAway, leagueV1: x.league, leagueExt: x.leagueExt, simulations: SIMS_POS, keepSampleRunIndex: gi === 0 ? 0 : null });
  if (gi === 0) example = { providerEventId: String(g.providerEventId), runIndex: 0, linescore: pos.sample.box.linescore, final: pos.sample.box.final, team: pos.sample.box.team, events: pos.sample.events.length, firstEvents: pos.sample.events.slice(0, 16).map((e) => ({ q: e.q, clock: e.clock, type: e.type, team: e.team, poss: e.poss, player: e.player ?? e.in ?? null, made: e.made, value: e.value, kind: e.kind, score: e.score })) };
  const band = (s, a) => (a >= s.p10 && a <= s.p90 ? 1 : 0);
  G.push({
    id: String(g.providerEventId), y, am, at, ot: g.overtime === true ? 1 : 0, elo: x.eloP,
    v1: { p: v1.sim.pHome, mErr: v1.sim.margin.mean - am, tErr: v1.sim.total.mean - at, m80: band(v1.sim.margin, am), t80: band(v1.sim.total, at), mSd: v1.sim.margin.sd, tSd: v1.sim.total.sd, ot: v1.sim.overtimeRate },
    pos: { p: pos.sim.pHome, mErr: pos.sim.margin.mean - am, tErr: pos.sim.total.mean - at, m80: band(pos.sim.margin, am), t80: band(pos.sim.total, at), mSd: pos.sim.margin.sd, tSd: pos.sim.total.sd, ot: pos.sim.overtimeRate },
  });
  for (const [t, side, teamId] of [[0, "home", x.homeId], [1, "away", x.awayId]]) {
    const acts = x.doc.players.filter((p) => String(p.providerTeamId) === teamId);
    for (const k of TEAM_KEYS) { teamActual[k].push(acts.reduce((s, p) => s + (Number.isInteger(p[k]) ? p[k] : 0), 0)); teamSim[k].push(pos.sim.team[t][k]); }
    const pv1 = new Map(v1.players[side].map((p) => [p.providerAthleteId, p])), ppos = new Map(pos.players[side].map((p) => [p.providerAthleteId, p]));
    for (const act of acts) {
      if (act.didNotPlay || !(Number.isInteger(act.minutes) && act.minutes > 0)) continue;
      const id = String(act.providerAthleteId);
      const a = pv1.get(id), b = ppos.get(id);
      if (!a || !b || a.expectedMinutes == null || b.expectedMinutes == null) continue;
      const nv = naive(id, x.now);
      const row = { game: G.length - 1, id, big: a.expectedMinutes >= 20, minutes: act.minutes, minV1: a.expectedMinutes, minPos: b.expectedMinutes, stats: {} };
      for (const k of NAIVE_KEYS) {
        if (!Number.isInteger(act[k])) continue;
        const s = { actual: act[k] };
        if (a[k]?.mean != null) s.v1 = { mean: a[k].mean, in80: band(a[k], act[k]) };
        if (b[k]?.mean != null) s.pos = { mean: b[k].mean, in80: band(b[k], act[k]) };
        if (nv?.[k]) s.naive = { mean: nv[k].mean, in80: band(nv[k], act[k]) };
        row.stats[k] = s;
      }
      P.push(row);
    }
  }
  if ((gi + 1) % 25 === 0) console.log(`  ${gi + 1}/${sample.length} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

/* ─────────────── metrics ─────────────── */
const ys = G.map((g) => g.y);
const winner = { elo: winnerScores(G.map((g) => g.elo), ys), v1: winnerScores(G.map((g) => g.v1.p), ys), pos: winnerScores(G.map((g) => g.pos.p), ys) };
const team = (m) => ({
  marginMAE: r3(mean(G.map((g) => Math.abs(g[m].mErr)))), marginBias: r3(mean(G.map((g) => g[m].mErr))), marginCoverage80: r3(mean(G.map((g) => g[m].m80))),
  totalMAE: r3(mean(G.map((g) => Math.abs(g[m].tErr)))), totalBias: r3(mean(G.map((g) => g[m].tErr))), totalCoverage80: r3(mean(G.map((g) => g[m].t80))),
  simMarginSD_mean: r3(mean(G.map((g) => g[m].mSd))), simTotalSD_mean: r3(mean(G.map((g) => g[m].tSd))), overtimeRate_mean: r4(mean(G.map((g) => g[m].ot))),
});
const byGame = (f) => { const c = G.map(() => []); for (const r of P) { const v = f(r); if (v != null) c[r.game].push(v); } return c; };
const fam = (k, m, sub = () => true) => {
  const rs = P.filter((r) => sub(r) && r.stats[k]?.[m]);
  return { n: rs.length, MAE: r3(mean(rs.map((r) => Math.abs(r.stats[k][m].mean - r.stats[k].actual)))), bias: r3(mean(rs.map((r) => r.stats[k][m].mean - r.stats[k].actual))), coverage80: r3(mean(rs.map((r) => r.stats[k][m].in80))) };
};
const players = {};
for (const k of NAIVE_KEYS) {
  players[k] = { v1: fam(k, "v1"), pos: fam(k, "pos"), naive: fam(k, "naive"), pos_ge20: fam(k, "pos", (r) => r.big), v1_ge20: fam(k, "v1", (r) => r.big), naive_ge20: fam(k, "naive", (r) => r.big) };
}
const minutes = { rows: P.length, v1MAE: r3(mean(P.map((r) => Math.abs(r.minV1 - r.minutes)))), posMAE: r3(mean(P.map((r) => Math.abs(r.minPos - r.minutes)))), v1MAE_ge20: r3(mean(P.filter((r) => r.big).map((r) => Math.abs(r.minV1 - r.minutes)))), posMAE_ge20: r3(mean(P.filter((r) => r.big).map((r) => Math.abs(r.minPos - r.minutes)))) };

const absDiff = (k, a, b) => byGame((r) => (r.stats[k]?.[a] && r.stats[k]?.[b] ? Math.abs(r.stats[k][a].mean - r.stats[k].actual) - Math.abs(r.stats[k][b].mean - r.stats[k].actual) : null));
const paired = {
  note: "A − B; lower is better for log loss, Brier and MAE; an interval excluding 0 is required to call a difference established",
  winner_pos_minus_v1: pairedWinner(G.map((g) => g.pos.p), G.map((g) => g.v1.p), ys, { seed: "pos-v1" }),
  winner_pos_minus_elo: pairedWinner(G.map((g) => g.pos.p), G.map((g) => g.elo), ys, { seed: "pos-elo" }),
  winner_v1_minus_elo: pairedWinner(G.map((g) => g.v1.p), G.map((g) => g.elo), ys, { seed: "v1-elo" }),
  marginAbsErr_pos_minus_v1: clusteredBootstrap(G.map((g) => [Math.abs(g.pos.mErr) - Math.abs(g.v1.mErr)]), { seed: "margin" }),
  totalAbsErr_pos_minus_v1: clusteredBootstrap(G.map((g) => [Math.abs(g.pos.tErr) - Math.abs(g.v1.tErr)]), { seed: "total" }),
  marginCover80_pos_minus_v1: clusteredBootstrap(G.map((g) => [g.pos.m80 - g.v1.m80]), { seed: "mcov" }),
  totalCover80_pos_minus_v1: clusteredBootstrap(G.map((g) => [g.pos.t80 - g.v1.t80]), { seed: "tcov" }),
  playerAbsErr_pos_minus_v1: Object.fromEntries(["pts", "reb", "ast", "threePm"].map((k) => [k, clusteredBootstrap(absDiff(k, "pos", "v1"), { seed: `p-v1-${k}` })])),
  playerAbsErr_pos_minus_naive: Object.fromEntries(NAIVE_KEYS.map((k) => [k, clusteredBootstrap(absDiff(k, "pos", "naive"), { seed: `p-nv-${k}` })])),
  playerCover80_pos_minus_naive: Object.fromEntries(["stl", "blk", "tov"].map((k) => [k, clusteredBootstrap(byGame((r) => (r.stats[k]?.pos && r.stats[k]?.naive ? r.stats[k].pos.in80 - r.stats[k].naive.in80 : null)), { seed: `c-nv-${k}` })])),
};
const teamTotals = Object.fromEntries(TEAM_KEYS.map((k) => [k, { actualPerTeamGame: r3(mean(teamActual[k])), simPerTeamGame: r3(mean(teamSim[k])), bias: r3(mean(teamSim[k]) - mean(teamActual[k])) }]));
const realized = { games: G.length, overtimeRate: r4(mean(G.map((g) => g.ot))), marginSD: r3(sdOf(G.map((g) => g.am))), totalSD: r3(sdOf(G.map((g) => g.at))) };
const report = {
  schemaVersion: 1, artifact: "nba-possession-sim-v0-dev-evaluation", dataClass: "PRIVATE_RESEARCH", productEligible: false,
  generatedAt: new Date().toISOString(), devSeason: SEASON, minDaysIntoSeason: MIN_DAYS, eligible: eligible.length, sampledGames: sample.length, gamesArg: GAMES === 100000 ? "all" : GAMES,
  status: sample.length === eligible.length ? "FULL_DEV_SEASON" : `PARTIAL_SAMPLE (${sample.length} of ${eligible.length} eligible games, every ${step}-th) — the full run is: nice -n 19 node scripts/nba/research/evaluate-possession-sim-v0.mjs --write`,
  models: { possession: { modelVersion: POSSESSION_SIM_VERSION, simulations: SIMS_POS, params: POSSESSION_PARAMS, paramsFittedOn: `corpus season 2024 (2023-24) only — ${FIT_REPORT}` }, v1: { modelVersion: NBA_SIM_V1_MODEL_VERSION, simulations: SIMS_V1, params: V1_PARAMS }, elo: "team-rating.mjs Elo through tip" },
  caveats: [
    "historical development-season numbers on 2024-25; NOT the assessment season, NOT forward shadow — nothing here promotes, validates or productises either engine",
    "both engines use the same historical roster proxy pool and no injuries feed; player rows are paired on players both engines predicted who actually played",
    "player quantiles for both engines are conditional on draws in which the player played; the naive baseline is over played games only",
    "the possession engine uses no Elo: team strength enters only through player rates, team defensive ratios and home court",
    "lower log loss / Brier / MAE is better; a difference is established only when its 95 % game-clustered bootstrap interval excludes 0",
  ],
  realized, winner, team: { v1: team("v1"), pos: team("pos") }, minutes, players, teamTotals, paired, example,
  runtimeSeconds: Math.round((Date.now() - t0) / 1000),
};
console.log(JSON.stringify({ realized, winner, team: report.team, minutes, players, teamTotals, paired }, null, 1));
console.log(`elapsed ${report.runtimeSeconds} s`);
if (WRITE) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 1) + "\n");
  console.log(`wrote ${path.relative(path.resolve(APP, ".."), OUT)}`);
}
