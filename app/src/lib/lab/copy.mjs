/**
 * RESEARCH LAB COPY (v1.5) — the ONLY user-facing words for the Lab's codes.
 *
 * Plain English, descriptive, for sports fans rather than database users: no "schema", "query cost", "SQL",
 * "database", "partition" or "index" ever reaches a reader (§129). Never a provider, file or internal status word.
 * Never an evaluative word about a row: a sorted column is not a ranking, and a matched threshold is not a hit
 * rate, an over rate or a success rate. Unknown codes THROW — a missing explanation must not render as nothing.
 *
 * Pure: no filesystem, no clock.
 */
import { LAB_ERROR } from "./contract.mjs";

export const MODE_LABEL = Object.freeze({ games: "Games", players: "Players", seasons: "Seasons" });
export const MODE_TITLE = Object.freeze({ games: "Game Finder", players: "Player Stat Explorer", seasons: "Season Explorer" });
export const MODE_SUB = Object.freeze({
  games: "Find recorded final scores by team, opponent, season, result, score or date.",
  players: "Filter recorded player game lines on one stat, with a minimum or a maximum.",
  seasons: "Recorded season results for every team, in a table you can sort.",
});

export const SPORT_NAME = Object.freeze({ MLB: "MLB", NFL: "NFL", EPL: "Premier League", UFC: "UFC" });

/** "2025" for NFL-2025, "2025-26" for EPL-2025-26 — the canonical id's own label, never a guess. */
export const seasonLabel = (id) => (id === "all" ? "All recorded seasons" : String(id ?? "").replace(/^[A-Z]+-/, ""));

/* ── why a sport is not in a mode ──────────────────────────────────────────────────────────────── */

export const BLOCKED_COPY = Object.freeze({
  TEAM_RESULTS_UNSUPPORTED: ({ sportName }) => `${sportName} final results are not yet an ID-based fact in GameTimePicks data, so no recorded game, record or score can be searched.`,
  SPORT_NOT_SUPPORTED: ({ sportName }) => `${sportName} is not organised as team games in GameTimePicks data, so this search does not apply.`,
  NO_COMPARABLE_STAT_FAMILY: ({ sportName }) => `${sportName} records outcomes only, with no numeric statistic to filter on.`,
});

export function blockedText(code, ctx) {
  const f = BLOCKED_COPY[code];
  if (!f) throw new Error(`lab copy: unknown blocked code ${code}`);
  return f(ctx);
}

/* ── why a query could not run ─────────────────────────────────────────────────────────────────── */

export const ERROR_COPY = Object.freeze({
  [LAB_ERROR.UNKNOWN_SCHEMA_VERSION]: () => "This research link was written for a different version of the Lab and cannot be read.",
  [LAB_ERROR.UNKNOWN_MODE]: () => "This link asks for a kind of search the Lab does not have.",
  [LAB_ERROR.UNSUPPORTED_SPORT_MODE]: () => "This search is not available for that sport.",
  [LAB_ERROR.UNKNOWN_FIELD]: () => "This link uses a filter the Lab does not have.",
  [LAB_ERROR.OPERATOR_NOT_ALLOWED]: () => "This link applies a filter in a way that field does not support.",
  [LAB_ERROR.INVALID_VALUE]: () => "One of the values in this link could not be read.",
  [LAB_ERROR.ENTITY_NOT_FOUND]: () => "This link names a team or player that is not in the Lab's list. Choose from the list instead.",
  [LAB_ERROR.SEASON_NOT_SUPPORTED]: () => "The season in this link has no recorded data for this search.",
  [LAB_ERROR.STAT_NOT_SUPPORTED]: () => "The stat in this link is not recorded for this sport.",
  [LAB_ERROR.STAT_REQUIRED]: () => "Choose a stat to filter player games on.",
  [LAB_ERROR.FIELD_REQUIRES_TEAM]: () => "A result, a home-or-away side and a score are always somebody's, so choose a team first.",
  [LAB_ERROR.ALL_SEASONS_NOT_SUPPORTED]: () => "Player games are searched one season at a time. A player's full recorded history is on their own research page.",
  [LAB_ERROR.TOO_MANY_FILTERS]: () => "This link uses more filters than the Lab accepts.",
  [LAB_ERROR.TOO_MANY_SORTS]: () => "This link sorts by more columns than the Lab accepts.",
  [LAB_ERROR.TOO_MANY_ENTITIES]: () => "This link selects more teams or players than the Lab accepts.",
  [LAB_ERROR.LIMIT_EXCEEDED]: () => "This link asks for a page beyond the last result the Lab returns.",
  [LAB_ERROR.INVALID_DATE_RANGE]: () => "The first date in this link is after the last date.",
  [LAB_ERROR.QUERY_TOO_LARGE]: () => "This research link is too long to read.",
});

export function errorText(code) {
  const f = ERROR_COPY[code];
  if (!f) throw new Error(`lab copy: unknown error code ${code}`);
  return f();
}

/* ── coverage ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * A compare family-coverage code ⇢ the Lab's own PUBLIC code. The upstream codes name their source
 * (`NFL_ESPN_LINES_2023_ON`), and a public artifact must not: the Lab stores its own code and the reader sees only
 * the sentence. An unmapped upstream code throws at build time rather than shipping unexplained.
 */
export const FAMILY_COVERAGE_CODE = Object.freeze({
  NFL_ESPN_LINES_2023_ON: "NFL_GAME_LINES_FROM_2023",
  MLB_CAPTURED_ONLY: "MLB_CAPTURED_CATEGORIES_ONLY",
});

export function familyCoverageCode(upstream) {
  if (upstream == null) return null;
  const code = FAMILY_COVERAGE_CODE[upstream];
  if (!code) throw new Error(`lab copy: unmapped family coverage code ${upstream}`);
  return code;
}

export const COVERAGE_COPY = Object.freeze({
  MLB_FINALS_ARCHIVE_2023: "Recorded MLB finals begin with the 2023 season. Earlier games are not in GameTimePicks data.",
  CURRENT_SEASON_ROLLING: "The current season is still being recorded, so its counts are lower than a completed season's.",
  NFL_NEUTRAL_HOST_UNKNOWN: "A few games were played at a neutral site. GameTimePicks data does not record which team hosted, so those games are shown as neutral and never as home or away.",
  NFL_NO_SEASON_PHASE: "Preseason, regular-season and playoff games are not labelled separately in GameTimePicks data, so they are not offered as a filter.",
  RECORDED_FINALS_ONLY: "Records count only games with an official final score recorded for both teams. Scheduled and postponed games are never counted, and never shown as 0–0.",
  MLB_PLAYER_CAPTURED_ONLY: "MLB player games include only the stat categories GameTimePicks captured for that game. This is not a complete MLB box-score history, and a game with no row is not a game missed.",
  NFL_NO_CURRENT_SEASON_LOGS: "Current-season (2026) player game lines are not available yet.",
  NFL_GAME_LINES_FROM_2023: "Passing touchdowns and interceptions thrown are recorded in game lines from 2023 onward. Earlier games show them as not recorded, never as zero.",
  MLB_CAPTURED_CATEGORIES_ONLY: "This category is recorded only for games where GameTimePicks captured it, so a player's game count reflects captured games rather than games played.",
  EPL_NO_CURRENT_SEASON_LOGS: "Current-season (2026-27) match lines are not available yet.",
});

export function coverageText(code) {
  const t = COVERAGE_COPY[code];
  if (!t) throw new Error(`lab copy: unknown coverage note ${code}`);
  return t;
}

/** The one-line period sentence above a result set. Deliberately says "GameTimePicks data", never "all games". */
export function coveragePeriod({ mode, sportName, from, to }) {
  const what = mode === "games" ? "Recorded finals" : mode === "players" ? "Recorded player games" : "Recorded season results";
  if (!from || !to) return `${what} in GameTimePicks ${sportName} data.`;
  return `${what} in GameTimePicks ${sportName} data, ${from.slice(0, 10)} to ${to.slice(0, 10)}.`;
}

/* ── neutral words for filters and results ─────────────────────────────────────────────────────── */

export const HA_LABEL = Object.freeze({ H: "Home", A: "Away", N: "Neutral site" });
export const RESULT_LABEL = Object.freeze({ W: "Won", L: "Lost", T: "Tied" });
export const SORT_LABEL = Object.freeze({
  date: "Date", scored: "Scored", allowed: "Allowed", totalScore: "Combined score",
  statValue: "Recorded value", seasonId: "Season", team: "Team", finals: "Recorded finals",
  wins: "W", losses: "L",
});

/**
 * A sort option's words. Direction is described in the terms of the column: a date runs newest-to-oldest, a name
 * runs A to Z, a count runs high to low. "High to low" on a team name would be a sentence nobody says out loud.
 */
const SORT_DIRECTION = Object.freeze({
  date: ["Newest first", "Oldest first"],
  seasonId: ["Newest first", "Oldest first"],
  team: ["A to Z", "Z to A"],
});
export function sortOptionText(field, dir) {
  const label = SORT_LABEL[field];
  if (!label) throw new Error(`lab copy: unknown sort field ${field}`);
  const [descWord, ascWord] = SORT_DIRECTION[field] ?? ["High to low", "Low to high"];
  const word = dir === "desc" ? descWord : ascWord;
  // A "team" sort is alphabetical, so ascending is A to Z.
  return `${label} · ${field === "team" ? (dir === "asc" ? "A to Z" : "Z to A") : word.toLowerCase()}`;
}

/** "Showing 50 of 142" — the only place a size sentence is written. Truncation is always visible (§70, §71). */
export function resultCountText({ mode, totalMatched, returned, capped, cap }) {
  const noun = mode === "games" ? (totalMatched === 1 ? "recorded game" : "recorded games") : mode === "players" ? (totalMatched === 1 ? "recorded player game" : "recorded player games") : (totalMatched === 1 ? "team season" : "team seasons");
  if (totalMatched === 0) return `No ${noun} match these filters.`;
  const head = `${totalMatched.toLocaleString("en-US")} ${noun} match`;
  if (capped) return `${head}. The first ${cap.toLocaleString("en-US")} are available; showing ${returned}.`;
  if (returned === totalMatched) return `${head}.`;
  return `${head}. Showing ${returned}.`;
}
