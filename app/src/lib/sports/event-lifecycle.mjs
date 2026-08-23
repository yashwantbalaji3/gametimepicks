/**
 * WHERE A PUBLISHED EVENT SITS IN ITS OWN LIFECYCLE.
 *
 * Every sport hub answers the same two questions — what is next, and how did the last one go — and
 * each answered them differently, which is how /ufc came to present a card fought the previous
 * night under the heading "Next card", with a live paper ladder beneath it. Nothing was stale in the
 * sense of a broken pipeline: the artifact was exactly what the last run produced. What was missing
 * is that no surface compared the event's own start time to the clock before calling it "next".
 *
 * The states are deliberately coarse, because the useful distinctions for a reader are coarse:
 *
 *   UPCOMING          it has not started. Model picks are a forecast, prices are live, a paper card
 *                     may be published.
 *   IN_PROGRESS       it has started and is not old enough to be finished. Nothing new may be
 *                     published against it — a price on an event in progress is not a pregame price.
 *   COMPLETE          it is over. Picks become a record to be graded, not a forecast to be offered.
 *   UNKNOWN           the event carries no readable start time. Treated as UNKNOWN rather than
 *                     guessed in either direction, because both guesses are harmful: "upcoming"
 *                     publishes a card for a fight already fought, and "complete" hides a real one.
 *
 * A REFRESH CADENCE IS NOT A LIFECYCLE. The UFC card artifact is rebuilt Tuesday, Thursday and
 * Saturday, so between a Saturday card and the following Tuesday the newest artifact legitimately
 * describes a finished event. Making the page fail closed is the fix; refreshing more often is a
 * separate improvement and does not remove the need for this, because any cadence has a gap.
 */

export const EVENT_STATE = Object.freeze({
  UPCOMING: "UPCOMING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETE: "COMPLETE",
  UNKNOWN: "UNKNOWN",
});

/**
 * How long after its start an event is assumed to still be running. A UFC card runs about six
 * hours from first prelim; a football match under three; a baseball game about four. The default is
 * generous on purpose: calling something COMPLETE while it is still happening is the worse error,
 * because that is the one that starts grading picks against outcomes that are not final.
 */
export const DEFAULT_DURATION_HOURS = 6;

/**
 * @param {object} o
 * @param {string|null} o.startUtc  the event's own start time
 * @param {string} o.nowIso
 * @param {number} [o.durationHours]
 */
export function eventState({ startUtc, nowIso, durationHours = DEFAULT_DURATION_HOURS }) {
  const start = Date.parse(String(startUtc ?? ""));
  const now = Date.parse(String(nowIso ?? ""));
  if (!Number.isFinite(start) || !Number.isFinite(now)) return EVENT_STATE.UNKNOWN;
  if (now < start) return EVENT_STATE.UPCOMING;
  if (now < start + durationHours * 3_600_000) return EVENT_STATE.IN_PROGRESS;
  return EVENT_STATE.COMPLETE;
}

/** True only when an event may be presented as the NEXT one. Everything else is not "next". */
export function isUpcoming(args) {
  return eventState(args) === EVENT_STATE.UPCOMING;
}

/**
 * The heading an event should carry, derived rather than hardcoded.
 *
 * "Next card" was a literal string, true whenever the artifact happened to be fresh and false for
 * three days a week. A heading that states the event's actual state cannot drift out of agreement
 * with the thing beneath it.
 */
export function eventHeading(state, noun = "card") {
  switch (state) {
    case EVENT_STATE.UPCOMING: return `Next ${noun}`;
    case EVENT_STATE.IN_PROGRESS: return `${noun[0].toUpperCase()}${noun.slice(1)} in progress`;
    case EVENT_STATE.COMPLETE: return `Last ${noun}`;
    default: return `Published ${noun}`;
  }
}
