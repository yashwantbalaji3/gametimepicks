/**
 * THE FRESHNESS CONTRACT (§15) — eleven named clocks, and the rule that they are not interchangeable.
 *
 * Every surface on this site shows some notion of "when". Before this module there was one word for
 * all of them — "Updated" — and that word is a lie by omission: it lets a reader conclude that a
 * page rebuilt ten seconds ago is showing a prediction made ten seconds ago, and it lets an
 * engineer conclude that a two-year-old model-fit date means the live feed is broken.
 *
 * §15 names the two confusions that matter, and this module is built so neither is REPRESENTABLE
 * rather than merely discouraged:
 *
 *   1. "An old model-fit date does not automatically mean a live feed failed."
 *      → `feedHealth` can only read LIVE-domain clocks. MODEL_FIT_AT is not reachable from it.
 *
 *   2. "A current page build does not mean its prediction was generated now."
 *      → `predictionAge` can only read FORECAST-domain clocks. PAGE_BUILT_AT is not reachable from
 *        it, and an absent FORECAST_GENERATED_AT yields UNKNOWN — never a fallback to the build.
 *
 * The enforcement is `readClock`, which REFUSES a clock outside the domain the caller declared. A
 * cross-domain read is a thrown error, not a wrong number, because a wrong number here is invisible.
 *
 * ⚠ ABSENT IS NOT ZERO AND NOT FRESH. A missing clock returns UNKNOWN. The whole class of defect
 * this repo keeps rediscovering — missing ≠ zero, unknown ≠ up to date — lands here first.
 */

/** The eleven, exactly as §15 names them. */
export const CLOCK = Object.freeze({
  /** When the static HTML was generated. Says nothing about the age of anything ON the page. */
  PAGE_BUILT_AT: "PAGE_BUILT_AT",
  /** When we last successfully read the upstream source (schedule, roster, box score). */
  SOURCE_OBSERVED_AT: "SOURCE_OBSERVED_AT",
  /** When this event's forecast was computed. */
  FORECAST_GENERATED_AT: "FORECAST_GENERATED_AT",
  /** When the forecast stopped being allowed to change — the pre-kickoff freeze. */
  FORECAST_FROZEN_AT: "FORECAST_FROZEN_AT",
  /** When the model's parameters were last fitted. Provenance, NOT liveness. */
  MODEL_FIT_AT: "MODEL_FIT_AT",
  /** When the model last passed its out-of-sample bars. Provenance, NOT liveness. */
  MODEL_VALIDATED_AT: "MODEL_VALIDATED_AT",
  /** When the sportsbook price on the row was captured. */
  MARKET_CAPTURED_AT: "MARKET_CAPTURED_AT",
  /** When the live provider state on the row was observed. */
  LIVE_OBSERVED_AT: "LIVE_OBSERVED_AT",
  /** When a provider first reported the event final. NOT settlement. */
  FINAL_OBSERVED_AT: "FINAL_OBSERVED_AT",
  /** When WE graded it from official results. The only clock that may back a win/loss. */
  SETTLED_AT: "SETTLED_AT",
  /** When a previously published result was corrected. */
  CORRECTED_AT: "CORRECTED_AT",
});

export const DOMAIN = Object.freeze({
  BUILD: "BUILD",
  SOURCE: "SOURCE",
  FORECAST: "FORECAST",
  /** Model provenance. Deliberately separate from FORECAST: the model can be a year old and this
   *  event's forecast minutes old, and both statements are true at once. */
  MODEL: "MODEL",
  MARKET: "MARKET",
  LIVE: "LIVE",
  RESULT: "RESULT",
});

export const CLOCK_DOMAIN = Object.freeze({
  [CLOCK.PAGE_BUILT_AT]: DOMAIN.BUILD,
  [CLOCK.SOURCE_OBSERVED_AT]: DOMAIN.SOURCE,
  [CLOCK.FORECAST_GENERATED_AT]: DOMAIN.FORECAST,
  [CLOCK.FORECAST_FROZEN_AT]: DOMAIN.FORECAST,
  [CLOCK.MODEL_FIT_AT]: DOMAIN.MODEL,
  [CLOCK.MODEL_VALIDATED_AT]: DOMAIN.MODEL,
  [CLOCK.MARKET_CAPTURED_AT]: DOMAIN.MARKET,
  [CLOCK.LIVE_OBSERVED_AT]: DOMAIN.LIVE,
  [CLOCK.FINAL_OBSERVED_AT]: DOMAIN.RESULT,
  [CLOCK.SETTLED_AT]: DOMAIN.RESULT,
  [CLOCK.CORRECTED_AT]: DOMAIN.RESULT,
});

/**
 * What each clock does NOT mean. Carried in the contract rather than in a doc, because every one of
 * these sentences describes a mistake somebody has already made on this codebase.
 */
export const NOT_A_CLAIM_ABOUT = Object.freeze({
  [CLOCK.PAGE_BUILT_AT]: "the age of any prediction, price or score on the page",
  [CLOCK.SOURCE_OBSERVED_AT]: "whether the source AGREED with us, only that we reached it",
  [CLOCK.FORECAST_GENERATED_AT]: "when the model was fitted, or when the page was built",
  [CLOCK.FORECAST_FROZEN_AT]: "when the forecast was generated — a carried-forward forecast freezes later than it was made",
  [CLOCK.MODEL_FIT_AT]: "whether the live feed is working, or how old this event's forecast is",
  [CLOCK.MODEL_VALIDATED_AT]: "whether the model is currently eligible — that is a separate published state",
  [CLOCK.MARKET_CAPTURED_AT]: "whether the price is still available at the book",
  [CLOCK.LIVE_OBSERVED_AT]: "whether the event is still live — a final event has a live observation too",
  [CLOCK.FINAL_OBSERVED_AT]: "that the event is settled; a provider FINAL is not a grade",
  [CLOCK.SETTLED_AT]: "that the grade is still current — see CORRECTED_AT",
  [CLOCK.CORRECTED_AT]: "that the original publication was withdrawn, only that it changed",
});

export const CLOCK_STATE = Object.freeze({
  KNOWN: "KNOWN",
  /** The record carries no such clock. NOT zero, NOT fresh, NOT stale. */
  UNKNOWN: "UNKNOWN",
  /** Present but unparseable, or ahead of `asOf`. A clock in the future is a defect, not a fresh one. */
  INVALID: "INVALID",
});

const ms = (iso) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) ? t : null; };

/**
 * Read one clock, having DECLARED which domain the question belongs to.
 *
 * ⚠ THE CROSS-DOMAIN READ THROWS. This is the whole enforcement mechanism: a function asking about
 * feed liveness cannot accidentally reach MODEL_FIT_AT, because the attempt is an error rather than
 * a plausible-looking number. Silent wrongness is what §15 exists to prevent.
 */
export function readClock(record, clock, { domain, asOf }) {
  if (!(clock in CLOCK_DOMAIN)) throw new Error(`readClock: ${clock} is not one of the eleven named clocks`);
  if (domain === undefined) throw new Error(`readClock: a domain must be declared — an undeclared read is how PAGE_BUILT_AT came to answer questions about predictions`);
  if (CLOCK_DOMAIN[clock] !== domain) {
    throw new Error(`readClock: ${clock} is a ${CLOCK_DOMAIN[clock]} clock and cannot answer a ${domain} question (§15)`);
  }
  const t = ms(record?.[clock]);
  if (record?.[clock] == null) return { state: CLOCK_STATE.UNKNOWN, at: null, ageMs: null };
  if (t === null) return { state: CLOCK_STATE.INVALID, at: record[clock], ageMs: null, why: "unparseable" };
  const now = ms(asOf);
  if (now === null) throw new Error("readClock: asOf must be a parseable instant — a clock age is never read from the wall clock here");
  if (t > now) return { state: CLOCK_STATE.INVALID, at: record[clock], ageMs: null, why: "ahead of asOf" };
  return { state: CLOCK_STATE.KNOWN, at: record[clock], ageMs: now - t };
}

export const FEED_HEALTH = Object.freeze({
  FRESH: "FRESH",
  STALE: "STALE",
  /** No live observation on the record. Says nothing about the feed. */
  NOT_OBSERVED: "NOT_OBSERVED",
  INVALID: "INVALID",
});

/**
 * Is the LIVE feed current? (§15 rule 1)
 *
 * Reads LIVE_OBSERVED_AT and nothing else. A model fitted in 2024 cannot make this say STALE,
 * because MODEL_FIT_AT is not reachable through a DOMAIN.LIVE read.
 */
export function feedHealth({ record, asOf, staleAfterMs }) {
  if (!Number.isFinite(staleAfterMs)) throw new Error("feedHealth: staleAfterMs is required — staleness has no safe default");
  const live = readClock(record, CLOCK.LIVE_OBSERVED_AT, { domain: DOMAIN.LIVE, asOf });
  if (live.state === CLOCK_STATE.UNKNOWN) {
    return { state: FEED_HEALTH.NOT_OBSERVED, ageMs: null, basis: CLOCK.LIVE_OBSERVED_AT };
  }
  if (live.state === CLOCK_STATE.INVALID) {
    return { state: FEED_HEALTH.INVALID, ageMs: null, basis: CLOCK.LIVE_OBSERVED_AT, why: live.why };
  }
  return {
    state: live.ageMs > staleAfterMs ? FEED_HEALTH.STALE : FEED_HEALTH.FRESH,
    ageMs: live.ageMs,
    basis: CLOCK.LIVE_OBSERVED_AT,
  };
}

/**
 * How old is the PREDICTION? (§15 rule 2)
 *
 * Reads FORECAST_GENERATED_AT and nothing else. PAGE_BUILT_AT is unreachable, so a page rebuilt
 * this minute cannot present a week-old forecast as current — the honest answer when the forecast
 * carries no generation time is UNKNOWN, which is exactly the case the MLB carried-forward
 * forecasts produce.
 */
export function predictionAge({ record, asOf }) {
  const gen = readClock(record, CLOCK.FORECAST_GENERATED_AT, { domain: DOMAIN.FORECAST, asOf });
  return { state: gen.state, ageMs: gen.ageMs, at: gen.at, basis: CLOCK.FORECAST_GENERATED_AT };
}

/**
 * Which clocks a surface should SHOW. §15: "Each surface should show only the clocks relevant to the
 * user, but canonical data should retain precise semantics." So this narrows the display; it never
 * narrows the record.
 */
export const SURFACE_CLOCKS = Object.freeze({
  /** A live row: what the provider last said, and what the price was. */
  LIVE_ROW: Object.freeze([CLOCK.LIVE_OBSERVED_AT, CLOCK.MARKET_CAPTURED_AT]),
  /** A pre-game forecast row: when it was made and when it froze. NOT the build. */
  FORECAST_ROW: Object.freeze([CLOCK.FORECAST_GENERATED_AT, CLOCK.FORECAST_FROZEN_AT]),
  /** A methodology page: provenance, which is where fit/validation belong. */
  METHODOLOGY: Object.freeze([CLOCK.MODEL_FIT_AT, CLOCK.MODEL_VALIDATED_AT]),
  /** A settled result: our grade, and any correction to it. */
  RESULT_ROW: Object.freeze([CLOCK.FINAL_OBSERVED_AT, CLOCK.SETTLED_AT, CLOCK.CORRECTED_AT]),
  /** The footer, which is the ONLY place the build clock is a truthful headline. */
  SITE_FOOTER: Object.freeze([CLOCK.PAGE_BUILT_AT]),
  /** Ops: everything, because ops is where the distinctions are the point. */
  OPS: Object.freeze(Object.values(CLOCK)),
});

/**
 * Every clock appears on at least one surface, and no surface invents one. A clock nothing shows is
 * either dead or a gap, and both deserve to fail a test rather than sit unnoticed.
 */
export function surfaceCoverage() {
  const shown = new Set(Object.values(SURFACE_CLOCKS).flat());
  const all = new Set(Object.values(CLOCK));
  return {
    unshown: [...all].filter((c) => !shown.has(c)),
    unknown: [...shown].filter((c) => !all.has(c)),
  };
}
