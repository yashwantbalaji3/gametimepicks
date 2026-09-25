/**
 * KICKOFF-AWARE PREGAME REFRESH — a deadline a wall-clock cron cannot meet.
 *
 * ⚠ WHY THIS EXISTS, MEASURED (2026-09-25). The player-prop cadence carried a Sunday 12:30 ET slot
 * whose whole purpose was "the last look before the 1pm ET kickoffs" — a T-30m refresh. GitHub's
 * scheduled delivery in this repository, over 14 days and 40 observations, was:
 *
 *     min 1h40m   median 2h52m   max 4h55m late     — and NOT ONE RUN WAS PUNCTUAL
 *
 * A 16:30Z slot therefore lands at 18:10Z at the very best, seventy minutes AFTER a 17:00Z kickoff.
 * The capture's window is pre-start events only, so those games are simply gone from it. That slot
 * could never do its job, and shifting it earlier does not fix a delay that VARIES by three hours —
 * it just moves which games get missed.
 *
 * THE FIX IS TO STOP ASKING FOR AN INSTANT AND START ASKING A QUESTION OFTEN.
 *
 * A dense schedule still DELIVERS densely: publication-watchdog fires every 30 minutes and its runs
 * arrive with a median gap of 27 minutes and a worst in-window gap of 99 (the ~940-minute gaps in
 * its history are overnight, where it has no slots). Individual runs are hours late; the STREAM is
 * not. So a frequent checker asking "is a kickoff close and are our prices old?" will land inside a
 * two-hour eligibility window essentially always, where a single precisely-timed slot lands inside
 * a thirty-minute one essentially never.
 *
 * This module is that question, and nothing else. Pure and clock-injected so the tests do not depend
 * on when they run; the caller does the IO and the dispatch.
 */

/**
 * Minutes before kickoff during which a refresh is worth buying.
 *
 * Two hours, not thirty minutes: the point is no longer to hit an instant but to open a window the
 * delivered stream reliably lands inside (median inter-run gap 27 min, worst in-window gap 99).
 */
export const LEAD_MINUTES = 120;

/**
 * A capture younger than this is fresh enough. THIS IS THE BUDGET, not a nicety.
 *
 * An NFL Sunday has three kickoff bands (the 1pm ET block, the 4pm block, and the night game), so
 * without a floor between dispatches a dense checker would buy the week once per checker run. At
 * three hours each band can trigger at most once, and the capture's own pre-start window makes the
 * later ones cheap because the slate has already emptied:
 *
 *   Sun 13:00Z cron sweep        15 events   78 credits   (unchanged, all-day coverage)
 *   ~T-2h before the 1pm block   15 events   78           (replaces the 12:30 ET cron that could
 *                                                          never land before kickoff)
 *   ~T-2h before the 4pm block    4 events   25           (the 1pm games are gone from the window)
 *   ~T-2h before the night game   1 event     8
 *                                            ───
 *                                            189 for the Sunday
 *
 * The retired cadence budgeted 169 for the same day and spent one of its three sweeps after the
 * games had started. This buys one more sweep and every one of them lands pre-kickoff.
 */
export const FRESH_MINUTES = 180;

/**
 * Should we dispatch a pregame refresh right now?
 *
 * Returns one typed decision and the evidence behind it. Every non-DISPATCH state is a REASON NOT
 * TO SPEND, and they are kept apart on purpose: "no kickoff is near" and "we already have fresh
 * prices" are different facts about a run that did not happen, and collapsing them would hide a
 * cadence that has stopped working behind one that is merely quiet.
 *
 * @param scheduleRows canonical schedule rows ({ providerEventId, dateUtc, shortName, ... })
 * @param capture      the committed market capture, or null
 * @param nowIso       this run's clock
 * @param runInFlight  true when an nfl-event-window run is already queued or running
 */
export function decideKickoffRefresh({ scheduleRows, capture, nowIso, runInFlight = false, leadMinutes = LEAD_MINUTES, freshMinutes = FRESH_MINUTES } = {}) {
  const now = Date.parse(nowIso ?? "");
  if (!Number.isFinite(now)) return { decision: "REFUSE", state: "NO_CLOCK", reason: "no usable clock — a refresh is never dispatched on a guessed time", events: [] };

  /*
   * ⚠ A STARTED GAME IS NOT A PREGAME EVENT, AND IT IS NOT A REASON TO BUY ANYTHING.
   *
   * The capture's own window is pre-start only, so a dispatch triggered by an in-progress game buys
   * nothing for that game and may buy nothing at all. Worse, it would keep re-triggering for the
   * whole duration of a live game — a spend loop driven by a fixture that can no longer be priced.
   * Strictly future kickoffs only, and a row whose time will not parse is excluded rather than
   * assumed pregame.
   */
  const upcoming = [];
  for (const r of scheduleRows ?? []) {
    /* The canonical schedule stamps "2026-09-27T17:00Z" — no seconds. Node parses that correctly;
       the seconds are added anyway so the value does not depend on that leniency holding. */
    const raw = String(r?.dateUtc ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z");
    const kickoff = Date.parse(raw);
    if (!Number.isFinite(kickoff)) continue;
    if (kickoff <= now) continue;                      // started or finished
    const minutesOut = (kickoff - now) / 60_000;
    if (minutesOut > leadMinutes) continue;            // too far away to be the last look
    upcoming.push({ providerEventId: r.providerEventId ?? null, matchup: r.shortName ?? null, kickoffUtc: r.dateUtc ?? null, minutesToKickoff: Math.round(minutesOut) });
  }
  upcoming.sort((a, b) => a.minutesToKickoff - b.minutesToKickoff);

  if (!upcoming.length) return { decision: "HOLD", state: "NO_KICKOFF_SOON", reason: `no pre-start event kicks off within ${leadMinutes} minutes`, events: [] };

  if (runInFlight) return { decision: "HOLD", state: "RUN_IN_FLIGHT", reason: "an nfl-event-window run is already queued or running — a second would buy the same week twice", events: upcoming };

  /*
   * THE DUPLICATE-SPEND GUARD, AND IT READS THE ARTIFACT RATHER THAN THE RUN LIST.
   *
   * A run that started is not prices that landed, and a run list cannot tell you how old the prices
   * actually are. `propPrices.capturedAt` can, it is the same field every public surface stamps, and
   * it survives the delayed arrival of a scheduled sweep: if the 13:00Z cron lands at 16:00Z, this
   * checker sees fresh prices at 16:15Z and holds, instead of buying the week a second time.
   */
  const capturedAt = capture?.propPrices?.capturedAt ?? null;
  const capturedMs = capturedAt ? Date.parse(capturedAt) : NaN;
  const probed = capture?.propMarkets?.state === "PROBED";
  if (probed && Number.isFinite(capturedMs)) {
    const ageMin = (now - capturedMs) / 60_000;
    if (ageMin >= 0 && ageMin < freshMinutes) {
      return { decision: "HOLD", state: "ALREADY_FRESH", reason: `prices captured ${Math.round(ageMin)} minutes ago, inside the ${freshMinutes}-minute freshness window`, capturedAt, events: upcoming };
    }
  }

  return {
    decision: "DISPATCH",
    state: probed ? "STALE_BEFORE_KICKOFF" : "NEVER_PROBED_BEFORE_KICKOFF",
    reason: `${upcoming.length} event(s) kick off within ${leadMinutes} minutes and the committed prices are ${capturedAt ? `from ${capturedAt}` : "absent"}`,
    capturedAt,
    events: upcoming,
  };
}
