/**
 * nba-possession-sim-v0 — FIT of every non-rule constant on the 2023-24 regular season ONLY (corpus season 2024).
 * Read-only harness; prints the fit and (with --write) stores it as
 * data/internal/research/nba/reports/possession-sim-v0-fit-2024.json. The constants in
 * app/src/lib/sports/nba/research/possession-sim/params.mjs FITTED are copied from this report (rounded) and cite it.
 * NBA RESEARCH PROTOTYPE · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * Only box scores of seasons ≤ 2024 and corpus rows of season 2024 are loaded: the 2024-25 development season and the
 * 2025-26 assessment season are never read. Population = regular season (phase 2 + cup final), as in v1.
 *
 * STAGE A — aggregates over 2023-24 player box scores (no simulation):
 *   θ, τ   MLE over player-games of P(FTA odd) = (1 − (1−2θ)^FGM · e^(−2τ·MIN)) / 2: each made FG carries a one-shot
 *          trip (and-one) with probability θ; τ·MIN counts odd trips unrelated to a make (three-shot fouls, technicals),
 *          two-shot trips never change parity. Grid MLE over (FGM, MIN) cells.
 *   STEAL_SHARE_OF_TOV   Σ STL(defence) ÷ Σ TOV(offence)
 *   BLOCK_PER_MISS2/3    non-negative least squares over team-games: BLK(defence) ≈ β2·missed 2PA + β3·missed 3PA
 *   PLAYER_REBOUND_SHARE Σ (OREB + opponent DREB) ÷ Σ live misses, live misses = missed FGA + trips × (1 − FT%)
 *                        (the last free throw of every trip is live; trips = two-shot + three-shot + and-one)
 *   HOME_*_RATIO         home ÷ away league FG%, TOV per segment, two-shot trips per segment
 * STAGE B — as-of (games ≥ 30 days in; inputs strictly before tip, exactly as v1):
 *   PACE_OFFSET/SLOPE    OLS of game segments per 48 on the mean of the two teams' as-of paces
 *   SEGMENT_DURATION_SHAPE  k such that a renewal process of min(24 s, Gamma(k)) segments has the residual variance of
 *                        game segments: Var(N) ≈ E[N]·CV²(k). (The residual also carries as-of estimation error, so this
 *                        k is a LOWER bound on the true shape — durations err toward too variable.)
 * STAGE C — simulation on a 2023-24 subsample (every --stride'th fit game, --sims draws):
 *   LATE_FOUL_WINDOW_DS × LATE_FOUL_MAX_DEFICIT grid: minimise Σ_b ((sim_b − real_b)/se_b)² where b ∈ final-margin
 *   buckets {1–3, 4–6, 7–10} and the statistic is mean (winner FTA − loser FTA) — the real side over ALL fit-sample
 *   games, the simulated side pooled over the subsample's draws. Then reports the fit-season bias of
 *   total and margin, OT rate and SDs at the chosen values (orientation only).
 *
 * Run (from app/, single process, low priority during protected windows):
 *   nice -n 19 node scripts/nba/research/fit-possession-sim-v0.mjs [--stage A|B|C|all] [--stride 4] [--sims 200] [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { indexBoxscores, leagueMeans, buildSideProfile, historicalRosterProxy } from "../../../src/lib/sports/nba/sim-v1-profile.mjs";
import { indexExtended, leagueExtended, teamFactors, derivedTeamGame, buildPossessionSide } from "../../../src/lib/sports/nba/research/possession-sim/profile-ext.mjs";
import { cappedGammaMean, solveGammaScale, gammaP, preparePossessionGame, simulatePossessionDraw } from "../../../src/lib/sports/nba/research/possession-sim/engine.mjs";
import { checkPossessionDraw } from "../../../src/lib/sports/nba/research/possession-sim/invariants.mjs";
import { POSSESSION_PARAMS, RULES } from "../../../src/lib/sports/nba/research/possession-sim/params.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const SEASON = 2024; // FIT SEASON — fixed
const MIN_DAYS = 30;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const STAGE = opt("--stage", "all");
const STRIDE = Number(opt("--stride", 4));
const SIMS = Number(opt("--sims", 200));
const WRITE = argv.includes("--write");
const r = (x, d = 5) => Number(x.toFixed(d));

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const box = fs.readdirSync(path.join(NBA, "boxscores")).filter((f) => /^\d+\.json$/.test(f)).map((f) => readJson(path.join(NBA, "boxscores", f))).filter((d) => d.season <= SEASON);
const regular = (d) => d.phase === 2 || d.phase === "cup-final";
const fitDocs = box.filter((d) => d.season === SEASON && regular(d) && d.boxscoreAvailable);
const KEYS = ["fgm", "fga", "threePm", "threePa", "ftm", "fta", "oreb", "dreb", "reb", "ast", "tov", "stl", "blk", "pf", "pts", "minutes"];

/* ─────────────── STAGE A ─────────────── */
const playerGames = [];
const teamGames = []; // { own, opp, isHome }
for (const d of fitDocs) {
  const sums = new Map();
  let complete = true;
  for (const p of d.players) {
    if (p.didNotPlay || !(Number.isInteger(p.minutes) && p.minutes > 0)) continue;
    if (KEYS.some((k) => !Number.isInteger(p[k]))) { complete = false; continue; }
    playerGames.push(p);
    const t = String(p.providerTeamId);
    if (!sums.has(t)) sums.set(t, Object.fromEntries(KEYS.map((k) => [k, 0])));
    for (const k of KEYS) sums.get(t)[k] += p[k];
  }
  const teams = d.teams.map((x) => String(x.providerTeamId));
  if (!complete || teams.length !== 2 || !sums.has(teams[0]) || !sums.has(teams[1])) continue;
  for (let k = 0; k < 2; k += 1) teamGames.push({ own: sums.get(teams[k]), opp: sums.get(teams[1 - k]), isHome: d.teams[k].homeAway === "home" && d.neutralSite !== true, eventId: String(d.providerEventId) });
}

// θ, τ grid MLE over (FGM, MIN) cells
const cells = new Map();
for (const p of playerGames) { const key = `${p.fgm}|${p.minutes}`; const c = cells.get(key) ?? { fgm: p.fgm, min: p.minutes, n: 0, odd: 0 }; c.n += 1; if (p.fta % 2) c.odd += 1; cells.set(key, c); }
const cellArr = [...cells.values()];
const ll = (th, ta) => { let s = 0; for (const c of cellArr) { const po = Math.min(1 - 1e-12, Math.max(1e-12, (1 - (1 - 2 * th) ** c.fgm * Math.exp(-2 * ta * c.min)) / 2)); s += c.odd * Math.log(po) + (c.n - c.odd) * Math.log(1 - po); } return s; };
let best = { th: 0, ta: 0, ll: -Infinity };
for (let th = 0; th <= 0.2; th += 0.002) for (let ta = 0; ta <= 0.002; ta += 0.00002) { const v = ll(th, ta); if (v > best.ll) best = { th, ta, ll: v }; }
// refine
for (let th = Math.max(0, best.th - 0.002); th <= best.th + 0.002; th += 0.0001) for (let ta = Math.max(0, best.ta - 0.00002); ta <= best.ta + 0.00002; ta += 0.000001) { const v = ll(th, ta); if (v > best.ll) best = { th, ta, ll: v }; }
const theta = best.th, tau = best.ta;
const fitted0 = { theta, tau };
// parity check table (observed vs fitted odd rate by FGM bucket)
const parity = [];
for (let f = 0; f <= 12; f += 1) {
  const cs = cellArr.filter((c) => (f < 12 ? c.fgm === f : c.fgm >= 12));
  const n = cs.reduce((s, c) => s + c.n, 0), odd = cs.reduce((s, c) => s + c.odd, 0);
  const pred = cs.reduce((s, c) => s + c.n * (1 - (1 - 2 * theta) ** c.fgm * Math.exp(-2 * tau * c.min)) / 2, 0);
  parity.push({ fgm: f < 12 ? String(f) : "12+", n, observedOdd: r(odd / n, 4), fittedOdd: r(pred / n, 4) });
}

const sum = (f) => teamGames.reduce((s, g) => s + f(g), 0);
const STEAL_SHARE = sum((g) => g.opp.stl) / sum((g) => g.own.tov);
// NNLS for blocks
const m2 = (g) => (g.own.fga - g.own.threePa) - (g.own.fgm - g.own.threePm), m3 = (g) => g.own.threePa - g.own.threePm;
let s22 = 0, s33 = 0, s23 = 0, s2y = 0, s3y = 0;
for (const g of teamGames) { const a = m2(g), b = m3(g), y = g.opp.blk; s22 += a * a; s33 += b * b; s23 += a * b; s2y += a * y; s3y += b * y; }
let b2 = (s2y * s33 - s23 * s3y) / (s22 * s33 - s23 * s23), b3 = (s22 * s3y - s23 * s2y) / (s22 * s33 - s23 * s23);
if (b3 < 0) { b3 = 0; b2 = s2y / s22; }
if (b2 < 0) { b2 = 0; b3 = s3y / s33; }
const der = (g) => derivedTeamGame(g.own, g.opp, fitted0);
const liveMiss = (g) => { const x = der(g); const trips = x.trips2 + x.trips3 + x.andOnes; return (g.own.fga - g.own.fgm) + trips * (g.own.fta > 0 ? 1 - g.own.ftm / g.own.fta : 0); };
const PLAYER_REB_SHARE = sum((g) => g.own.oreb + g.opp.dreb) / sum(liveMiss);
const sideAgg = (home) => { const gs = teamGames.filter((g) => g.isHome === home); const S = (f) => gs.reduce((s, g) => s + f(g), 0); const seg = S((g) => der(g).segments); return { n: gs.length, fgPct: S((g) => g.own.fgm) / S((g) => g.own.fga), tovPerSeg: S((g) => g.own.tov) / seg, trip2PerSeg: S((g) => der(g).trips2) / seg }; };
const H = sideAgg(true), A = sideAgg(false);
const stageA = {
  playerGames: playerGames.length, teamGames: teamGames.length, cells: cellArr.length,
  AND_ONE_PER_FGM: r(theta, 5), THREE_SHOT_TRIPS_PER_MIN: r(tau, 7), parityLogLik: r(best.ll, 2), parityTable: parity,
  STEAL_SHARE_OF_TOV: r(STEAL_SHARE, 4), BLOCK_PER_MISS2: r(b2, 4), BLOCK_PER_MISS3: r(b3, 4), PLAYER_REBOUND_SHARE: r(PLAYER_REB_SHARE, 4),
  HOME_FG_RATIO: r(H.fgPct / A.fgPct, 4), HOME_TOV_RATIO: r(H.tovPerSeg / A.tovPerSeg, 4), HOME_TRIP_RATIO: r(H.trip2PerSeg / A.trip2PerSeg, 4), homeAway: { home: H, away: A },
  perTeamGame: { segments: r(sum((g) => der(g).segments) / teamGames.length, 2), trips2: r(sum((g) => der(g).trips2) / teamGames.length, 2), trips3: r(sum((g) => der(g).trips3) / teamGames.length, 3), andOnes: r(sum((g) => der(g).andOnes) / teamGames.length, 2), nonFtFoulsDrawn: r(sum((g) => der(g).nonFtFoulsDrawn) / teamGames.length, 2), possessions: r(sum((g) => { const x = der(g); return g.own.fga - g.own.oreb + g.own.tov + x.trips2 + x.trips3; }) / teamGames.length, 2) },
};
console.log("STAGE A", JSON.stringify({ ...stageA, parityTable: undefined, homeAway: undefined }, null, 1));
const report = { schemaVersion: 1, artifact: "nba-possession-sim-v0-fit", dataClass: "PRIVATE_RESEARCH", productEligible: false, fitSeason: SEASON, minDaysIntoSeason: MIN_DAYS, generatedAt: new Date().toISOString(), method: "see app/scripts/nba/research/fit-possession-sim-v0.mjs header", stageA };

/* ─────────────── STAGE B ─────────────── */
const corpus = readJson(path.join(NBA, "corpus-v1.json"));
const rows = (corpus.rows ?? []).filter((x) => x.season === SEASON && x.phase === 2).sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
const start = Date.parse(rows[0].dateUtc);
const boxById = new Map(box.map((d) => [String(d.providerEventId), d]));
const sample = rows.filter((x) => Date.parse(x.dateUtc) >= start + MIN_DAYS * 86400_000 && boxById.get(String(x.providerEventId))?.boxscoreAvailable);
const ext = indexExtended(box);
const gameById = new Map(ext.games.map((g) => [g.eventId, g]));
let stageB = null;
if (STAGE === "B" || STAGE === "C" || STAGE === "all") {
  const xs = [], ys = [];
  for (const g of sample) {
    const eg = gameById.get(String(g.providerEventId));
    if (!eg?.complete) continue;
    const L = leagueExtended(ext, { asOf: g.dateUtc, fitted: fitted0 });
    const pa = teamFactors(ext, eg.teams[0], { asOf: g.dateUtc, leagueExt: L, fitted: fitted0 }).pace, pb = teamFactors(ext, eg.teams[1], { asOf: g.dateUtc, leagueExt: L, fitted: fitted0 }).pace;
    const gameMinutes = (eg.sums[0].minutes + eg.sums[1].minutes) / 10;
    const segs = derivedTeamGame(eg.sums[0], eg.sums[1], fitted0).segments + derivedTeamGame(eg.sums[1], eg.sums[0], fitted0).segments;
    xs.push((pa + pb) / 2); ys.push(segs * 48 / gameMinutes);
  }
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const offset = my - slope * mx;
  const resid = ys.map((y, i) => y - (offset + slope * xs[i]));
  const rv = resid.reduce((s, e) => s + e * e, 0) / (resid.length - 2);
  const cv2target = rv / my;
  const muDs = 28800 / my, C = RULES.SHOT_CLOCK_DS;
  const cv2 = (k) => { const s = solveGammaScale(k, muDs, C); const m1 = cappedGammaMean(k, s, C); const m2v = k * (k + 1) * s * s * gammaP(k + 2, C / s) + C * C * (1 - gammaP(k, C / s)); return (m2v - m1 * m1) / (m1 * m1); };
  let lo = 0.2, hi = 60;
  const cvLo = cv2(lo), cvHi = cv2(hi);
  let shape;
  if (cv2target >= cvLo) shape = lo; else if (cv2target <= cvHi) shape = hi; else { for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (cv2(mid) > cv2target) lo = mid; else hi = mid; } shape = (lo + hi) / 2; }
  stageB = { games: xs.length, PACE_OFFSET: r(offset, 3), PACE_SLOPE: r(slope, 4), meanSegmentsPer48: r(my, 2), meanPaceInput: r(mx, 2), residualSD: r(Math.sqrt(rv), 3), cv2Target: r(cv2target, 5), meanSegmentSeconds: r(muDs / 10, 3), SEGMENT_DURATION_SHAPE: r(shape, 3), cv2AtShape: r(cv2(shape), 5), shapeBoundHit: shape === 0.2 || shape === 60 };
  console.log("STAGE B", JSON.stringify(stageB, null, 1));
  report.stageB = stageB;
}

/* ─────────────── STAGE C ─────────────── */
if ((STAGE === "C" || STAGE === "all") && stageB) {
  const v1idx = indexBoxscores(box);
  const fittedAB = {
    ...POSSESSION_PARAMS,
    AND_ONE_PER_FGM: stageA.AND_ONE_PER_FGM, THREE_SHOT_TRIPS_PER_MIN: stageA.THREE_SHOT_TRIPS_PER_MIN, STEAL_SHARE_OF_TOV: stageA.STEAL_SHARE_OF_TOV,
    BLOCK_PER_MISS2: stageA.BLOCK_PER_MISS2, BLOCK_PER_MISS3: stageA.BLOCK_PER_MISS3, PLAYER_REBOUND_SHARE: stageA.PLAYER_REBOUND_SHARE,
    HOME_FG_RATIO: stageA.HOME_FG_RATIO, HOME_TOV_RATIO: stageA.HOME_TOV_RATIO, HOME_TRIP_RATIO: stageA.HOME_TRIP_RATIO,
    PACE_OFFSET: stageB.PACE_OFFSET, PACE_SLOPE: stageB.PACE_SLOPE, SEGMENT_DURATION_SHAPE: stageB.SEGMENT_DURATION_SHAPE,
  };
  const fittedTT = { theta: stageA.AND_ONE_PER_FGM, tau: stageA.THREE_SHOT_TRIPS_PER_MIN };
  const sub = sample.filter((_, i) => i % STRIDE === 0);
  const games = [];
  for (const g of sub) {
    const doc = boxById.get(String(g.providerEventId));
    const homeId = String(doc.teams.find((t) => t.homeAway === "home")?.providerTeamId), awayId = String(doc.teams.find((t) => t.homeAway === "away")?.providerTeamId);
    const now = g.dateUtc;
    const league = leagueMeans(v1idx, { asOf: now });
    const L = leagueExtended(ext, { asOf: now, fitted: fittedTT });
    const side = (tid) => buildPossessionSide(ext, { v1Side: buildSideProfile(v1idx, { teamId: tid, rosterRows: historicalRosterProxy(v1idx, tid, { asOf: now }).map((id) => ({ providerAthleteId: id, availability: "unknown" })), asOf: now, league }), asOf: now, leagueExt: L, fitted: fittedTT });
    const hs = side(homeId), as = side(awayId);
    if (hs.players.length < 5 || as.players.length < 5) continue;
    const fta = (tid) => doc.players.filter((p) => String(p.providerTeamId) === tid && Number.isInteger(p.fta)).reduce((s, p) => s + p.fta, 0);
    games.push({ g, now, homeId, awayId, hs, as, league, L, realFtaDiffHomeMinusAway: fta(homeId) - fta(awayId) });
  }
  const buckets = [[1, 3], [4, 6], [7, 10]];
  const bucketOf = (m) => buckets.findIndex(([a, b]) => Math.abs(m) >= a && Math.abs(m) <= b);
  // real statistic — over ALL fit-sample games (no simulation needed; the stride subsample alone left se ≈ 1.1–1.6 FTA)
  const real = buckets.map(() => []);
  for (const g of sample) {
    const doc = boxById.get(String(g.providerEventId));
    const hId = String(doc.teams.find((t) => t.homeAway === "home")?.providerTeamId);
    const fta = (home) => doc.players.filter((p) => (String(p.providerTeamId) === hId) === home && Number.isInteger(p.fta)).reduce((s, p) => s + p.fta, 0);
    const m = g.ftHome - g.ftAway; const b = bucketOf(m);
    if (b >= 0) real[b].push(Math.sign(m) * (fta(true) - fta(false)));
  }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sdv = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
  const realStat = real.map((a) => ({ n: a.length, mean: r(mean(a), 3), se: r(sdv(a) / Math.sqrt(a.length), 3) }));
  console.log("STAGE C real winner−loser FTA by final-margin bucket", JSON.stringify(realStat));
  // per-draw FTA by side and margin (the first draw of every game also runs the full invariant checker)
  const evalConfig = (W, D) => {
    const st = buckets.map(() => ({ s: 0, n: 0 }));
    const pooled = { margin: [], total: [], ot: 0, n: 0, marginErr: [], totalErr: [], fta: 0, tov: 0, oreb: 0, stl: 0, blk: 0, pf: 0, threePa: 0, fga: 0 };
    for (const x of games) {
      const prep = preparePossessionGame({ providerEventId: x.g.providerEventId, neutralSite: x.g.neutralSite === true, home: { providerTeamId: x.homeId, side: x.hs }, away: { providerTeamId: x.awayId, side: x.as }, leagueV1: x.league, leagueExt: x.L, params: { ...fittedAB, LATE_FOUL_WINDOW_DS: W, LATE_FOUL_MAX_DEFICIT: D } });
      let ms = 0, ts = 0;
      for (let i = 0; i < SIMS; i += 1) {
        const d = simulatePossessionDraw(prep, i);
        if (i === 0) { const v = checkPossessionDraw(d, prep.rosters); if (v.length) throw new Error(v.join("; ")); }
        const m = d.final[0] - d.final[1];
        const b = bucketOf(m);
        if (b >= 0) { st[b].s += Math.sign(m) * (d.box.team[0].fta - d.box.team[1].fta); st[b].n += 1; }
        ms += m; ts += d.final[0] + d.final[1];
        if (d.overtimePeriods > 0) pooled.ot += 1;
        pooled.n += 1;
        for (const k of ["fta", "tov", "oreb", "stl", "blk", "pf", "threePa", "fga"]) pooled[k] += (d.box.team[0][k] + d.box.team[1][k]) / 2;
      }
      pooled.marginErr.push(ms / SIMS - (x.g.ftHome - x.g.ftAway)); pooled.totalErr.push(ts / SIMS - (x.g.ftHome + x.g.ftAway));
    }
    const sim = st.map((b) => (b.n ? b.s / b.n : null));
    const obj = sim.reduce((s, v, b) => s + ((v - realStat[b].mean) / realStat[b].se) ** 2, 0);
    return { W, D, simStat: sim.map((v) => r(v, 3)), objective: r(obj, 3), otRate: r(pooled.ot / pooled.n, 4), marginBias: r(mean(pooled.marginErr), 3), totalBias: r(mean(pooled.totalErr), 3), perTeamGame: Object.fromEntries(["fta", "tov", "oreb", "stl", "blk", "pf", "threePa", "fga"].map((k) => [k, r(pooled[k] / pooled.n, 2)])) };
  };
  const grid = [];
  const t0 = Date.now();
  for (const W of [0, 300, 600, 900, 1200]) for (const D of W === 0 ? [0] : [3, 6, 9]) { const res = evalConfig(W, D); grid.push(res); console.log(JSON.stringify(res), `${((Date.now() - t0) / 1000).toFixed(0)} s`); }
  const chosen = grid.slice().sort((a, b) => a.objective - b.objective || a.W - b.W || a.D - b.D)[0];
  const realTeam = Object.fromEntries(["fta", "tov", "oreb", "stl", "blk", "pf", "threePa", "fga"].map((k) => [k, r(mean(games.map((x) => { const doc = boxById.get(String(x.g.providerEventId)); return doc.players.filter((p) => Number.isInteger(p[k])).reduce((s, p) => s + p[k], 0) / 2; })), 2)]));
  const realOt = r(mean(games.map((x) => (x.g.overtime ? 1 : 0))), 4);
  report.stageC = { games: games.length, stride: STRIDE, sims: SIMS, buckets: buckets.map(([a, b]) => `${a}-${b}`), realStat, grid, chosen: { LATE_FOUL_WINDOW_DS: chosen.W, LATE_FOUL_MAX_DEFICIT: chosen.D }, fitSeasonCheckAtChosen: { simMarginBias: chosen.marginBias, simTotalBias: chosen.totalBias, simOtRate: chosen.otRate, realOtRate: realOt, simPerTeamGame: chosen.perTeamGame, realPerTeamGame: realTeam } };
  console.log("STAGE C chosen", JSON.stringify(report.stageC.chosen), JSON.stringify(report.stageC.fitSeasonCheckAtChosen));
}
report.fit = {
  AND_ONE_PER_FGM: stageA.AND_ONE_PER_FGM, THREE_SHOT_TRIPS_PER_MIN: stageA.THREE_SHOT_TRIPS_PER_MIN, STEAL_SHARE_OF_TOV: stageA.STEAL_SHARE_OF_TOV,
  BLOCK_PER_MISS2: stageA.BLOCK_PER_MISS2, BLOCK_PER_MISS3: stageA.BLOCK_PER_MISS3, PLAYER_REBOUND_SHARE: stageA.PLAYER_REBOUND_SHARE,
  HOME_FG_RATIO: stageA.HOME_FG_RATIO, HOME_TOV_RATIO: stageA.HOME_TOV_RATIO, HOME_TRIP_RATIO: stageA.HOME_TRIP_RATIO,
  ...(stageB ? { PACE_OFFSET: stageB.PACE_OFFSET, PACE_SLOPE: stageB.PACE_SLOPE, SEGMENT_DURATION_SHAPE: stageB.SEGMENT_DURATION_SHAPE } : {}),
  ...(report.stageC ? report.stageC.chosen : {}),
};
console.log("FIT", JSON.stringify(report.fit));
if (WRITE) {
  const out = path.join(NBA, "reports", "possession-sim-v0-fit-2024.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 1) + "\n");
  console.log(`wrote ${path.relative(path.resolve(APP, ".."), out)}`);
}
