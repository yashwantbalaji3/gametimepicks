/**
 * MODEL vs SPORTSBOOK LINE for social graphics — the Command Center side of the ONE odds contract the website owns
 * (docs/odds-comparison-contract.md). Pure. It never fetches, never prices, never decides a lean: it takes the
 * website's own outputs and either returns a display view or says why the post must fall back to projection-only.
 *
 *   price        a provider price record exactly as the website stores it (e.g. `gtp.nba.prop-price@1`:
 *                line, book, bookTitle, overAmerican, underAmerican, capturedAt, eventId, providerAthleteId, family)
 *   evaluation   the result of the website's `evaluateMarket` (lib/consistency/market-evaluator.mjs) on the OFFICIAL
 *                snapshot for that same record — copied verbatim, never recomputed
 *   availability the website's odds-lane state for the sport (sports/odds/availability.mjs), e.g. "CAPTURED"
 *   eligibleBooks the website's eligible-operator allowlist (sports/odds/eligible-operators.mjs ELIGIBLE_OPERATOR_KEYS)
 *
 * The colour comes from the evaluator's LEAN (price-based: EV and edge thresholds), not from projection vs line, so a
 * social graphic can never show a side the website doesn't. "Model − line" is shown as a separate number.
 */
export const ODDS_COMPARISON_CONTRACT = "gtp.cc.odds-comparison@1";
export const ACCEPTED_EVALUATOR_VERSIONS = Object.freeze(["gtp.consistency.market-evaluator@1"]);
/** Social odds graphics stay off until the feed, display rights, API budget and tests are production-ready (founder). */
export const SOCIAL_ODDS_ENABLED = false;
export const BOOK_AVAILABILITY_NOTE = "Sportsbook availability varies by state."; // the website's one wording
export const REFUSAL = Object.freeze({
  GATED: "SOCIAL_ODDS_GATED",
  NO_PRICE: "NO_VERIFIED_PRICE",
  EVALUATOR_UNKNOWN: "EVALUATOR_VERSION_UNKNOWN",
  AVAILABILITY: "ODDS_NOT_CAPTURED",
  OPERATOR: "OPERATOR_NOT_ELIGIBLE",
  MISMATCH: "PRICE_EVALUATION_MISMATCH",
  AFTER_START: "AFTER_START",
  NOT_QUALIFIED: "EVALUATION_NOT_QUALIFIED",
});

const num = (x) => typeof x === "number" && Number.isFinite(x);
const LEAN_STYLE = { OVER: "over", UNDER: "under", NONE: "neutral" };

/**
 * @param {{ player: {name: string, team: string}, family: string, projection: number|null, price?: object|null,
 *           evaluation?: object|null, availability?: string|null, eligibleBooks?: string[], now: string,
 *           startUtc?: string|null, enabled?: boolean }} input
 * @returns {{ contract: string, mode: "comparison"|"projection-only", lineDependentHeld: boolean, reasons: string[],
 *             view: object }}
 */
export function comparisonView(input) {
  const { player, family, projection, price = null, evaluation = null, availability = null, eligibleBooks = [], now, startUtc = null, enabled = SOCIAL_ODDS_ENABLED } = input;
  const reasons = [];
  if (!enabled) reasons.push(REFUSAL.GATED);
  if (!price || !num(price.line) || !price.book || !price.capturedAt) reasons.push(REFUSAL.NO_PRICE);
  if (!evaluation || !ACCEPTED_EVALUATOR_VERSIONS.includes(evaluation.version)) reasons.push(REFUSAL.EVALUATOR_UNKNOWN);
  if (availability !== "CAPTURED") reasons.push(`${REFUSAL.AVAILABILITY}:${availability ?? "UNKNOWN"}`);
  if (price?.book && !eligibleBooks.includes(price.book)) reasons.push(REFUSAL.OPERATOR);
  // numbers copied, never recomputed: the evaluation must describe this exact record
  if (price && evaluation && (evaluation.line !== price.line || (evaluation.capturedAt ?? null) !== price.capturedAt)) reasons.push(REFUSAL.MISMATCH);
  if (startUtc && Date.parse(startUtc) <= Date.parse(now)) reasons.push(REFUSAL.AFTER_START);
  if (evaluation && evaluation.eligibility?.qualified !== true) reasons.push(REFUSAL.NOT_QUALIFIED, ...(evaluation.withheldReasons ?? []).map((r) => `evaluator:${r}`));

  const base = { player: player.name, team: player.team, family, projection: num(projection) ? projection : null };
  if (reasons.length) {
    // projection only: no line, no price, no side — and any graphic that needs the line is held, never improvised
    return { contract: ODDS_COMPARISON_CONTRACT, mode: "projection-only", lineDependentHeld: true, reasons, view: { ...base, style: "neutral" } };
  }
  const lean = evaluation.lean;
  return {
    contract: ODDS_COMPARISON_CONTRACT, mode: "comparison", lineDependentHeld: false, reasons: [],
    view: {
      ...base,
      line: price.line, book: price.book, bookTitle: price.bookTitle ?? price.book,
      overAmerican: num(price.overAmerican) ? price.overAmerican : null, underAmerican: num(price.underAmerican) ? price.underAmerican : null,
      lean, style: LEAN_STYLE[lean] ?? "neutral",
      // presentation only: the distance between the official projection and the line (not an edge, not an EV)
      modelMinusLine: num(projection) ? Math.round((projection - price.line) * 10) / 10 : null,
      capturedAt: price.capturedAt,
      quoteAgeMinutes: Math.max(0, Math.round((Date.parse(now) - Date.parse(price.capturedAt)) / 60000)),
      evaluatorVersion: evaluation.version,
      bookNote: BOOK_AVAILABILITY_NOTE,
    },
  };
}
