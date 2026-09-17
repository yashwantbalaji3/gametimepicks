/**
 * MATCHUP EXPLORER + COMPARE — contract (v1.4).
 *
 *   Data Platform ──(B1: the v1.3 research builder, unchanged)──▶ data/research-projection/v1
 *                                                                        │ read ONCE by scripts/compare/build-compare-projections.mjs
 *                                                                        ▼
 *                                                          data/compare-projection/v1  (committed, deterministic)
 *                                                                        │
 *                  ┌─────────────────────────────────────────────────────┴───────────────────────────┐
 *   build time: /matchups/<sport>/<gameId>/ pages                          public assets /data/compare/v1/** (static files)
 *                                                                          composed in the browser by the SAME pure selectors
 *
 * Compare never reads the Data Platform: B1 `PLATFORM_CONSUMERS` is not widened. Comparison is DESCRIPTIVE — no
 * record, stat or meeting here is a prediction, a ranking or an edge; forecasts stay with their own owners and are
 * joined at the page by exact canonical game id.
 *
 * Pure module: no filesystem, no clock, no network.
 */

export const COMPARE_PROJECTION_SCHEMA_VERSION = 1;

/** Committed projection (repo root). Outside app/public: the builder emits the public subset separately. */
export const COMPARE_PROJECTION_DIR = "data/compare-projection/v1";

/** Public URL prefix of the static assets the Compare shells fetch. */
export const COMPARE_ASSET_PREFIX = "/data/compare/v1";

/**
 * What ships. Team Compare needs id-keyed team final scores (MLB runs, NFL points): EPL has none, UFC has no teams.
 * Player Compare needs at least one comparable stat family: UFC fighters carry outcome flags only, so no family.
 */
export const TEAM_COMPARE_SPORTS = Object.freeze(["MLB", "NFL"]);
export const PLAYER_COMPARE_SPORTS = Object.freeze(["NFL", "EPL", "MLB"]);
/** Sports whose Team Compare shell exists only to say why it is blocked (no record, no score, no meeting). */
export const TEAM_COMPARE_BLOCKED_SPORTS = Object.freeze(["EPL"]);
export const MATCHUP_SPORTS = Object.freeze(["MLB", "NFL"]);

/** Stable reason codes. UI maps them to copy (lib/compare/copy.mjs); core logic never carries sentences. */
export const BLOCKER = Object.freeze({
  DIFFERENT_SPORT: "DIFFERENT_SPORT",
  SAME_ENTITY: "SAME_ENTITY",
  SPORT_NOT_SUPPORTED: "SPORT_NOT_SUPPORTED",
  TEAM_RESULTS_UNSUPPORTED: "TEAM_RESULTS_UNSUPPORTED",
  ENTITY_NOT_PUBLISHED: "ENTITY_NOT_PUBLISHED",
  NO_SHARED_SEASON: "NO_SHARED_SEASON",
  NO_SHARED_STAT: "NO_SHARED_STAT",
  STAT_NOT_SHARED: "STAT_NOT_SHARED",
  SEASON_NOT_SHARED: "SEASON_NOT_SHARED",
  INSUFFICIENT_RECORDED_GAMES: "INSUFFICIENT_RECORDED_GAMES",
});

/** Fields owned by forecasts, Live, settlement or the reader's device. A compare artifact carrying one is refused. */
export const FORBIDDEN_COMPARE_FIELDS = Object.freeze([
  "forecast", "forecasts", "prediction", "probability", "winProbability", "confidence", "median", "p10", "p90", "edge",
  "odds", "price", "line", "modelStatus", "shadow", "liveState", "clock", "settled", "gradedAt", "followed", "saved",
  "observedAt", "src", "sourcePath", "providerAliases", "winner", "advantage", "rank", "score100",
]);

/** Evaluative words a comparison must never print about a side (a forecast owner's own section is separate). */
export const EVALUATIVE_TERMS = Object.freeze(["winner", "better", "edge", "advantage", "stronger", "best", "hotter"]);

/**
 * Canonical pair key. Symmetric by construction: `A vs B` and `B vs A` name the same pair. Display order is a UI
 * concern and never reaches identity.
 * @param {string} sport
 * @param {string} idA canonical id
 * @param {string} idB canonical id
 */
export function pairKey(sport, idA, idB) {
  if (typeof idA !== "string" || typeof idB !== "string" || !idA || !idB) throw new Error("compare pairKey: two canonical ids are required");
  const [lo, hi] = idA < idB ? [idA, idB] : [idB, idA];
  return `${sport}:${lo}|${hi}`;
}

/** Public shell routes. */
export const comparePath = (kind, sport, query) => {
  const base = `/compare/${kind === "team" ? "teams" : "players"}/${String(sport).toLowerCase()}/`;
  if (!query) return base;
  const q = Object.entries(query).filter(([, v]) => v != null && v !== "");
  return q.length ? `${base}?${q.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}` : base;
};

export const matchupPath = (sport, gameId) => `/matchups/${String(sport).toLowerCase()}/${gameId}/`;

/** Public asset paths (served statically; one index per kind+sport, one file per entity). */
export const compareAssetPath = {
  index: (kind, sport) => `${COMPARE_ASSET_PREFIX}/${kind === "team" ? "teams" : "players"}/${String(sport).toLowerCase()}/index.json`,
  entity: (kind, sport, slug) => `${COMPARE_ASSET_PREFIX}/${kind === "team" ? "teams" : "players"}/${String(sport).toLowerCase()}/${slug}.json`,
};

/**
 * Refuse a compare document whose version this reader does not understand.
 * @param {any} doc
 * @param {string} where
 */
export function assertCompareVersion(doc, where) {
  if (!doc || typeof doc !== "object") throw new Error(`${where}: compare projection is not an object`);
  if (doc.schemaVersion !== COMPARE_PROJECTION_SCHEMA_VERSION) {
    throw new Error(`${where}: compare projection schemaVersion ${JSON.stringify(doc.schemaVersion)} is not readable by the v${COMPARE_PROJECTION_SCHEMA_VERSION} reader`);
  }
  return doc;
}
