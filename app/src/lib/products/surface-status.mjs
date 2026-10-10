/**
 * A picks surface's header state, from what the page shows AND whether the day's producer ran (TRUTH-001).
 *
 * /build and /build/custom said "Data pending" whenever they had nothing to show — including days the producers
 * ran and found nothing: 2026-10-09 has 0 MLB games, and the risk ladder ran at 15:18Z with `cards: []` and every
 * tier skipped "no priced card in this tier on today's slate". "Data pending" promises data that is not coming.
 *
 *   pregame / review   something is shown (today's slate / an earlier slate)
 *   no_qualifying      nothing shown, and the producer ran for this date — a result, not a delay
 *   data_pending       nothing shown, and no producer output exists for this date yet
 */
export function picksSurfaceStatus({ shownCount, slateDate, today, producerRan }) {
  if (shownCount > 0) return slateDate >= today ? "pregame" : "review";
  return producerRan ? "no_qualifying" : "data_pending";
}
