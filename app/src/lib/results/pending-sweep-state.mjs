/**
 * WHY A PENDING CARD IS STILL PENDING — two states that are not the same thing (v1.8).
 *
 * The guard this serves used to assert one sentence over every stale pending card:
 *
 *     "still pending after N days — the sweep exists so this cannot happen"
 *
 * It CAN happen, and on 2026-09-19 it did, for a reason the message actively denied. The nightly
 * sweep ran, inspected those exact cards and logged `6/8 cards decided for 2026-09-19`. It was
 * working. The EPL results simply had not arrived yet — they landed roughly three and a half days
 * after the matches, past a threshold that assumed three. So correct pipeline behaviour rendered as
 * a red gate whose text pointed the reader at a sweep that was fine. That is the same failure class
 * as a refusal code naming the wrong subsystem: the cost is not the red, it is the misdirection.
 *
 * So the two states are typed, and the distinguishing evidence is a FACT rather than elapsed time:
 *
 *   UPSTREAM_SOURCE_LAG   the settler, run now over committed data, STILL cannot decide these cards.
 *                         Nothing downstream can fix that. Not a defect; a disclosed wait.
 *
 *   BROKEN_SWEEP          no sweep is wired to run at all, or the settler could not be asked.
 *                         Nothing will ever clear these. A real defect.
 *
 *   DECIDABLE_BUT_PENDING the settler CAN decide them from data already on disk, yet the receipt
 *                         still says pending. Source lag does not explain this. Either the sweep is
 *                         not running, or it has not run since the results landed — the guard says
 *                         exactly that instead of picking one.
 *
 * WHAT THIS MODULE DOES NOT DO. It does not grade, settle, or decide any card; it reads the
 * settler's own count of what it could decide. It never writes. `pending` stays pending — a card
 * that cannot be decided is never a loss, and a source that has not answered is not a zero.
 *
 * DO NOT COLLAPSE THESE BACK. A single "still pending" failure is easy to write and tells the next
 * reader nothing about which of three different actions to take: wait, fix the wiring, or find out
 * why the sweep has not run. The whole point is which one.
 */

/** The closed vocabulary. A caller names one; there is no "just pending". */
export const PENDING_SWEEP_STATES = Object.freeze({
  NO_PENDING: "NO_PENDING",
  UPSTREAM_SOURCE_LAG: "UPSTREAM_SOURCE_LAG",
  DECIDABLE_BUT_PENDING: "DECIDABLE_BUT_PENDING",
  PARTIALLY_DECIDABLE: "PARTIALLY_DECIDABLE",
  BROKEN_SWEEP: "BROKEN_SWEEP",
});

/** The states a stale pending date may hold WITHOUT being a defect. */
export const BENIGN_STATES = Object.freeze([PENDING_SWEEP_STATES.NO_PENDING, PENDING_SWEEP_STATES.UPSTREAM_SOURCE_LAG]);

/**
 * The settler's own decidability count, read from its stdout: `N/M cards decided for <date>`.
 *
 * Returns null when the line is absent or does not match — NEVER a guess. A caller that cannot read
 * the count must treat the date as unexplained rather than assume lag, because assuming lag is the
 * fail-open that would let a genuinely broken sweep pass as "waiting on the source".
 *
 * @param {string} stdout
 * @param {string} date
 * @returns {{ decided: number, total: number } | null}
 */
export function parseDecidability(stdout, date) {
  const m = new RegExp(`(\\d+)\\s*/\\s*(\\d+)\\s+cards decided for ${date.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).exec(String(stdout ?? ""));
  if (!m) return null;
  const decided = Number(m[1]);
  const total = Number(m[2]);
  if (!Number.isInteger(decided) || !Number.isInteger(total) || total < 0 || decided < 0 || decided > total) return null;
  return { decided, total };
}

/**
 * Classify one stale pending date.
 *
 * @param {object} q
 * @param {boolean} q.sweepWired       a workflow actually runs the pending-day sweep
 * @param {number}  q.pendingCount     pending cards on the committed receipt
 * @param {{ decided: number, total: number } | null} q.decidability  the settler's own count, or null if unreadable
 * @returns {{ state: string, reason: string }}
 */
export function classifyPendingDate({ sweepWired, pendingCount, decidability }) {
  const S = PENDING_SWEEP_STATES;
  if (pendingCount === 0) return { state: S.NO_PENDING, reason: "no pending cards on this receipt" };

  /* Checked FIRST and independently of the settler: with nothing scheduled to sweep, no amount of
     source lag explains a stale pending card, because nothing would clear it even once the results
     land. This is the one state that is true from the repository alone. */
  if (!sweepWired) {
    return { state: S.BROKEN_SWEEP, reason: "no workflow runs the pending-day sweep — nothing will ever clear these cards, whatever the source does" };
  }
  /* Fail CLOSED. An unreadable settler is not evidence of lag; it is an absence of evidence, and
     treating it as lag is exactly how a broken sweep would slip through this guard. */
  if (!decidability) {
    return { state: S.BROKEN_SWEEP, reason: "the settler could not be asked (no decidability line) — the state cannot be established, so it is not assumed benign" };
  }

  const undecidable = decidability.total - decidability.decided;
  if (undecidable >= pendingCount) {
    return {
      state: S.UPSTREAM_SOURCE_LAG,
      reason: `the settler still cannot decide ${undecidable} of ${decidability.total} cards from committed data — the results have not arrived, which nothing downstream can fix`,
    };
  }
  if (undecidable === 0) {
    return {
      state: S.DECIDABLE_BUT_PENDING,
      reason: `the settler decides all ${decidability.total} cards from data already on disk, so source lag does not explain ${pendingCount} still-pending card(s): either the sweep is not running, or it has not run since the results landed`,
    };
  }
  return {
    state: S.PARTIALLY_DECIDABLE,
    reason: `the settler decides ${decidability.decided} of ${decidability.total}, leaving ${undecidable} undecidable — fewer than the ${pendingCount} still pending, so lag explains some but not all of them`,
  };
}

/** True when a state is a genuine defect the gate must go red on. */
export const isDefect = (state) => !BENIGN_STATES.includes(state);
