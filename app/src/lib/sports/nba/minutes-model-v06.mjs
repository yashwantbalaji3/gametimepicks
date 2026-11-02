/**
 * NBA v0.6 CANDIDATE minutes model. PURE, deterministic, no I/O.
 * NBA REGULAR SEASON — CANDIDATE (NOT ARMED) · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * UNARMED. No production path imports this module. It is not a family in experimental-forecast.mjs, it writes nothing,
 * and it has no receipt. Its only callers are its tests and app/scripts/nba/research/replay-nba-v06-candidate.mjs.
 * Rules, constants and pass bars: docs/nba/NBA_V06_MINUTES_CANDIDATE_PREREGISTRATION_2026-11-02.md.
 *
 * THE v0.6 RULES, on top of v0.3 (minutes-model-v03.mjs) and the v0.5 gate (eligibility-gate-v05.mjs), both unedited:
 *   1. AS-OF INPUTS. buildV06Context is the one door. A box score enters only if it tipped before the instant AND was
 *      captured at or before it; an injury entry only if stated at or before it. No capture stamp, no entry.
 *   2. EXCLUSION. A player in a state whose 2025-26 play rate is under EXCLUDE_BELOW_PLAY_RATE is removed from the pool
 *      (minutesState EXCLUDED_NOT_PLAYING) with the reason on the row. Out in the feed stays Out.
 *   3. NORMALISATION (normaliseV06). Over-full pool: nobody is raised; the excess comes off minutes^power, so mostly
 *      from the bench. Under-full pool: minutes rise by one factor, each player bounded by a personal ceiling. What the
 *      ceilings cannot place is reported as unallocatedMinutes. It is never put on a player: it stands for players the
 *      model cannot see, usually rookies.
 *   4. LIGHTER PRIOR. The prior is worth PRIOR_GAMES appearances for MINUTES only. Rates, starter rate and the role play
 *      rate stay on v0.3's estimate, so a stat difference from v0.3 comes from minutes.
 *   5. DAY-TO-DAY AND MISSED GAMES. q = v0.3 playRate × v0.5 multiplier; a Day-To-Day listing in a state with no
 *      missed-game evidence (LAST_PLAYED, NONE) also takes DAY_TO_DAY_MULTIPLIER. Missed-game states do not take it: the
 *      missed game and the listing are largely the same evidence.
 *   6. TRADES AND PLAYOFFS. Playoffs and play-in never enter (v0.3's population rule). Appearances for another team,
 *      including this season's, are prior, never current, and a prior from another team is worth TRANSFER_PRIOR_GAMES.
 *   7. COVERAGE. Every starter and the sixth man of the team's last game before the instant is checked against the pool
 *      and gets a status and reason. A player with no committed evidence stays unprojected with a reason code; no
 *      number is invented for him.
 */
import { DEFAULT_MINUTES_SD_RATIO, MAX_PLAYER_MINUTES, TEAM_MINUTES } from "./game-sim.mjs";
import { ELIGIBILITY_TABLE, MULTIPLIERS, STATES, applyEligibilityGate, indexCurrentSeasonStatus } from "./eligibility-gate-v05.mjs";
import { gatePoolV03, indexRoleHistory } from "./minutes-model-v03.mjs";
import { MINUTES_STATES } from "./roster-gated-pool.mjs";
import { corpusSeasonOfDate, inPopulation } from "./sim-v1-profile.mjs";
import { V1_PARAMS } from "./game-sim-v1.mjs";

export const MINUTES_MODEL_V06_VERSION = "nba-minutes-model-v0.6-candidate";
export const POOL_V06_VERSION = "nba-roster-gated-pool-v0.6-candidate";
export const V06_NORMALISATION_RULE = "v06-bounded-water-fill";
export const CANDIDATE_STATUS = Object.freeze({ armed: false, role: "CANDIDATE_UNARMED", dataClass: "PRIVATE_RESEARCH", productEligible: false });
export const PROPOSED = "PROPOSED_NOT_APPROVED";
export const EXCLUDED_STATE = "EXCLUDED_NOT_PLAYING";

/** No number here is approved. Each one is recomputed by minutes-model-v06.test.mjs where a recompute exists. */
export const CONSTANTS = Object.freeze({
  PRIOR_GAMES: Object.freeze({ value: 3, status: PROPOSED, source: "Audit section 6: 2024-25 and 2025-26, first 20 team games; 3 reuses the frozen MIN_GAMES_FOR_RATES" }),
  TRANSFER_PRIOR_GAMES: Object.freeze({ value: 1, status: PROPOSED, source: "fitTransferPriorGames: lowest pooled MAE on changed-team rows, 2024-25 and 2025-26, first 20 team games, n 2,334" }),
  EXCLUDE_BELOW_PLAY_RATE: Object.freeze({ value: 0.25, status: PROPOSED, source: "Judgement within a measured gap: ELIGIBILITY_TABLE cells run 0.021, 0.135, then 0.369. Any value from 0.14 to 0.36 selects the same two states" }),
  DAY_TO_DAY_MULTIPLIER: Object.freeze({ value: 0.527, status: PROPOSED, source: "fitDayToDayMultiplier: frozen v0.3 receipts, slates 2026-10-22 to 2026-10-28, 43 Day-To-Day rows. IN-SAMPLE for those games: no earlier injury history exists" }),
  UNDERFULL_CEILING_SDS: Object.freeze({ value: 1, status: PROPOSED, source: "Judgement. shareUnderMeanPlusSd: 0.848 of 2025-26 appearances are at or below own mean + 1 SD" }),
  UNDERFULL_CEILING_MINUTES: Object.freeze({ value: 41, status: PROPOSED, source: "p99 of 2025-26 regular-season appearance minutes (minutesQuantile)" }),
});
/** Reused numbers. They were approved for other families, or for none, so none is approved for this candidate. */
export const REUSED_CONSTANTS = Object.freeze({
  RATE_PRIOR_GAMES: Object.freeze({ value: 10, status: PROPOSED, source: "v0.3 PARAMS.PRIOR_GAMES; founder approval on 2026-10-22 covers v0.3 alone" }),
  MINUTES_POWER: Object.freeze({ value: V1_PARAMS.MINUTES_POWER, status: PROPOSED, source: "v1 engine MINUTES_POWER; founder approval on 2026-10-22 covers v0.3 alone" }),
  ELIGIBILITY_MULTIPLIERS: Object.freeze({ value: MULTIPLIERS, status: PROPOSED, source: "PR 1281 ELIGIBILITY_TABLE, 2025-26 regular season; awaiting founder decision 3 in the audit" }),
});
const K = Object.freeze(Object.fromEntries(Object.entries(CONSTANTS).map(([k, c]) => [k, c.value])));

const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(2)));
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(3)));
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(4)));
const STAT_KEYS = Object.freeze(["pts", "reb", "ast", "threePm"]);

const cellRate = (c) => c.played / c.n;
/** The states removed from the pool: fitted play rate under the threshold. Derived, so the table stays the one source. */
export function excludedStates(threshold = K.EXCLUDE_BELOW_PLAY_RATE) {
  return Object.keys(ELIGIBILITY_TABLE.cells).filter((s) => s !== STATES.LAST_PLAYED && cellRate(ELIGIBILITY_TABLE.cells[s]) < threshold).sort();
}

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
 * Everything one forecast instant reads, built once and shared across its pools.
 * `overrides` exists for the preregistered sensitivities in the replay. It accepts only the named constants.
 * @param injuriesAsOf  the feed's own stamp; a feed stamped after the instant is refused by gatePoolV06
 */
export function buildV06Context({ boxscores, injuries = null, injuriesAsOf = null, asOfDateUtc, overrides = null }) {
  const unknown = Object.keys(overrides ?? {}).filter((k) => !(k in CONSTANTS));
  if (unknown.length) throw new Error(`buildV06Context: unknown override ${unknown.join(", ")}`);
  const asOf = asOfInputs({ boxscores, injuries, asOfDateUtc });
  const roleIndex = indexRoleHistory(asOf.docs, { asOfDateUtc, population: "regular" });
  const statusIndex = indexCurrentSeasonStatus(asOf.docs, { asOfDateUtc });
  const lastGameByTeam = new Map();
  const ordered = [...asOf.docs].filter((d) => (Number.isInteger(d.season) ? d.season : corpusSeasonOfDate(d.dateUtc)) === roleIndex.currentSeason && inPopulation(d.phase, "regular"))
    .sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
  for (const d of ordered) for (const t of d.teams ?? []) lastGameByTeam.set(String(t.providerTeamId), d);
  return {
    asOfDateUtc, boxscores: asOf.docs, injuries: asOf.injuries, injuriesAsOf, roleIndex, statusIndex, lastGameByTeam,
    params: { ...K, ...(overrides ?? {}) },
  };
}

function weightedSd(pairs) {
  if (pairs.length < 2) return null;
  const W = pairs.reduce((s, [, w]) => s + w, 0);
  const W2 = pairs.reduce((s, [, w]) => s + w * w, 0);
  if (!(W > 0) || !(W * W - W2 > 0)) return null;
  const m = pairs.reduce((s, [v, w]) => s + v * w, 0) / W;
  return Math.sqrt(pairs.reduce((s, [v, w]) => s + w * (v - m) ** 2, 0) / (W - W2 / W));
}

/**
 * Rules 4 and 6. Current = this season's appearances FOR THIS TEAM. Carried = last season's appearances on any team,
 * plus this season's for other teams. Carried is worth PRIOR_GAMES, or TRANSFER_PRIOR_GAMES when the most recent carried
 * appearance was for another team. Never inflated: a thin prior keeps its real weight. Pure.
 */
export function minutesEstimateV06(rec, { priorSeason, currentSeason, teamId, params = K }) {
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

/** Why a rostered, not-Out player has no projection. A code, never a number. */
export function noProjectionReason(row) {
  if (row.rosterExperienceYears === 0) return "ROOKIE_NO_REGULAR_SEASON_BOX";
  if (Number.isInteger(row.rosterExperienceYears)) return "VETERAN_NO_BOX_IN_LAST_TWO_SEASONS";
  return "NO_COMMITTED_EVIDENCE";
}

/**
 * Weighted fill with a ceiling per player: find f with Σ w_i · min(cap_i, f · share_i) = target, or every player at his
 * ceiling if the target is out of reach. Returns the minutes and the factor. Pure.
 */
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
 * Rule 3. rows: [{ minutes, q, sd }]. Pure. Team minutes reconcile by construction:
 * Σ q·minutes + unallocatedMinutes = target, with unallocatedMinutes ≥ 0.
 */
export function normaliseV06(rows, { target = TEAM_MINUTES, power = V1_PARAMS.MINUTES_POWER, params = K } = {}) {
  const q = rows.map((r) => r.q);
  const raw = rows.map((r) => r.minutes);
  const weightedSum = rows.reduce((s, r) => s + r.q * r.minutes, 0);
  const overFull = weightedSum > target;
  let fill;
  if (overFull) {
    fill = boundedWaterFill(raw.map((m) => m ** power), q, raw, target);
  } else {
    const ceilings = rows.map((r) => {
      const sd = Number.isFinite(r.sd) ? r.sd : r.minutes * DEFAULT_MINUTES_SD_RATIO;
      return Math.max(r.minutes, Math.min(params.UNDERFULL_CEILING_MINUTES, r.minutes + params.UNDERFULL_CEILING_SDS * sd));
    });
    fill = boundedWaterFill(raw, q, ceilings, target);
  }
  const placed = rows.reduce((s, r, i) => s + r.q * fill.minutes[i], 0);
  return {
    minutes: fill.minutes,
    factor: fill.factor,
    atCeiling: fill.capped,
    applied: overFull ? "over-full: bench water-fill, nobody raised" : "under-full: bounded lift, remainder unallocated",
    weightedSum, placed,
    unallocatedMinutes: Math.max(0, target - placed),
  };
}

/** Rule 7 for one team: last game's starters and sixth man against the pool. */
function coverageFor(context, teamId, rows) {
  const box = context.lastGameByTeam.get(teamId) ?? null;
  if (!box) return { lastEventId: null, rule: "team has no game before the instant", roles: [], total: 0, projected: 0 };
  const lines = (box.players ?? []).filter((p) => String(p.providerTeamId) === teamId && !p.didNotPlay && Number.isInteger(p.minutes) && p.minutes > 0);
  const starters = lines.filter((p) => p.starter === true);
  const sixth = lines.filter((p) => p.starter !== true).sort((a, b) => b.minutes - a.minutes || Number(a.providerAthleteId) - Number(b.providerAthleteId))[0] ?? null;
  const byId = new Map(rows.map((r) => [r.providerAthleteId, r]));
  const roles = [...starters.map((p) => [p, "STARTER"]), ...(sixth ? [[sixth, "SIXTH_MAN"]] : [])].map(([p, role]) => {
    const id = String(p.providerAthleteId);
    const r = byId.get(id);
    const status = !r ? "NOT_ON_ROSTER_CAPTURE" : r.minutesState === MINUTES_STATES.OUT ? "OUT" : r.minutesState === EXCLUDED_STATE ? "EXCLUDED" : Number.isFinite(r.expectedMinutes) ? "PROJECTED" : "NO_PROJECTION";
    return { providerAthleteId: id, name: p.name ?? null, role, status, reason: status === "NO_PROJECTION" ? r.noProjectionReason : status === "EXCLUDED" ? r.exclusionReason : null };
  });
  return { lastEventId: String(box.providerEventId), rule: "starters and top bench minutes of the team's last game before the instant", roles, total: roles.length, projected: roles.filter((r) => r.status === "PROJECTED").length };
}

/**
 * The v0.6 pool for one team: v0.3's roster gate and rows, the v0.5 gate, then rules 2, 4, 5, 6 and 7.
 * A refused roster stays refused. Rows carry `projectedPlayProbability` even when excluded, so participation can be scored.
 */
export function gatePoolV06({ rosters, providerTeamId, context }) {
  const { asOfDateUtc, roleIndex, statusIndex, injuries, injuriesAsOf, params } = context;
  const teamId = String(providerTeamId);
  if (injuriesAsOf != null && !(Date.parse(injuriesAsOf) <= Date.parse(asOfDateUtc))) return { state: "REFUSED", reason: "INJURIES_FROM_THE_FUTURE", gate: { poolVersion: POOL_V06_VERSION, refusal: "INJURIES_FROM_THE_FUTURE", injuriesAsOf } };
  const v03 = gatePoolV03({ rosters, providerTeamId: teamId, boxscores: context.boxscores, asOfDateUtc, injuries, population: "regular", roleIndex });
  if (v03.state !== "GATED") return v03;
  const gated = applyEligibilityGate(v03, { statusIndex });
  const seasons = { priorSeason: roleIndex.priorSeason, currentSeason: roleIndex.currentSeason };
  const excluded = new Set(excludedStates(params.EXCLUDE_BELOW_PLAY_RATE));

  const rows = gated.rows.map((r) => {
    const isOut = r.availability === "out";
    const dayToDay = /day-to-day/i.test(String(r.injuryStatus ?? ""));
    const noMissedGameEvidence = r.eligibilityState === STATES.LAST_PLAYED || r.eligibilityState === STATES.NONE;
    const q = dayToDay && noMissedGameEvidence ? Math.max(0.001, r3(r.playRate * params.DAY_TO_DAY_MULTIPLIER)) : r.playRate;
    const est = isOut ? null : minutesEstimateV06(roleIndex.byAthlete.get(r.providerAthleteId), { ...seasons, teamId, params });
    const hasEvidence = est != null && Number.isFinite(est.expectedMinutes) && est.expectedMinutes > 0;
    const isExcluded = !isOut && hasEvidence && excluded.has(r.eligibilityState);
    const base = {
      ...r,
      v03RoleMinutes: r.expectedMinutes,
      v05PlayRate: r.playRate,
      playRate: q,
      projectedPlayProbability: isOut ? 0 : hasEvidence ? q : null,
      dayToDayApplied: !isOut && dayToDay && noMissedGameEvidence,
      carriedGames: est?.carriedGames ?? 0,
      currentGamesThisTeam: est?.currentGamesThisTeam ?? 0,
      carriedWeight: est?.carriedWeight ?? null,
      movedTeam: est?.movedTeam ?? false,
      exclusionReason: null,
      noProjectionReason: null,
    };
    if (isOut) return base;
    if (!hasEvidence) return { ...base, expectedMinutes: null, minutesSd: null, rates: null, rateSd: null, minutesState: MINUTES_STATES.INSUFFICIENT_HISTORY, noProjectionReason: noProjectionReason(r) };
    if (isExcluded) return { ...base, expectedMinutes: null, minutesSd: null, minutesState: EXCLUDED_STATE, exclusionReason: r.eligibilityState, roleMinutesIfPlaying: est.expectedMinutes };
    return { ...base, expectedMinutes: est.expectedMinutes, minutesSd: est.minutesSd };
  });

  return {
    ...gated,
    ...CANDIDATE_STATUS,
    modelVersion: MINUTES_MODEL_V06_VERSION,
    constantsStatus: PROPOSED,
    params: { ...params },
    normalisation: { rule: V06_NORMALISATION_RULE, power: REUSED_CONSTANTS.MINUTES_POWER.value },
    rows,
    excluded: rows.filter((r) => r.minutesState === EXCLUDED_STATE).map((r) => ({ providerAthleteId: r.providerAthleteId, name: r.name, reason: r.exclusionReason, roleMinutesIfPlaying: r.roleMinutesIfPlaying, playProbability: r.projectedPlayProbability })),
    noProjection: rows.filter((r) => r.noProjectionReason).map((r) => ({ providerAthleteId: r.providerAthleteId, name: r.name, reason: r.noProjectionReason, experienceYears: r.rosterExperienceYears })),
    coverage: coverageFor(context, teamId, rows),
    gate: { ...gated.gate, poolVersion: POOL_V06_VERSION, minutesModel: MINUTES_MODEL_V06_VERSION },
  };
}

/**
 * v0.6 roster preparation. Same fallbacks as prepareRosterV03 (pool rate, default SD, conditional minutes), with
 * normaliseV06 in place of the v0.3 normalisation. `reconciliation` is the team's minutes account.
 */
export function prepareRosterV06(pool) {
  const norm = pool?.normalisation;
  if (norm?.rule !== V06_NORMALISATION_RULE || !Number.isFinite(norm?.power)) throw new Error("prepareRosterV06: a v0.6 pool is required");
  const params = pool.params ?? K;
  const rows = Array.isArray(pool?.rows) ? pool.rows : [];
  const live = rows.filter((r) => r.availability !== "out" && Number.isFinite(r.expectedMinutes) && r.expectedMinutes > 0);
  const qOf = (r) => (Number.isFinite(r.playRate) && r.playRate > 0 ? Math.min(1, r.playRate) : 1);
  const filled = normaliseV06(live.map((r) => ({ minutes: r.expectedMinutes, q: qOf(r), sd: r.minutesSd })), { power: norm.power, params });

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
  return {
    ...CANDIDATE_STATUS,
    modelVersion: MINUTES_MODEL_V06_VERSION,
    players,
    excluded: pool.excluded ?? [],
    noProjection: pool.noProjection ?? [],
    coverage: pool.coverage ?? null,
    reconciliation: {
      targetTeamMinutes: TEAM_MINUTES,
      expectedOnProjected: r2(expectedOnProjected),
      unallocatedMinutes: r2(TEAM_MINUTES - expectedOnProjected),
      rule: "Σ q·minutes + unallocatedMinutes = 240; unallocated minutes stand for players the model cannot see and are never placed on a projected player",
      applied: filled.applied,
      factor: r4(filled.factor),
      atCeiling: filled.atCeiling,
      rawPlayRateWeighted: r2(filled.weightedSum),
    },
  };
}

