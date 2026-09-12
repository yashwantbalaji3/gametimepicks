/**
 * UFC FIGHT-DAY WATCH (P265) — is today's card priced, with hours still to fix it?
 *
 * On 2026-09-12 the Saturday capture slot (11:00 UTC) had not fired by 13:12 UTC, the card was at
 * 18:00 UTC, and `odds-latest.json` still described the PREVIOUS event. Nothing noticed: the
 * cron-slot check only asks whether a run exists, the failure alerts only fire on a failed run, and
 * the EPL matchday watch — the one thing shaped like this — covers only football.
 *
 * The question it asks is about the ARTIFACT, not the schedule: does the published odds file describe
 * the card that fights today? A run that happened and produced last week's prices is not coverage.
 *
 * NEVER AFTER THE FIRST BOUT. The odds feed serves live, in-play prices once a card is under way, and
 * capturing those would publish in-play numbers as though they were the pre-fight market. Past the
 * first bout this reports the gap and refuses to dispatch — the honest answer is that the day was
 * missed, not that it can still be repaired.
 */

export const UFC_WATCH_VERSION = 1;
/** Inside this many hours of the first bout, an unpriced card is actionable rather than merely early. */
export const DEFAULT_LEAD_HOURS = 8;

const hoursBetween = (fromIso, toIso) => (Date.parse(toIso) - Date.parse(fromIso)) / 3_600_000;

/**
 * @param {{
 *   card: { event?: { providerEventId?: string, startUtc?: string, name?: string, boutCount?: number } } | null,
 *   oddsEventId: string | null,
 *   nowIso: string,
 *   ranToday: boolean,
 *   leadHours?: number,
 * }} input
 * @returns {{ state: string, reason: string, shouldDispatch: boolean, hoursToFirstBout: number|null }}
 */
export function ufcFightdayWatch({ card, oddsEventId, nowIso, ranToday, leadHours = DEFAULT_LEAD_HOURS }) {
  const event = card?.event ?? null;
  const start = event?.startUtc ?? null;
  if (!event?.providerEventId || !start || !Number.isFinite(Date.parse(start))) {
    return { state: "NO_CARD", reason: "no scheduled card with a start time", shouldDispatch: false, hoursToFirstBout: null };
  }

  const hours = hoursBetween(nowIso, start);
  if (hours < 0) {
    const priced = oddsEventId === event.providerEventId;
    return {
      state: priced ? "DONE" : "TOO_LATE",
      reason: priced
        ? `${event.name ?? "the card"} is under way and was priced before it started`
        : `${event.name ?? "the card"} started ${Math.abs(hours).toFixed(1)}h ago unpriced — the feed serves in-play prices now, so this is a missed day, not a repairable one`,
      shouldDispatch: false,
      hoursToFirstBout: hours,
    };
  }

  if (hours > leadHours) {
    return {
      state: "TOO_EARLY",
      reason: `first bout is ${hours.toFixed(1)}h away; prices are not due until it is within ${leadHours}h`,
      shouldDispatch: false,
      hoursToFirstBout: hours,
    };
  }

  // The artifact is the evidence: a capture that ran and published another event's prices is not coverage.
  if (oddsEventId !== event.providerEventId) {
    return {
      state: "UNPRICED",
      reason: ranToday
        ? `first bout is ${hours.toFixed(1)}h away and the capture ran today, but the published odds still describe event ${oddsEventId ?? "none"} rather than ${event.providerEventId}`
        : `first bout is ${hours.toFixed(1)}h away and the capture has not run today — the published odds describe ${oddsEventId ?? "no event"}`,
      shouldDispatch: true,
      hoursToFirstBout: hours,
    };
  }

  return {
    state: "PRICED",
    reason: `first bout in ${hours.toFixed(1)}h and the published odds describe this card`,
    shouldDispatch: false,
    hoursToFirstBout: hours,
  };
}
