/**
 * TEAM + PLAYER RESEARCH — public projection contract (v1.3).
 *
 * The research projection is a PRESENTATION read model over the Data Platform. It is NOT the platform's
 * storage contract (that is `data-platform/contract.mjs`, schemaVersion 1) and it versions separately:
 * a page reader refuses any projection version it does not know rather than guessing at its shape.
 *
 * Owners, in one line each (docs/TEAM_PLAYER_RESEARCH.md §2):
 *   projection   page-shaped factual summaries, coverage, windows, slugs      (this package)
 *   platform     canonical identity + factual rows                             (lib/data-platform — build script only)
 *   forecasts    model-owned, joined at the PAGE by exact canonical id          (never inside a projection file)
 *   Live / settlement / Follow / Saved                                          (untouched)
 *
 * Pure module: no filesystem, no clock, no network.
 */

export const RESEARCH_PROJECTION_SCHEMA_VERSION = 1;

/** Where the committed projection lives, relative to the repository root. Outside app/public: never served wholesale. */
export const RESEARCH_PROJECTION_DIR = "data/research-projection/v1";

export const RESEARCH_SPORTS = Object.freeze(["MLB", "NFL", "EPL", "UFC"]);
export const TEAM_SPORTS = Object.freeze(["MLB", "NFL", "EPL"]);

/** Coverage status words describe DATA AVAILABILITY for a page, never model quality. */
export const COVERAGE_STATUS = Object.freeze({ FULL: "FULL", PARTIAL: "PARTIAL", LIMITED: "LIMITED", UNSUPPORTED: "UNSUPPORTED" });

/** Fields that belong to other owners. A projection record carrying any of them is refused (leak guard + validator). */
export const FORBIDDEN_PROJECTION_FIELDS = Object.freeze([
  "forecast", "forecasts", "probability", "confidence", "median", "p10", "p90", "edge", "odds", "price",
  "liveState", "clock", "settled", "gradedAt", "followed", "saved", "observedAt", "src", "sourcePath", "providerAliases",
]);

/**
 * Refuse a projection document whose version this reader does not understand.
 * @param {any} doc
 * @param {string} where
 */
export function assertProjectionVersion(doc, where) {
  if (!doc || typeof doc !== "object") throw new Error(`${where}: research projection is not an object`);
  if (doc.schemaVersion !== RESEARCH_PROJECTION_SCHEMA_VERSION) {
    throw new Error(`${where}: research projection schemaVersion ${JSON.stringify(doc.schemaVersion)} is not readable by the v${RESEARCH_PROJECTION_SCHEMA_VERSION} reader`);
  }
  return doc;
}

/** Route path for an entity. Sport segment is lower case; the slug is presentation, resolved through the registry. */
export function researchPath(kind, sportId, slug) {
  const seg = kind === "team" ? "teams" : "players";
  return `/${seg}/${String(sportId).toLowerCase()}/${slug}/`;
}
