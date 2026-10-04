/**
 * SESSION 5 · A3/A4 — THE THURSDAY PREGAME REFRESH, WITHOUT A HUMAN AND WITHOUT A CREDIT.
 * (Session 12: and Sunday's — the same two passes for each kickoff group, in kickoff order.)
 *
 * On 2026-10-01 PIT @ CLE (kickoff 00:15Z Friday) the boards were refreshed by a manual zero-credit
 * dispatch. Two defects made the automatic path unable to do it:
 *   - `nfl-kickoff-refresh` fires Thursdays at 17–21 UTC (1–5 PM ET). Its "≤ 120 minutes to kickoff" rule
 *     is never true on time for a 00:15Z kickoff, and GitHub delivered ONE of its ten slots that night
 *     (21:40Z → NO_KICKOFF_SOON). It also dispatches the PAID prop probe.
 *   - Scheduled delivery here runs 1h40m–4h55m late (P253, 40 observations). A cron cannot hit a deadline.
 *
 * AND THE GAME-DAY INACTIVES (A3). The league injuries feed `capture-injuries.mjs` already reads carries the
 * official inactives as "Out · Coach's Decision" — on 2026-10-01 stamped 22:48–23:08Z, i.e. T-87 to T-67,
 * after the NFL's 90-minute declaration. Our last pre-kickoff capture was 22:30:25Z (T-105), so all six read
 * "Active". No new source is needed; a pass AFTER the declaration is. Hence two passes:
 *   ROSTER    T-105 — rosters, usage, injuries, depth chart (inside the 90–120 band)
 *   INACTIVES T-55  — the same chain once inactives are declared, landing before kickoff
 *
 * Whichever scheduled run ARRIVES first decides from the committed boards and WAITS for each pass inside the
 * job, then dispatches the event window with `skip_odds=true` (the documented zero-credit chain).
 *
 * Pure: the clock and the boards are arguments.
 */

/** The passes, in order. `doneWithin`: a board regenerated within this many minutes of kickoff satisfies it. */
export const PASSES = Object.freeze([
  Object.freeze({ id: "ROSTER", leadMin: 105, doneWithinMin: 120 }),
  Object.freeze({ id: "INACTIVES", leadMin: 55, doneWithinMin: 65 }),
]);
/** Kept for the band check: the roster pass sits inside 90–120 minutes. */
export const TARGET_LEAD_MIN = PASSES[0].leadMin;
/** Later than this before kickoff a refresh may not land before the game starts. */
export const LATEST_LEAD_MIN = 25;
/** A run that slept to the target re-decides a few seconds early; it must still dispatch. */
export const DISPATCH_TOLERANCE_MIN = 5;
/** The longest a single wait may be (the workflow's timeout must exceed the whole job). */
export const MAX_WAIT_MIN = 270;
/** Kickoffs further away than this are left to a later delivery. */
export const HORIZON_MIN = MAX_WAIT_MIN + TARGET_LEAD_MIN;

export const PREGAME_REFRESH = Object.freeze({
  WAIT_THEN_DISPATCH: "WAIT_THEN_DISPATCH",
  DISPATCH_NOW: "DISPATCH_NOW",
  ALREADY_REFRESHED: "ALREADY_REFRESHED",
  TOO_LATE: "TOO_LATE",
  NO_GAME: "NO_GAME",
});

const MIN = 60_000;

/**
 * One kickoff group's decision (every game at that instant is one refresh).
 * Returns the first pass that still owes work, or a terminal ALREADY_REFRESHED / TOO_LATE.
 */
function decideKickoff(slate, k, now) {
  const label = slate.map((b) => b.matchup ?? b.providerEventId).join(", ");
  const kickoffUtc = new Date(k).toISOString();
  const oldest = Math.min(...slate.map((b) => { const g = Date.parse(b.generatedAt ?? ""); return Number.isFinite(g) ? g : -Infinity; }));
  const lead = (k - now) / MIN;
  const base = { kickoffUtc, matchup: label };

  for (const pass of PASSES) {
    if (k - oldest <= pass.doneWithinMin * MIN) continue; // every board already regenerated inside this pass's band
    if (lead < LATEST_LEAD_MIN) return { ...base, decision: PREGAME_REFRESH.TOO_LATE, pass: pass.id, reason: `${label}: ${Math.round(lead)} minutes to kickoff — a ${pass.id} refresh might not land before the game starts`, waitSeconds: 0 };
    if (lead <= pass.leadMin + DISPATCH_TOLERANCE_MIN) return { ...base, decision: PREGAME_REFRESH.DISPATCH_NOW, pass: pass.id, reason: `${label}: ${pass.id} pass, ${Math.round(lead)} minutes to kickoff`, waitSeconds: 0 };
    return { ...base, decision: PREGAME_REFRESH.WAIT_THEN_DISPATCH, pass: pass.id, reason: `${label}: waiting for the ${pass.id} pass, ${pass.leadMin} minutes before kickoff`, waitSeconds: Math.round((lead - pass.leadMin) * 60) };
  }
  return { ...base, decision: PREGAME_REFRESH.ALREADY_REFRESHED, reason: `${label}: every board was regenerated after the inactive declaration (within ${PASSES.at(-1).doneWithinMin} minutes of kickoff)`, waitSeconds: 0 };
}

/**
 * @param boards  committed nfl-player-board artifacts ({ providerEventId, matchup, kickoffUtc, generatedAt })
 * @param nowIso  the run's own clock
 * @returns {{ decision, pass?, reason, waitSeconds, kickoffUtc?, matchup? }}
 *
 * SESSION 12 · SUNDAY HAS SEVERAL KICKOFFS. Thursday and Monday have one, so "the next kickoff" was the
 * whole question. A Sunday has the 1 PM block, 4:05 and 4:25 PM, and the night game. Once the earliest
 * group is done (ALREADY_REFRESHED) or can no longer be helped (TOO_LATE), the job must move on to the
 * next group instead of exiting — otherwise the 4 PM inactives pass waits on a fresh delivery that a
 * Sunday afternoon may not bring. Groups are taken in kickoff order; the first that still owes a pass
 * decides. When none does, the EARLIEST group's terminal state is reported (unchanged for one game).
 */
export function decidePregameFreeRefresh({ boards, nowIso }) {
  const now = Date.parse(nowIso ?? "");
  if (!Number.isFinite(now)) throw new Error("decidePregameFreeRefresh: nowIso required");
  const upcoming = (boards ?? [])
    .map((b) => ({ ...b, k: Date.parse(b?.kickoffUtc ?? "") }))
    .filter((b) => Number.isFinite(b.k) && b.k > now && b.k - now <= HORIZON_MIN * MIN)
    .sort((a, b) => a.k - b.k);
  if (!upcoming.length) return { decision: PREGAME_REFRESH.NO_GAME, reason: `no committed board kicks off within ${HORIZON_MIN} minutes`, waitSeconds: 0 };
  const kickoffs = [...new Set(upcoming.map((b) => b.k))];
  let first = null;
  for (const k of kickoffs) {
    const d = decideKickoff(upcoming.filter((b) => b.k === k), k, now);
    if (d.decision !== PREGAME_REFRESH.ALREADY_REFRESHED && d.decision !== PREGAME_REFRESH.TOO_LATE) return d;
    first ??= d;
  }
  return first;
}
