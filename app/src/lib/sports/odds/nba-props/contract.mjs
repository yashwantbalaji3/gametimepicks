/**
 * NBA PLAYER-PROP PRICES · THE CONTRACT (provider: The Odds API v4, sport key `basketball_nba`). Pure constants.
 *
 * STATUS: ADAPTER + CONTRACT TESTS ONLY. No NBA prop price has been bought for this lane. The founder has NOT
 * approved paid Odds API credits for NBA props (the proposed 800-credit token is not approved), so everything here
 * runs on TEST FIXTURES built from the provider's documented response shape. The capture script
 * (scripts/nba/capture-nba-props-odds.mjs) is a dry-run planner that refuses to make a network call.
 *
 * ORDER OF WORK (founder): player POINTS first, then rebounds / assists / threes / combos. `NBA_PROP_FAMILIES` is that
 * order; a capture plan takes a prefix of it, never a reordering.
 *
 * WHAT A PRICE RECORD IS (`gtp.nba.prop-price@1`) — one bookmaker's two-way main line for one player, one stat:
 *   { schema, recordId, provider, eventId, providerEventId, providerAthleteId, playerName, family, providerMarketKey,
 *     line, book, bookTitle, overAmerican, underAmerican, capturedAt, fetchedAt, raw }
 *   eventId            ESPN providerEventId (the canonical NBA event id), joined by BOTH teams + start time.
 *   providerAthleteId  ESPN athlete id, resolved from the provider's name string through the event's two rosters
 *                      and the reviewed alias table. Any ambiguity refuses; a name is never the identity.
 *   family             the official snapshot's family key (pts / reb / ast / threePm / pra …), so a record can be handed
 *                      to the shared evaluator (consistency/market-evaluator.mjs) without translation at the call site.
 *   capturedAt         the PROVIDER's last_update for that market (the market's own, else the bookmaker's) — the
 *                      instant the price was true, not the instant we fetched it (`fetchedAt`).
 *   raw                provider ids kept verbatim (odds event id, bookmaker key, market key, outcome description).
 */

export const NBA_PROPS_CONTRACT_VERSION = "nba-player-props-adapter@1";
export const PRICE_RECORD_SCHEMA = "gtp.nba.prop-price@1";
export const PROVIDER = "the-odds-api";
export const PROVIDER_SPORT_KEY = "basketball_nba";

/** Documentation the adapter is written against (fetched 2026-10-21; see docs/nba/SPORTSBOOK_HANDOFF_CAPABILITY_MATRIX_2026-10-21.md). */
export const PROVIDER_DOCS = Object.freeze({
  eventOdds: "https://the-odds-api.com/liveapi/guides/v4/#get-event-odds",
  marketKeys: "https://the-odds-api.com/sports-odds-data/betting-markets.html",
  usageQuota: "https://the-odds-api.com/liveapi/guides/v4/#usage-quota-costs",
});

/**
 * Provider market key → official-snapshot family, in the founder's order (points first). `modelled: false` rows are
 * mapped so coverage can COUNT them, but a record is never produced for a family no official model covers
 * (official-snapshot.mjs NBA_NOT_MODELLED: rebAst, stl, blk, tov).
 */
export const NBA_PROP_FAMILIES = Object.freeze([
  Object.freeze({ marketKey: "player_points", family: "pts", label: "Points", modelled: true }),
  Object.freeze({ marketKey: "player_rebounds", family: "reb", label: "Rebounds", modelled: true }),
  Object.freeze({ marketKey: "player_assists", family: "ast", label: "Assists", modelled: true }),
  Object.freeze({ marketKey: "player_threes", family: "threePm", label: "Threes made", modelled: true }),
  Object.freeze({ marketKey: "player_points_rebounds_assists", family: "pra", label: "Points + rebounds + assists", modelled: true }),
  Object.freeze({ marketKey: "player_points_rebounds", family: "ptsReb", label: "Points + rebounds", modelled: true }),
  Object.freeze({ marketKey: "player_points_assists", family: "ptsAst", label: "Points + assists", modelled: true }),
  Object.freeze({ marketKey: "player_rebounds_assists", family: "rebAst", label: "Rebounds + assists", modelled: false }),
]);
export const FAMILY_BY_MARKET_KEY = Object.freeze(Object.fromEntries(NBA_PROP_FAMILIES.map((f) => [f.marketKey, f])));
export const FAMILY_BY_KEY = Object.freeze(Object.fromEntries(NBA_PROP_FAMILIES.map((f) => [f.family, f])));
/** Points first: the default scope of a capture plan. */
export const POINTS_FIRST_SCOPE = Object.freeze(["player_points"]);

/** Every refusal the adapter can make. A refusal is recorded with its reason; nothing is dropped silently. */
export const REFUSAL = Object.freeze({
  PROVIDER_FAILURE: "PROVIDER_FAILURE",
  RESPONSE_SHAPE_INVALID: "RESPONSE_SHAPE_INVALID",
  WRONG_SPORT: "WRONG_SPORT",
  EVENT_UNMATCHED: "EVENT_UNMATCHED",
  EVENT_AMBIGUOUS: "EVENT_AMBIGUOUS",
  EVENT_ORIENTATION_SWAPPED: "EVENT_ORIENTATION_SWAPPED",
  EVENT_LINEAGE_VIOLATION: "EVENT_LINEAGE_VIOLATION",
  BOOK_NOT_ELIGIBLE: "BOOK_NOT_ELIGIBLE",
  MARKET_NOT_IN_SCOPE: "MARKET_NOT_IN_SCOPE",
  FAMILY_NOT_MODELLED: "FAMILY_NOT_MODELLED",
  PLAYER_UNRESOLVED: "PLAYER_UNRESOLVED",
  PLAYER_AMBIGUOUS: "PLAYER_AMBIGUOUS",
  ONE_SIDED: "ONE_SIDED",
  NOT_TWO_WAY: "NOT_TWO_WAY",
  MULTIPLE_MAIN_LINES: "MULTIPLE_MAIN_LINES",
  NO_LINE: "NO_LINE",
  PRICE_FORMAT: "PRICE_FORMAT",
  PRICE_IMPLAUSIBLE: "PRICE_IMPLAUSIBLE",
  NO_PROVIDER_TIMESTAMP: "NO_PROVIDER_TIMESTAMP",
  PRICE_STALE: "PRICE_STALE",
  PRICE_FROM_FUTURE: "PRICE_FROM_FUTURE",
  PRICE_AFTER_START: "PRICE_AFTER_START",
  DUPLICATE_CONFLICT: "DUPLICATE_CONFLICT",
});

/** A duplicate that agrees with the record already held is not a refusal — it is counted and folded. */
export const DUPLICATE_IDENTICAL = "DUPLICATE_IDENTICAL";

/** Freshness bound at ingestion: the product contract's own 12 h (products/eligible-leg LEG_BOUNDS.maxPriceAgeMs). */
export const MAX_PRICE_AGE_MS = 12 * 60 * 60 * 1000;
/** Clock skew tolerated before a provider timestamp counts as "from the future". */
export const FUTURE_SKEW_MS = 60 * 1000;

/** Coverage states a consumer must distinguish (founder: provider-failure and insufficient-coverage are states). */
export const COVERAGE_STATE = Object.freeze({
  OK: "OK",
  INSUFFICIENT_COVERAGE: "INSUFFICIENT_COVERAGE",
  PROVIDER_FAILURE: "PROVIDER_FAILURE",
  NO_RESPONSES: "NO_RESPONSES",
});
/** Minimum distinct eligible books with at least one record before a slate's coverage is OK (a comparison needs two). */
export const MIN_BOOKS_FOR_COVERAGE = 2;
