/**
 * EPL MATCHDAY WATCH — "should the matchweek job have run by now, and did it?"
 *
 * The monitoring registry recorded EPL as `alerted: true, watched: false`, and the gap in its own
 * words was "alerted, but nothing watches whether the matchweek run happened at all". Those are
 * different failures. Alerting covers a run that RAN and broke. Nothing covered a run that never
 * started — and GitHub crons are best-effort: a morning cron has already silently skipped in this
 * repo's history, which is why MLB has a watchdog and a dispatch remedy.
 *
 * For EPL the stakes are concentrated rather than daily. Fixtures cluster on four days a week, the
 * forecast job runs a few hours before the first kickoff of each cluster, and a skipped run means the
 * published forecast is silently stale for a whole matchweek while every surface keeps rendering it
 * with confidence.
 *
 * MATCHDAY IS DERIVED FROM THE FIXTURES, never from a hardcoded weekday. The cron list and the real
 * calendar drift apart — cup weeks, TV rescheduling, a moved kickoff — and a watchdog keyed to
 * "it's Friday" would go quiet in exactly the weeks the schedule is unusual.
 *
 * Pure: no fs, no network, no clock. The caller supplies the fixtures and the instant.
 */

export const EPL_WATCH_VERSION = 1;

/** Default lead time: the job should have run by the time the first kickoff is this close. */
export const DEFAULT_LEAD_HOURS = 8;

/**
 * Decide what the watchdog should do.
 *
 * @param {{ fixtures: Array<{kickoffIso?: string, kickoffUtc?: string}>, nowIso: string,
 *           ranToday: boolean, leadHours?: number, forecastGeneratedAt?: string|null }} input
 * @returns {{ state: string, reason: string, shouldDispatch: boolean, hoursToKickoff: number|null }}
 *
 * States:
 *   NO_UPCOMING_FIXTURE  nothing kicks off inside the window — silence is correct
 *   TOO_EARLY            a fixture is coming but the job is not due yet
 *   RAN                  due, and the job ran
 *   MISSED               due, and it did NOT run → dispatch and alert
 *   STALE_FORECAST       the job ran but the forecast predates the previous matchday → suspicious
 */
export function eplMatchdayWatch({ fixtures, nowIso, ranToday, leadHours = DEFAULT_LEAD_HOURS, forecastGeneratedAt = null }) {
  const now = Date.parse(nowIso ?? "");
  if (!Number.isFinite(now)) throw new Error("eplMatchdayWatch: nowIso required");

  const kickoffs = (fixtures ?? [])
    .map((f) => Date.parse(f.kickoffIso ?? f.kickoffUtc ?? ""))
    .filter((t) => Number.isFinite(t) && t > now)
    .sort((a, b) => a - b);

  if (kickoffs.length === 0) {
    return { state: "NO_UPCOMING_FIXTURE", reason: "no future kickoff in the committed capture", shouldDispatch: false, hoursToKickoff: null };
  }

  const hours = (kickoffs[0] - now) / 3_600_000;
  if (hours > leadHours) {
    return {
      state: "TOO_EARLY",
      reason: `next kickoff is ${hours.toFixed(1)}h away; the job is not due until it is within ${leadHours}h`,
      shouldDispatch: false,
      hoursToKickoff: hours,
    };
  }

  if (!ranToday) {
    return {
      state: "MISSED",
      reason: `next kickoff is ${hours.toFixed(1)}h away and epl-matchweek has not run today — a skipped cron leaves the published forecast silently stale for the whole matchweek`,
      shouldDispatch: true,
      hoursToKickoff: hours,
    };
  }

  /*
   * The job ran — but a run that produced nothing is the failure mode this repo keeps finding, so
   * the forecast's own stamp is checked too. Older than the imminent kickoff by more than a day means
   * the run happened and the artifact did not move.
   */
  if (forecastGeneratedAt) {
    const gen = Date.parse(forecastGeneratedAt);
    if (Number.isFinite(gen) && (now - gen) / 3_600_000 > 24) {
      return {
        state: "STALE_FORECAST",
        reason: `epl-matchweek ran today but the published forecast is stamped ${forecastGeneratedAt}, over 24h old, with a kickoff ${hours.toFixed(1)}h away`,
        shouldDispatch: true,
        hoursToKickoff: hours,
      };
    }
  }

  return { state: "RAN", reason: `kickoff in ${hours.toFixed(1)}h and the job ran today`, shouldDispatch: false, hoursToKickoff: hours };
}
