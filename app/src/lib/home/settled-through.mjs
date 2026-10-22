/**
 * HOME · "Settled through <date>" — the newest settled date across what the Home page summarizes (Housekeeping 10-22).
 *
 * The hero's proof link ("Settled through Oct 15 →", to /results) and the Recent results strip ("Last settled …")
 * name no product, so they claim the site as a whole is settled through that day. They read ONLY the suggested-parlay
 * optimizer's settled index, which stopped at 2026-10-15 while MLB had settled through 10-19 and the Bank Builder /
 * Moonshot receipts (NFL included) through 10-20 — the label said less than was true and contradicted /results.
 *
 * Rule: the newest of
 *   • every optimizer settled slate date (a slate with at least one decided card — the index the label used before), and
 *   • the window end (`window.to`) of every canonical results-projection cell that is a SETTLED, CURRENT record:
 *       family product | forecast (the products and sports Home summarizes),
 *       era RECEIPT_ERA (the Rule S fold — a day folds only when every placed lane is decided) | LIVE_LEDGER
 *         (an official-result ledger), status LIVE, display-eligible, and carrying integer won/lost counts.
 *     Excluded on purpose: PENDING_SETTLEMENT / UNRECEIPTED_GAP / frozen or superseded cells (not settled, or not
 *     current), and the Parlay Lab family, whose windows end at the newest evaluated slate, settled or not.
 * Nothing is computed beyond picking the maximum; no settlement data is read or changed here.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SETTLED_FAMILIES = new Set(["product", "forecast"]);
const SETTLED_ERAS = new Set(["RECEIPT_ERA", "LIVE_LEDGER"]);

/** Is this projection cell a settled, current record whose window end is a settled day? */
export function isSettledRecordCell(cell) {
  return Boolean(
    cell &&
      SETTLED_FAMILIES.has(cell.family) &&
      SETTLED_ERAS.has(cell.era) &&
      cell.status === "LIVE" &&
      cell.displayEligible?.eligible === true &&
      Number.isInteger(cell.counts?.won) &&
      Number.isInteger(cell.counts?.lost) &&
      typeof cell.window?.to === "string" &&
      DATE_RE.test(cell.window.to),
  );
}

/**
 * @param {{ projection?: { cells?: unknown[] } | null, optimizerSettledDates?: string[] }} input
 * @returns {string | null} the newest settled YYYY-MM-DD, or null when nothing has settled
 */
export function newestSettledDate({ projection = null, optimizerSettledDates = [] } = {}) {
  const dates = [
    ...(optimizerSettledDates ?? []).filter((d) => typeof d === "string" && DATE_RE.test(d)),
    ...(Array.isArray(projection?.cells) ? projection.cells : []).filter(isSettledRecordCell).map((c) => c.window.to),
  ];
  return dates.length ? dates.sort().at(-1) : null;
}
