/**
 * A STAMPED LIFECYCLE MUST NOT OUTLIVE THE KICKOFF (P252).
 *
 * `lifecycle` on an NFL index event is written when the artifact is generated and then trusted by
 * every consumer. The event window runs at 14:30Z, 15:00Z and 21:00Z, so a Wednesday-night game
 * kicking off at 00:20Z carries a stamp made two hours BEFORE it started, and nothing re-examines
 * it until the next morning's run.
 *
 * Measured on 2026-09-10 at 03:29Z, three hours after NE @ SEA had kicked off:
 *   · /nfl listed it as "scheduled"
 *   · /simulate offered it under today's events with no started marker
 *   · the HOMEPAGE ranked "Seattle Seahawks to beat New England Patriots" inside "The model's
 *     strongest reads today" — a completed game presented as a live read
 * and it would have carried that for another eleven hours.
 *
 * This is the defect `lib/sports/event-lifecycle.mjs` was written for on /ufc, in its own words:
 * "no surface compared the event's own start time to the clock before calling it next". NFL never
 * adopted it. This is that adoption, plus the one rule that makes combining a stamp and a clock
 * safe:
 *
 *   THE CLOCK MAY ONLY ADVANCE THE STAMP, NEVER REWIND IT.
 *
 * A stamp saying STARTED or SETTLED stands even if the kickoff time looks future — the producer
 * may know something the clock cannot, a postponement being the obvious case, and P215 recorded
 * exactly that failure for MLB. A stamp saying UPCOMING loses to a kickoff that has passed,
 * because there is no way for that combination to be true.
 */
import { eventState, EVENT_STATE } from "../event-lifecycle.mjs";

/** A football game is over well inside four hours of kickoff; the shared owner's default is six. */
export const NFL_DURATION_HOURS = 4;

/** The closed set an NFL index event may carry, in order of advancement. */
const RANK = { UPCOMING: 0, STARTED: 1, SETTLED: 2 };

/**
 * The lifecycle a reader should be shown, from the stamp and the clock together.
 *
 * @param {{ lifecycle?: string, kickoffUtc?: string|null, locked?: boolean }} event
 * @param {string} nowIso
 * @returns {"UPCOMING"|"STARTED"|"SETTLED"}
 */
export function effectiveLifecycle(event, nowIso) {
  const stamped = RANK[event?.lifecycle] != null ? event.lifecycle : "UPCOMING";
  if (RANK[stamped] > RANK.UPCOMING) return stamped;
  /* An unreadable kickoff is UNKNOWN, and UNKNOWN never advances a stamp — guessing "started"
     would hide a real upcoming game, which is the harm in the other direction. */
  const state = eventState({ startUtc: event?.kickoffUtc ?? null, nowIso, durationHours: NFL_DURATION_HOURS });
  if (state === EVENT_STATE.IN_PROGRESS || state === EVENT_STATE.COMPLETE) return "STARTED";
  return stamped;
}

/** True when the game has kicked off — the question nine call sites were asking of the stamp. */
export function hasStarted(event, nowIso) {
  return effectiveLifecycle(event, nowIso) !== "UPCOMING";
}
