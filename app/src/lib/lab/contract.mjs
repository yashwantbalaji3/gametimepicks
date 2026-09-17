/**
 * RESEARCH LAB — contract (v1.5).
 *
 *   Data Platform ──(B1: the v1.3 research builder, unchanged)──▶ data/research-projection/v1
 *                                                                        │ read ONCE by scripts/compare/build-compare-projections.mjs
 *                                                                        ▼
 *                                                          data/compare-projection/v1
 *                                                                        │ read ONCE by scripts/lab/build-lab-projections.mjs
 *                                                                        ▼
 *                                                            data/lab-projection/v1  (committed, deterministic)
 *                                                                        │ build step: scripts/lab/emit-lab-assets.mjs
 *                                                                        ▼
 *                                              app/public/data/lab/v1/**  (gitignored static files)
 *                                                    the /research/lab/ shell fetches an index + ONE partition
 *                                                    and runs the SAME pure engine the unit tests pin
 *
 * The Lab never reads the Data Platform: B1 `PLATFORM_CONSUMERS` is not widened. It FILTERS, SORTS and COUNTS
 * recorded facts. It does not predict, rank, grade, score or name a better side, and it holds no forecast, no Live
 * state, no settlement grade and no reader preference.
 *
 * Pure module: no filesystem, no clock, no network. Safe in the browser.
 */

/** The committed Lab projection's own schema version — independent of research (1) and compare (1). */
export const LAB_PROJECTION_SCHEMA_VERSION = 1;

/**
 * The QUERY grammar's own version, versioned separately from the projection so a query object can outlive an
 * artifact rebuild (and so a future Ask GameTime tool call can pin the argument shape it was written against).
 */
export const LAB_QUERY_SCHEMA_VERSION = 1;

/** Committed projection (repo root). Outside app/public: the public subset is emitted separately each build. */
export const LAB_PROJECTION_DIR = "data/lab-projection/v1";

/** Public URL prefix of the static assets the Research Lab fetches. */
export const LAB_ASSET_PREFIX = "/data/lab/v1";

/** The Research Lab route. `/research/` is the existing Research-engine page; the Lab is its tool. */
export const LAB_ROUTE = "/research/lab/";

export const LAB_MODES = Object.freeze(["games", "players", "seasons"]);

/**
 * What ships, per mode.
 *   games / seasons need id-keyed team final scores: MLB runs and NFL points are facts; EPL has none and UFC has
 *                   no teams (a bout is not a team game and is not forced into this contract).
 *   players         needs at least one comparable stat family (the v1.4 registry): UFC fighters carry outcome flags
 *                   only, so no numeric family exists.
 */
export const LAB_MODE_SPORTS = Object.freeze({
  games: Object.freeze(["MLB", "NFL"]),
  players: Object.freeze(["NFL", "EPL", "MLB"]),
  seasons: Object.freeze(["MLB", "NFL"]),
});

/** Why a sport is absent from a mode. Stable codes; the UI maps them to copy (lib/lab/copy.mjs). */
export const LAB_BLOCKED_SPORTS = Object.freeze({
  games: Object.freeze({ EPL: "TEAM_RESULTS_UNSUPPORTED", UFC: "SPORT_NOT_SUPPORTED" }),
  players: Object.freeze({ UFC: "NO_COMPARABLE_STAT_FAMILY" }),
  seasons: Object.freeze({ EPL: "TEAM_RESULTS_UNSUPPORTED", UFC: "SPORT_NOT_SUPPORTED" }),
});

/** Every sport the Lab knows about, so an unknown sport is refused rather than treated as blocked. */
export const LAB_SPORTS = Object.freeze(["MLB", "NFL", "EPL", "UFC"]);

/**
 * QUERY BUDGET. Every number is measured, not guessed (docs/RESEARCH_LAB.md §7):
 *   partitions  the largest query loads ONE index + ONE row partition. 2 is the ceiling, not a target.
 *   rows        500 returned rows is 10 pages of 50; the biggest partition holds 14,718 rows, so a scan is
 *               bounded by the partition, and the returned set is bounded by this.
 *   filters     8 typed clauses is more than any registry offers for one mode (games: 8 fields, players: 6).
 *   urlLength   1,024 characters — a share link must survive a mail client.
 */
export const LAB_BUDGET = Object.freeze({
  maxFilters: 8,
  maxSorts: 2,
  maxEntities: 4,
  maxRows: 500,
  maxPartitions: 2,
  pageSizes: Object.freeze([25, 50, 100]),
  defaultPageSize: 50,
  maxUrlLength: 1024,
});

/** Stable refusal codes. Core logic never carries a sentence; lib/lab/copy.mjs owns every word a reader sees. */
export const LAB_ERROR = Object.freeze({
  UNKNOWN_SCHEMA_VERSION: "UNKNOWN_SCHEMA_VERSION",
  UNKNOWN_MODE: "UNKNOWN_MODE",
  UNSUPPORTED_SPORT_MODE: "UNSUPPORTED_SPORT_MODE",
  UNKNOWN_FIELD: "UNKNOWN_FIELD",
  OPERATOR_NOT_ALLOWED: "OPERATOR_NOT_ALLOWED",
  INVALID_VALUE: "INVALID_VALUE",
  ENTITY_NOT_FOUND: "ENTITY_NOT_FOUND",
  SEASON_NOT_SUPPORTED: "SEASON_NOT_SUPPORTED",
  STAT_NOT_SUPPORTED: "STAT_NOT_SUPPORTED",
  STAT_REQUIRED: "STAT_REQUIRED",
  FIELD_REQUIRES_TEAM: "FIELD_REQUIRES_TEAM",
  ALL_SEASONS_NOT_SUPPORTED: "ALL_SEASONS_NOT_SUPPORTED",
  TOO_MANY_FILTERS: "TOO_MANY_FILTERS",
  TOO_MANY_SORTS: "TOO_MANY_SORTS",
  TOO_MANY_ENTITIES: "TOO_MANY_ENTITIES",
  LIMIT_EXCEEDED: "LIMIT_EXCEEDED",
  INVALID_DATE_RANGE: "INVALID_DATE_RANGE",
  QUERY_TOO_LARGE: "QUERY_TOO_LARGE",
});

/**
 * The sentinel season value meaning "every recorded season".
 *
 * Accepted in `games` and `seasons` mode ONLY, where one partition already holds every season, so "all" costs the
 * same single fetch as one season. It is REFUSED in `players` mode: player rows are partitioned by season (the
 * largest is 14,718 rows) and "all" would load every partition. One season per player query is the bound. Reading
 * a player's whole recorded history across seasons is what the player research page and Player Compare already do,
 * and the Lab links to both.
 */
export const ALL_SEASONS = "all";

/** Modes in which `ALL_SEASONS` is a legal season value. */
export const ALL_SEASONS_MODES = Object.freeze(["games", "seasons"]);

/**
 * Fields owned by forecasts, Live, settlement or the reader's device. A Lab artifact carrying one is refused by
 * the builder and by the projection test — the same closed list style the compare projection uses.
 */
export const FORBIDDEN_LAB_FIELDS = Object.freeze([
  "forecast", "forecasts", "prediction", "probability", "winProbability", "confidence", "median", "p10", "p90",
  "edge", "odds", "price", "line", "modelStatus", "shadow", "liveState", "clock", "inning", "settled", "gradedAt",
  "followed", "saved", "observedAt", "src", "sourcePath", "providerAliases", "winner", "advantage", "rank",
  "score100", "hitRate", "overRate", "successRate", "trend", "streak", "grade",
]);

/**
 * Evaluative words a research result must never print about a row (§118). A sorted factual column is not a ranking
 * and a matched threshold is not a hit rate.
 */
export const LAB_EVALUATIVE_TERMS = Object.freeze([
  "winner", "better", "edge", "advantage", "stronger", "best", "hotter", "hot streak", "hit rate", "success rate",
  "power ranking", "favourable", "favorable", "profitable",
]);

/**
 * Which committed projection files are stored gzipped. Row partitions are (the public emit writes them plain, the
 * way the compare emit does); the small indexes and the two receipts stay readable in a diff.
 */
export const labStoredGzipped = (rel) => /^(games|players|seasons)\//.test(rel);

/** Public asset paths (static files; one index per mode+sport, one row partition per query). */
export const labAssetPath = Object.freeze({
  index: (mode, sport) => `${LAB_ASSET_PREFIX}/${mode}/${String(sport).toLowerCase()}/index.json`,
  games: (sport) => `${LAB_ASSET_PREFIX}/games/${String(sport).toLowerCase()}/rows.json`,
  players: (sport, seasonId) => `${LAB_ASSET_PREFIX}/players/${String(sport).toLowerCase()}/${seasonId}.json`,
  seasons: (sport) => `${LAB_ASSET_PREFIX}/seasons/${String(sport).toLowerCase()}/rows.json`,
});

/** Canonical Lab URL for a serialized query string (the shell path is the canonical page). */
export const labPath = (search) => (search ? `${LAB_ROUTE}${search}` : LAB_ROUTE);

/**
 * Refuse a Lab document whose version this reader does not understand. Never reinterpreted, never repaired.
 * @param {any} doc
 * @param {string} where
 */
export function assertLabVersion(doc, where) {
  if (!doc || typeof doc !== "object") throw new Error(`${where}: lab projection is not an object`);
  if (doc.schemaVersion !== LAB_PROJECTION_SCHEMA_VERSION) {
    throw new Error(`${where}: lab projection schemaVersion ${JSON.stringify(doc.schemaVersion)} is not readable by the v${LAB_PROJECTION_SCHEMA_VERSION} reader`);
  }
  return doc;
}

/** Is this sport available in this mode? */
export const labModeSupports = (mode, sport) => (LAB_MODE_SPORTS[mode] ?? []).includes(sport);

/** The reason a sport is blocked in a mode, or null when it is supported (or not a sport at all). */
export const labBlocker = (mode, sport) => (LAB_BLOCKED_SPORTS[mode] ?? {})[sport] ?? null;
