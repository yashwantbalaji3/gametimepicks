/**
 * SESSION 5 · A4 — THE THURSDAY PREGAME ROSTER/USAGE REFRESH, WITHOUT A HUMAN AND WITHOUT A CREDIT.
 *
 * On 2026-10-01 PIT @ CLE (kickoff 00:15Z Friday) the boards were refreshed by a manual zero-credit
 * dispatch. Two defects made the automatic path unable to do it:
 *   - `nfl-kickoff-refresh` fires Thursdays at `*\/30 17-21` UTC (1–5 PM ET). Its "≤ 120 minutes to kickoff"
 *     rule is never true on time for a 00:15Z kickoff, and GitHub delivered ONE of its ten slots that night
 *     (21:40Z → NO_KICKOFF_SOON). It also dispatches the PAID prop probe.
 *   - Scheduled delivery here runs 1h40m–4h55m late (P253, 40 observations). A cron cannot hit a deadline.
 *
 * So a deadline is met the only way this scheduler allows: whichever run ARRIVES first computes the target
 * from the committed boards and WAITS for it inside the job, then dispatches the event window with
 * `skip_odds=true` (the documented zero-credit chain: rosters, injuries, depth, usage, boards).
 *
 * Pure: the clock and the boards are arguments.
 */

/** Target lead before kickoff: inside the 90–120 minute band, leaving room for a ~10 minute window run. */
export const TARGET_LEAD_MIN = 105;
/** Later than this before kickoff a refresh may not land before the game starts — run only if earlier. */
export const LATEST_LEAD_MIN = 25;
/** A board regenerated within this many minutes of kickoff already IS the pregame refresh. */
export const FRESH_WITHIN_MIN = 120;
/** A run that slept to the target re-decides a few seconds early; it must still dispatch. */
export const DISPATCH_TOLERANCE_MIN = 5;
/** The longest the job will wait (the workflow's timeout must exceed it). */
export const MAX_WAIT_MIN = 330;

export const PREGAME_REFRESH = Object.freeze({
  WAIT_THEN_DISPATCH: "WAIT_THEN_DISPATCH",
  DISPATCH_NOW: "DISPATCH_NOW",
  ALREADY_REFRESHED: "ALREADY_REFRESHED",
  TOO_LATE: "TOO_LATE",
  NO_GAME: "NO_GAME",
});

const MIN = 60_000;

/**
 * @param boards  committed nfl-player-board artifacts ({ providerEventId, matchup, kickoffUtc, generatedAt })
 * @param nowIso  the run's own clock
 * @returns {{ decision, reason, waitSeconds, kickoffUtc?, matchup? }}
 */
export function decidePregameFreeRefresh({ boards, nowIso }) {
  const now = Date.parse(nowIso ?? "");
  if (!Number.isFinite(now)) throw new Error("decidePregameFreeRefresh: nowIso required");
  /* The next kickoff the job could still wait for. Several games at one kickoff are one refresh. */
  const upcoming = (boards ?? [])
    .map((b) => ({ ...b, k: Date.parse(b?.kickoffUtc ?? "") }))
    .filter((b) => Number.isFinite(b.k) && b.k > now && b.k - now <= (MAX_WAIT_MIN + TARGET_LEAD_MIN) * MIN)
    .sort((a, b) => a.k - b.k);
  if (!upcoming.length) return { decision: PREGAME_REFRESH.NO_GAME, reason: `no committed board kicks off within ${MAX_WAIT_MIN + TARGET_LEAD_MIN} minutes`, waitSeconds: 0 };
  const k = upcoming[0].k;
  const slate = upcoming.filter((b) => b.k === k);
  const label = slate.map((b) => b.matchup ?? b.providerEventId).join(", ");
  const kickoffUtc = new Date(k).toISOString();
  const refreshed = slate.every((b) => Number.isFinite(Date.parse(b.generatedAt ?? "")) && k - Date.parse(b.generatedAt) <= FRESH_WITHIN_MIN * MIN);
  if (refreshed) return { decision: PREGAME_REFRESH.ALREADY_REFRESHED, reason: `${label}: every board was regenerated within ${FRESH_WITHIN_MIN} minutes of kickoff`, waitSeconds: 0, kickoffUtc, matchup: label };
  const lead = (k - now) / MIN;
  if (lead < LATEST_LEAD_MIN) return { decision: PREGAME_REFRESH.TOO_LATE, reason: `${label}: ${Math.round(lead)} minutes to kickoff — a refresh might not land before the game starts`, waitSeconds: 0, kickoffUtc, matchup: label };
  if (lead <= TARGET_LEAD_MIN + DISPATCH_TOLERANCE_MIN) return { decision: PREGAME_REFRESH.DISPATCH_NOW, reason: `${label}: ${Math.round(lead)} minutes to kickoff`, waitSeconds: 0, kickoffUtc, matchup: label };
  return { decision: PREGAME_REFRESH.WAIT_THEN_DISPATCH, reason: `${label}: waiting until ${TARGET_LEAD_MIN} minutes before kickoff`, waitSeconds: Math.round((lead - TARGET_LEAD_MIN) * 60), kickoffUtc, matchup: label };
}
