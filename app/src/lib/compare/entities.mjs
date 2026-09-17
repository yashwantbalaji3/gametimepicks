/**
 * COMPARE ENTITIES (v1.4 · C1405) — the compact, pair-independent shape one team or one player takes in the compare
 * projection, derived by pure functions from ONE v1.3 research projection record.
 *
 * Why pair-independent: 750 NFL players make 280,875 pairs. Nothing here is keyed by a pair; the browser composes
 * any pair from two entity files with the same pure selectors a build-time matchup page uses.
 *
 * Packed rows (documented once, read by index everywhere):
 *   TEAM   [gameId, date, seasonId, ha, opponentTeamId, status, own, opp, result]      — the v1.3 TEAM_ROW, unchanged
 *   PLAYER [gameId, date, seasonId, teamId, opponentTeamId, ha, ...values]             — values in `stats` order;
 *          null = not recorded (never 0). Only rows recording at least one comparable value are kept.
 *
 * Pure: no filesystem, no clock.
 */
import { COMPARE_PROJECTION_SCHEMA_VERSION } from "./contract.mjs";
import { STAT_FAMILIES } from "./stat-families.mjs";

export const TEAM = Object.freeze({ GAME: 0, DATE: 1, SEASON: 2, HA: 3, OPP: 4, STATUS: 5, OWN: 6, OPP_SCORE: 7, RESULT: 8 });
export const PLAYER = Object.freeze({ GAME: 0, DATE: 1, SEASON: 2, TEAM: 3, OPP: 4, HA: 5, VALUES: 6 });

// v1.3 PLAYER_ROW layout (lib/research-pages/player-read-model.mjs): values start at 11.
const R = Object.freeze({ GAME: 0, DATE: 1, SEASON: 2, TEAM: 3, OPP: 4, HA: 5, VALUES: 11 });

export const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Coverage the compare surfaces carry: status + note codes + period. Codes only; copy lives in copy.mjs. */
const coverageOf = (c) => ({ status: c.status, notes: [...c.notes], from: c.from ?? null, to: c.to ?? null });

/**
 * @param {import("../research-pages/projection-store").TeamProjection} t
 * @param {string} path research page path
 */
export function teamCompareEntity(t, path) {
  return {
    schemaVersion: COMPARE_PROJECTION_SCHEMA_VERSION,
    artifact: "compare-team",
    sport: t.sport,
    id: t.id,
    slug: t.slug,
    name: t.name,
    abbreviation: t.abbreviation ?? null,
    path,
    supportsResults: t.supportsResults === true,
    resultsThrough: t.resultsThrough ?? null,
    coverage: coverageOf(t.coverage),
    rows: t.games.map((g) => [...g]),
  };
}

/**
 * Comparable families of a player: a family whose column belongs to one of the player's research stat groups (the
 * v1.3 availability rule — the group's primary stat is non-zero somewhere) AND has at least one recorded value.
 * A receiver whose passing line is all recorded zeros does not carry "Passing yards" — exactly as his research page.
 * @param {import("../research-pages/projection-store").PlayerProjection} p
 */
export function playerStatKeys(p) {
  const grouped = new Set(p.groups.flatMap((g) => g.columns));
  const colIndex = new Map(p.columns.map((c, i) => [c.key, i]));
  return (STAT_FAMILIES[p.sport] ?? [])
    .filter((f) => grouped.has(f.column) && colIndex.has(f.column) && p.gameLog.some((row) => isNum(row[R.VALUES + colIndex.get(f.column)])))
    .map((f) => f.key);
}

/**
 * @param {import("../research-pages/projection-store").PlayerProjection} p
 * @param {string} path research page path
 */
export function playerCompareEntity(p, path) {
  const stats = playerStatKeys(p);
  const colIndex = new Map(p.columns.map((c, i) => [c.key, i]));
  const cols = stats.map((k) => colIndex.get(k.slice(k.indexOf(".") + 1)));
  const rows = [];
  for (const r of p.gameLog) {
    const values = cols.map((ci) => (isNum(r[R.VALUES + ci]) ? r[R.VALUES + ci] : null));
    if (!values.some(isNum)) continue;
    rows.push([r[R.GAME], r[R.DATE], r[R.SEASON], r[R.TEAM] ?? null, r[R.OPP] ?? null, r[R.HA] ?? null, ...values]);
  }
  return {
    schemaVersion: COMPARE_PROJECTION_SCHEMA_VERSION,
    artifact: "compare-player",
    sport: p.sport,
    id: p.id,
    slug: p.slug,
    name: p.name,
    currentTeamId: p.currentTeamId ?? null,
    path,
    coverage: coverageOf(p.coverage),
    stats,
    rows,
  };
}

/** Seasons (newest first) in which an entity recorded at least one value of a family. */
export function playerSeasonsForStat(entity, statKey) {
  const i = entity.stats.indexOf(statKey);
  if (i < 0) return [];
  const s = new Set();
  for (const r of entity.rows) if (isNum(r[PLAYER.VALUES + i])) s.add(r[PLAYER.SEASON]);
  return [...s].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

/** Seasons (newest first) in which a team has at least one PROVEN final (both scores). */
export function teamSeasonsWithResults(entity) {
  if (!entity.supportsResults) return [];
  const s = new Set();
  for (const r of entity.rows) if (r[TEAM.RESULT]) s.add(r[TEAM.SEASON]);
  return [...s].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

/** Rows keyed by canonical game id: a repeated game id is ONE game (first row wins; rows arrive newest first). */
export function uniqueByGame(rows) {
  const seen = new Set();
  return rows.filter((r) => (seen.has(r[0]) ? false : (seen.add(r[0]), true)));
}

/** Canonical ordering used everywhere: event instant/date desc, then game id desc. */
export const newestFirst = (a, b) => {
  const da = a[1] ?? "";
  const db = b[1] ?? "";
  if (da !== db) return da < db ? 1 : -1;
  return a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0;
};
