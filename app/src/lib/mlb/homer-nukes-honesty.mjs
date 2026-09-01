/**
 * HOMER NUKES — the board's honest-limits sentence, from the settled record rather than asserted.
 *
 * The sentence used to be typed into the generator: "This board has no settled track record yet,
 * and no home-run market price is fetched…". True the day it was written, and still being published
 * fourteen graded slates later — on the same page as a track-record table, so /homer-nukes said both
 * that it had no settled record and that it had graded 70 picks.
 *
 * It sat beside a second defect that made the pair look coherent: the page counted hits by filtering
 * on `p.homered`, a field the settlement artifact has never written (it records `result: "hit" |
 * "miss"`). The numerator was therefore always zero, so the table read "0 of 70 picks homered" —
 * for a model that actually hit 11 of 60 graded picks against 14.7 expected. One sentence claimed no
 * record; the other reported a catastrophic one; neither was true.
 *
 * ONE RULE, TWO CALLERS. The generator stamps this into the board it writes, and the page renders it
 * from the live record — a stored copy is a snapshot, and yesterday's board must not keep asserting
 * yesterday's record. Both call this so they cannot disagree.
 *
 * Pure: the record is passed in.
 */

/** The half that is true regardless of the record: no market price is fetched, so no market claim. */
const NO_MARKET =
  "no home-run market price is fetched, so it makes no claim to beat a sportsbook. It is the model's own read, published so it can be measured.";

/**
 * @param {{gradedPicks?: number, actual?: number, predicted?: number}|null} record
 *        the committed `homer-nukes/record.json`, or null when it cannot be read
 */
export function homerNukesHonestLimit(record) {
  const graded = typeof record?.gradedPicks === "number" ? record.gradedPicks : null;

  /*
   * An unreadable record yields the no-record wording. "We could not read it" and "nothing has been
   * graded" are different facts, but they share one safe sentence — the unsafe direction is claiming
   * a record we cannot see.
   */
  if (graded == null || graded === 0) return `This board has no settled track record yet, and ${NO_MARKET}`;

  const actual = typeof record.actual === "number" ? record.actual : null;
  const predicted = typeof record.predicted === "number" ? record.predicted : null;
  const summary =
    actual != null && predicted != null
      ? `${actual} of ${graded} graded picks homered against ${predicted.toFixed(1)} expected`
      : `${graded} picks have been graded`;

  /*
   * No rate, at any sample size. A board of ~25% picks is supposed to miss most of the time, so a
   * percentage over sixty picks is noise with a percent sign on it — the counts and the expectation
   * are what a reader can actually check.
   */
  return `Settled from official box scores: ${summary}. No accuracy claim is made at this sample size, and ${NO_MARKET}`;
}
