/**
 * Daily freshness SLO evaluation (Program 100-103 Lane H).
 *
 * WHY THIS EXISTS
 * During the 2026-08-01→03 incident the observer DID report `newest board … (3d old)` — as a
 * WARNING. Every failed run also alerted correctly. The product still served a three-day-old
 * slate for 62 hours, because nothing expressed the one condition that actually mattered:
 *
 *     it is a scheduled slate day, the automation is green, and there is still no board for TODAY.
 *
 * A single-run failure alert cannot say that, and a warning is easy to scroll past. This turns
 * "no current board past the SLO hour" into a FAILURE, which flips the observer verdict and
 * escalates through the already-proven ops webhook.
 */

/** Past this ET hour on a scheduled slate day, a missing current board is CRITICAL, not a warning. */
export const BOARD_DUE_ET_HOUR = 14; // 2pm ET — well after the 09:30 ET generator, before evening first pitches
export const BOARD_WARN_ET_HOUR = 11;

/**
 * Current ET hour as 0–23.
 *
 * `Intl` with `hour12: false` returns **24** for the midnight hour (a documented quirk that also
 * affects `hourCycle: "h23"`), so the naive computation makes 00:33 ET read as hour 24 — i.e.
 * "past the 14:00 deadline" — and would fire a false outage every single midnight. `% 24` is the
 * fix; this helper exists so the quirk is handled in exactly one place and stays tested.
 */
export function currentEtHour(now = new Date()) {
  const raw = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(now),
  );
  return Number.isFinite(raw) ? raw % 24 : 0;
}

export const FRESHNESS_STATES = Object.freeze({
  NO_SCHEDULE: "NO_SCHEDULE",
  AWAITING_MARKETS: "SCHEDULE_READY_AWAITING_MARKETS",
  PARTIAL: "PARTIAL_PREGAME_COVERAGE",
  CURRENT: "CURRENT_BASE_BOARD",
  CURRENT_PATCHED: "CURRENT_WITH_PATCHES",
  FROZEN: "GAMES_IN_PROGRESS_BOARD_FROZEN",
  AWAITING_SETTLEMENT: "AWAITING_SETTLEMENT",
  SETTLED: "SETTLED",
  STALE: "STALE",
});

/**
 * @param {object} o
 * @param {string} o.todayEt          current ET date (YYYY-MM-DD)
 * @param {number} o.etHour           current ET hour (0-23)
 * @param {string|null} o.newestBoard newest generated board date
 * @param {number|null} o.scheduledGames games on today's official schedule (null = unknown)
 * @param {number} [o.coveredGames]   games on today's board carrying market coverage
 * @param {boolean} [o.hasPatches]
 * @returns {{state:string, severity:"OK"|"WARN"|"FAIL", detail:string}}
 */
export function evaluateDailyFreshness({ todayEt, etHour, newestBoard, scheduledGames, coveredGames = 0, hasPatches = false }) {
  if (scheduledGames === 0) {
    return { state: FRESHNESS_STATES.NO_SCHEDULE, severity: "OK", detail: `no games scheduled for ${todayEt}` };
  }

  const boardIsCurrent = newestBoard === todayEt;

  if (!boardIsCurrent) {
    // The incident's exact shape. Severity escalates with the clock, so a normal pre-generation
    // morning is not noise, but a missing board at 2pm ET is a product outage.
    const detail =
      `no board for the current ET slate date ${todayEt} (newest: ${newestBoard ?? "none"})` +
      (scheduledGames == null ? "" : ` · ${scheduledGames} game(s) scheduled`);
    if (etHour >= BOARD_DUE_ET_HOUR) return { state: FRESHNESS_STATES.STALE, severity: "FAIL", detail: `${detail} — past ${BOARD_DUE_ET_HOUR}:00 ET` };
    if (etHour >= BOARD_WARN_ET_HOUR) return { state: FRESHNESS_STATES.STALE, severity: "WARN", detail: `${detail} — past ${BOARD_WARN_ET_HOUR}:00 ET` };
    return { state: FRESHNESS_STATES.AWAITING_MARKETS, severity: "OK", detail: `${detail} — before the generation window` };
  }

  // Board IS current. Partial coverage on today's slate is a healthy state, not a defect:
  // a partial-but-current board is strictly better than a complete but stale one.
  if (coveredGames === 0) {
    return { state: FRESHNESS_STATES.AWAITING_MARKETS, severity: "OK", detail: `board for ${todayEt} published; no markets posted yet` };
  }
  if (scheduledGames != null && coveredGames < scheduledGames) {
    return {
      state: hasPatches ? FRESHNESS_STATES.CURRENT_PATCHED : FRESHNESS_STATES.PARTIAL,
      severity: "OK",
      detail: `board for ${todayEt} current with honest partial coverage (${coveredGames}/${scheduledGames} games)`,
    };
  }
  return {
    state: hasPatches ? FRESHNESS_STATES.CURRENT_PATCHED : FRESHNESS_STATES.CURRENT,
    severity: "OK",
    detail: `board for ${todayEt} current with full coverage (${coveredGames}/${scheduledGames})`,
  };
}
