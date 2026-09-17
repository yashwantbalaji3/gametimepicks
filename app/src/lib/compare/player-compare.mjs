/**
 * PLAYER COMPARE READ MODEL (v1.4 · §20 §22 §57–§59 §64 · C1406) — two players, one shared stat family.
 *
 *   - Only the selected SHARED family is read; there is no fallback to another stat.
 *   - Missing is never zero: only recorded numbers enter any aggregate. A recorded 0 is a value.
 *   - Season summary: n, mean, median, min, max (+ total where the family says a sum is meaningful).
 *   - Recent windows are INDEPENDENT last-N recorded games per player across seasons; each side states its own n,
 *     and a side with fewer recorded games says so (it is never relabelled "Last 5").
 *   - The chart series is relative order (game 1…N, newest first) with each game's own date — never a shared date
 *     axis implying the games were played together.
 *   - Rows keep THAT game's team (historical affiliation), not the player's current team.
 *
 * Pure: no filesystem, no clock.
 */
import { getPlayerCompareEligibility } from "./eligibility.mjs";
import { PLAYER, isNum, uniqueByGame } from "./entities.mjs";
import { statFamily } from "./stat-families.mjs";

export const PLAYER_WINDOWS = Object.freeze([3, 5, 10]);
const round1 = (x) => Math.round(x * 10) / 10;

/** mean / median / min / max over recorded values; null summary when n = 0. */
export function describeValues(values) {
  const v = values.filter(isNum);
  if (!v.length) return { n: 0, mean: null, median: null, min: null, max: null, total: null };
  const sorted = [...v].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : round1((sorted[mid - 1] + sorted[mid]) / 2);
  const total = v.reduce((a, x) => a + x, 0);
  return { n: v.length, mean: round1(total / v.length), median, min: sorted[0], max: sorted[sorted.length - 1], total };
}

/** Recorded games of one family, newest first: [{gameId, date, seasonId, teamId, opponentId, ha, value}]. */
export function recordedGames(entity, statKey) {
  const i = entity.stats.indexOf(statKey);
  if (i < 0) return [];
  return uniqueByGame(entity.rows)
    .filter((r) => isNum(r[PLAYER.VALUES + i]))
    .map((r) => ({ gameId: r[PLAYER.GAME], date: r[PLAYER.DATE], seasonId: r[PLAYER.SEASON], teamId: r[PLAYER.TEAM], opponentId: r[PLAYER.OPP], ha: r[PLAYER.HA], value: r[PLAYER.VALUES + i] }));
}

function sideSummary(entity, statKey, seasonId) {
  const fam = statFamily(statKey);
  const all = recordedGames(entity, statKey);
  const inSeason = all.filter((g) => g.seasonId === seasonId);
  const d = describeValues(inSeason.map((g) => g.value));
  return {
    id: entity.id,
    slug: entity.slug,
    name: entity.name,
    path: entity.path,
    currentTeamId: entity.currentTeamId,
    coverage: entity.coverage,
    recordedFrom: all.length ? all[all.length - 1].date : null,
    recordedThrough: all.length ? all[0].date : null,
    season: { ...d, total: fam?.total ? d.total : null, games: inSeason },
    windows: PLAYER_WINDOWS.map((size) => {
      const slice = all.slice(0, size);
      const s = describeValues(slice.map((g) => g.value));
      return { size, n: s.n, complete: s.n === size, mean: s.mean, values: slice.map((g) => g.value), games: slice };
    }),
  };
}

/**
 * @param {{ a: any, b: any, stat?: string|null, season?: string|null }} input player compare entities in display order;
 *   stat = canonical family key (`NFL.receivingYards`)
 */
export function buildPlayerComparison({ a, b, stat = null, season = null }) {
  const eligibility = getPlayerCompareEligibility(a, b, { stat, season });
  const ident = (e) => (e ? { id: e.id, slug: e.slug, name: e.name, path: e.path, currentTeamId: e.currentTeamId, coverage: e.coverage } : null);
  if (!eligibility.eligible) return { eligibility, family: null, a: ident(a), b: ident(b) };
  const key = eligibility.selectedStat;
  return {
    eligibility,
    family: statFamily(key),
    a: sideSummary(a, key, eligibility.selectedSeason),
    b: sideSummary(b, key, eligibility.selectedSeason),
  };
}
