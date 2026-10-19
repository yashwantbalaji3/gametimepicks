/**
 * NBA sim v1 — AS-OF PLAYER / TEAM PROFILES (the inputs `game-sim-v1.mjs` consumes). PURE, deterministic, no I/O.
 * NBA REGULAR SEASON — SHADOW CANDIDATE · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * WHY THIS IS NOT minutes-model.mjs. The v0 minutes model picks ONE season (the newest with any game before `now`)
 * and computes rates only when a player has ≥ 3 appearances in it. Under the v0.2 season fold that switches the
 * whole team to the new season after its FIRST new-season game: every player has < 3 appearances, every rate is
 * null, the team-pool fallback is null too, and v0's team score becomes exactly 0 (the 0–0 v0.2 forecasts of
 * 2026-10-13 CLE@ORL, NY@TOR, IND@OKC). v1 never switches seasons wholesale: it reads the current season AND the
 * previous one as ONE recency-weighted history per player and shrinks toward league means by sample size, so a
 * team with 1–2 new-season games still has its players' full prior-season rates (regression test in
 * game-sim-v1.test.mjs).
 *
 * THE RULES (constants in PROFILE_PARAMS, every one documented here):
 *   - HISTORY: box scores strictly before `asOf` (leakage cutoff), the population's phases only (regular = phase 2
 *     and the cup final; play-in and playoffs are EXCLUDED — their rotations are not regular-season rotations;
 *     preseason = phase 1), seasons S and S−1 where S is the corpus season of `asOf`. A player's appearances are
 *     taken across ALL teams (a traded player keeps his own per-minute history — the v0.1 rule); his minutes then
 *     meet the NEW team's context in the per-draw normalisation to 240 (+25 per OT) inside the engine.
 *   - RECENCY: weights decay by APPEARANCE ORDER, not by calendar days, so the off-season gap does not make one
 *     new-season game outweigh a whole prior season. Weight of the k-th most recent appearance = 0.5^(k/h):
 *     h = MINUTES_HALF_LIFE_APPS (10) for minutes and play rate, RATE_HALF_LIFE_APPS (40) for per-minute rates.
 *     After 1 new-season game that game carries ≈ 7 % of the minutes weight; after 10, ≈ 50 %.
 *   - SHRINKAGE (cold start / thin samples): per-minute rate = (Σ w·stat + K·league) / (Σ w·min + K) with
 *     K = RATE_PRIOR_MINUTES (100 min ≈ 4 games of a rotation player); 3P% and 2P% shrink toward the league
 *     make-rates with P3_PRIOR_ATTEMPTS (150) and P2_PRIOR_ATTEMPTS (100) pseudo-attempts. The prior is the
 *     LEAGUE-WIDE, minutes-weighted, as-of mean (the box-score corpus carries no positions, so a position prior is
 *     not available historically; the same prior is used live so the calibrated engine sees what it was fit on).
 *   - PLAY RATE: share of the player's recent team games in which he played, where only "COACH'S DECISION" DNPs
 *     count as not playing (an injury DNP is an availability fact, read live from the injuries feed instead);
 *     shrunk toward PLAY_PRIOR (0.85) with PLAY_PRIOR_GAMES (3) pseudo-games.
 *   - MINUTES SD: recency-weighted SD of played minutes, shrunk toward MINUTES_SD_PRIOR_RATIO × mean with
 *     MINUTES_SD_PRIOR_GAMES (3) pseudo-games.
 *   - NO HISTORY → null (INSUFFICIENT_HISTORY): the engine skips the player visibly (v0.1 rule), never zero-fills.
 *   - TEAM DEFENCE: points allowed per game, recency-weighted (TEAM_HALF_LIFE_GAMES 15) over the same seasons,
 *     shrunk toward league points per team-game with TEAM_PRIOR_GAMES (10).
 *   - LEAGUE MEANS: the last LEAGUE_WINDOW_GAMES (600) population games before `asOf` in seasons S and S−1.
 */

export const PROFILE_VERSION = "nba-sim-v1-profile-1";
export const PROFILE_PARAMS = Object.freeze({
  MINUTES_HALF_LIFE_APPS: 10,
  RATE_HALF_LIFE_APPS: 40,
  RATE_PRIOR_MINUTES: 100,
  P3_PRIOR_ATTEMPTS: 150,
  P2_PRIOR_ATTEMPTS: 100,
  PLAY_PRIOR: 0.85,
  PLAY_PRIOR_GAMES: 3,
  MINUTES_SD_PRIOR_RATIO: 0.3,
  MINUTES_SD_PRIOR_GAMES: 3,
  TEAM_HALF_LIFE_GAMES: 15,
  TEAM_PRIOR_GAMES: 10,
  LEAGUE_WINDOW_GAMES: 600,
});
/** Per-minute keys the engine needs. twoPm/twoPa are derived (fgm − threePm, fga − threePa). */
export const RATE_KEYS = Object.freeze(["pts", "reb", "ast", "threePa", "threePm", "twoPa", "twoPm", "fta", "ftm"]);
/** Used only when a population has NO game before `asOf` (never on a real slate since 2023-24); recorded when used. */
export const LEAGUE_FALLBACK = Object.freeze({
  pointsPerTeamGame: 114, rates: Object.freeze({ pts: 0.475, reb: 0.183, ast: 0.11, threePa: 0.146, threePm: 0.053, twoPa: 0.19, twoPm: 0.103, fta: 0.093, ftm: 0.073 }), p3: 0.364, p2: 0.54,
});

const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(4)));

/** Corpus season label of a UTC instant (Sept→June seasons labelled by the year they end in). */
export function corpusSeasonOfDate(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.getUTCMonth() >= 8 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
}

export function inPopulation(phase, population) {
  if (population === "preseason") return phase === 1;
  if (population === "regular") return phase === 2 || phase === "cup-final";
  throw new Error(`sim-v1-profile: unknown population ${population}`);
}

function appRow(p) {
  const ints = ["minutes", "pts", "reb", "ast", "threePm", "threePa", "fgm", "fga", "ftm", "fta"];
  if (!ints.every((k) => Number.isInteger(p[k]))) return null;
  return { minutes: p.minutes, pts: p.pts, reb: p.reb, ast: p.ast, threePa: p.threePa, threePm: p.threePm, twoPa: p.fga - p.threePa, twoPm: p.fgm - p.threePm, fta: p.fta, ftm: p.ftm };
}

/**
 * Index box-score docs once (pure). Every doc keeps its own season label (fetched docs are labelled by season-fold).
 * @returns {{ byAthlete: Map, byTeam: Map, games: object[] }} all arrays sorted oldest → newest
 */
export function indexBoxscores(boxscores) {
  const docs = (Array.isArray(boxscores) ? boxscores : [])
    .filter((d) => d?.boxscoreAvailable && typeof d.dateUtc === "string" && Number.isFinite(Date.parse(d.dateUtc)) && Array.isArray(d.players))
    .map((d) => ({ d, t: Date.parse(d.dateUtc), season: Number.isInteger(d.season) ? d.season : corpusSeasonOfDate(d.dateUtc) }))
    .sort((a, b) => a.t - b.t || String(a.d.providerEventId).localeCompare(String(b.d.providerEventId)));
  const byAthlete = new Map();
  const byTeam = new Map();
  const games = [];
  for (const { d, t, season } of docs) {
    const teamPts = new Map();
    const statLines = new Map();
    let complete = true;
    for (const p of d.players) {
      if (p?.providerAthleteId == null) continue;
      const id = String(p.providerAthleteId);
      const teamId = String(p.providerTeamId);
      const played = !p.didNotPlay && Number.isInteger(p.minutes) && p.minutes > 0;
      const line = played ? appRow(p) : null;
      if (played && !line) complete = false;
      const coachDnp = p.didNotPlay === true && /COACH/i.test(String(p.dnpReason ?? ""));
      if (!byAthlete.has(id)) byAthlete.set(id, []);
      byAthlete.get(id).push({ t, season, phase: d.phase, teamId, eventId: String(d.providerEventId), played: played && line != null, coachDnp, line, starter: p.starter === true, name: p.name ?? null });
      if (played && Number.isInteger(p.pts)) teamPts.set(teamId, (teamPts.get(teamId) ?? 0) + p.pts);
      if (line) { const s = statLines.get(teamId) ?? { pts: 0, minutes: 0 }; s.pts += line.pts; s.minutes += line.minutes; statLines.set(teamId, s); }
    }
    const teams = (d.teams ?? []).map((x) => String(x.providerTeamId));
    if (teams.length !== 2) continue;
    games.push({ t, season, phase: d.phase, eventId: String(d.providerEventId), teams, pts: teams.map((id) => teamPts.get(id) ?? null), complete });
    for (let k = 0; k < 2; k += 1) {
      const id = teams[k];
      if (!byTeam.has(id)) byTeam.set(id, []);
      byTeam.get(id).push({ t, season, phase: d.phase, eventId: String(d.providerEventId), ptsFor: teamPts.get(id) ?? null, ptsAgainst: teamPts.get(teams[1 - k]) ?? null });
    }
  }
  return { byAthlete, byTeam, games };
}

const seasonsFor = (asOf) => { const s = corpusSeasonOfDate(asOf); return new Set([s, s - 1]); };
const before = (rows, cutoff, population, seasons) => rows.filter((r) => r.t < cutoff && inPopulation(r.phase, population) && seasons.has(r.season));

/** League per-minute means, make rates and points per team-game, as of `asOf`. */
export function leagueMeans(index, { asOf, population = "regular" }) {
  const cutoff = Date.parse(asOf);
  if (!Number.isFinite(cutoff)) throw new Error("leagueMeans: asOf (ISO) required");
  const seasons = seasonsFor(asOf);
  const games = before(index.games, cutoff, population, seasons).filter((g) => g.complete && g.pts.every(Number.isInteger));
  const window = games.slice(-PROFILE_PARAMS.LEAGUE_WINDOW_GAMES);
  if (!window.length) return { basis: "fallback-no-history", games: 0, ...structuredClone(LEAGUE_FALLBACK) };
  const ids = new Set(window.map((g) => g.eventId));
  const tot = Object.fromEntries(RATE_KEYS.map((k) => [k, 0]));
  let minutes = 0;
  for (const rows of index.byAthlete.values()) {
    for (const r of rows) {
      if (!r.played || !ids.has(r.eventId)) continue;
      minutes += r.line.minutes;
      for (const k of RATE_KEYS) tot[k] += r.line[k];
    }
  }
  const rates = Object.fromEntries(RATE_KEYS.map((k) => [k, minutes > 0 ? tot[k] / minutes : LEAGUE_FALLBACK.rates[k]]));
  const pointsPerTeamGame = window.reduce((s, g) => s + g.pts[0] + g.pts[1], 0) / (2 * window.length);
  return {
    basis: "as-of-league", games: window.length, fromUtc: new Date(window[0].t).toISOString(), toUtc: new Date(window[window.length - 1].t).toISOString(),
    pointsPerTeamGame, rates, p3: tot.threePa > 0 ? tot.threePm / tot.threePa : LEAGUE_FALLBACK.p3, p2: tot.twoPa > 0 ? tot.twoPm / tot.twoPa : LEAGUE_FALLBACK.p2,
  };
}

/**
 * One player's as-of profile, or null when he has no played appearance in the window (INSUFFICIENT_HISTORY).
 */
export function playerProfile(index, athleteId, { asOf, population = "regular", league }) {
  const cutoff = Date.parse(asOf);
  const P = PROFILE_PARAMS;
  const rows = before(index.byAthlete.get(String(athleteId)) ?? [], cutoff, population, seasonsFor(asOf)).reverse(); // newest first
  const played = rows.filter((r) => r.played);
  if (!played.length) return null;
  // play rate over played + coach's-decision DNPs (injury DNPs are availability, not role)
  let pw = 0, pp = 0, k = 0;
  for (const r of rows) {
    if (!r.played && !r.coachDnp) continue;
    const w = 0.5 ** (k / P.MINUTES_HALF_LIFE_APPS); k += 1;
    pw += w; if (r.played) pp += w;
  }
  const playRate = (pp + P.PLAY_PRIOR * P.PLAY_PRIOR_GAMES) / (pw + P.PLAY_PRIOR_GAMES);
  // minutes
  let mw = 0, ms = 0, mss = 0;
  played.forEach((r, i) => { const w = 0.5 ** (i / P.MINUTES_HALF_LIFE_APPS); mw += w; ms += w * r.line.minutes; mss += w * r.line.minutes ** 2; });
  const minutesMean = ms / mw;
  const wVar = Math.max(0, mss / mw - minutesMean ** 2);
  const sdPrior = P.MINUTES_SD_PRIOR_RATIO * minutesMean;
  const minutesSd = Math.sqrt((mw * wVar + P.MINUTES_SD_PRIOR_GAMES * sdPrior ** 2) / (mw + P.MINUTES_SD_PRIOR_GAMES));
  // rates
  const sw = Object.fromEntries(RATE_KEYS.map((key) => [key, 0]));
  let wMin = 0, rawMin = 0;
  played.forEach((r, i) => { const w = 0.5 ** (i / P.RATE_HALF_LIFE_APPS); wMin += w * r.line.minutes; rawMin += r.line.minutes; for (const key of RATE_KEYS) sw[key] += w * r.line[key]; });
  const K = P.RATE_PRIOR_MINUTES;
  const rates = Object.fromEntries(RATE_KEYS.map((key) => [key, (sw[key] + K * league.rates[key]) / (wMin + K)]));
  const p3 = (sw.threePm + P.P3_PRIOR_ATTEMPTS * league.p3) / (sw.threePa + P.P3_PRIOR_ATTEMPTS);
  const p2 = (sw.twoPm + P.P2_PRIOR_ATTEMPTS * league.p2) / (sw.twoPa + P.P2_PRIOR_ATTEMPTS);
  const curSeason = corpusSeasonOfDate(asOf);
  const last = played[0];
  return {
    providerAthleteId: String(athleteId),
    name: last.name,
    gamesUsed: played.length,
    gamesThisSeason: played.filter((r) => r.season === curSeason).length,
    gamesPriorSeason: played.filter((r) => r.season === curSeason - 1).length,
    historyMinutes: rawMin,
    weightedMinutes: r4(wMin),
    shrinkWeight: r4(wMin / (wMin + K)), // share of the rate that is the player's own history (1 − share on the league prior)
    starterRate: r4(played.slice(0, 10).filter((r) => r.starter).length / Math.min(10, played.length)),
    playRate: r4(playRate),
    minutesMean: r4(minutesMean),
    minutesSd: r4(minutesSd),
    rates: Object.fromEntries(RATE_KEYS.map((key) => [key, r4(rates[key])])),
    p3: r4(p3), p2: r4(p2),
    lastTeamId: last.teamId,
    lastPlayedUtc: new Date(last.t).toISOString(),
  };
}

/** Team points allowed per game (recency-weighted, shrunk to the league) — the defence half of the expected total. */
export function teamDefence(index, teamId, { asOf, population = "regular", league }) {
  const cutoff = Date.parse(asOf);
  const P = PROFILE_PARAMS;
  const rows = before(index.byTeam.get(String(teamId)) ?? [], cutoff, population, seasonsFor(asOf)).filter((r) => Number.isInteger(r.ptsAgainst) && Number.isInteger(r.ptsFor)).reverse();
  let w = 0, a = 0, f = 0;
  rows.forEach((r, i) => { const x = 0.5 ** (i / P.TEAM_HALF_LIFE_GAMES); w += x; a += x * r.ptsAgainst; f += x * r.ptsFor; });
  const L = league.pointsPerTeamGame;
  return {
    games: rows.length,
    ptsAllowed: r4((a + P.TEAM_PRIOR_GAMES * L) / (w + P.TEAM_PRIOR_GAMES)),
    ptsScored: r4((f + P.TEAM_PRIOR_GAMES * L) / (w + P.TEAM_PRIOR_GAMES)),
  };
}

/**
 * The historical ROSTER PROXY used only by the research harnesses (no roster captures exist for past seasons):
 * players who PLAYED for the team in any of its last `lastN` population games before `asOf` and whose most recent
 * played appearance (any team) is for this team. Live forecasts use the captured roster (roster-gated-pool.mjs).
 */
export function historicalRosterProxy(index, teamId, { asOf, population = "regular", lastN = 10 }) {
  const cutoff = Date.parse(asOf);
  const seasons = seasonsFor(asOf);
  const recent = before(index.byTeam.get(String(teamId)) ?? [], cutoff, population, seasons).slice(-lastN);
  const ids = new Set(recent.map((g) => g.eventId));
  const out = new Set();
  for (const [id, rows] of index.byAthlete) {
    let hit = false; let lastTeam = null;
    for (const r of rows) {
      if (!(r.t < cutoff) || !r.played) continue;
      lastTeam = r.teamId;
      if (ids.has(r.eventId) && r.teamId === String(teamId)) hit = true;
    }
    if (hit && lastTeam === String(teamId)) out.add(id);
  }
  return [...out].sort();
}

/**
 * Assemble one side's engine input from roster rows (`{ providerAthleteId, name, availability, injuryStatus,
 * historyBasis?, rosterPosition? }`). OUT players are listed and not simulated; players without history are listed
 * as INSUFFICIENT_HISTORY and not simulated (never zero-filled).
 */
export function buildSideProfile(index, { teamId, rosterRows, asOf, population = "regular", league }) {
  const players = [];
  const excludedOut = [];
  const insufficientHistory = [];
  for (const r of rosterRows) {
    const id = String(r.providerAthleteId);
    if (r.availability === "out") { excludedOut.push({ providerAthleteId: id, name: r.name ?? null, injuryStatus: r.injuryStatus ?? null }); continue; }
    const prof = playerProfile(index, id, { asOf, population, league });
    if (!prof) { insufficientHistory.push({ providerAthleteId: id, name: r.name ?? null, position: r.rosterPosition ?? null }); continue; }
    players.push({
      ...prof, name: r.name ?? prof.name,
      availability: r.availability ?? "unknown", injuryStatus: r.injuryStatus ?? null,
      historyBasis: prof.lastTeamId === String(teamId) ? "same-team" : "other-team",
    });
  }
  players.sort((a, b) => b.minutesMean * b.playRate - a.minutesMean * a.playRate || a.providerAthleteId.localeCompare(b.providerAthleteId));
  return { teamId: String(teamId), players, excludedOut, insufficientHistory, defence: teamDefence(index, teamId, { asOf, population, league }) };
}
