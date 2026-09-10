/**
 * PAID-RUN GATE — at most one paid morning refresh per ET day, whatever triggered it.
 *
 * WHY THIS HAS TO EXIST BEFORE THE CHAIN. morning-projections spends Odds API credits. Today it is
 * reached by exactly one scheduled cron, so "once a day" is enforced by there being one trigger.
 * P253 adds a second trigger — the workflow chains off nightly-settle's completion so the morning
 * band stops waiting on its own badly-delayed cron — and a workflow with two triggers and no gate
 * is a workflow that can pay twice for the same day's data. The 14:15 UTC backstop cron already
 * carried that risk in principle; adding the chain makes it routine.
 *
 * So the gate lands FIRST and the chain lands on top of it. The credit guard inside the run caps
 * what a single run may spend; it has nothing to say about a second run, which is a different
 * question and the one that matters here.
 *
 * TWO INDEPENDENT SIGNALS, EITHER OF WHICH IS SUFFICIENT TO SKIP:
 *
 *   1. run history  — a morning-projections run already succeeded today
 *   2. artifact     — today's board is already on disk
 *
 * Either alone would work on a good day. Together they cover each other's lag: run history can be
 * momentarily behind for a run that just finished, and the board can be committed by a recovery
 * path that never shows up as a morning-projections success. Requiring BOTH to be clear before
 * spending is the conservative direction, and on a paid call conservative is correct.
 *
 * FAIL-CLOSED ON UNKNOWNS. If we could not read the run history, we do not spend. A gate that
 * spends when its evidence is missing is not a gate — and this repo has an incident register full
 * of checks that returned "fine" when they meant "I could not tell".
 */

/** States, so a dashboard can classify without regex-matching prose. */
export const PAID_RUN_STATES = Object.freeze({
  RUN_SCHEDULED: "RUN_SCHEDULED",
  RUN_FORCED: "RUN_FORCED",
  SKIP_ALREADY_RAN: "SKIP_ALREADY_RAN",
  SKIP_BOARD_PRESENT: "SKIP_BOARD_PRESENT",
  SKIP_UNKNOWN_HISTORY: "SKIP_UNKNOWN_HISTORY",
});

/**
 * Decide whether a paid morning refresh may proceed.
 *
 * @param {object}  input
 * @param {boolean} input.forced                 operator asked for this run explicitly
 * @param {string}  input.etDate                 today in ET (YYYY-MM-DD)
 * @param {number|null} input.successfulRunsToday successful runs of this workflow today, or null if unknown
 * @param {string|null} input.newestBoardDate    newest board on disk (YYYY-MM-DD) or null/"none"
 * @returns {{run: boolean, state: string, reason: string}}
 */
export function decidePaidRun({ forced = false, etDate, successfulRunsToday, newestBoardDate } = {}) {
  if (!etDate) {
    return {
      run: false,
      state: PAID_RUN_STATES.SKIP_UNKNOWN_HISTORY,
      reason: "no ET date was supplied — refusing to spend against an unknown day",
    };
  }

  /*
   * FORCE IS FIRST AND IT IS ABSOLUTE. An operator dispatching this workflow by hand has already
   * decided the day needs another refresh — a stuck board, a provider outage that has cleared, a
   * slate that changed. The gate exists to stop AUTOMATION paying twice, never to argue with a
   * person who typed the dispatch. It is deliberately not reachable from a schedule or a chain.
   */
  if (forced) {
    return { run: true, state: PAID_RUN_STATES.RUN_FORCED, reason: `operator forced a refresh for ${etDate}` };
  }

  if (successfulRunsToday === null || successfulRunsToday === undefined || !Number.isFinite(successfulRunsToday)) {
    return {
      run: false,
      state: PAID_RUN_STATES.SKIP_UNKNOWN_HISTORY,
      reason: "could not read this workflow's run history — refusing to spend on unknown evidence",
    };
  }

  if (successfulRunsToday > 0) {
    return {
      run: false,
      state: PAID_RUN_STATES.SKIP_ALREADY_RAN,
      reason: `${successfulRunsToday} successful run(s) already completed for ${etDate}`,
    };
  }

  const board = newestBoardDate === "none" ? null : newestBoardDate;
  if (board && board >= etDate) {
    return {
      run: false,
      state: PAID_RUN_STATES.SKIP_BOARD_PRESENT,
      reason: `a board for ${board} is already on disk — today's work product exists`,
    };
  }

  return {
    run: true,
    state: PAID_RUN_STATES.RUN_SCHEDULED,
    reason: `no run and no board for ${etDate} yet`,
  };
}

/** One line for the workflow log and the step summary. Decision first — callers parse `head -1`. */
export function formatDecision(d) {
  return `${d.run ? "RUN" : "SKIP"} ${d.state} ${d.reason}`;
}
