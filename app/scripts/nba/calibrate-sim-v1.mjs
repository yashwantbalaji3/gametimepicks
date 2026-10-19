/**
 * NBA sim v1 — CALIBRATION of the engine's few scalar parameters on the 2023-24 regular season ONLY (corpus season
 * 2024). Read-only harness; prints the fit and (with --write) stores it as
 * data/internal/research/nba/reports/sim-v1-calibration-2024.json. The constants in game-sim-v1.mjs `V1_PARAMS`
 * are copied from this report (rounded) and cite it; nothing reads the report at run time.
 *
 * Per 2023-24 regular-season game ≥ 30 days into the season, with strictly as-of inputs (Elo through tip, profiles
 * from box scores strictly before tip, the historical roster proxy of sim-v1-profile.mjs):
 *   margin:  regulation margin = HCA·home + ELO_TO_MARGIN·(Elo_h − Elo_a)                (OLS, 2 params)
 *   total:   regulation total − L = TOTAL_OFFSET + TOTAL_WEIGHT·(T_raw − L)                (OLS, 2 params)
 *            L = 2 × league points per team-game as of tip; T_raw = (O_h + D_a + O_a + D_h)/2 where O is the pool's
 *            minutes-weighted points per 240 minutes and D the opponent's points allowed per game.
 *   noise:   team score = E·g + σ_e·z with shared pace g ~ N(1, σ_p²): solves Var(margin resid) = 2σ_e² + E[(H−A)²]σ_p²
 *            and Var(total resid) = 2σ_e² + E[(H+A)²]σ_p² for (σ_e, σ_p).
 *   quarters: mean share of regulation points per quarter + Dirichlet concentration α from the per-team-game
 *            Pearson statistic (multinomial ⇒ mean 3; Dirichlet-multinomial ⇒ 3(n+α)/(1+α)).
 *   minutes:  MINUTES_POWER from a grid, minimising expected-minutes MAE of players who played (every 3rd fit game).
 *   overtime: mean points per team per OT period ÷ (expected team points × 5/48)  → OT_SCALE.
 * Regulation scores come from the raw scoreboard linescores (periods 1–4), so OT games enter as regulation ties.
 *
 * Run (from app/): node scripts/nba/calibrate-sim-v1.mjs [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildTeamRatings, ratingFor } from "../../src/lib/sports/nba/team-rating.mjs";
import { indexBoxscores, leagueMeans, buildSideProfile, historicalRosterProxy } from "../../src/lib/sports/nba/sim-v1-profile.mjs";
import { expectedSidePoints, simulateGameV1, V1_PARAMS } from "../../src/lib/sports/nba/game-sim-v1.mjs";
import { winProbability } from "../../src/lib/sports/nba/team-rating.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const SEASON = 2024; // FIT SEASON — fixed; the dev season (2025) and assessment season (2026) are never read here
const MIN_DAYS = 30;
const WRITE = process.argv.includes("--write");

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const corpus = readJson(path.join(NBA, "corpus-v1.json"));
const box = fs.readdirSync(path.join(NBA, "boxscores")).filter((f) => /^\d+\.json$/.test(f)).map((f) => readJson(path.join(NBA, "boxscores", f)))
  .filter((d) => d.season <= SEASON); // nothing after the fit season is even loaded
const index = indexBoxscores(box);
const boxById = new Map(box.map((d) => [String(d.providerEventId), d]));

// linescores (raw scoreboard) for the fit season only
const lines = new Map();
for (const f of fs.readdirSync(path.join(NBA, "raw")).filter((x) => /^espn-.*\.json$/.test(x))) {
  for (const e of readJson(path.join(NBA, "raw", f)).events ?? []) {
    if (e?.season?.year !== SEASON || e?.season?.type !== 2) continue;
    const comp = e.competitions?.[0]; if (!comp) continue;
    const side = (ha) => comp.competitors.find((c) => c.homeAway === ha);
    const h = side("home"), a = side("away");
    const per = (c) => (c?.linescores ?? []).slice().sort((x, y) => x.period - y.period).map((x) => Number(x.value));
    lines.set(String(e.id), { home: per(h), away: per(a) });
  }
}

const rows = (corpus.rows ?? []).filter((r) => r.season === SEASON && r.phase === 2)
  .sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
const start = Date.parse(rows[0].dateUtc);
const sample = rows.filter((r) => Date.parse(r.dateUtc) >= start + MIN_DAYS * 86400_000 && boxById.get(String(r.providerEventId))?.boxscoreAvailable && lines.has(String(r.providerEventId)));
const corpusRows = (corpus.rows ?? []).filter((r) => r.season <= SEASON);

const recs = [];
let t0 = Date.now();
for (const g of sample) {
  const id = String(g.providerEventId);
  const doc = boxById.get(id);
  const homeId = doc.teams.find((t) => t.homeAway === "home")?.providerTeamId, awayId = doc.teams.find((t) => t.homeAway === "away")?.providerTeamId;
  const ls = lines.get(id);
  if (!homeId || !awayId || ls.home.length < 4 || ls.away.length < 4) continue;
  const now = g.dateUtc;
  const ratings = buildTeamRatings(corpusRows, { throughDateUtc: now, targetSeason: SEASON });
  const rh = ratingFor(ratings, g.home).rating, ra = ratingFor(ratings, g.away).rating;
  const league = leagueMeans(index, { asOf: now });
  const sideOf = (tid) => buildSideProfile(index, { teamId: tid, rosterRows: historicalRosterProxy(index, tid, { asOf: now }).map((pid) => ({ providerAthleteId: pid, availability: "unknown" })), asOf: now, league });
  const H = sideOf(homeId), A = sideOf(awayId);
  const L = 2 * league.pointsPerTeamGame;
  const eh = expectedSidePoints(H), ea = expectedSidePoints(A);
  const Traw = (eh.offence + A.defence.ptsAllowed + ea.offence + H.defence.ptsAllowed) / 2;
  const regH = ls.home.slice(0, 4).reduce((s, x) => s + x, 0), regA = ls.away.slice(0, 4).reduce((s, x) => s + x, 0);
  recs.push({ H, A, rh, ra, league, now, homeId, awayId, neutral: g.neutralSite === true, id, home: g.neutralSite === true ? 0 : 1, eloDiff: rh - ra, L, Traw, regMargin: regH - regA, regTotal: regH + regA, ls, overtime: ls.home.length > 4 });
}
console.log(`fit season ${SEASON}: ${recs.length} games (${sample.length} sampled ≥ day ${MIN_DAYS}) · ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
// margin OLS with 2 regressors (home indicator, eloDiff), no free intercept
const Sxx = [[0, 0], [0, 0]], Sxy = [0, 0];
for (const r of recs) { const x = [r.home, r.eloDiff]; for (let i = 0; i < 2; i += 1) { Sxy[i] += x[i] * r.regMargin; for (let j = 0; j < 2; j += 1) Sxx[i][j] += x[i] * x[j]; } }
const det = Sxx[0][0] * Sxx[1][1] - Sxx[0][1] * Sxx[1][0];
const HCA = (Sxy[0] * Sxx[1][1] - Sxx[0][1] * Sxy[1]) / det;
const ELO_TO_MARGIN = (Sxx[0][0] * Sxy[1] - Sxx[1][0] * Sxy[0]) / det;
// total: (regTotal − L) = OFFSET + W·(T_raw − L)   (OLS with intercept; OFFSET absorbs that L is a FINAL-score
// league mean, overtime included, while the engine's expectation is a REGULATION total)
const xs = recs.map((r) => r.Traw - r.L), ys = recs.map((r) => r.regTotal - r.L);
const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
const W = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
const OFFSET = my - W * mx;
const corrTotal = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
const tot = recs.map((r) => { const mt = r.L + OFFSET + W * (r.Traw - r.L), mm = HCA * r.home + ELO_TO_MARGIN * r.eloDiff; return { mt, mm, em: r.regMargin - mm, et: r.regTotal - mt, H: (mt + mm) / 2, A: (mt - mm) / 2 }; });
const Vm = mean(tot.map((x) => x.em ** 2)), Vt = mean(tot.map((x) => x.et ** 2));
const Ed2 = mean(tot.map((x) => (x.H - x.A) ** 2)), Es2 = mean(tot.map((x) => (x.H + x.A) ** 2));
// Vm = 2σe² + Ed2·σp² ; Vt = 2σe² + Es2·σp²
const sp2 = (Vt - Vm) / (Es2 - Ed2);
const se2 = (Vm - Ed2 * sp2) / 2;
// quarters
const shares = [0, 0, 0, 0]; let nTeamGames = 0;
for (const r of recs) for (const s of [r.ls.home, r.ls.away]) { const n = s.slice(0, 4).reduce((a, b) => a + b, 0); for (let q = 0; q < 4; q += 1) shares[q] += s[q] / n; nTeamGames += 1; }
for (let q = 0; q < 4; q += 1) shares[q] /= nTeamGames;
let chi = 0, nMean = 0;
for (const r of recs) for (const s of [r.ls.home, r.ls.away]) { const n = s.slice(0, 4).reduce((a, b) => a + b, 0); nMean += n; for (let q = 0; q < 4; q += 1) chi += (s[q] - n * shares[q]) ** 2 / (n * shares[q]); }
const rho = chi / nTeamGames / 3; nMean /= nTeamGames;
const alpha = rho > 1 ? (nMean - rho) / (rho - 1) : null;
// overtime
const otPts = [], otExp = [];
recs.forEach((r, i) => { if (!r.overtime) return; for (const [s, e] of [[r.ls.home, tot[i].H], [r.ls.away, tot[i].A]]) for (const x of s.slice(4)) { otPts.push(x); otExp.push(e * 5 / 48); } });
const OT_SCALE = mean(otPts) / mean(otExp);

// minutes power: grid over MINUTES_POWER on every 3rd fit game (400 draws each), all other params at the fit above;
// criterion = MAE of the conditional expected minutes for players who actually played (the minutes model's own error)
const GRID = [1, 1.25, 1.5, 1.75, 2, 2.5];
const powerFit = [];
const base = { ...V1_PARAMS, HCA_POINTS: HCA, ELO_TO_MARGIN, TOTAL_WEIGHT: W, TOTAL_OFFSET: OFFSET, TEAM_NOISE_SD: Math.sqrt(se2), PACE_SD: Math.sqrt(Math.max(0, sp2)) };
for (const gamma of GRID) {
  const errs = [], errs20 = [];
  recs.forEach((r, k) => {
    if (k % 3) return;
    const out = simulateGameV1({ providerEventId: r.id, inputAsOf: r.now, neutralSite: r.neutral, home: { name: "h", providerTeamId: r.homeId, rating: { rating: r.rh }, profile: r.H }, away: { name: "a", providerTeamId: r.awayId, rating: { rating: r.ra }, profile: r.A }, league: r.league, eloWinProbability: winProbability(r.rh, r.ra), simulations: 400, params: { ...base, MINUTES_POWER: gamma } });
    const actual = new Map(boxById.get(r.id).players.filter((p) => !p.didNotPlay && Number.isInteger(p.minutes) && p.minutes > 0).map((p) => [String(p.providerAthleteId), p.minutes]));
    for (const p of [...out.players.home, ...out.players.away]) { const a = actual.get(p.providerAthleteId); if (a == null || p.expectedMinutes == null) continue; errs.push(Math.abs(p.expectedMinutes - a)); if (p.expectedMinutes >= 20) errs20.push(Math.abs(p.expectedMinutes - a)); }
  });
  powerFit.push({ gamma, rows: errs.length, minutesMAE: Number(mean(errs).toFixed(3)), minutesMAE_ge20: Number(mean(errs20).toFixed(3)), rows_ge20: errs20.length });
  console.log(`MINUTES_POWER ${gamma}: minutes MAE ${mean(errs).toFixed(3)} (n ${errs.length}) · ≥20 min ${mean(errs20).toFixed(3)} (n ${errs20.length})`);
}
const bestPower = powerFit.slice().sort((a, b) => a.minutesMAE - b.minutesMAE || a.gamma - b.gamma)[0].gamma;

const fit = {
  HCA_POINTS: Number(HCA.toFixed(3)), ELO_TO_MARGIN: Number(ELO_TO_MARGIN.toFixed(5)), TOTAL_WEIGHT: Number(W.toFixed(3)), TOTAL_OFFSET: Number(OFFSET.toFixed(3)),
  TEAM_NOISE_SD: Number(Math.sqrt(se2).toFixed(3)), PACE_SD: Number(Math.sqrt(Math.max(0, sp2)).toFixed(4)),
  QUARTER_SHARES: shares.map((x) => Number(x.toFixed(4))), QUARTER_DIRICHLET_ALPHA: alpha == null ? null : Number(alpha.toFixed(1)), OT_SCALE: Number(OT_SCALE.toFixed(3)), MINUTES_POWER: bestPower,
};
const diag = {
  games: recs.length, overtimeGames: recs.filter((r) => r.overtime).length, regulationTieRate: Number(mean(recs.map((r) => (r.regMargin === 0 ? 1 : 0))).toFixed(4)),
  residualSD: { margin: Number(Math.sqrt(Vm).toFixed(2)), total: Number(Math.sqrt(Vt).toFixed(2)) },
  meanTotal: Number(mean(recs.map((r) => r.regTotal)).toFixed(2)), meanL: Number(mean(recs.map((r) => r.L)).toFixed(2)), meanTraw: Number(mean(recs.map((r) => r.Traw)).toFixed(2)),
  corrTotalSignal: Number(corrTotal.toFixed(3)), sdTrawMinusL: Number(Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) / xs.length).toFixed(2)), totalBiasAtFit: Number(mean(tot.map((x) => x.et)).toFixed(3)), marginBiasAtFit: Number(mean(tot.map((x) => x.em)).toFixed(3)),
  quarterPearsonRatio: Number(rho.toFixed(3)), meanTeamRegPts: Number(nMean.toFixed(2)), otPeriodsTeam: otPts.length, otPtsMean: Number(mean(otPts).toFixed(2)), minutesPowerGrid: powerFit,
};
console.log(JSON.stringify({ fit, diag }, null, 1));
if (WRITE) {
  const out = path.join(NBA, "reports", "sim-v1-calibration-2024.json");
  fs.writeFileSync(out, JSON.stringify({ schemaVersion: 1, artifact: "nba-sim-v1-calibration", dataClass: "PRIVATE_RESEARCH", productEligible: false, fitSeason: SEASON, minDaysIntoSeason: MIN_DAYS, generatedAt: new Date().toISOString(), method: "see app/scripts/nba/calibrate-sim-v1.mjs header", fit, diagnostics: diag }, null, 1) + "\n");
  console.log(`wrote ${path.relative(path.resolve(APP, ".."), out)}`);
}
