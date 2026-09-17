/**
 * GAMETIME DATA PLATFORM — canonical record contract (v1.2 · schemaVersion 1).
 *
 * The platform is the FACTUAL sports graph beneath the product: identity, schedule/result linkage and
 * source-owned game facts. It is deliberately NOT a game "mega-object". Forecasts (model-owned), Live
 * state (provider-owned, ephemeral), settlement (grading-owned) and personal state (device-owned) stay
 * with their owners and join these records by canonical id — never the other way round. So no record
 * here has a forecast, live, grade, follow, save or observation field, and `validateRecord` refuses one
 * (see FORBIDDEN_OWNER_FIELDS) so the boundary is structural, not a convention.
 *
 * Every record carries `schemaVersion`. A v1 reader REJECTS any other version — a future v2 record is
 * never silently coerced into a v1 shape.
 *
 * Pure: no I/O, no clock, no network. See docs/GAMETIME_DATA_PLATFORM.md.
 */

export const PLATFORM_SCHEMA_VERSION = 1;

/** The product's existing sport codes (Follow, Observation, Saved). No second sport namespace. */
export const SPORT_IDS = Object.freeze(["MLB", "NFL", "EPL", "UFC"]);

export const ENTITY_TYPES = Object.freeze(["sport", "league", "season", "team", "player", "game"]);

/** A game's FACTUAL result class as of the source cutoff. Not live state: NOT_FINAL never means "in progress". */
export const STATUS_CLASSES = Object.freeze(["FINAL", "NOT_FINAL"]);

export const SEASON_PHASES = Object.freeze(["PRESEASON", "REGULAR", "POSTSEASON"]);

export const HOME_AWAY = Object.freeze(["HOME", "AWAY", "NEUTRAL"]);

export const UFC_CORNERS = Object.freeze(["RED", "BLUE"]);

/**
 * Provider ID NAMESPACES (not endpoints). An ESPN athlete id is the same id whether it arrived through
 * the scoreboard or the site API, so the alias namespace is `espn`; source POLICY stays in
 * lib/sports/source-registry.mjs and is referenced from sources.json per artifact.
 */
export const PROVIDERS = Object.freeze({
  mlb_statsapi: "MLB StatsAPI ids (gamePk, team id, person id, venue id)",
  espn: "ESPN ids (event, competition, team, athlete)",
  nflverse: "nflverse ids (game_id, gsis player id, franchise team code as used in GameTime's franchise-mapped research tables)",
  pfr: "Pro-Football-Reference player id (via the committed nflverse snap id bridge)",
  openfootball: "openfootball fixture key (season:matchday:home-v-away)",
  gametime_epl_club: "the shipped EPL club slug used inside shipped EPL event ids",
  gametime_epl_event: "a previously shipped EPL event id superseded by a kickoff change (lineage via the stable openfootball fixture key)",
});

/** Data availability vocabulary for coverage slices — describes DATA, never model quality. */
export const COVERAGE_STATUS = Object.freeze([
  "AVAILABLE", "PARTIAL", "UNSUPPORTED", "SOURCE_MISSING", "UNRESOLVED_IDENTITY", "INVALID_SOURCE", "STALE",
]);

/** Fields owned by OTHER owners. Their presence on a platform record is a contract violation. */
export const FORBIDDEN_OWNER_FIELDS = Object.freeze([
  "forecast", "prediction", "probability", "probabilities", "modelProbability", "projection", "lean", "edge",
  "live", "liveState", "clock", "inning", "period", "fetchedAt",
  "settlement", "settled", "graded", "gradedAt", "outcome", "hit",
  "followed", "saved", "observation", "observedAt",
]);

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const nonEmpty = (v) => typeof v === "string" && v.trim() !== "" && v === v.trim();
const nullableString = (v) => v === null || nonEmpty(v);

/** @param {unknown} v */
export function isIsoUtc(v) {
  return typeof v === "string" && ISO_UTC.test(v) && Number.isFinite(Date.parse(v));
}
/** @param {unknown} v */
export function isDate(v) {
  if (typeof v !== "string" || !DATE.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
}

/**
 * Normalize an instant to the platform's one spelling (`YYYY-MM-DDTHH:MM:SSZ`). Providers spell the same
 * minute several ways (`19:00Z`, `19:00:00Z`, `+00:00`); the event instant is the fact, not the spelling.
 * Returns null for anything unparseable — never a guessed time.
 * @param {unknown} v
 */
export function normalizeInstant(v) {
  if (typeof v !== "string" || v.trim() === "") return null;
  if (!/T\d{2}:\d{2}/.test(v)) return null; // a date alone is NOT an instant
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(v)) return null; // no zone ⇒ not provably UTC
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** @param {unknown} a */
export function validateAlias(a) {
  const errs = [];
  if (!isObj(a)) return ["alias is not an object"];
  if (!Object.hasOwn(PROVIDERS, a.provider)) errs.push(`unknown provider namespace ${JSON.stringify(a.provider)}`);
  if (!ENTITY_TYPES.includes(a.entityType)) errs.push(`unknown alias entityType ${JSON.stringify(a.entityType)}`);
  if (typeof a.id !== "string" || !nonEmpty(a.id)) errs.push(`alias id must be a non-empty trimmed STRING (got ${JSON.stringify(a.id)})`);
  else if (a.id.includes("|")) errs.push(`alias id may not contain "|" (reserved index separator): ${a.id}`);
  const extra = Object.keys(a).filter((k) => !["provider", "entityType", "id"].includes(k));
  if (extra.length) errs.push(`alias has unexpected keys ${extra.join(",")}`);
  return errs;
}

const aliasList = (list, entityType, errs) => {
  if (!Array.isArray(list)) { errs.push("providerAliases must be an array"); return; }
  const seen = new Set();
  for (const a of list) {
    for (const e of validateAlias(a)) errs.push(e);
    if (isObj(a) && a.entityType !== entityType) errs.push(`alias ${a.provider}:${a.id} has entityType ${a.entityType}, record is ${entityType}`);
    const k = isObj(a) ? `${a.provider}|${a.entityType}|${a.id}` : String(a);
    if (seen.has(k)) errs.push(`duplicate alias ${k}`);
    seen.add(k);
  }
};

const KEYS = {
  sport: ["schemaVersion", "id", "name"],
  league: ["schemaVersion", "id", "sportId", "name", "providerAliases"],
  season: ["schemaVersion", "id", "sportId", "leagueId", "label", "semantics", "startDate", "endDate", "providerAliases"],
  team: ["schemaVersion", "id", "sportId", "leagueId", "name", "shortName", "abbreviation", "providerAliases"],
  player: ["schemaVersion", "id", "sportId", "name", "currentTeamId", "providerAliases"],
  game: [
    "schemaVersion", "id", "sportId", "leagueId", "seasonId", "seasonPhase", "startUtc", "officialDate",
    "homeTeamId", "awayTeamId", "competitors", "card", "neutralSite", "venue", "statusClass", "providerAliases",
  ],
  teamGameStat: ["schemaVersion", "family", "sportId", "gameId", "teamId", "opponentTeamId", "homeAway", "isFinal", "stats", "src"],
  playerGameStat: ["schemaVersion", "family", "sportId", "gameId", "playerId", "teamId", "opponentTeamId", "opponentPlayerId", "stats", "src"],
};
export const RECORD_KEYS = Object.freeze(KEYS);

/**
 * Validate one record's SHAPE (no cross-record checks — those live in validate.mjs).
 * @param {keyof typeof KEYS} kind
 * @param {any} r
 * @returns {string[]} errors; empty means valid
 */
export function validateRecord(kind, r) {
  const errs = [];
  if (!isObj(r)) return [`${kind} record is not an object`];
  if (r.schemaVersion !== PLATFORM_SCHEMA_VERSION) {
    return [`${kind} record schemaVersion ${JSON.stringify(r.schemaVersion)} is not supported by this v${PLATFORM_SCHEMA_VERSION} reader`];
  }
  const expected = KEYS[kind];
  if (!expected) return [`unknown record kind ${kind}`];
  const keys = Object.keys(r);
  const missing = expected.filter((k) => !Object.hasOwn(r, k));
  const extra = keys.filter((k) => !expected.includes(k));
  if (missing.length) errs.push(`${kind} missing keys: ${missing.join(",")}`);
  const forbidden = extra.filter((k) => FORBIDDEN_OWNER_FIELDS.includes(k));
  if (forbidden.length) errs.push(`${kind} carries fields owned by another owner: ${forbidden.join(",")}`);
  const unknown = extra.filter((k) => !FORBIDDEN_OWNER_FIELDS.includes(k));
  if (unknown.length) errs.push(`${kind} has unexpected keys: ${unknown.join(",")}`);
  if (missing.length) return errs;

  const sportOk = (v) => SPORT_IDS.includes(v);
  switch (kind) {
    case "sport":
      if (!sportOk(r.id)) errs.push(`sport id ${JSON.stringify(r.id)} is not a product sport code`);
      if (!nonEmpty(r.name)) errs.push("sport name required");
      break;
    case "league":
      if (!nonEmpty(r.id)) errs.push("league id required");
      if (!sportOk(r.sportId)) errs.push("league sportId invalid");
      if (!nonEmpty(r.name)) errs.push("league name required");
      aliasList(r.providerAliases, "league", errs);
      break;
    case "season":
      if (!nonEmpty(r.id)) errs.push("season id required");
      if (!sportOk(r.sportId)) errs.push("season sportId invalid");
      if (!nonEmpty(r.leagueId)) errs.push("season leagueId required");
      if (!nonEmpty(r.label)) errs.push("season label required");
      if (!nonEmpty(r.semantics)) errs.push("season semantics required");
      if (r.startDate !== null && !isDate(r.startDate)) errs.push("season startDate must be null or YYYY-MM-DD");
      if (r.endDate !== null && !isDate(r.endDate)) errs.push("season endDate must be null or YYYY-MM-DD");
      aliasList(r.providerAliases, "season", errs);
      break;
    case "team":
      if (!nonEmpty(r.id)) errs.push("team id required");
      if (!sportOk(r.sportId)) errs.push("team sportId invalid");
      if (!nonEmpty(r.leagueId)) errs.push("team leagueId required");
      if (!nonEmpty(r.name)) errs.push("team name required");
      if (!nullableString(r.shortName)) errs.push("team shortName must be null or a string");
      if (!nullableString(r.abbreviation)) errs.push("team abbreviation must be null or a string");
      aliasList(r.providerAliases, "team", errs);
      if (Array.isArray(r.providerAliases) && r.providerAliases.length === 0) errs.push(`team ${r.id} has no provider alias — identity must trace to a provider id`);
      break;
    case "player":
      if (!nonEmpty(r.id)) errs.push("player id required");
      if (!sportOk(r.sportId)) errs.push("player sportId invalid");
      if (!nonEmpty(r.name)) errs.push("player name required");
      if (!nullableString(r.currentTeamId)) errs.push("player currentTeamId must be null or a string");
      aliasList(r.providerAliases, "player", errs);
      if (Array.isArray(r.providerAliases) && r.providerAliases.length === 0) errs.push(`player ${r.id} has no provider alias — identity must trace to a provider id`);
      break;
    case "game": {
      if (!nonEmpty(r.id)) errs.push("game id required");
      if (!sportOk(r.sportId)) errs.push("game sportId invalid");
      if (!nonEmpty(r.leagueId)) errs.push("game leagueId required");
      if (!nonEmpty(r.seasonId)) errs.push("game seasonId required");
      if (r.seasonPhase !== null && !SEASON_PHASES.includes(r.seasonPhase)) errs.push(`game seasonPhase ${JSON.stringify(r.seasonPhase)} invalid`);
      if (r.startUtc !== null && !isIsoUtc(r.startUtc)) errs.push(`game startUtc ${JSON.stringify(r.startUtc)} is not a UTC instant`);
      if (r.officialDate !== null && !isDate(r.officialDate)) errs.push(`game officialDate ${JSON.stringify(r.officialDate)} invalid`);
      if (r.startUtc === null && r.officialDate === null) errs.push(`game ${r.id} has neither startUtc nor officialDate`);
      if (!nullableString(r.homeTeamId)) errs.push("game homeTeamId must be null or a string");
      if (!nullableString(r.awayTeamId)) errs.push("game awayTeamId must be null or a string");
      if (r.competitors !== null) {
        if (!Array.isArray(r.competitors)) errs.push("game competitors must be null or an array");
        else for (const c of r.competitors) {
          if (!isObj(c) || !nonEmpty(c.playerId) || !UFC_CORNERS.includes(c.corner) || Object.keys(c).length !== 2) errs.push(`game competitor malformed: ${JSON.stringify(c)}`);
        }
      }
      if (r.card !== null && (!isObj(r.card) || !nonEmpty(r.card.id) || !nullableString(r.card.name))) errs.push("game card must be null or {id,name}");
      if (r.neutralSite !== null && typeof r.neutralSite !== "boolean") errs.push("game neutralSite must be null or boolean");
      if (r.venue !== null && (!isObj(r.venue) || !nullableString(r.venue.providerId) || !nullableString(r.venue.name) || (r.venue.providerId === null && r.venue.name === null))) errs.push("game venue must be null or {providerId,name} with at least one value");
      if (!STATUS_CLASSES.includes(r.statusClass)) errs.push(`game statusClass ${JSON.stringify(r.statusClass)} invalid`);
      aliasList(r.providerAliases, "game", errs);
      if (Array.isArray(r.providerAliases) && r.providerAliases.length === 0) errs.push(`game ${r.id} has no provider alias`);
      break;
    }
    case "teamGameStat":
      if (!nonEmpty(r.family)) errs.push("teamGameStat family required");
      if (!sportOk(r.sportId)) errs.push("teamGameStat sportId invalid");
      if (!nonEmpty(r.gameId) || !nonEmpty(r.teamId)) errs.push("teamGameStat gameId/teamId required");
      if (!nullableString(r.opponentTeamId)) errs.push("teamGameStat opponentTeamId must be null or string");
      if (r.homeAway !== null && !HOME_AWAY.includes(r.homeAway)) errs.push("teamGameStat homeAway invalid");
      if (typeof r.isFinal !== "boolean") errs.push("teamGameStat isFinal must be boolean");
      if (!isObj(r.stats)) errs.push("teamGameStat stats must be an object");
      if (!nonEmpty(r.src)) errs.push("teamGameStat src (provenance key) required");
      break;
    case "playerGameStat":
      if (!nonEmpty(r.family)) errs.push("playerGameStat family required");
      if (!sportOk(r.sportId)) errs.push("playerGameStat sportId invalid");
      if (!nonEmpty(r.gameId) || !nonEmpty(r.playerId)) errs.push("playerGameStat gameId/playerId required");
      if (!nullableString(r.teamId)) errs.push("playerGameStat teamId must be null or string");
      if (!nullableString(r.opponentTeamId)) errs.push("playerGameStat opponentTeamId must be null or string");
      if (!nullableString(r.opponentPlayerId)) errs.push("playerGameStat opponentPlayerId must be null or string");
      if (!isObj(r.stats)) errs.push("playerGameStat stats must be an object");
      if (!nonEmpty(r.src)) errs.push("playerGameStat src (provenance key) required");
      break;
  }
  return errs;
}

/** Cross-sport reference key — the same `SPORT:type:id` shape Follow and Observation already use. */
export function refKey(sportId, entityType, id) {
  return `${sportId}:${entityType}:${id}`;
}
