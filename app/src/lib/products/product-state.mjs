/**
 * Daily-product operating state — one contract for Bank Builder, Moonshot, the homepage product
 * cards, and Mr. Dub's Portfolio (Program 140).
 *
 * THE DEFECT THIS FIXES. `/bank-builder` rendered "Live today" above cards that had not been
 * regenerated since 2026-07-21, because the freshness badge was fed the MLB SLATE date — an
 * artifact the daily board keeps current — while the cards below it come from a different artifact
 * on a different (and, it turned out, entirely unscheduled) generator. The badge was measuring one
 * thing and sitting above another.
 *
 * The rule this encodes: **a product's freshness may only be derived from that product's own
 * artifact.** Never from a sibling's date, never from the slate, never from the build time.
 *
 * The second thing it encodes is the distinction the founder asked for: OPERATIONAL state versus
 * MODEL outcome. "We ran and nothing qualified" and "we never ran" both produce an empty page, and
 * before this they rendered identically. One is model discipline; the other is an outage.
 */

export const PRODUCT_STATES = {
  /** No artifact for the current product date. The generator did not run. NOT a no-play. */
  NOT_RUN: "NOT_RUN",
  /** An artifact exists but the inputs it needs are absent. */
  INPUTS_MISSING: "INPUTS_MISSING",
  /** Inputs exist but predate the current product date — generating from them would be dishonest. */
  INPUTS_STALE: "INPUTS_STALE",
  /** The generator ran and failed. */
  GENERATION_FAILED: "GENERATION_FAILED",
  /** The generator ran to completion for the current date and nothing met policy. A REAL no-play. */
  COMPLETED_NO_QUALIFIED_CARD: "COMPLETED_NO_QUALIFIED_CARD",
  /** A card is published for the current date. */
  CARD_PUBLISHED: "CARD_PUBLISHED",
  /** A published card whose events have started/finished but is not yet graded. */
  AWAITING_SETTLEMENT: "AWAITING_SETTLEMENT",
  /** Graded from official results. */
  SETTLED: "SETTLED",
};

/** Only these may say anything resembling "today". */
const CURRENT = new Set([
  PRODUCT_STATES.COMPLETED_NO_QUALIFIED_CARD,
  PRODUCT_STATES.CARD_PUBLISHED,
  PRODUCT_STATES.AWAITING_SETTLEMENT,
  PRODUCT_STATES.SETTLED,
]);

/** Only this one may say "live". A no-play is current but NOT live — there is nothing running. */
const LIVE = new Set([PRODUCT_STATES.CARD_PUBLISHED, PRODUCT_STATES.AWAITING_SETTLEMENT]);

export const isCurrent = (state) => CURRENT.has(state);
export const isLive = (state) => LIVE.has(state);

/**
 * Derive a product's state from ITS OWN artifact.
 *
 * @param {object}  o
 * @param {string}  o.productDate        today's product date (ET)
 * @param {string?} [o.artifactDate]     the `date` field of the product's own artifact
 * @param {number}  [o.publishedCards]   cards published on that artifact
 * @param {boolean} [o.generatorFailed]  the generator reported a failure
 * @param {boolean} [o.inputsMissing]    required inputs were absent
 * @param {string?} [o.inputsDate]       the date of the inputs used
 * @param {boolean} [o.settled]          the published card has been graded
 * @param {boolean} [o.eventsStarted]    the card's events have begun
 */
export function deriveProductState({
  productDate,
  artifactDate = null,
  publishedCards = 0,
  generatorFailed = false,
  inputsMissing = false,
  inputsDate = null,
  settled = false,
  eventsStarted = false,
}) {
  // No artifact for today at all — the generator did not run. This is the case that spent fifteen
  // days rendering as a no-play, and it is the single most important distinction in this module.
  if (artifactDate == null || artifactDate !== productDate) return PRODUCT_STATES.NOT_RUN;

  if (generatorFailed) return PRODUCT_STATES.GENERATION_FAILED;
  if (inputsMissing) return PRODUCT_STATES.INPUTS_MISSING;
  if (inputsDate != null && inputsDate < productDate) return PRODUCT_STATES.INPUTS_STALE;

  if (publishedCards > 0) {
    if (settled) return PRODUCT_STATES.SETTLED;
    return eventsStarted ? PRODUCT_STATES.AWAITING_SETTLEMENT : PRODUCT_STATES.CARD_PUBLISHED;
  }
  // Ran to completion for today, nothing qualified. The honest no-play.
  return PRODUCT_STATES.COMPLETED_NO_QUALIFIED_CARD;
}

/**
 * User-facing label. Never says "live" unless a card is actually running, and never presents a
 * missing run as a decision the model made.
 */
/**
 * @param {string} state
 * @param {{artifactDate?: string|null, productDate?: string|null}} [opts]
 */
export function productStateLabel(state, { artifactDate = null, productDate = null } = {}) {
  switch (state) {
    case PRODUCT_STATES.CARD_PUBLISHED: return "Live today";
    case PRODUCT_STATES.AWAITING_SETTLEMENT: return "Awaiting settlement";
    case PRODUCT_STATES.SETTLED: return "Settled";
    case PRODUCT_STATES.COMPLETED_NO_QUALIFIED_CARD: return "No qualified card today";
    case PRODUCT_STATES.GENERATION_FAILED: return "Update failed — being investigated";
    case PRODUCT_STATES.INPUTS_MISSING: return "Waiting on today's data";
    case PRODUCT_STATES.INPUTS_STALE: return "Waiting on today's data";
    case PRODUCT_STATES.NOT_RUN:
    default: {
      // Deliberately NOT "no qualified card": we do not know that, because nothing ran.
      if (artifactDate && productDate && artifactDate < productDate) {
        const days = Math.round((Date.parse(`${productDate}T00:00:00Z`) - Date.parse(`${artifactDate}T00:00:00Z`)) / 86_400_000);
        return `Not updated today · last card ${artifactDate}${days > 1 ? ` (${days} days ago)` : ""}`;
      }
      return "Not updated today";
    }
  }
}

/**
 * One line explaining the state to a user, in product terms rather than engineering terms.
 * A material outage is disclosed; it is just not disclosed in the vocabulary of a stack trace.
 */
export function productStateExplanation(state) {
  switch (state) {
    case PRODUCT_STATES.CARD_PUBLISHED: return "Today's card is published and its events have not started.";
    case PRODUCT_STATES.AWAITING_SETTLEMENT: return "Today's card is placed; results are graded from official box scores once games finish.";
    case PRODUCT_STATES.SETTLED: return "Today's card has been graded from official results.";
    case PRODUCT_STATES.COMPLETED_NO_QUALIFIED_CARD:
      return "Today's slate was checked in full and nothing met the card's qualification policy. No card is published rather than forcing one.";
    case PRODUCT_STATES.GENERATION_FAILED: return "Today's update did not complete. The last published card is shown below.";
    case PRODUCT_STATES.INPUTS_MISSING:
    case PRODUCT_STATES.INPUTS_STALE: return "Today's source data has not arrived yet, so no card has been assessed.";
    case PRODUCT_STATES.NOT_RUN:
    default:
      return "This product has not been updated for today's slate, so no card has been assessed. This is an operational gap, not a decision by the model.";
  }
}

/**
 * The freshness date a surface may display — the product's OWN artifact date, or null.
 * @param {{artifactDate?: string|null}} [opts]
 */
export function productFreshnessDate({ artifactDate = null } = {}) {
  return typeof artifactDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(artifactDate) ? artifactDate : null;
}
