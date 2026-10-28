/**
 * ONE "SETTLED THROUGH" TRUTH (P0 U1, 2026-10-28). Every date the site prints about how far its records are
 * settled comes from THIS module. Before it, the same 99-bet paper ledger carried three dates on Production:
 * the global header chip "Settled · Oct 15" (the MLB priced-card optimizer's newest DECIDED slate, which stopped
 * moving when that optimizer stopped producing cards — later slates were graded and simply had no card), /mr-dub
 * "Settled through Oct 15" (the newest day on which a Mr. Dub card settled), and /results + /bank-builder
 * "… – Mon, Oct 26" (the fold's real settled-through). Each surface computed its own date from a different
 * question and printed it under the same words.
 *
 * THE THREE QUESTIONS, NAMED SO THEY CANNOT BE CONFUSED AGAIN
 *
 *   1. "Results settled through <D>" — ONE LEDGER. The last day D through which that ledger is FULLY graded:
 *      every day ≤ D is decided, no-play days included. For the core paper ledger (Bank Builder + Moonshot,
 *      Rule S) that is the window end of its settled-receipts record — the fold (`protectedFold.foldedThrough`),
 *      which advances a day only when every placed lane of that day is decided, and advances through days on
 *      which no card was placed. Accessor: `ledgerSettledThrough` / `corePaperSettledThrough`.
 *
 *   2. "Last card settled <D>" — ONE LEDGER. The newest day on which a card of that ledger was decided. It is
 *      legitimately OLDER than (1) when no card was offered on the days since (on 10-28: Oct 15 vs Oct 26).
 *      It is never printed as "settled through". Accessor: `lastCardSettledDate`.
 *
 *   3. "Latest results <D>" — THE SITE. The newest day through which ANY current official record (a product
 *      ledger or a public-forecast ledger) is settled. It speaks for the newest record, not for all of them,
 *      so it is never worded "settled through" (one ledger may lag; its own page says so with (1)).
 *      Accessor: `siteLatestResultsDate` (== `newestSettledDate`, the Housekeeping 10-22 rule, unchanged).
 *
 * Pure: inputs are the canonical results projection and the dates the caller already holds. Nothing here
 * grades, folds, or reads settlement data on its own; the server wrapper (settled-through-server.ts) loads
 * the committed artifacts once per build.
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
 * (3) THE SITE — the newest settled date across the current official records.
 *
 * Rule (Housekeeping 10-22, unchanged): the newest of
 *   • every optimizer settled slate date (a slate with at least one decided card), and
 *   • the window end of every projection cell `isSettledRecordCell` accepts (product | forecast, RECEIPT_ERA |
 *     LIVE_LEDGER, LIVE, display-eligible, integer won/lost). PENDING_SETTLEMENT / UNRECEIPTED_GAP / frozen /
 *     superseded cells and the Parlay Lab family (whose windows end at the newest EVALUATED slate) never count.
 *
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

/** (3) under the name the surfaces use. */
export const siteLatestResultsDate = newestSettledDate;

/**
 * (1) ONE LEDGER — "results settled through" for a product's ledger: the window end of its CURRENT settled-receipts
 * record (product family, RECEIPT_ERA, LIVE, display-eligible). Null when the product has no such record.
 *
 * @param {{ cells?: unknown[] } | null | undefined} projection
 * @param {string} product e.g. "bank-builder" | "moonshot"
 * @returns {string | null}
 */
export function ledgerSettledThrough(projection, product) {
  const cell = (Array.isArray(projection?.cells) ? projection.cells : []).find(
    (c) => c?.family === "product" && c?.era === "RECEIPT_ERA" && c?.product === product && isSettledRecordCell(c),
  );
  return cell ? cell.window.to : null;
}

/** The products the core paper ledger (the protected bankroll, Rule S) settles together. */
export const CORE_PAPER_PRODUCTS = Object.freeze(["bank-builder", "moonshot"]);

/**
 * (1) THE CORE PAPER LEDGER — Mr. Dub's protected bankroll (Bank Builder + Moonshot fold together, one fold).
 * "Fully graded through" means BOTH products are, so the answer is the EARLIER of the two windows; on committed
 * data they are the same day (one fold writes both). Null when either product has no settled-receipts record.
 *
 * @param {{ cells?: unknown[] } | null | undefined} projection
 * @returns {string | null}
 */
export function corePaperSettledThrough(projection) {
  const dates = CORE_PAPER_PRODUCTS.map((p) => ledgerSettledThrough(projection, p));
  if (dates.some((d) => d === null)) return null;
  return [...dates].sort()[0];
}

/**
 * (2) ONE LEDGER — the newest day on which a card of the ledger was decided.
 *
 * Input is the ledger's own dated days, each carrying its events (the shape of mr-dub/daily-summary.json): a day
 * counts only when at least one event on it has status "settled". Never derived from a calendar.
 *
 * @param {Array<{ date?: string, events?: Array<{ status?: string }> }> | null | undefined} days
 * @returns {string | null}
 */
export function lastCardSettledDate(days) {
  const dates = (Array.isArray(days) ? days : [])
    .filter((d) => typeof d?.date === "string" && DATE_RE.test(d.date) && (d.events ?? []).some((e) => e?.status === "settled"))
    .map((d) => d.date);
  return dates.length ? dates.sort().at(-1) : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Oct 26" — the one short spelling every settled-through label uses. */
export function shortDay(iso) {
  if (typeof iso !== "string" || !DATE_RE.test(iso)) return null;
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** The label words, in one place, so no surface invents a fourth phrasing. */
export const SETTLED_LABELS = Object.freeze({
  ledger: "Results settled through",
  lastCard: "last card settled",
  site: "Latest results",
});

/**
 * One ledger's status line: "Results settled through Oct 26 · last card settled Oct 15". The second half is
 * dropped when it is the same day (nothing to distinguish) or unknown. Null when the ledger has no settled day.
 *
 * @param {{ settledThrough: string | null, lastCardSettled?: string | null }} input
 * @returns {string | null}
 */
export function ledgerSettledLine({ settledThrough, lastCardSettled = null }) {
  const through = shortDay(settledThrough);
  if (!through) return null;
  const last = shortDay(lastCardSettled);
  return last && lastCardSettled !== settledThrough
    ? `${SETTLED_LABELS.ledger} ${through} · ${SETTLED_LABELS.lastCard} ${last}`
    : `${SETTLED_LABELS.ledger} ${through}`;
}

/**
 * (2) for a CARD ledger whose last settled card is older than its newest slate: what happened on the slates since —
 * how many produced no card at all, and how many carry cards still awaiting a decision. /results said every newer
 * suggested-parlay slate was "awaiting grading" when each had been graded with no card generated (Oct 16 → 27).
 *
 * @param {{ lastCardSettled: string | null, slates: Array<{ date: string, cards: number }> }} input
 *   `slates` = the ledger's graded slates; `cards` = how many cards that slate carries.
 * @returns {{ noCard: number, awaiting: number }}
 */
export function slatesSinceLastCard({ lastCardSettled, slates }) {
  const after = (Array.isArray(slates) ? slates : []).filter((s) => typeof s?.date === "string" && DATE_RE.test(s.date) && (!lastCardSettled || s.date > lastCardSettled));
  return {
    noCard: after.filter((s) => !(s.cards > 0)).length,
    awaiting: after.filter((s) => s.cards > 0).length,
  };
}
