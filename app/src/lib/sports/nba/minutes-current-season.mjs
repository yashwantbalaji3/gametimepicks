/**
 * NBA MINUTES CHALLENGER — `nba-minutes-current-season@1` (Track B #1, PD 2026-11-10; the v0.1 minutes diagnostic of
 * 2026-11-10 found every 2026-27 forecast using a 2025-26 window, playoffs included, and a proportional rescale that
 * pushed stars to 46–48 minutes). PURE, deterministic, no I/O. dataClass PRIVATE_RESEARCH · productEligible: false ·
 * feeds no public surface and changes no official forecast.
 *
 * For one team side of one frozen official v0.1 forecast game:
 *   POOL       the official pool, unchanged in membership and availability: the players the frozen forecast simulated
 *              (`forecast.players[side]`) plus the roster players it could not project for lack of history
 *              (`<side>.pool.insufficientHistory`). OUT players stay out (they are in neither list).
 *   HISTORY    the CURRENT season only: regular-season box scores (phase 2, final, box score available) of the game's own
 *              NBA season (finals-record.mjs nbaSeasonLabel of the ET date) strictly before BOTH the forecast's inputAsOf
 *              AND the game's ET date. No playoffs, no prior season.
 *   ESTIMATE   v0.1's own rule (minutes-model.mjs), applied to that history:
 *                trailing    mean minutes over the player's appearances in the team's last TRAILING_N (10) games, when
 *                            he has ≥ MIN_GAMES_FOR_RATES (3) of them;
 *                season      else his mean over all his current-season regular appearances (any team), when ≥ 3;
 *                fallback    else the frozen official v0.1 value before its rescale (expectedMinutes / rescaleFactor,
 *                            a lower bound when the frozen value sits at the 48-minute cap) — the prior-season figure;
 *                            a player with neither (no current games, no v0.1 value) is left out, as v0.1 leaves him.
 *              DNP and null-minute rows never count (v0.1's NEVER ZERO-FILL rule). sd: the sample sd of the same
 *              minutes; with fewer than 2 values, DEFAULT_MINUTES_SD_RATIO × estimate (game-sim.mjs).
 *   CEILING    the player's own observed current-season maximum minutes (regular season, any team, same cutoff),
 *              capped at MAX_PLAYER_MINUTES (48). A player with no current game has his estimate as his ceiling.
 *   TO 240     TEAM_MINUTES (240). Pool above 240: every estimate is scaled down by the same factor (no one rises).
 *              Pool below 240: water-filling — one common factor s ≥ 1 with each player at min(estimate × s,
 *              max(estimate, ceiling)), so no one is ever pushed above his own observed maximum; when every player is at
 *              his ceiling and the pool is still short, the side keeps the shortfall (reported, never invented).
 *              sd scales with each player's own factor (final / estimate), as in game-sim.mjs.
 *   INTERVAL   80% minutes interval: Normal(final, sd) quantiles at ±z(0.9), clipped to [0, 48] — the same
 *              distribution game-sim.mjs draws minutes from.
 * No new constant: TRAILING_N, MIN_GAMES_FOR_RATES (minutes-model.mjs), TEAM_MINUTES, MAX_PLAYER_MINUTES,
 * DEFAULT_MINUTES_SD_RATIO (game-sim.mjs). z(0.9) is the standard normal quantile, computed.
 */
import { TRAILING_N, MIN_GAMES_FOR_RATES } from "./minutes-model.mjs";
import { TEAM_MINUTES, MAX_PLAYER_MINUTES, DEFAULT_MINUTES_SD_RATIO } from "./game-sim.mjs";
import { etDateOf as recordEtDateOf, nbaSeasonLabel } from "./finals-record.mjs";

export const MINUTES_CHALLENGER_ID = "nba-minutes-current-season@1";
export const REGULAR_PHASE = 2;
const BISECTION_STEPS = 100; // numerical only

const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(4)));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sampleSd = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};
const etCache = new Map();
const etDateOf = (iso) => { if (!etCache.has(iso)) etCache.set(iso, recordEtDateOf(iso)); return etCache.get(iso); };

/** Standard normal quantile (Acklam's rational approximation, |error| < 1.2e-9) — used only for z(0.9). */
function normalQuantile(p) {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const q = p < 0.5 ? Math.sqrt(-2 * Math.log(p)) : Math.sqrt(-2 * Math.log(1 - p));
  if (p < 0.02425 || p > 1 - 0.02425) {
    const x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    return p < 0.5 ? x : -x;
  }
  const r = (p - 0.5) ** 2;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * (p - 0.5)) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
export const Z80 = normalQuantile(0.9);

/** 80% interval of a Normal(mu, sd) clipped to [0, MAX_PLAYER_MINUTES]. */
export function interval80(mu, sd) {
  const s = Number.isFinite(sd) ? sd : 0;
  const clip = (x) => Math.min(MAX_PLAYER_MINUTES, Math.max(0, x));
  return [r4(clip(mu - Z80 * s)), r4(clip(mu + Z80 * s))];
}

/** Current-season regular-season box scores usable for a forecast (the leakage rule, applied once per game). */
export function eligibleBoxscores(boxscores, { cutoffUtc, gameEt }) {
  const cutoff = Date.parse(cutoffUtc);
  const season = nbaSeasonLabel(gameEt);
  return (boxscores ?? [])
    .filter((b) => b?.boxscoreAvailable && b.status === "STATUS_FINAL" && Number(b.phase) === REGULAR_PHASE && typeof b.dateUtc === "string")
    .filter((b) => Date.parse(b.dateUtc) < cutoff && etDateOf(b.dateUtc) < gameEt && nbaSeasonLabel(etDateOf(b.dateUtc)) === season)
    .sort((x, y) => Date.parse(y.dateUtc) - Date.parse(x.dateUtc) || String(y.providerEventId).localeCompare(String(x.providerEventId)));
}

const played = (p) => p && !p.didNotPlay && Number.isInteger(p.minutes);

/**
 * One player's current-season estimate (no 240 step yet).
 * @param docs     eligibleBoxscores(...) — newest first
 * @param teamId   the player's team in this forecast
 * @param frozen   the frozen v0.1 row ({ expectedMinutes, minutesSd } post-rescale) or null, and the side's rescale factor
 */
export function playerEstimate(docs, teamId, athleteId, { frozen = null, rescaleFactor = null } = {}) {
  const id = String(athleteId), tid = String(teamId);
  const teamDocs = docs.filter((b) => (b.teams ?? []).some((t) => String(t.providerTeamId) === tid)).slice(0, TRAILING_N);
  const rowIn = (b) => (b.players ?? []).find((p) => String(p.providerAthleteId) === id);
  const windowMins = teamDocs.map(rowIn).filter((p) => played(p) && String(p.providerTeamId) === tid).map((p) => p.minutes);
  const seasonMins = docs.map(rowIn).filter(played).map((p) => p.minutes);
  const ceilingObserved = seasonMins.length ? Math.min(MAX_PLAYER_MINUTES, Math.max(...seasonMins)) : null;
  let basis, est, sd, games;
  if (windowMins.length >= MIN_GAMES_FOR_RATES) { basis = "trailing"; est = mean(windowMins); sd = sampleSd(windowMins); games = windowMins.length; }
  else if (seasonMins.length >= MIN_GAMES_FOR_RATES) { basis = "season"; est = mean(seasonMins); sd = sampleSd(seasonMins); games = seasonMins.length; }
  else if (frozen && Number.isFinite(frozen.expectedMinutes) && Number.isFinite(rescaleFactor) && rescaleFactor > 0) {
    basis = frozen.expectedMinutes >= MAX_PLAYER_MINUTES ? "fallback-v0.1-capped" : "fallback-v0.1";
    est = frozen.expectedMinutes / rescaleFactor;
    sd = Number.isFinite(frozen.minutesSd) ? frozen.minutesSd / rescaleFactor : null;
    games = seasonMins.length;
  } else return { providerAthleteId: id, basis: "none", estimate: null, currentGames: seasonMins.length };
  if (!Number.isFinite(sd)) sd = est * DEFAULT_MINUTES_SD_RATIO;
  return { providerAthleteId: id, basis, estimate: est, sd, currentGames: seasonMins.length, basisGames: games, ceilingObserved, ceiling: Math.max(est, ceilingObserved ?? est) };
}

/**
 * Distribute a pool to TEAM_MINUTES with the per-player ceiling (see the header). Pure arithmetic over
 * [{ estimate, ceiling }]; returns finals in input order, the factor and any shortfall.
 */
export function distributeTo240(rows) {
  const xs = rows.map((r) => ({ m: r.estimate, c: Math.min(MAX_PLAYER_MINUTES, Math.max(r.estimate, r.ceiling ?? r.estimate)) }));
  const raw = xs.reduce((a, x) => a + x.m, 0);
  if (!(raw > 0)) return { finals: xs.map(() => null), factor: null, rawPool: raw, sum: 0, shortfall: TEAM_MINUTES };
  if (raw >= TEAM_MINUTES) {
    const s = TEAM_MINUTES / raw;
    const finals = xs.map((x) => x.m * s);
    return { finals, factor: s, rawPool: raw, sum: finals.reduce((a, b) => a + b, 0), shortfall: 0 };
  }
  const total = (s) => xs.reduce((a, x) => a + Math.min(x.m * s, x.c), 0);
  const capSum = xs.reduce((a, x) => a + x.c, 0);
  if (capSum <= TEAM_MINUTES) {
    const finals = xs.map((x) => x.c);
    return { finals, factor: null, rawPool: raw, sum: capSum, shortfall: TEAM_MINUTES - capSum, allAtCeiling: true };
  }
  let lo = 1, hi = Math.max(...xs.map((x) => x.c / x.m));
  for (let i = 0; i < BISECTION_STEPS; i += 1) { const mid = (lo + hi) / 2; if (total(mid) < TEAM_MINUTES) lo = mid; else hi = mid; }
  const s = (lo + hi) / 2;
  const finals = xs.map((x) => Math.min(x.m * s, x.c));
  return { finals, factor: s, rawPool: raw, sum: finals.reduce((a, b) => a + b, 0), shortfall: 0 };
}

/**
 * The challenger for one side of one frozen official forecast game.
 * @param game       frozen v0.1 forecast game ({ providerEventId, dateUtc, home/away: { providerTeamId, pool }, forecast })
 * @param side       "home" | "away"
 * @param boxscores  all box-score docs available (any season; the leakage rule selects)
 */
export function minutesChallengerSide(game, side, boxscores) {
  const f = game?.forecast;
  const cutoffUtc = f?.inputAsOf;
  if (typeof cutoffUtc !== "string" || !(Date.parse(cutoffUtc) < Date.parse(game?.dateUtc))) return { ok: false, reason: "FORECAST_NOT_BEFORE_TIP" };
  const teamId = game[side]?.providerTeamId;
  if (teamId == null) return { ok: false, reason: "NO_TEAM" };
  const docs = eligibleBoxscores(boxscores, { cutoffUtc, gameEt: etDateOf(game.dateUtc) });
  const rescaleFactor = f.assumptions?.minutes?.[side]?.rescaleFactor ?? null;
  const simulated = (f.players?.[side] ?? []).filter((p) => p.availability !== "out");
  const noHistory = (game[side]?.pool?.insufficientHistory ?? []).filter((p) => !simulated.some((s) => String(s.providerAthleteId) === String(p.providerAthleteId)));
  const pool = [
    ...simulated.map((p) => ({ providerAthleteId: String(p.providerAthleteId), name: p.name ?? null, frozen: p, inOfficialPool: true })),
    ...noHistory.map((p) => ({ providerAthleteId: String(p.providerAthleteId), name: p.name ?? null, frozen: null, inOfficialPool: false })),
  ];
  const ests = pool.map((p) => ({ ...p, ...playerEstimate(docs, teamId, p.providerAthleteId, { frozen: p.frozen, rescaleFactor }) }));
  const modelled = ests.filter((e) => Number.isFinite(e.estimate) && e.estimate > 0);
  const dist = distributeTo240(modelled);
  const players = modelled.map((e, i) => {
    const fin = dist.finals[i];
    const sd = e.sd * (fin / e.estimate);
    return {
      providerAthleteId: e.providerAthleteId, name: e.name, inOfficialPool: e.inOfficialPool, basis: e.basis, currentGames: e.currentGames,
      estimate: r4(e.estimate), ceiling: r4(e.ceiling), ceilingObserved: r4(e.ceilingObserved), expectedMinutes: r4(fin), minutesSd: r4(sd), interval80: interval80(fin, sd),
      officialExpectedMinutes: e.frozen ? e.frozen.expectedMinutes : null,
    };
  });
  return {
    ok: true,
    challenger: MINUTES_CHALLENGER_ID,
    providerEventId: String(game.providerEventId),
    side,
    cutoffUtc,
    boxscoresUsed: docs.length,
    teamGamesUsed: Math.min(TRAILING_N, docs.filter((b) => (b.teams ?? []).some((t) => String(t.providerTeamId) === String(teamId))).length),
    rawPool: r4(dist.rawPool),
    factor: r4(dist.factor),
    sum: r4(dist.sum),
    shortfall: r4(dist.shortfall),
    players,
    leftOut: ests.filter((e) => !(Number.isFinite(e.estimate) && e.estimate > 0)).map((e) => ({ providerAthleteId: e.providerAthleteId, name: e.name, basis: e.basis })),
  };
}
