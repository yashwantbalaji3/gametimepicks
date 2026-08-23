/**
 * DOES THE OFFICIAL RESULTS CORPUS COVER THE CARD WE ACTUALLY PUBLISHED?
 *
 * The UFC settlement path — paper cards, the model-vs-market comparison, the gate's settlement
 * stage — all read one artifact: a corpus scraped from ufcstats.com by a third party. That corpus
 * is not published the moment a card ends. On 2026-08-23 its newest event was 2026-08-15 while ten
 * bouts fought the previous night sat waiting to be graded against it.
 *
 * Every symptom of that looked like a healthy no-op. The grader printed NOTHING_NEW, which is what
 * a closed loop prints. The paper cards read "pending", which is what an ungraded card reads before
 * anything is wrong. The corpus itself reported "fresh", because its bar was 120 days. Three
 * surfaces, none of them lying, and none of them able to say the one thing that was true: we are
 * waiting on somebody else's publication.
 *
 * THE COMPARISON THIS MAKES is the only one that can tell the difference, and it needs a fact the
 * scrape pipeline does not have — the date of the card WE published. A corpus eight days behind is
 * perfectly healthy in a week with no card, and is a stalled source in a week with one.
 *
 * It reports a STATE, never a verdict about the source's reliability, and an unreadable artifact
 * yields UNKNOWN rather than a problem: "we could not read it" and "it is behind" are different
 * facts, and only one of them is about the world.
 */

export const COVERAGE = Object.freeze({
  /** The corpus contains the card we published. Settlement can proceed. */
  COVERED: "COVERED",
  /** Our card is newer than anything in the corpus. Waiting on the upstream publication. */
  AWAITING_SOURCE: "AWAITING_SOURCE",
  /** One side or the other could not be read. Never reported as a lag. */
  UNKNOWN: "UNKNOWN",
});

const dayOf = (v) => {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/**
 * @param {object} o
 * @param {string|null} o.cardEventDate     the day of the card we published (YYYY-MM-DD)
 * @param {string|null} o.corpusLatestEvent the corpus's own newest event date
 * @param {string|null} [o.nowIso]          used only to report how long the wait has run
 */
export function resultsCoverage({ cardEventDate, corpusLatestEvent, nowIso = null }) {
  const card = dayOf(cardEventDate);
  const corpus = dayOf(corpusLatestEvent);
  if (!card || !corpus) {
    return { state: COVERAGE.UNKNOWN, cardEventDate: card, corpusLatestEvent: corpus, lagDays: null, waitingDays: null };
  }
  /*
   * COVERED is `corpus >= card`, not `corpus === card`. The corpus is a rolling window over many
   * events; once it has reached our card's day or passed it, that card is in it. Requiring equality
   * would report AWAITING_SOURCE every time a LATER card had already landed, which is the opposite
   * of the truth.
   */
  const covered = corpus >= card;
  const lagDays = Math.round((Date.parse(`${card}T00:00:00Z`) - Date.parse(`${corpus}T00:00:00Z`)) / 86_400_000);
  const now = nowIso ? dayOf(nowIso) : null;
  return {
    state: covered ? COVERAGE.COVERED : COVERAGE.AWAITING_SOURCE,
    cardEventDate: card,
    corpusLatestEvent: corpus,
    /** How far the corpus sits behind our card. Zero or negative once covered. */
    lagDays,
    /** How long we have been waiting, which is a different number and the one a reader feels. */
    waitingDays: covered || !now ? null : Math.round((Date.parse(`${now}T00:00:00Z`) - Date.parse(`${card}T00:00:00Z`)) / 86_400_000),
  };
}

/** Reader-facing, and it must never imply the cards lost or that anything is wrong with them. */
export function coverageNote(cov) {
  if (cov.state === COVERAGE.COVERED) return null;
  if (cov.state === COVERAGE.UNKNOWN) return "The official results artifact could not be read, so whether this card has been graded is unknown.";
  const waited = cov.waitingDays != null && cov.waitingDays > 0
    ? ` It has been ${cov.waitingDays} day${cov.waitingDays === 1 ? "" : "s"}.`
    : "";
  return `Awaiting official results. The results source we grade from has published nothing later than ${cov.corpusLatestEvent}, and this card was fought on ${cov.cardEventDate}, so these cards cannot be settled yet.${waited} They are not pending because of anything about the cards themselves.`;
}
