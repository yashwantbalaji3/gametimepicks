/**
 * LIVE FRESHNESS + REFRESH POLICY (v1.1 · §12).
 *
 * Two questions, one owner, so the gateway's TTL and the badge the reader sees can never disagree:
 *
 *   1. how old is this envelope, and may we still call it live?   -> freshnessOf()
 *   2. how long until anyone should ask upstream again?           -> refreshPolicyFor()
 *
 * THE RULE THAT MATTERS. Age is measured against `fetchedAt` — the instant WE hold evidence for —
 * and re-evaluated on the READER's clock, never frozen into the payload. This is Phase 6's Rule B:
 * a static claim about the present ages into a lie, so the present is recomputed by whoever is
 * looking. A cached envelope served 90s later is 90s old to its reader and says so.
 *
 * Neither v1.1 provider publishes a source timestamp (verified 2026-09-15), so `sourceUpdatedAt` is
 * null and age is fetch age. That is a weaker claim than "the provider updated 12s ago" and it is
 * stated as the weaker claim rather than dressed up as the stronger one.
 */
import { isInPlay, isTerminal } from "./contract.mjs";

/** Under this age an in-play envelope is FRESH. */
export const FRESH_MAX_MS = 45_000;
/** Under this age it is DELAYED — shown, but labelled as the last confirmed state. */
export const DELAYED_MAX_MS = 120_000;

/**
 * FRESH | DELAYED | STALE | NOT_APPLICABLE.
 *
 * Only an in-play event can be stale: a scheduled or finished event is not claiming to track a
 * moving thing, so its age is not a defect and it is never badged as one.
 */
export function freshnessOf(envelope, nowMs) {
  if (!isInPlay(envelope.state)) return { level: "NOT_APPLICABLE", ageMs: null };
  const fetched = Date.parse(envelope.fetchedAt ?? "");
  // An unparseable fetch stamp is treated as the worst case, never as "just now".
  if (!Number.isFinite(fetched)) return { level: "STALE", ageMs: null, reason: "UNPARSEABLE_FETCHED_AT" };
  const ageMs = Math.max(0, nowMs - fetched);
  if (ageMs < FRESH_MAX_MS) return { level: "FRESH", ageMs };
  if (ageMs < DELAYED_MAX_MS) return { level: "DELAYED", ageMs };
  return { level: "STALE", ageMs, reason: "AGE_EXCEEDS_LIVE_WINDOW" };
}

/** Whole seconds, for "updated N sec ago". Null age yields null — never a confident "0". */
export function ageSeconds(ageMs) {
  return typeof ageMs === "number" && Number.isFinite(ageMs) ? Math.floor(ageMs / 1000) : null;
}

/** Seconds a response may be reused, by state. Terminal events are effectively permanent. */
export const TTL_SECONDS = Object.freeze({
  LIVE: 25,
  DELAYED: 25,
  /** A game about to start changes rarely but must flip to LIVE promptly. */
  PRE_IMMINENT: 60,
  /** More than two hours out, nothing about the event is moving. */
  PRE_DISTANT: 300,
  TERMINAL: 3600,
  UNKNOWN: 60,
});

/** Inside this window before start, a PRE event is refreshed at the imminent cadence. */
export const IMMINENT_WINDOW_MS = 120 * 60_000;

/**
 * How the gateway should cache an envelope and how often a client should re-ask.
 *
 * `clientIntervalMs` is null for a terminal event: the client must STOP, not slow down. A halted
 * poll is the only guarantee that a finished game costs nothing.
 */
export function refreshPolicyFor(envelope, nowMs) {
  if (isTerminal(envelope.state)) {
    return { ttlSeconds: TTL_SECONDS.TERMINAL, clientIntervalMs: null, reason: "TERMINAL" };
  }
  if (isInPlay(envelope.state)) {
    return { ttlSeconds: TTL_SECONDS.LIVE, clientIntervalMs: 30_000, reason: "IN_PLAY" };
  }
  if (envelope.state === "PRE") {
    const start = Date.parse(envelope.startTime ?? "");
    // An unknown start time is treated as imminent: fail toward noticing kickoff, never toward
    // sleeping through it. The cost of being early is one extra call a minute.
    const imminent = !Number.isFinite(start) || start - nowMs <= IMMINENT_WINDOW_MS;
    return imminent
      ? { ttlSeconds: TTL_SECONDS.PRE_IMMINENT, clientIntervalMs: 60_000, reason: "PRE_IMMINENT" }
      : { ttlSeconds: TTL_SECONDS.PRE_DISTANT, clientIntervalMs: 300_000, reason: "PRE_DISTANT" };
  }
  return { ttlSeconds: TTL_SECONDS.UNKNOWN, clientIntervalMs: 60_000, reason: "UNKNOWN_STATE" };
}

/** A hidden tab is not a reader. Backing off here is most of the client-side cost story. */
export const HIDDEN_TAB_MIN_INTERVAL_MS = 120_000;

/** The interval to actually use, given tab visibility. Terminal stays stopped either way. */
export function effectiveIntervalMs(policy, documentHidden) {
  if (policy.clientIntervalMs === null) return null;
  return documentHidden
    ? Math.max(policy.clientIntervalMs, HIDDEN_TAB_MIN_INTERVAL_MS)
    : policy.clientIntervalMs;
}
