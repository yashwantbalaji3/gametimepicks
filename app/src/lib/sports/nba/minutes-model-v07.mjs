/**
 * NBA v0.7 CANDIDATE minutes model. PURE, deterministic, no I/O.
 * NBA REGULAR SEASON — CANDIDATE (NOT ARMED) · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * UNARMED. No production path imports this module. It is not a family in experimental-forecast.mjs, it writes nothing,
 * and it has no receipt. Its only callers are its tests and three scripts in app/scripts/nba/research.
 * Rules, constants and bars: docs/nba/NBA_V07_MINUTES_CANDIDATE_PREREGISTRATION_2026-11-02.md.
 *
 * Built on v0.3's roster gate and rates (minutes-model-v03.mjs, unedited). It does not import the v0.6 candidate, which is
 * preserved evidence and whose own test forbids other callers, so the shared arithmetic is restated here.
 *
 * THE v0.7 RULES:
 *   1. AS-OF INPUTS. buildV07Context is the one door, and it is the same door as v0.6.
 *   2. REMOVAL NEEDS POSITIVE EVIDENCE. Out in the as-of feed removes a player. A box-score absence never does: it lowers
 *      his play probability and he stays projected. There is no exclusion state.
 *   3. PLAY PROBABILITY. A player who missed games has q = min(base, P(play | state)), the state's rate read directly. It is
 *      not base × a multiplier, because base already carries coach's DNPs, which double-counts them. Out of sample on
 *      completed seasons the multiplier ran 0.22 under the observed rate on MISSED_2PLUS_COACH. LAST_PLAYED and NONE keep base.
 *   4. DAY-TO-DAY has no constant of its own, because no completed season has an injury feed. A listing moves the player to
 *      the MISSED_1_OTHER rate, or keeps his state's rate if that is higher. A listed long absentee therefore rises to it:
 *      the listing is positive evidence of a short absence. The listing and the state never stack.
 *   5. ROLE MINUTES. As v0.6: current is this season for this team; carried is worth PRIOR_GAMES, or TRANSFER_PRIOR_GAMES
 *      when the last carried appearance was for another team. Playoffs and play-in never enter. Rates stay on v0.3's estimate.
 *   6. NORMALISATION (normaliseV07). Over-full: nobody is raised, and the excess comes off minutes^power. Under-full: a player
 *      at or above TOP_ROTATION_MINUTES is not raised at all. Anyone below rises by the same UNDER_FULL_LIFT_MINUTES × (f − 1),
 *      f = 240 / S, and stops at the top line. It is additive, so a short pool is never scaled.
 *   7. UNALLOCATED MINUTES are reported with their context and never placed on a player.
 *   8. NO FABRICATION. A player with no regular-season box score in S or S−1 is unprojected, with a reason code.
 *   9. COVERAGE. Starters, sixth man and rotation of the team's last game each get a status, and any status other than
 *      PROJECTED carries a reason code. coverageReportV07 builds the per-slate report.
 */
import { DEFAULT_MINUTES_SD_RATIO, MAX_PLAYER_MINUTES, TEAM_MINUTES } from "./game-sim.mjs";
import { gatePoolV03, indexRoleHistory } from "./minutes-model-v03.mjs";
import { MINUTES_STATES } from "./roster-gated-pool.mjs";
import { corpusSeasonOfDate, inPopulation } from "./sim-v1-profile.mjs";
import { V1_PARAMS } from "./game-sim-v1.mjs";
import { indexCurrentSeasonStatus, stateFor, STATES } from "./minutes-model-v07-state.mjs";

export { STATES };
export const MINUTES_MODEL_V07_VERSION = "nba-minutes-model-v0.7-candidate";
export const POOL_V07_VERSION = "nba-roster-gated-pool-v0.7-candidate";
export const V07_NORMALISATION_RULE = "v07-top-held-additive-lift";
export const CANDIDATE_STATUS = Object.freeze({ armed: false, role: "CANDIDATE_UNARMED", dataClass: "PRIVATE_RESEARCH", productEligible: false });
export const PROPOSED = "PROPOSED_NOT_APPROVED";
export const REMOVAL_EVIDENCE = Object.freeze({ OUT_IN_FEED: "OUT_IN_FEED" });
export const COVERAGE_STATUS = Object.freeze({ PROJECTED: "PROJECTED", OUT: "OUT", NO_PROJECTION: "NO_PROJECTION", NOT_ON_ROSTER_CAPTURE: "NOT_ON_ROSTER_CAPTURE", REFUSED: "REFUSED" });
export const TEAM_REASONS = Object.freeze({ NO_GAME_BEFORE_INSTANT: "TEAM_NO_GAME_BEFORE_INSTANT" });

/** No number here is approved. Each data-sourced one is recomputed by minutes-model-v07.test.mjs. */
export const CONSTANTS = Object.freeze({
  PRIOR_GAMES: Object.freeze({ value: 3, status: PROPOSED, source: "Audit section 6, 2024-25 and 2025-26, first 20 team games. Reuses the frozen MIN_GAMES_FOR_RATES. Carried unchanged from the v0.6 preregistration" }),
  TRANSFER_PRIOR_GAMES: Object.freeze({ value: 1, status: PROPOSED, source: "Lowest pooled MAE on changed-team rows, 2024-25 and 2025-26, first 20 team games, n 2,334. Carried unchanged from the v0.6 preregistration" }),
  PLAY_RATE_BY_STATE: Object.freeze({
    value: Object.freeze({ NO_APPEARANCE: 0.029, MISSED_1_COACH: 0.484, MISSED_1_OTHER: 0.489, MISSED_2PLUS_COACH: 0.367, MISSED_2PLUS_OTHER: 0.136 }),
    status: PROPOSED,
    source: "fitStateTable: 2024-25 and 2025-26 regular seasons pooled, rows with a role",
  }),
  DAY_TO_DAY_STATE: Object.freeze({ value: STATES.MISSED_1_OTHER, status: PROPOSED, source: "Named judgement. No completed season has an injury feed, so the listing borrows the nearest box-score state, a player who just missed one game for a non-coach reason" }),
  TOP_ROTATION_MINUTES: Object.freeze({ value: 30, status: PROPOSED, source: "proportionalLiftSlope by role band, 2024-25 and 2025-26: 0.002 and -0.058 at role 30 or more against 0.148 and 0.152 at 24 to 30. The line itself is a judgement within that step" }),
  UNDER_FULL_LIFT_MINUTES: Object.freeze({ value: 9, status: PROPOSED, source: "fitAdditiveLift: 2024-25 and 2025-26 pooled, 9.03 minutes per unit of (f − 1), n 28,970, rounded to a whole minute. The Out stand-in uses hindsight" }),
});
/** Reused numbers. They were approved for other families, or for none, so none is approved for this candidate. */
export const REUSED_CONSTANTS = Object.freeze({
  RATE_PRIOR_GAMES: Object.freeze({ value: 10, status: PROPOSED, source: "v0.3 PARAMS.PRIOR_GAMES, used for rates, starter rate and base play rate; founder approval on 2026-10-22 covers v0.3 alone" }),
  MINUTES_POWER: Object.freeze({ value: V1_PARAMS.MINUTES_POWER, status: PROPOSED, source: "v1 engine MINUTES_POWER; founder approval on 2026-10-22 covers v0.3 alone" }),
});
const K = Object.freeze(Object.fromEntries(Object.entries(CONSTANTS).map(([k, c]) => [k, c.value])));

const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(2)));
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(3)));
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(4)));
const STAT_KEYS = Object.freeze(["pts", "reb", "ast", "threePm"]);

/** The one door for as-of inputs. Pure. */
export function asOfInputs({ boxscores, injuries = null, asOfDateUtc }) {
  const cutoff = Date.parse(asOfDateUtc);
  if (!Number.isFinite(cutoff)) throw new Error("asOfInputs: asOfDateUtc (ISO) is required");
  const docs = (Array.isArray(boxscores) ? boxscores : []).filter((d) => {
    if (!d?.boxscoreAvailable || typeof d.dateUtc !== "string" || !(Date.parse(d.dateUtc) < cutoff)) return false;
    const captured = Date.parse(d.capturedAt ?? "");
    return Number.isFinite(captured) && captured <= cutoff;
  });
  const entries = Array.isArray(injuries) ? injuries.filter((e) => { const t = Date.parse(e?.statedAt ?? ""); return !Number.isFinite(t) || t <= cutoff; }) : null;
  return { docs, injuries: entries };
}

/**
 * Everything one forecast instant reads, built once and shared across its pools. It takes no overrides: v0.7 has no
 * sensitivities, so no variant can be run from this module.
 * @param injuriesAsOf  the feed's own stamp; a feed stamped after the instant is refused by gatePoolV07
 */
export function buildV07Context({ boxscores, injuries = null, injuriesAsOf = null, asOfDateUtc }) {
  const asOf = asOfInputs({ boxscores, injuries, asOfDateUtc });
  const roleIndex = indexRoleHistory(asOf.docs, { asOfDateUtc, population: "regular" });
  const statusIndex = indexCurrentSeasonStatus(asOf.docs, { asOfDateUtc });
  const lastGameByTeam = new Map();
  const ordered = [...asOf.docs].filter((d) => (Number.isInteger(d.season) ? d.season : corpusSeasonOfDate(d.dateUtc)) === roleIndex.currentSeason && inPopulation(d.phase, "regular"))
    .sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
  for (const d of ordered) for (const t of d.teams ?? []) lastGameByTeam.set(String(t.providerTeamId), d);
  return { asOfDateUtc, boxscores: asOf.docs, injuries: asOf.injuries, injuriesAsOf, roleIndex, statusIndex, lastGameByTeam, params: { ...K } };
}

function weightedSd(pairs) {
  if (pairs.length < 2) return null;
  const W = pairs.reduce((s, [, w]) => s + w, 0);
  const W2 = pairs.reduce((s, [, w]) => s + w * w, 0);
  if (!(W > 0) || !(W * W - W2 > 0)) return null;
  const m = pairs.reduce((s, [v, w]) => s + v * w, 0) / W;
  return Math.sqrt(pairs.reduce((s, [v, w]) => s + w * (v - m) ** 2, 0) / (W - W2 / W));
}

/** Rule 5. Pure. */
export function minutesEstimateV07(rec, { priorSeason, currentSeason, teamId, params = K }) {
  const team = String(teamId);
  const S1 = rec?.apps?.[priorSeason] ?? [];
  const Cur = rec?.apps?.[currentSeason] ?? [];
  const current = Cur.filter((a) => a.teamId === team);
  const carried = [...S1, ...Cur.filter((a) => a.teamId !== team)];
  const nP = carried.length, nC = current.length;
  if (nP + nC === 0) return null;
  const moved = nP > 0 && carried.at(-1).teamId !== team;
  const k = moved ? params.TRANSFER_PRIOR_GAMES : params.PRIOR_GAMES;
  const w = nP > 0 ? Math.min(1, k / nP) : 0;
  // with no game for this team yet the carried role is the only evidence, so its weight does not matter
  const weighted = [...carried.map((a) => [a.minutes, nC === 0 ? 1 : w]), ...current.map((a) => [a.minutes, 1])];
  const W = weighted.reduce((s, [, x]) => s + x, 0);
  return {
    expectedMinutes: r3(weighted.reduce((s, [m, x]) => s + m * x, 0) / W),
    minutesSd: r3(weightedSd(weighted)),
    carriedGames: nP, currentGamesThisTeam: nC, carriedWeight: r3(nC === 0 ? 1 : w), movedTeam: moved,
  };
}

/** Rules 3 and 4. base is v0.3's play rate. Pure. */
export function playProbabilityV07({ base, state, dayToDay }, params = K) {
  const b = Number.isFinite(base) && base > 0 ? Math.min(1, base) : 1;
  const rates = params.PLAY_RATE_BY_STATE;
  const own = rates[state] ?? null; // null for LAST_PLAYED and NONE
  const rate = dayToDay ? Math.max(rates[params.DAY_TO_DAY_STATE], own ?? 0) : own;
  return rate == null ? r3(b) : Math.max(0.001, r3(Math.min(b, rate)));
}

/** Why a rostered, not-Out player has no projection. A code, never a number. */
export function noProjectionReason(row) {
  if (row.rosterExperienceYears === 0) return "ROOKIE_NO_REGULAR_SEASON_BOX";
  if (Number.isInteger(row.rosterExperienceYears)) return "VETERAN_NO_BOX_IN_LAST_TWO_SEASONS";
  return "NO_COMMITTED_EVIDENCE";
}

/** Weighted fill with a ceiling per player: find f with Σ w_i · min(cap_i, f · share_i) = target. Pure. */
export function boundedWaterFill(shares, weights, caps, target) {
  const n = shares.length;
  const capped = new Set();
  for (let iter = 0; iter <= n; iter += 1) {
    let free = 0, cappedMass = 0;
    for (let i = 0; i < n; i += 1) { if (capped.has(i)) cappedMass += weights[i] * caps[i]; else free += weights[i] * shares[i]; }
    if (!(free > 0)) return { minutes: caps.slice(), factor: null, capped: capped.size };
    const f = (target - cappedMass) / free;
    let changed = false;
    for (let i = 0; i < n; i += 1) if (!capped.has(i) && f * shares[i] > caps[i]) { capped.add(i); changed = true; }
    if (!changed) return { minutes: shares.map((s, i) => (capped.has(i) ? caps[i] : f * s)), factor: f, capped: capped.size };
  }
  throw new Error("boundedWaterFill: did not converge");
}

/**
 * Rule 6. rows: [{ minutes, q }]. Pure. Team minutes reconcile by construction:
 * Σ q·minutes + unallocatedMinutes = target, with unallocatedMinutes ≥ 0.
 * The lift is scaled down only if it would overfill the team, which takes a pool far too small to be a real side.
 */
export function normaliseV07(rows, { target = TEAM_MINUTES, power = V1_PARAMS.MINUTES_POWER, params = K } = {}) {
  const q = rows.map((r) => r.q);
  const raw = rows.map((r) => r.minutes);
  const S = rows.reduce((s, r) => s + r.q * r.minutes, 0);
  const overFull = S > target;
  let minutes, requiredFactor = null;
  if (overFull) {
    minutes = boundedWaterFill(raw.map((m) => m ** power), q, raw, target).minutes;
  } else if (S > 0) {
    requiredFactor = target / S;
    const top = params.TOP_ROTATION_MINUTES;
    const wanted = params.UNDER_FULL_LIFT_MINUTES * (requiredFactor - 1);
    const deltas = raw.map((m) => (m < top ? Math.min(top - m, wanted) : 0));
    const mass = deltas.reduce((s, d, i) => s + q[i] * d, 0);
    const scale = mass > target - S ? (target - S) / mass : 1;
    minutes = raw.map((m, i) => m + scale * deltas[i]);
  } else {
    minutes = raw.slice();
  }
  const placed = rows.reduce((s, r, i) => s + r.q * minutes[i], 0);
  return {
    minutes,
    requiredFactor,
    applied: overFull ? "over-full: excess taken off minutes^power, nobody raised" : "under-full: top rotation held, additive lift below it, remainder unallocated",
    weightedSum: S,
    lifted: overFull ? 0 : Math.max(0, placed - S),
    cut: overFull ? S - placed : 0,
    placed,
    unallocatedMinutes: Math.max(0, target - placed),
  };
}

/** Rule 9 for one team: last game's starters, sixth man and rotation against the pool. */
function coverageFor(context, teamId, rows) {
  const box = context.lastGameByTeam.get(teamId) ?? null;
  if (!box) return { lastEventId: null, teamReason: TEAM_REASONS.NO_GAME_BEFORE_INSTANT, rule: "team has no game before the instant", roles: [], total: 0, projected: 0 };
  const lines = (box.players ?? []).filter((p) => String(p.providerTeamId) === teamId && !p.didNotPlay && Number.isInteger(p.minutes) && p.minutes > 0);
  const starters = lines.filter((p) => p.starter === true);
  const bench = lines.filter((p) => p.starter !== true).sort((a, b) => b.minutes - a.minutes || Number(a.providerAthleteId) - Number(b.providerAthleteId));
  const byId = new Map(rows.map((r) => [r.providerAthleteId, r]));
  const roleOf = [...starters.map((p) => [p, "STARTER"]), ...bench.map((p, i) => [p, i === 0 ? "SIXTH_MAN" : "ROTATION"])];
  const roles = roleOf.map(([p, role]) => {
    const id = String(p.providerAthleteId);
    const r = byId.get(id);
    const status = !r ? COVERAGE_STATUS.NOT_ON_ROSTER_CAPTURE : r.minutesState === MINUTES_STATES.OUT ? COVERAGE_STATUS.OUT : Number.isFinite(r.expectedMinutes) ? COVERAGE_STATUS.PROJECTED : COVERAGE_STATUS.NO_PROJECTION;
    const reason = status === COVERAGE_STATUS.PROJECTED ? null : status === COVERAGE_STATUS.OUT ? REMOVAL_EVIDENCE.OUT_IN_FEED : status === COVERAGE_STATUS.NO_PROJECTION ? r.noProjectionReason : COVERAGE_STATUS.NOT_ON_ROSTER_CAPTURE;
    return { providerAthleteId: id, name: p.name ?? null, role, lastGameMinutes: p.minutes, status, reason, playProbability: r?.projectedPlayProbability ?? null, eligibilityState: r?.eligibilityState ?? null, injuryStatus: r?.injuryStatus ?? null };
  });
  return { lastEventId: String(box.providerEventId), teamReason: null, rule: "last-lineup proxy: starters, top bench minutes and other players of the team's last game before the instant", roles, total: roles.length, projected: roles.filter((r) => r.status === COVERAGE_STATUS.PROJECTED).length };
}

/**
 * The v0.7 pool for one team: v0.3's roster gate and rows, then rules 2 to 5, 8 and 9.
 * A refused roster stays refused. Every rostered player is either projected, Out in the feed, or unprojected with a reason.
 */
export function gatePoolV07({ rosters, providerTeamId, context }) {
  const { asOfDateUtc, roleIndex, statusIndex, injuries, injuriesAsOf, params } = context;
  const teamId = String(providerTeamId);
  if (injuriesAsOf != null && !(Date.parse(injuriesAsOf) <= Date.parse(asOfDateUtc))) return { state: "REFUSED", reason: "INJURIES_FROM_THE_FUTURE", gate: { poolVersion: POOL_V07_VERSION, refusal: "INJURIES_FROM_THE_FUTURE", injuriesAsOf } };
  const v03 = gatePoolV03({ rosters, providerTeamId: teamId, boxscores: context.boxscores, asOfDateUtc, injuries, population: "regular", roleIndex });
  if (v03.state !== "GATED") return v03;
  const seasons = { priorSeason: roleIndex.priorSeason, currentSeason: roleIndex.currentSeason };

  const rows = v03.rows.map((r) => {
    const isOut = r.availability === "out";
    const { state, streak } = stateFor(statusIndex, teamId, r.providerAthleteId);
    const dayToDay = !isOut && /day-to-day/i.test(String(r.injuryStatus ?? ""));
    const q = playProbabilityV07({ base: r.playRate, state, dayToDay }, params);
    const est = isOut ? null : minutesEstimateV07(roleIndex.byAthlete.get(r.providerAthleteId), { ...seasons, teamId, params });
    const hasEvidence = est != null && Number.isFinite(est.expectedMinutes) && est.expectedMinutes > 0;
    const base = {
      ...r,
      v03RoleMinutes: r.expectedMinutes,
      basePlayRate: r.playRate ?? null,
      playRate: q,
      projectedPlayProbability: isOut ? 0 : hasEvidence ? q : null,
      eligibilityState: state,
      eligibilityStreak: streak,
      dayToDay,
      removalEvidence: isOut ? REMOVAL_EVIDENCE.OUT_IN_FEED : null,
      carriedGames: est?.carriedGames ?? 0,
      currentGamesThisTeam: est?.currentGamesThisTeam ?? 0,
      carriedWeight: est?.carriedWeight ?? null,
      movedTeam: est?.movedTeam ?? false,
      noProjectionReason: null,
    };
    if (isOut) return base;
    if (!hasEvidence) return { ...base, expectedMinutes: null, minutesSd: null, rates: null, rateSd: null, minutesState: MINUTES_STATES.INSUFFICIENT_HISTORY, noProjectionReason: noProjectionReason(r) };
    return { ...base, expectedMinutes: est.expectedMinutes, minutesSd: est.minutesSd };
  });

  return {
    ...v03,
    ...CANDIDATE_STATUS,
    modelVersion: MINUTES_MODEL_V07_VERSION,
    constantsStatus: PROPOSED,
    params: { ...params },
    normalisation: { rule: V07_NORMALISATION_RULE, power: REUSED_CONSTANTS.MINUTES_POWER.value },
    rows,
    noProjection: rows.filter((r) => r.noProjectionReason).map((r) => ({ providerAthleteId: r.providerAthleteId, name: r.name, reason: r.noProjectionReason, experienceYears: r.rosterExperienceYears })),
    coverage: coverageFor(context, teamId, rows),
    gate: { ...v03.gate, poolVersion: POOL_V07_VERSION, minutesModel: MINUTES_MODEL_V07_VERSION },
  };
}

/**
 * v0.7 roster preparation. Same fallbacks as v0.3 (pool rate, default SD, conditional minutes), with normaliseV07 for the
 * team account. `reconciliation` shows how the 240 minutes were placed and the context of what was not.
 */
export function prepareRosterV07(pool) {
  const norm = pool?.normalisation;
  if (norm?.rule !== V07_NORMALISATION_RULE || !Number.isFinite(norm?.power)) throw new Error("prepareRosterV07: a v0.7 pool is required");
  const params = pool.params ?? K;
  const rows = Array.isArray(pool?.rows) ? pool.rows : [];
  const live = rows.filter((r) => r.availability !== "out" && Number.isFinite(r.expectedMinutes) && r.expectedMinutes > 0);
  const qOf = (r) => (Number.isFinite(r.playRate) && r.playRate > 0 ? Math.min(1, r.playRate) : 1);
  const filled = normaliseV07(live.map((r) => ({ minutes: r.expectedMinutes, q: qOf(r) })), { power: norm.power, params });

  const poolRate = {};
  for (const k of STAT_KEYS) {
    const withRate = live.filter((r) => r.rates && Number.isFinite(r.rates[k]));
    const w = withRate.reduce((s, r) => s + r.expectedMinutes, 0);
    poolRate[k] = w > 0 ? withRate.reduce((s, r) => s + r.rates[k] * r.expectedMinutes, 0) / w : null;
  }
  const players = live.map((r, i) => {
    const mu = Math.min(MAX_PLAYER_MINUTES, filled.minutes[i]);
    const ratio = mu / r.expectedMinutes;
    const sd = Number.isFinite(r.minutesSd) ? r.minutesSd * ratio : mu * DEFAULT_MINUTES_SD_RATIO;
    const hasOwnRates = r.rates && STAT_KEYS.every((k) => Number.isFinite(r.rates[k]));
    const rates = {}, rateSd = {};
    for (const k of STAT_KEYS) {
      const own = r.rates && Number.isFinite(r.rates[k]);
      rates[k] = own ? r.rates[k] : poolRate[k];
      rateSd[k] = own && Number.isFinite(r.rateSd?.[k]) ? r.rateSd[k] : (rates[k] != null ? rates[k] * 0.5 : null);
    }
    return {
      providerAthleteId: r.providerAthleteId, name: r.name,
      expectedMinutes: r4(mu), minutesSd: r4(sd), starterRate: r.starterRate, basis: r.basis, gamesUsed: r.gamesUsed,
      availability: r.availability, injuryStatus: r.injuryStatus ?? null, eligibilityState: r.eligibilityState,
      ratesBasis: hasOwnRates ? "player-window" : "team-pool-fallback",
      rates: Object.fromEntries(STAT_KEYS.map((k) => [k, r4(rates[k])])),
      rateSd: Object.fromEntries(STAT_KEYS.map((k) => [k, r4(rateSd[k])])),
      playRate: r4(qOf(r)),
      roleMinutes: r4(r.expectedMinutes),
    };
  });
  const expectedOnProjected = live.reduce((s, r, i) => s + qOf(r) * Math.min(MAX_PLAYER_MINUTES, filled.minutes[i]), 0);
  const unallocated = Math.max(0, TEAM_MINUTES - expectedOnProjected);
  const noProjection = pool.noProjection ?? [];
  const outRows = rows.filter((r) => r.availability === "out").length;
  const context = [
    ...(noProjection.length ? ["ROSTERED_PLAYERS_WITH_NO_PROJECTION"] : []),
    ...(outRows ? ["PLAYERS_OUT_IN_FEED"] : []),
    ...(live.some((r) => qOf(r) < 0.5) ? ["PROJECTED_PLAYERS_WITH_PLAY_PROBABILITY_UNDER_HALF"] : []),
  ];
  return {
    ...CANDIDATE_STATUS,
    modelVersion: MINUTES_MODEL_V07_VERSION,
    players,
    noProjection,
    coverage: pool.coverage ?? null,
    reconciliation: {
      targetTeamMinutes: TEAM_MINUTES,
      expectedOnProjected: r2(expectedOnProjected),
      unallocatedMinutes: r2(unallocated),
      rule: "Σ q·minutes + unallocatedMinutes = 240; unallocated minutes stand for what the model cannot place and are never put on a projected player",
      applied: filled.applied,
      rawPlayRateWeighted: r2(filled.weightedSum),
      requiredFactor: r4(filled.requiredFactor),
      liftPlaced: r2(filled.lifted),
      cut: r2(filled.cut),
      unallocatedContext: unallocated > 0.005 ? context : [],
      noProjectionRows: noProjection.length,
      outRows,
    },
  };
}

/**
 * The per-slate coverage report. Pure.
 * @param games [{ providerEventId, home: { providerTeamId, abbr }, away: { providerTeamId, abbr } }]
 * Every missing row carries a reason code; the function throws if one does not.
 */
export function coverageReportV07({ date, games, rosters, context }) {
  const teams = [];
  const seen = new Set();
  for (const g of games) {
    for (const side of [g.home, g.away]) {
      const teamId = String(side.providerTeamId);
      if (seen.has(teamId)) continue;
      seen.add(teamId);
      const pool = gatePoolV07({ rosters, providerTeamId: teamId, context });
      if (pool.state !== "GATED") {
        teams.push({ team: side.abbr ?? teamId, providerTeamId: teamId, providerEventId: String(g.providerEventId), state: pool.state, teamReason: `${COVERAGE_STATUS.REFUSED}:${pool.reason}`, starters: [], sixthMen: [], rotation: [], missing: [] });
        continue;
      }
      const prep = prepareRosterV07(pool);
      const minutes = new Map(prep.players.map((p) => [p.providerAthleteId, p.expectedMinutes]));
      const roles = pool.coverage.roles.map((c) => ({ ...c, expectedMinutes: minutes.get(c.providerAthleteId) ?? null }));
      const missing = roles.filter((c) => c.status !== COVERAGE_STATUS.PROJECTED);
      for (const c of missing) if (!c.reason) throw new Error(`coverageReportV07: ${c.name} has status ${c.status} with no reason code`);
      teams.push({
        team: side.abbr ?? teamId, providerTeamId: teamId, providerEventId: String(g.providerEventId), state: "GATED",
        lastEventId: pool.coverage.lastEventId, teamReason: pool.coverage.teamReason,
        starters: roles.filter((c) => c.role === "STARTER"), sixthMen: roles.filter((c) => c.role === "SIXTH_MAN"), rotation: roles.filter((c) => c.role === "ROTATION"),
        missing, noProjection: prep.noProjection, unallocatedMinutes: prep.reconciliation.unallocatedMinutes, unallocatedContext: prep.reconciliation.unallocatedContext,
      });
    }
  }
  const rolesAll = teams.flatMap((t) => [...t.starters, ...t.sixthMen, ...t.rotation]);
  const tally = (role) => {
    const list = rolesAll.filter((c) => c.role === role);
    const reasons = {};
    for (const c of list) if (c.reason) reasons[c.reason] = (reasons[c.reason] ?? 0) + 1;
    return { total: list.length, projected: list.filter((c) => c.status === COVERAGE_STATUS.PROJECTED).length, reasons };
  };
  return {
    ...CANDIDATE_STATUS,
    modelVersion: MINUTES_MODEL_V07_VERSION,
    label: "COVERAGE_REPORT_LAST_LINEUP_PROXY",
    proxy: "No NBA depth chart is committed. Starters and sixth men are those of each team's last game before the instant.",
    date,
    asOfDateUtc: context.asOfDateUtc,
    totals: { teams: teams.length, teamsWithNoLineup: teams.filter((t) => t.teamReason).length, starters: tally("STARTER"), sixthMen: tally("SIXTH_MAN"), rotation: tally("ROTATION") },
    teams,
  };
}
