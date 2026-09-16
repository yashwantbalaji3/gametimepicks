/**
 * THE GAMETIME LIVE CONTRACT (v1.1 · L105) — the only live shape anything outside an adapter may read.
 *
 * WHY THIS MODULE EXISTS. Live state has three owners and collapsing them is the defect class Phase 6
 * caught in production (a static artifact's eligibility claim aged into a lie). The three owners are
 * kept apart here, by construction, and every consumer is handed the distinction:
 *
 *   PRE-GAME FORECAST   immutable   model-owned      forecastGeneratedAt   never overwritten
 *   LIVE EVENT STATE    ephemeral   provider-owned   sourceUpdatedAt       refreshed / cached
 *   FINAL RESULT        canonical   settlement-owned settledAt             never "live" again
 *
 * A LiveEventEnvelope therefore describes ONLY the middle row. It carries no probability, no
 * projection and no model output — a live envelope can never become a forecast, and merging one into
 * a forecast artifact is not expressible in this contract.
 *
 * NO NODE IMPORTS. The serverless gateway (api/live.mjs) and the browser both load this module, so it
 * must run in either runtime. The same rule that `explorer-legs.ts` records: a contract two runtimes
 * share cannot live in a module only one of them can load.
 *
 * NEVER FABRICATE. Absent is `null`, not `0`. `sourceUpdatedAt` is null for both v1.1 providers
 * because neither MLB StatsAPI's schedule payload nor ESPN's scoreboard publishes one (verified
 * 2026-09-15) — freshness is therefore stated from `fetchedAt`, which is a claim we can actually make.
 */

export const LIVE_SCHEMA_VERSION = 1;

/** Every state a live event may be in. UNKNOWN is a real answer, never a guess at one of the others. */
export const LIVE_STATES = Object.freeze([
  "PRE",
  "LIVE",
  "FINAL",
  "POSTPONED",
  "CANCELLED",
  "DELAYED",
  "UNKNOWN",
]);

/** States in which no further upstream call may be made for this event. */
const TERMINAL_STATES = new Set(["FINAL", "CANCELLED", "POSTPONED"]);

/** Has this event reached a state from which it cannot return to LIVE? Polling must stop. */
export function isTerminal(state) {
  return TERMINAL_STATES.has(state);
}

/** Only LIVE and DELAYED events have a "now" worth refreshing quickly. */
export function isInPlay(state) {
  return state === "LIVE" || state === "DELAYED";
}

/**
 * Build an envelope with every field explicitly present.
 *
 * Callers pass what the provider actually gave; everything unstated becomes null — so a field a
 * provider omits is indistinguishable, downstream, from a field we chose not to read, and NEITHER
 * can read as zero. `state` outside LIVE_STATES degrades to UNKNOWN rather than travelling on.
 */
export function makeEnvelope(input) {
  const state = LIVE_STATES.includes(input.state) ? input.state : "UNKNOWN";
  return {
    schemaVersion: LIVE_SCHEMA_VERSION,
    eventId: input.eventId,
    sport: input.sport,
    provider: input.provider,
    providerEventId: input.providerEventId,

    startTime: input.startTime ?? null,
    state,
    /** The provider's own words for the state, shown verbatim so we never paraphrase a feed. */
    stateDetail: input.stateDetail ?? null,

    sourceUpdatedAt: input.sourceUpdatedAt ?? null,
    fetchedAt: input.fetchedAt,

    period: input.period ?? null,
    competitors: input.competitors,
    situation: input.situation ?? null,
    playerStats: input.playerStats ?? null,
  };
}

/** One side of the event. `score` is null until the provider states one — never 0 by default. */
export function makeCompetitor(input) {
  return {
    teamId: input.teamId ?? null,
    abbr: input.abbr ?? null,
    name: input.name ?? null,
    score: typeof input.score === "number" && Number.isFinite(input.score) ? input.score : null,
  };
}

/**
 * A factual cumulative player stat. `value` is what the box score SAYS, nothing derived.
 *
 * `playerId` is the canonical GameTime id (`nfl-athlete-<espnId>`, `mlb-person-<personId>`), so a
 * consumer joins to a frozen forecast by identity. An unmapped player keeps a null playerId and is
 * still shown as live fact — it simply cannot be joined, which is the honest outcome.
 */
export function makePlayerStat(input) {
  return {
    playerId: input.playerId ?? null,
    providerPlayerId: input.providerPlayerId ?? null,
    name: input.name ?? null,
    teamAbbr: input.teamAbbr ?? null,
    /** A GameTime market key (e.g. "player_reception_yds") so the forecast join needs no name table. */
    market: input.market,
    value: typeof input.value === "number" && Number.isFinite(input.value) ? input.value : null,
  };
}

/** A refusal is a first-class envelope-shaped answer, so no caller has to model "sometimes null". */
export function makeUnavailable(input) {
  return {
    schemaVersion: LIVE_SCHEMA_VERSION,
    unavailable: true,
    /** Machine reason. Rendered copy is chosen by the UI, never taken from a provider string. */
    reason: input.reason,
    eventId: input.eventId ?? null,
    sport: input.sport ?? null,
    fetchedAt: input.fetchedAt,
  };
}

/** Every refusal reason the gateway and the UI both understand. */
export const UNAVAILABLE_REASONS = Object.freeze([
  "PROVIDER_ERROR",
  "PROVIDER_MALFORMED",
  "EVENT_NOT_FOUND",
  "AMBIGUOUS_EVENT_MAPPING",
  "UNSUPPORTED_SPORT",
  "FEATURE_DISABLED",
]);

/** True for anything the UI must render as a refusal card rather than as an event. */
export function isUnavailable(x) {
  return Boolean(x && x.unavailable === true);
}
