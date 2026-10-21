/**
 * nba-possession-sim-v0 · AS-OF EXTENDED PROFILES. PURE, deterministic, no I/O.
 * NBA RESEARCH PROTOTYPE · dataClass PRIVATE_RESEARCH · productEligible: false · never wired into a route/artifact/board.
 *
 * The v1 profile (sim-v1-profile.mjs, imported read-only) already gives each player minutes mean/SD, play rate and
 * shrunk per-minute pts/reb/ast/3PA/3PM/2PA/2PM/FTA/FTM plus 3P%/2P%. A possession engine also needs the stats v1 never
 * reads: OREB, DREB, TOV, STL, BLK, PF per minute, and team-level pace and defensive ratios. This module computes them
 * with EXACTLY the v1 rules (same leakage cutoff, same population/season filter, same recency half-lives, same
 * shrinkage pseudo-minutes / pseudo-games — the constants are read from PROFILE_PARAMS, not restated), so no new
 * profile constant is introduced here:
 *   - player per-minute rate  = (Σ w·stat + K·league) / (Σ w·min + K), w = 0.5^(k / RATE_HALF_LIFE_APPS), K = RATE_PRIOR_MINUTES
 *   - team ratios             = recency-weighted (TEAM_HALF_LIFE_GAMES) sums, shrunk with TEAM_PRIOR_GAMES pseudo-games of
 *                               the league per-game values
 *   - league means            = the last LEAGUE_WINDOW_GAMES population games before asOf in seasons S and S−1
 *
 * TIMED SEGMENTS (the engine's unit of clock time; see params.mjs for the derivation of θ and τ):
 *   segments(team on offence) = FGA + TOV + trips2 + trips3 + nonFtFoulsDrawn
 *   trips2 = (FTA − θ·FGM − 3·trips3) / 2,  trips3 = τ·minutes,  nonFtFoulsDrawn = opponent PF − trips2 − trips3 − θ·FGM
 * all from the player box-score sums of the team-game (team-credited rebounds / turnovers are not in the corpus).
 */
import { PROFILE_PARAMS, corpusSeasonOfDate, inPopulation } from "../../sim-v1-profile.mjs";

export const EXT_KEYS = Object.freeze(["oreb", "dreb", "tov", "stl", "blk", "pf"]);
const TEAM_KEYS = ["fga", "fgm", "threePa", "threePm", "fta", "ftm", "oreb", "dreb", "tov", "stl", "blk", "pf", "pts", "minutes"];
const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(5)));
const isInt = Number.isInteger;

const seasonsFor = (asOf) => { const s = corpusSeasonOfDate(asOf); return new Set([s, s - 1]); };
const before = (rows, cutoff, population, seasons) => rows.filter((r) => r.t < cutoff && inPopulation(r.phase, population) && seasons.has(r.season));

/**
 * Derived per-team-game quantities given the fitted θ (and-ones per made FG) and τ (three-shot trips per minute).
 * `o` = the team's own sums, `d` = the opponent's sums.
 */
export function derivedTeamGame(o, d, { theta, tau }) {
  const trips3 = tau * o.minutes;
  const andOnes = theta * o.fgm;
  const trips2 = Math.max(0, (o.fta - andOnes - 3 * trips3) / 2);
  const nonFtFoulsDrawn = Math.max(0, d.pf - trips2 - trips3 - andOnes);
  const segments = o.fga + o.tov + trips2 + trips3 + nonFtFoulsDrawn;
  return { trips2, trips3, andOnes, nonFtFoulsDrawn, segments };
}

/**
 * Index box-score docs once (pure). Only complete docs (every played line carries every stat used) enter team rows.
 * @returns {{ byAthlete: Map<string, object[]>, byTeam: Map<string, object[]>, games: object[] }}
 */
export function indexExtended(boxscores) {
  const docs = (Array.isArray(boxscores) ? boxscores : [])
    .filter((d) => d?.boxscoreAvailable && typeof d.dateUtc === "string" && Number.isFinite(Date.parse(d.dateUtc)) && Array.isArray(d.players))
    .map((d) => ({ d, t: Date.parse(d.dateUtc), season: isInt(d.season) ? d.season : corpusSeasonOfDate(d.dateUtc) }))
    .sort((a, b) => a.t - b.t || String(a.d.providerEventId).localeCompare(String(b.d.providerEventId)));
  const byAthlete = new Map(), byTeam = new Map(), games = [];
  for (const { d, t, season } of docs) {
    const sums = new Map();
    let complete = true;
    for (const p of d.players) {
      if (p?.providerAthleteId == null) continue;
      const played = !p.didNotPlay && isInt(p.minutes) && p.minutes > 0;
      if (!played) continue;
      const id = String(p.providerAthleteId), teamId = String(p.providerTeamId);
      const ok = TEAM_KEYS.every((k) => isInt(p[k]));
      if (!ok) complete = false;
      if (!byAthlete.has(id)) byAthlete.set(id, []);
      byAthlete.get(id).push({ t, season, phase: d.phase, eventId: String(d.providerEventId), teamId, minutes: p.minutes, ...Object.fromEntries(EXT_KEYS.map((k) => [k, isInt(p[k]) ? p[k] : null])), fgm: isInt(p.fgm) ? p.fgm : null, fta: isInt(p.fta) ? p.fta : null });
      if (!sums.has(teamId)) sums.set(teamId, Object.fromEntries(TEAM_KEYS.map((k) => [k, 0])));
      const s = sums.get(teamId);
      for (const k of TEAM_KEYS) if (isInt(p[k])) s[k] += p[k];
    }
    const teams = (d.teams ?? []).map((x) => String(x.providerTeamId));
    if (teams.length !== 2 || !sums.has(teams[0]) || !sums.has(teams[1])) continue;
    const home = (d.teams ?? []).find((x) => x.homeAway === "home");
    const g = { t, season, phase: d.phase, eventId: String(d.providerEventId), teams, homeTeamId: home ? String(home.providerTeamId) : null, sums: teams.map((id) => sums.get(id)), complete };
    games.push(g);
    if (!complete) continue;
    for (let k = 0; k < 2; k += 1) {
      if (!byTeam.has(teams[k])) byTeam.set(teams[k], []);
      byTeam.get(teams[k]).push({ t, season, phase: d.phase, eventId: g.eventId, own: g.sums[k], opp: g.sums[1 - k], isHome: g.homeTeamId === teams[k] });
    }
  }
  return { byAthlete, byTeam, games };
}

/**
 * League as-of means for the extended keys (per minute), per-segment rates, FG%, and game segments per 48 minutes.
 * The window is the v1 rule: the last LEAGUE_WINDOW_GAMES complete population games before asOf in seasons S, S−1.
 */
export function leagueExtended(index, { asOf, population = "regular", fitted }) {
  const cutoff = Date.parse(asOf);
  if (!Number.isFinite(cutoff)) throw new Error("leagueExtended: asOf (ISO) required");
  const games = before(index.games, cutoff, population, seasonsFor(asOf)).filter((g) => g.complete).slice(-PROFILE_PARAMS.LEAGUE_WINDOW_GAMES);
  if (!games.length) return null;
  const tot = Object.fromEntries(TEAM_KEYS.map((k) => [k, 0]));
  let segs = 0, trips2 = 0, trips3 = 0, nonFt = 0, per48 = 0;
  for (const g of games) {
    for (let k = 0; k < 2; k += 1) {
      for (const key of TEAM_KEYS) tot[key] += g.sums[k][key];
      const x = derivedTeamGame(g.sums[k], g.sums[1 - k], fitted);
      segs += x.segments; trips2 += x.trips2; trips3 += x.trips3; nonFt += x.nonFtFoulsDrawn;
    }
    const gameMinutes = (g.sums[0].minutes + g.sums[1].minutes) / 10; // team-minutes ÷ 5 per side × 2 sides
    per48 += (derivedTeamGame(g.sums[0], g.sums[1], fitted).segments + derivedTeamGame(g.sums[1], g.sums[0], fitted).segments) * 48 / gameMinutes;
  }
  return {
    games: games.length, fromUtc: new Date(games[0].t).toISOString(), toUtc: new Date(games[games.length - 1].t).toISOString(),
    perMinute: Object.fromEntries(EXT_KEYS.map((k) => [k, tot[k] / tot.minutes])),
    fgPct: tot.fgm / tot.fga,
    tovPerSegment: tot.tov / segs, trip2PerSegment: trips2 / segs, trip3PerSegment: trips3 / segs, nonFtFoulPerSegment: nonFt / segs,
    segmentsPer48: per48 / games.length,
    teamGames: 2 * games.length,
  };
}

/** One player's extended per-minute rates (v1 recency + shrinkage rule), or null with no played appearance. */
export function playerExtended(index, athleteId, { asOf, population = "regular", leagueExt }) {
  const cutoff = Date.parse(asOf);
  const P = PROFILE_PARAMS;
  const rows = before(index.byAthlete.get(String(athleteId)) ?? [], cutoff, population, seasonsFor(asOf)).reverse();
  if (!rows.length) return null;
  const sw = Object.fromEntries(EXT_KEYS.map((k) => [k, 0])), sm = Object.fromEntries(EXT_KEYS.map((k) => [k, 0]));
  rows.forEach((r, i) => {
    const w = 0.5 ** (i / P.RATE_HALF_LIFE_APPS);
    for (const k of EXT_KEYS) if (r[k] != null) { sw[k] += w * r[k]; sm[k] += w * r.minutes; }
  });
  const K = P.RATE_PRIOR_MINUTES;
  return Object.fromEntries(EXT_KEYS.map((k) => [k, r5((sw[k] + K * leagueExt.perMinute[k]) / (sm[k] + K))]));
}

/**
 * Team as-of factors: pace (game segments per 48 in this team's games) and three defensive ratios (opponent rate when
 * facing this team ÷ league rate): FG% allowed, TOV per segment forced, two-shot trips per segment conceded.
 */
export function teamFactors(index, teamId, { asOf, population = "regular", leagueExt, fitted }) {
  const cutoff = Date.parse(asOf);
  const P = PROFILE_PARAMS;
  const rows = before(index.byTeam.get(String(teamId)) ?? [], cutoff, population, seasonsFor(asOf)).reverse();
  let w = 0, pace = 0, fga = 0, fgm = 0, tov = 0, trips = 0, segs = 0;
  rows.forEach((r, i) => {
    const x = 0.5 ** (i / P.TEAM_HALF_LIFE_GAMES);
    const oppSeg = derivedTeamGame(r.opp, r.own, fitted), ownSeg = derivedTeamGame(r.own, r.opp, fitted);
    const gameMinutes = (r.own.minutes + r.opp.minutes) / 10;
    w += x; pace += x * (oppSeg.segments + ownSeg.segments) * 48 / gameMinutes;
    fga += x * r.opp.fga; fgm += x * r.opp.fgm; tov += x * r.opp.tov; trips += x * oppSeg.trips2; segs += x * oppSeg.segments;
  });
  const G = P.TEAM_PRIOR_GAMES, L = leagueExt;
  const segPerTeamGame = L.segmentsPer48 / 2;
  const fgaPerTeamGame = segPerTeamGame * (1 - L.tovPerSegment - L.trip2PerSegment - L.trip3PerSegment - L.nonFtFoulPerSegment);
  return {
    games: rows.length,
    pace: r5((pace + G * L.segmentsPer48) / (w + G)),
    defFgPct: r5(((fgm + G * fgaPerTeamGame * L.fgPct) / (fga + G * fgaPerTeamGame)) / L.fgPct),
    defTov: r5(((tov + G * segPerTeamGame * L.tovPerSegment) / (segs + G * segPerTeamGame)) / L.tovPerSegment),
    defTrip: r5(((trips + G * segPerTeamGame * L.trip2PerSegment) / (segs + G * segPerTeamGame)) / L.trip2PerSegment),
  };
}

/**
 * Engine input for one side: the v1 side profile (buildSideProfile, read-only) joined with the extended rates and the
 * team factors. Players without extended history cannot occur (the v1 profile already requires a played appearance in
 * the same window); a missing one is refused loudly.
 */
export function buildPossessionSide(index, { v1Side, asOf, population = "regular", leagueExt, fitted }) {
  const players = v1Side.players.map((p) => {
    const ext = playerExtended(index, p.providerAthleteId, { asOf, population, leagueExt });
    if (!ext) throw new Error(`buildPossessionSide: ${p.providerAthleteId} has a v1 profile but no extended history`);
    return { ...p, ext };
  });
  return { teamId: v1Side.teamId, players, factors: teamFactors(index, v1Side.teamId, { asOf, population, leagueExt, fitted }), excludedOut: v1Side.excludedOut, insufficientHistory: v1Side.insufficientHistory };
}
