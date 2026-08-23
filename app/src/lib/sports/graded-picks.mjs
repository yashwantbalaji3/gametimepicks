/**
 * ONE SHAPE FOR "WHAT THE MODEL SAID, AND WHAT ACTUALLY HAPPENED" — ACROSS EVERY SPORT.
 *
 * Each sport already grades its own picks against official results, and each did it in a different
 * shape, in a different place, published to a different degree:
 *
 *   MLB   33,944 graded prop leans in a JSONL validation ledger — rich, and on no page.
 *   EPL   7 graded matches behind loadEplGradedRecord — rendered, and only on /epl.
 *   NFL   17 graded forecasts across three dated internal files — rendered as prose, not rows.
 *   UFC   6 graded bouts in the model-vs-market ledger — internal, and the PUBLIC graded artifact
 *         it should have fed reported zero.
 *
 * So a reader could see what a model predicted, and on most sports could not see how those
 * predictions turned out. That asymmetry always flatters: forecasts are published continuously and
 * results are published never, which is the shape of every tipster site that has ever existed.
 *
 * ── WHAT THIS REFUSES TO DO ────────────────────────────────────────────────────────────────────
 *
 * A VOID IS NOT A MISS. A pick whose condition never held — a fighter who did not fight, a batter
 * who did not take the field, a match with no winner — is excluded from every count rather than
 * scored as a loss. Counting them as losses understates; counting them as wins overstates; only
 * excluding them is honest, and it is the reason conditional projections can be published at all.
 *
 * A HIT RATE IS NOT A VERDICT. Every record carries a sampleState, and below a real sample the
 * accompanying note says in words that the figures support nothing. Six bouts and seven matches are
 * noise; publishing them with a percent sign and no qualifier would be the dishonest version of
 * being transparent.
 *
 * THE LIST IS NOT THE RECORD. Counts are computed over EVERY graded row; the rows shipped to a page
 * are the most recent slice. An artifact that counted only what it displayed would silently shrink
 * its own denominator, so `counted` and `shown` are separate numbers and both are published.
 */

export const SAMPLE_STATE = Object.freeze({
  NONE: "NOTHING_GRADED",
  TOO_SMALL: "TOO_SMALL_TO_ASSESS",
  EMERGING: "EMERGING",
  ASSESSABLE: "ASSESSABLE",
});

/**
 * Below this many graded picks no rate is presented as meaningful. It is not a magic number so much
 * as a floor: a hit rate over a few dozen binary outcomes has a confidence interval wide enough to
 * contain almost any claim, so quoting one is quoting noise.
 */
export const ASSESSABLE_MIN = 200;
const EMERGING_MIN = 30;

export function sampleStateFor(n) {
  if (!n) return SAMPLE_STATE.NONE;
  if (n < EMERGING_MIN) return SAMPLE_STATE.TOO_SMALL;
  if (n < ASSESSABLE_MIN) return SAMPLE_STATE.EMERGING;
  return SAMPLE_STATE.ASSESSABLE;
}

/** The sentence that must travel with the numbers. Derived, so it cannot drift from the count. */
export function sampleNote(state, n) {
  switch (state) {
    case SAMPLE_STATE.NONE:
      return "Nothing has been graded yet, so there is no record to show — not a record of zero.";
    case SAMPLE_STATE.TOO_SMALL:
      return `${n} graded ${n === 1 ? "pick" : "picks"} is far too few to say anything about accuracy. These are published so the predictions can be checked, not as evidence that they work.`;
    case SAMPLE_STATE.EMERGING:
      return `${n} graded picks is still a small sample. A hit rate over this many outcomes has a wide enough margin of error to be consistent with almost any true accuracy.`;
    default:
      return `${n} graded picks. A hit rate is still not proof a model beats a price — that requires a preregistered comparison against the closing line, which is tracked separately per sport.`;
  }
}

/**
 * Build a sport's record from picks already in the common shape.
 *
 * @param {object} o
 * @param {string} o.sport
 * @param {string} o.label
 * @param {Array<object>} o.picks   newest first
 * @param {number} [o.shown]        how many rows to publish
 * @param {string} o.what           what these picks ARE, in the sport's own terms
 * @param {string|null} [o.caveat]  anything a reader must know to read them correctly
 */
export function buildGradedRecord({ sport, label, picks, shown = 100, what, caveat = null }) {
  const all = picks ?? [];
  // A void never enters the denominator. See the header: this is the difference between an honest
  // conditional projection and one that quietly counts its own unmet conditions as losses.
  const decided = all.filter((p) => p.hit === true || p.hit === false);
  const hits = decided.filter((p) => p.hit === true).length;
  const voided = all.length - decided.length;
  const state = sampleStateFor(decided.length);
  return {
    sport,
    label,
    what,
    caveat,
    counts: {
      /** Every graded row, not just the ones displayed. */
      counted: decided.length,
      hits,
      misses: decided.length - hits,
      voided,
      shown: Math.min(shown, all.length),
      total: all.length,
    },
    /** Null below a real sample — never a percentage presented without its qualifier. */
    hitRate: decided.length ? Number((hits / decided.length).toFixed(4)) : null,
    sampleState: state,
    sampleNote: sampleNote(state, decided.length),
    picks: all.slice(0, shown),
  };
}
