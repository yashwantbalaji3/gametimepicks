/**
 * NBA v0.3 CANDIDATE minutes model: role prior + rotation-aware team normalisation. PURE, deterministic, no I/O.
 * NBA REGULAR SEASON — CANDIDATE SHADOW (NOT ARMED) · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * WHY (docs/nba/NBA_V01_PRESEASON_MINUTES_INVESTIGATION_2026-10-21.md). The official v0.1 player model reads
 * minutes-model.mjs over the corpus box scores only (dataRule corpus-v1). On a 2026-27 regular-season forecast:
 *   1. its "trailing10" window is the team's LAST 10 GAMES OF 2025-26 in the "regular" population, which is
 *      phase !== 1, so play-in and playoff games are inside it (559 of 909 appearances on 2026-10-20), and for a
 *      non-playoff team the window is the end-of-season stretch (rest, shutdowns, injury returns);
 *   2. game-sim.mjs prepareRoster then rescales the whole roster pool to 240 minutes by ONE factor computed from
 *      the sum of every rostered player's minutes-per-APPEARANCE. That sum counts deep-bench players at the
 *      minutes they get on the nights they play, so on 2026-10-20/21 it ran 197–384 and the factor 0.62–1.22: every starter
 *      loses the same share as the 15th man.
 * Preseason is NOT in the v0.1 window: v0.1 never reads a fetched box score, and the minutes model's population
 * filter drops phase 1 for a regular-season forecast. That is pinned again here for the candidate, which does read
 * fetched 2026-27 box scores (67 of them preseason as of 2026-10-21).
 *
 * THE v0.3 RULES (structural; one constant, reused from the frozen v0 model — see PARAMS):
 *   - POPULATION: regular = phase 2 and the cup final only (sim-v1-profile.mjs `inPopulation`, already frozen in the
 *     repo): preseason, play-in and playoff rotations never enter a regular-season minutes estimate.
 *   - HISTORY BY ATHLETE across teams (the v0.1 traveling-history rule), seasons S (the corpus season of the
 *     forecast instant) and S−1, strictly before the instant.
 *   - ROLE PRIOR: the player's whole S−1 regular season, per appearance. Not the last 10 team games: a full-season
 *     role is not the end-of-season stretch.
 *   - BLEND toward the current season as games accrue, with the prior worth PRIOR_GAMES appearances:
 *       minutes = (w·Σ priorMinutes + Σ currentMinutes) / (w·nPrior + nCurrent),  w = min(1, PRIOR_GAMES / nPrior).
 *     A thin prior is never inflated (w ≤ 1). There is no switch point, so no cliff when the season turns over
 *     (the v0 model's seasonUsed switch is what zeroed the v0.2 team scores on 2026-10-13).
 *     Rates, starter share, minutes SD and play rate use the same weights.
 *   - PLAY RATE: appearances / (appearances + COACH'S DECISION DNPs), same weights. An injury DNP is availability
 *     (the injuries feed), not role, and is not counted (sim-v1-profile.mjs rule).
 *   - TEAM NORMALISATION (game-sim-v03.mjs prepareRosterV03; game-sim.mjs, the frozen v0 engine, is untouched): minutes stay
 *     CONDITIONAL on playing (what a player's line and the grader compare against) and the team sums to 240 IN
 *     EXPECTATION over who plays (Σ playRate·minutes = 240). An over-full pool is brought to 240 by weighted
 *     water-filling of minutes^MINUTES_POWER, so the excess comes mostly from the short-minutes players rather than
 *     one equal share off every starter. MINUTES_POWER is the v1 engine's frozen 1.25 (fitted on 2023-24 only,
 *     preregistration look 4); no new constant. A pool at or under 240 keeps v0's uniform bounded factor.
 *     The engine counts a player's points toward the team total with probability playRate, from its own RNG
 *     stream, so the player draws are the ones the base stream would give.
 *   - NO HISTORY → INSUFFICIENT_HISTORY (null, never 0): the v0.1 rule. Fewer than MIN_GAMES_FOR_RATES appearances
 *     → rates null (the pool-rate fallback applies), as in v0.
 */
import { MIN_GAMES_FOR_RATES, TRAILING_N, availabilityFromInjuries } from "./minutes-model.mjs";
import { inPopulation, corpusSeasonOfDate } from "./sim-v1-profile.mjs";
import { rosterForTeam } from "./roster-contract.mjs";
import { checkRosterFreshness, GATE_REFUSALS, MINUTES_STATES, HISTORY_BASES, ROSTER_MAX_AGE_HOURS } from "./roster-gated-pool.mjs";
import { PLAY_RATE_WATER_FILL } from "./game-sim-v03.mjs";
import { V1_PARAMS } from "./game-sim-v1.mjs";

export const MINUTES_MODEL_V03_VERSION = "nba-minutes-model-v0.3-role-prior";
export const POOL_V03_VERSION = "nba-roster-gated-pool-v0.3";
export const NORMALISATION = Object.freeze({ rule: PLAY_RATE_WATER_FILL, power: V1_PARAMS.MINUTES_POWER });
/**
 * PRIOR_GAMES reuses the frozen v0 window length (TRAILING_N = 10, preregistration §1): the prior counts as one
 * v0 window of games. It was not fitted to any 2026-27 outcome. Founder approval of this constant is part of the
 * amendment draft (methodology constants need a source).
 */
export const PARAMS = Object.freeze({ PRIOR_GAMES: TRAILING_N, MIN_GAMES_FOR_RATES, MINUTES_POWER: V1_PARAMS.MINUTES_POWER });
export const BASES = Object.freeze({ ROLE_PRIOR: "role-prior", BLEND: "blend", CURRENT: "current", INSUFFICIENT: "insufficient" });
const STAT_KEYS = Object.freeze(["pts", "reb", "ast", "threePm"]);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(3)));

/**
 * One pass over the box scores: per athlete, the population's appearances and coach's-decision DNPs in seasons
 * S and S−1, strictly before `asOfDateUtc`, across every team. Pure.
 */
export function indexRoleHistory(boxscores, { asOfDateUtc, population = "regular" }) {
  const cutoff = Date.parse(asOfDateUtc);
  if (!Number.isFinite(cutoff)) throw new Error("indexRoleHistory: asOfDateUtc (ISO) is required");
  if (population !== "regular" && population !== "preseason") throw new Error(`indexRoleHistory: unknown population ${population}`);
  const current = corpusSeasonOfDate(asOfDateUtc);
  const prior = current - 1;
  const byAthlete = new Map();
  const teamGames = new Map(); // teamId → { [season]: count }
  const docs = (Array.isArray(boxscores) ? boxscores : [])
    .filter((d) => d?.boxscoreAvailable && typeof d.dateUtc === "string" && Date.parse(d.dateUtc) < cutoff && inPopulation(d.phase, population))
    .map((d) => ({ d, t: Date.parse(d.dateUtc), season: Number.isInteger(d.season) ? d.season : corpusSeasonOfDate(d.dateUtc) }))
    .filter((x) => x.season === current || x.season === prior)
    .sort((a, b) => a.t - b.t || String(a.d.providerEventId).localeCompare(String(b.d.providerEventId)));
  for (const { d, season } of docs) {
    for (const t of d.teams ?? []) {
      const id = String(t.providerTeamId);
      if (!teamGames.has(id)) teamGames.set(id, {});
      teamGames.get(id)[season] = (teamGames.get(id)[season] ?? 0) + 1;
    }
    for (const p of d.players ?? []) {
      if (p?.providerAthleteId == null) continue;
      const id = String(p.providerAthleteId);
      let rec = byAthlete.get(id);
      if (!rec) { rec = { providerAthleteId: id, name: p.name ?? null, apps: { [prior]: [], [current]: [] }, coachDnp: { [prior]: 0, [current]: 0 }, dnpCount: 0, nullMinutesCount: 0, lastTeam: null, lastSeenDateUtc: null }; byAthlete.set(id, rec); }
      if (p.name) rec.name = p.name;
      if (p.didNotPlay) {
        rec.dnpCount += 1;
        if (/COACH/i.test(String(p.dnpReason ?? ""))) rec.coachDnp[season] += 1;
        continue;
      }
      if (!Number.isInteger(p.minutes)) { rec.nullMinutesCount += 1; continue; }
      if (p.minutes <= 0) continue;
      rec.apps[season].push({ minutes: p.minutes, starter: p.starter === true, pts: p.pts, reb: p.reb, ast: p.ast, threePm: p.threePm, teamId: String(p.providerTeamId) });
      rec.lastTeam = String(p.providerTeamId);
      rec.lastSeenDateUtc = d.dateUtc;
    }
  }
  return { population, asOfDateUtc, currentSeason: current, priorSeason: prior, byAthlete, teamGames };
}

function weightedSd(pairs) {
  // pairs: [value, weight]; reliability-weighted sample SD; null below 2 observations
  if (pairs.length < 2) return null;
  const W = pairs.reduce((s, [, w]) => s + w, 0);
  const W2 = pairs.reduce((s, [, w]) => s + w * w, 0);
  if (!(W > 0) || !(W * W - W2 > 0)) return null;
  const m = pairs.reduce((s, [v, w]) => s + v * w, 0) / W;
  return Math.sqrt(pairs.reduce((s, [v, w]) => s + w * (v - m) ** 2, 0) / (W - W2 / W));
}

/** The v0.3 role estimate for one athlete record (from indexRoleHistory). Pure. */
export function roleEstimate(rec, { priorSeason, currentSeason }) {
  const P = rec?.apps?.[priorSeason] ?? [];
  const C = rec?.apps?.[currentSeason] ?? [];
  const nP = P.length, nC = C.length;
  const w = nP > 0 ? Math.min(1, PARAMS.PRIOR_GAMES / nP) : 0;
  const weighted = [...P.map((a) => [a, w]), ...C.map((a) => [a, 1])];
  const W = weighted.reduce((s, [, x]) => s + x, 0);
  const basis = nP + nC < PARAMS.MIN_GAMES_FOR_RATES ? BASES.INSUFFICIENT : nC === 0 ? BASES.ROLE_PRIOR : nP === 0 ? BASES.CURRENT : BASES.BLEND;
  const out = {
    expectedMinutes: W > 0 ? r3(weighted.reduce((s, [a, x]) => s + a.minutes * x, 0) / W) : null,
    minutesSd: r3(weightedSd(weighted.map(([a, x]) => [a.minutes, x]))),
    starterRate: W > 0 ? r3(weighted.reduce((s, [a, x]) => s + (a.starter ? x : 0), 0) / W) : null,
    gamesUsed: nP + nC, priorGames: nP, currentGames: nC, priorWeight: r3(w),
    basis, rates: null, rateSd: null, playRate: null,
  };
  const cdP = rec?.coachDnp?.[priorSeason] ?? 0, cdC = rec?.coachDnp?.[currentSeason] ?? 0;
  const den = w * (nP + cdP) + (nC + cdC);
  out.playRate = den > 0 ? r3((w * nP + nC) / den) : null;
  if (nP + nC >= PARAMS.MIN_GAMES_FOR_RATES) {
    out.rates = {}; out.rateSd = {};
    for (const k of STAT_KEYS) {
      const rows = weighted.filter(([a]) => Number.isInteger(a[k]) && a.minutes > 0);
      if (rows.length < PARAMS.MIN_GAMES_FOR_RATES) { out.rates[k] = null; out.rateSd[k] = null; continue; }
      const stat = rows.reduce((s, [a, x]) => s + a[k] * x, 0);
      const mins = rows.reduce((s, [a, x]) => s + a.minutes * x, 0);
      out.rates[k] = r3(stat / mins);
      out.rateSd[k] = r3(weightedSd(rows.map(([a, x]) => [a[k] / a.minutes, x])));
    }
  }
  return out;
}

/**
 * The v0.3 roster-gated pool for one team: same gate as roster-gated-pool.mjs `gatePool` (fresh roster, team captured,
 * not empty — fail closed), rows by athlete from the role index. Rows are minutes-model-shaped (game-sim-v03.prepareRosterV03
 * consumes them) plus playRate; the result carries `normalisation` (NORMALISATION), which game-sim-v03.mjs requires.
 *
 * @param roleIndex  optional indexRoleHistory() result shared across sides (must match asOfDateUtc + population)
 */
export function gatePoolV03({ rosters, providerTeamId, boxscores, asOfDateUtc, injuries = null, population = "regular", roleIndex = null }) {
  const teamId = String(providerTeamId);
  const fresh = checkRosterFreshness(rosters, asOfDateUtc);
  const gateBase = { poolVersion: POOL_V03_VERSION, rosterAsOf: fresh.asOf, rosterAgeHours: fresh.ageHours, maxAgeHours: ROSTER_MAX_AGE_HOURS };
  if (!fresh.ok) return { state: "REFUSED", reason: fresh.reason, gate: { ...gateBase, refusal: fresh.reason } };
  const team = rosterForTeam(rosters, teamId);
  if (!team) {
    const listed = (rosters.teams ?? []).find((t) => String(t.providerTeamId) === teamId);
    return { state: "REFUSED", reason: GATE_REFUSALS.ROSTER_TEAM_MISSING, gate: { ...gateBase, refusal: GATE_REFUSALS.ROSTER_TEAM_MISSING, detail: listed?.reason ?? "team not in roster capture" } };
  }
  if (!Array.isArray(team.players) || team.players.length === 0) return { state: "REFUSED", reason: GATE_REFUSALS.ROSTER_TEAM_EMPTY, gate: { ...gateBase, refusal: GATE_REFUSALS.ROSTER_TEAM_EMPTY } };
  const idx = roleIndex ?? indexRoleHistory(boxscores, { asOfDateUtc, population });
  if (idx.asOfDateUtc !== asOfDateUtc || idx.population !== population) throw new Error("gatePoolV03: roleIndex was built for another instant or population");
  const seasons = { priorSeason: idx.priorSeason, currentSeason: idx.currentSeason };

  const rows = [], insufficientHistory = [], otherTeamHistory = [], out = [];
  for (const p of team.players) {
    const id = String(p.providerAthleteId);
    const avail = availabilityFromInjuries(injuries, teamId, id);
    const rec = idx.byAthlete.get(id) ?? null;
    const est = rec ? roleEstimate(rec, seasons) : null;
    const historyBasis = !rec?.lastTeam ? HISTORY_BASES.NONE : rec.lastTeam === teamId ? HISTORY_BASES.SAME_TEAM : HISTORY_BASES.OTHER_TEAM;
    const isOut = avail.availability === "out";
    const modelled = est != null && Number.isFinite(est.expectedMinutes);
    const row = {
      providerAthleteId: id,
      name: rec?.name ?? p.displayName ?? null,
      expectedMinutes: isOut || !modelled ? null : est.expectedMinutes,
      minutesSd: isOut || !modelled ? null : est.minutesSd,
      starterRate: est?.starterRate ?? null,
      gamesUsed: est?.gamesUsed ?? 0,
      dnpCount: rec?.dnpCount ?? 0,
      nullMinutesCount: rec?.nullMinutesCount ?? 0,
      basis: est?.basis ?? BASES.INSUFFICIENT,
      availability: avail.availability,
      injuryStatus: avail.injuryStatus,
      rates: modelled ? est.rates : null,
      rateSd: modelled ? est.rateSd : null,
      lastSeenDateUtc: rec?.lastSeenDateUtc ?? null,
      minutesState: isOut ? MINUTES_STATES.OUT : modelled ? MINUTES_STATES.MODELLED : MINUTES_STATES.INSUFFICIENT_HISTORY,
      historyBasis,
      historyTeam: rec?.lastTeam ?? null,
      rosterPosition: p.position ?? null,
      rosterExperienceYears: p.experienceYears ?? null,
      playRate: est?.playRate ?? null,
      priorGames: est?.priorGames ?? 0,
      currentGames: est?.currentGames ?? 0,
      priorWeight: est?.priorWeight ?? null,
    };
    rows.push(row);
    if (isOut) out.push({ providerAthleteId: id, name: row.name, injuryStatus: row.injuryStatus });
    else if (!modelled) insufficientHistory.push({ providerAthleteId: id, name: row.name, position: row.rosterPosition, experienceYears: row.rosterExperienceYears, gamesUsed: row.gamesUsed, dnpCount: row.dnpCount, historyBasis });
    if (historyBasis === HISTORY_BASES.OTHER_TEAM) otherTeamHistory.push({ providerAthleteId: id, name: row.name, historyTeam: row.historyTeam, expectedMinutes: row.expectedMinutes, basis: row.basis });
  }
  rows.sort((a, b) => (b.expectedMinutes ?? -1) - (a.expectedMinutes ?? -1) || (Number(a.providerAthleteId) - Number(b.providerAthleteId)) || a.providerAthleteId.localeCompare(b.providerAthleteId));
  const onRoster = new Set(team.players.map((p) => String(p.providerAthleteId)));
  const excludedNotOnRoster = [...idx.byAthlete.values()].filter((r) => r.lastTeam === teamId && !onRoster.has(r.providerAthleteId))
    .map((r) => ({ providerAthleteId: r.providerAthleteId, name: r.name, lastSeenDateUtc: r.lastSeenDateUtc }))
    .sort((a, b) => a.providerAthleteId.localeCompare(b.providerAthleteId));
  const tg = idx.teamGames.get(teamId) ?? {};
  return {
    state: "GATED",
    modelVersion: MINUTES_MODEL_V03_VERSION,
    teamProviderId: teamId,
    asOfDateUtc,
    population,
    trailingN: null,
    seasonUsed: idx.currentSeason,
    priorSeason: idx.priorSeason,
    // both seasons are read, so "in season" (the manifest's no-history check) counts both; each is also given alone
    teamGamesInSeason: (tg[idx.currentSeason] ?? 0) + (tg[idx.priorSeason] ?? 0),
    teamGamesInCurrentSeason: tg[idx.currentSeason] ?? 0,
    teamGamesInPriorSeason: tg[idx.priorSeason] ?? 0,
    teamGamesInWindow: (tg[idx.currentSeason] ?? 0) + (tg[idx.priorSeason] ?? 0),
    windowFromDateUtc: null,
    windowToDateUtc: null,
    injuriesProvided: Array.isArray(injuries),
    normalisation: { ...NORMALISATION },
    rows,
    unmatchedInjuries: (Array.isArray(injuries) ? injuries : [])
      .filter((e) => String(e?.providerTeamId) === teamId && !rows.some((r) => r.providerAthleteId === String(e?.athleteId)))
      .map((e) => ({ athleteId: String(e.athleteId), athleteName: e.athleteName ?? null, status: e.status ?? null })),
    gate: {
      ...gateBase,
      rule: "pool = captured roster as of the forecast instant; history by athlete across teams, regular season only (phase 2 + cup final), seasons S−1 (role prior, worth PRIOR_GAMES appearances) and S; no roster → refuse; no history → INSUFFICIENT_HISTORY (null, never 0)",
      minutesModel: MINUTES_MODEL_V03_VERSION,
      params: { ...PARAMS },
      rosterSize: team.players.length,
      rosterCapturedAt: team.capturedAt ?? null,
      simulated: rows.filter((r) => r.minutesState === MINUTES_STATES.MODELLED).length,
      insufficientHistory,
      out,
      otherTeamHistory,
      excludedNotOnRoster,
    },
  };
}
