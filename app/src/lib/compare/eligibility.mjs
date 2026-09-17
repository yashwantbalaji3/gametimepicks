/**
 * COMPARE ELIGIBILITY (v1.4 · §48–§49 · C1402) — may these two entities be compared, and on what?
 *
 * Pure identity/intersection logic. Returns stable reason codes, never copy. Order-independent: swapping A and B
 * changes nothing but display order (the pair key, shared seasons and shared families are symmetric).
 *
 * Nothing falls back: a requested stat or season that the pair does not share is a blocker, not a quiet substitute.
 */
import { BLOCKER, PLAYER_COMPARE_SPORTS, TEAM_COMPARE_BLOCKED_SPORTS, TEAM_COMPARE_SPORTS, pairKey } from "./contract.mjs";
import { playerSeasonsForStat, teamSeasonsWithResults } from "./entities.mjs";
import { sharedStatFamilies } from "./stat-families.mjs";

const intersectDesc = (a, b) => {
  const bs = new Set(b);
  return a.filter((x) => bs.has(x)).sort((x, y) => (x < y ? 1 : x > y ? -1 : 0));
};

function identityBlockers(a, b, supported, blocked = []) {
  if (!a || !b) return [BLOCKER.ENTITY_NOT_PUBLISHED];
  if (a.sport !== b.sport) return [BLOCKER.DIFFERENT_SPORT];
  if (blocked.includes(a.sport)) return [BLOCKER.TEAM_RESULTS_UNSUPPORTED];
  if (!supported.includes(a.sport)) return [BLOCKER.SPORT_NOT_SUPPORTED];
  if (a.id === b.id) return [BLOCKER.SAME_ENTITY];
  return [];
}

/**
 * @param {any} a team compare entity (or null when the selection did not resolve)
 * @param {any} b
 * @param {{ season?: string|null }} [opts]
 */
export function getTeamCompareEligibility(a, b, opts = {}) {
  const blockers = identityBlockers(a, b, TEAM_COMPARE_SPORTS, TEAM_COMPARE_BLOCKED_SPORTS);
  if (!blockers.length && (!a.supportsResults || !b.supportsResults)) blockers.push(BLOCKER.TEAM_RESULTS_UNSUPPORTED);
  if (blockers.length) return { eligible: false, pair: null, sharedSeasons: [], selectedSeason: null, defaultSeason: null, blockers };
  const sharedSeasons = intersectDesc(teamSeasonsWithResults(a), teamSeasonsWithResults(b));
  const defaultSeason = sharedSeasons[0] ?? null;
  if (!sharedSeasons.length) blockers.push(BLOCKER.NO_SHARED_SEASON);
  let selectedSeason = defaultSeason;
  if (opts.season != null && opts.season !== "") {
    if (sharedSeasons.includes(opts.season)) selectedSeason = opts.season;
    else { selectedSeason = null; blockers.push(BLOCKER.SEASON_NOT_SHARED); }
  }
  return { eligible: blockers.length === 0, pair: pairKey(a.sport, a.id, b.id), sharedSeasons, selectedSeason, defaultSeason, blockers };
}

/**
 * Default season rule (§67): the newest season in which BOTH players recorded the selected stat. A current season
 * with no factual rows on either side (NFL 2026) is therefore never the default — it is not in the intersection.
 *
 * @param {any} a player compare entity (or null)
 * @param {any} b
 * @param {{ stat?: string|null, season?: string|null }} [opts] stat = canonical family key
 */
export function getPlayerCompareEligibility(a, b, opts = {}) {
  const blockers = identityBlockers(a, b, PLAYER_COMPARE_SPORTS);
  const empty = { eligible: false, pair: null, sharedStatFamilies: [], selectedStat: null, sharedSeasons: [], selectedSeason: null, defaultSeason: null };
  if (blockers.length) return { ...empty, blockers };
  const shared = sharedStatFamilies(a, b);
  if (!shared.length) return { ...empty, pair: pairKey(a.sport, a.id, b.id), blockers: [BLOCKER.NO_SHARED_STAT] };
  let selectedStat = shared[0];
  if (opts.stat != null && opts.stat !== "") {
    if (!shared.includes(opts.stat)) return { ...empty, pair: pairKey(a.sport, a.id, b.id), sharedStatFamilies: shared, blockers: [BLOCKER.STAT_NOT_SHARED] };
    selectedStat = opts.stat;
  }
  const sharedSeasons = intersectDesc(playerSeasonsForStat(a, selectedStat), playerSeasonsForStat(b, selectedStat));
  const defaultSeason = sharedSeasons[0] ?? null;
  if (!sharedSeasons.length) blockers.push(BLOCKER.NO_SHARED_SEASON);
  let selectedSeason = defaultSeason;
  if (opts.season != null && opts.season !== "") {
    if (sharedSeasons.includes(opts.season)) selectedSeason = opts.season;
    else { selectedSeason = null; if (sharedSeasons.length) blockers.push(BLOCKER.SEASON_NOT_SHARED); }
  }
  return { eligible: blockers.length === 0, pair: pairKey(a.sport, a.id, b.id), sharedStatFamilies: shared, selectedStat, sharedSeasons, selectedSeason, defaultSeason, blockers };
}
