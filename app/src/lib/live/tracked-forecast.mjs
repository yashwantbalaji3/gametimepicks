/**
 * LiveTrackedForecast — one frozen forecast beside one live fact (v1.8 · L1, INTERNAL).
 *
 * L0 (#641) found that the hard parts already exist: `contract.mjs` owns live state, `forecast-join.mjs`
 * joins the NFL player board to the box score on `nfl-athlete-<espnId>`, and `lifecycle.mjs` already knows
 * that a provider FINAL is not a settlement. What did not exist is a NAMED ROW that carries both sides
 * plus the reason there is no value — so Bank Builder, Moonshot, `/my` and a notifier could read one shape
 * instead of each re-deriving it.
 *
 * THE GAP THIS CLOSES. `joinNflPlayerBoard` returns `value: null` for five different situations: the game
 * has not started · the game is live and the player has not recorded anything · the player is not in the
 * feed at all · the market is not trackable · the feed is stale. A reader cannot tell those apart, and the
 * difference between "has not recorded a reception" and "recorded 0" is exactly the difference this
 * product exists to respect. Each now has its own state.
 *
 * TWO LAYERS, DELIBERATELY NOT MERGED.
 *   gameState      — per EVENT, from `derivePresentationState` (reused verbatim, never re-implemented).
 *   trackingState  — per (player, market), the reason THIS row does or does not carry a value.
 * A game can be LIVE while a row is NO_STAT_YET; collapsing them would lose that.
 *
 * WHAT THIS MODULE MAY NOT DO, enforced by having no such export:
 *   · it never writes — Rule A is kept by absence, as in `forecast-join.mjs`;
 *   · it never settles — provider FINAL yields FINAL_PENDING_SETTLEMENT, never SETTLED;
 *   · it never estimates — no probability, no pace, no "on track", no remaining-production figure. The
 *     only derived quantity is `position` (BELOW | INSIDE | ABOVE), which is arithmetic over two numbers
 *     that are already public.
 *
 * FROZEN LINES ARE ABSENT ON PURPOSE. GameTime buys no NFL player-prop lines (props are out of the NFL
 * odds receipt's scope), so `frozenLine` stays null and the comparison is against the model's own p10–p90
 * band. A "68 / 72 needed" display would need a real purchased line and is not expressible here.
 *
 * INTERNAL ONLY. Nothing in this file is reachable from a public surface, and NFL live remains gated off
 * (`publicSports()` excludes it until `LIVE_PUBLIC_SPORTS` says otherwise — a founder decision).
 */
import { derivePresentationState } from "./lifecycle.mjs";
import { freshnessOf } from "./freshness.mjs";
import { COMPARABLE_NFL_MARKETS, COMPARABLE_STATES } from "./forecast-join.mjs";

export const TRACKED_SCHEMA_VERSION = 1;

/**
 * Why a row does or does not carry a live value. Closed, and every member is a DIFFERENT fact —
 * merging any two of them back together is the defect this vocabulary exists to prevent.
 */
export const TRACKING_STATES = Object.freeze({
  TRACKING: "TRACKING",                     // the feed states a value for this player and market
  AWAITING_KICKOFF: "AWAITING_KICKOFF",     // the event has not started; absence is expected
  NO_STAT_YET: "NO_STAT_YET",               // event in play/final, feed carries no row — NOT zero
  IDENTITY_UNRESOLVED: "IDENTITY_UNRESOLVED", // the forecast has no canonical player id to join on
  STAT_UNSUPPORTED: "STAT_UNSUPPORTED",     // the market is not trackable; no row is emitted at all
  SOURCE_STALE: "SOURCE_STALE",             // in-play but the envelope is older than the live window
  GAME_NOT_TRACKABLE: "GAME_NOT_TRACKABLE", // postponed / cancelled — nothing will arrive
});

/** States in which a value, if present, may be shown as a current fact. */
const VALUE_BEARING = new Set([TRACKING_STATES.TRACKING, TRACKING_STATES.SOURCE_STALE]);

/** A market is trackable only if it is mapped AND the board published it in a comparable state. */
export function marketIsTrackable(board, market) {
  if (!COMPARABLE_NFL_MARKETS.includes(market)) return false;
  const family = board?.families?.[market];
  return Boolean(family && COMPARABLE_STATES.includes(family.state));
}

/**
 * Build the tracked rows for one NFL event.
 *
 * @param {object} q
 * @param {object} q.board      the frozen player board for this event (`<espnEventId>.json`)
 * @param {object|null} q.envelope  the live envelope, or null when nothing has been fetched
 * @param {object[]} q.joined   rows from `joinNflPlayerBoard` (forecast side, value may be null)
 * @param {object|null} q.settlement  canonical settlement, when it exists
 * @param {number} q.nowMs
 * @returns {{ rows: object[], gameState: string, counts: Record<string, number> }}
 */
export function buildLiveTrackedForecasts({ board, envelope = null, joined = [], settlement = null, nowMs }) {
  const presentation = derivePresentationState({ envelope, settlement });
  const gameState = presentation.state;
  const fresh = envelope ? freshnessOf(envelope, nowMs) : { level: "NOT_APPLICABLE", ageMs: null };

  const rows = [];
  for (const j of joined) {
    /* A market that is not trackable emits NO ROW. Emitting one with a null value would put an
       ESTIMATE or HOLDING market on screen beside a live number, which reads as the market returning. */
    if (!marketIsTrackable(board, j.market)) continue;

    const state = trackingStateFor({ row: j, gameState, freshLevel: fresh.level });
    const value = VALUE_BEARING.has(state) ? j.value : null;
    rows.push({
      schemaVersion: TRACKED_SCHEMA_VERSION,
      forecastId: `${board?.providerEventId ?? "unknown"}:${j.playerId ?? "unresolved"}:${j.market}`,
      sport: "nfl",
      gameId: board?.providerEventId ?? null,
      entityId: j.playerId ?? null,
      entityType: "PLAYER",
      market: j.market,
      label: j.label ?? j.market,
      /* The frozen side. `frozenLine` is null by design — GameTime buys no NFL prop lines. */
      frozenProjection: numberOrNull(j.median),
      frozenRange: { low: numberOrNull(j.rangeLow), high: numberOrNull(j.rangeHigh) },
      frozenLine: null,
      modelState: j.modelState ?? null,
      publishedAt: board?.generatedAt ?? null,
      participation: j.participation ?? null,
      /* The live side. Null means "not stated", never zero. */
      currentValue: value,
      position: value === null ? null : j.position,
      period: envelope?.period ?? null,
      clock: envelope?.situation?.displayClock ?? null,
      gameState,
      trackingState: state,
      freshness: fresh.level,
      source: envelope?.provider ?? null,
      sourceEventId: envelope?.providerEventId ?? null,
      updatedAt: envelope?.fetchedAt ?? null,
      /* Settlement owns these. This module never fills them. */
      finalValue: null,
      settlementStatus: null,
    });
  }

  const counts = {};
  for (const r of rows) counts[r.trackingState] = (counts[r.trackingState] ?? 0) + 1;
  return { rows, gameState, counts };
}

/** The per-row reason, decided in fail-closed order. */
function trackingStateFor({ row, gameState, freshLevel }) {
  const S = TRACKING_STATES;
  /* Identity first: without a canonical id there is nothing to join, whatever the game is doing. A
     forecast we cannot identify must never borrow another player's number. */
  if (!row.playerId) return S.IDENTITY_UNRESOLVED;
  if (gameState === "POSTPONED" || gameState === "CANCELLED") return S.GAME_NOT_TRACKABLE;
  if (gameState === "PRE" || gameState === "UNKNOWN") return S.AWAITING_KICKOFF;
  if (row.value === null || row.value === undefined) return S.NO_STAT_YET;
  if (freshLevel === "STALE") return S.SOURCE_STALE;
  return S.TRACKING;
}

const numberOrNull = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
