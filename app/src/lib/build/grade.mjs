/**
 * Build leg grade — model confidence, versioned and gated (Program 146 · evening R1).
 *
 * WHAT A GRADE IS HERE, EXACTLY. Model CONFIDENCE — how firmly the model holds its own estimate,
 * given fresh inputs and complete leg data. It is NOT pick quality, NOT expected profit, and NOT a
 * model-vs-market comparison: this model's settled record shows it does not beat the market
 * overall, so any grade implying "this pick is good" would be a claim the evidence contradicts.
 * The explanation string carries that caveat verbatim and a guard keeps it there.
 *
 * ELIGIBILITY IS THE POINT. A leg may be graded ONLY when:
 *   1. the source provided a real model probability (never derived from odds — the Release F rule),
 *   2. the leg's source artifact is the CURRENT product date (stale estimates are not confidence),
 *   3. the leg data is complete enough to know what is being graded (game, market, price).
 * Everything else is UNGRADED with a stated reason — absence over invention, the standing rule.
 */

export const GRADE_RUBRIC_VERSION = 1;

/** Confidence bands over the model's own probability. Deliberately coarse — three bands is what a
 *  probability estimate with this model's measured error can support; finer would be false precision. */
const BANDS = Object.freeze([
  { grade: "A", min: 0.6, meaning: "the model holds this estimate firmly" },
  { grade: "B", min: 0.52, meaning: "the model leans this way" },
  { grade: "C", min: 0, meaning: "the model's estimate is close to a coin flip" },
]);

/**
 * Grade one leg. Pure and deterministic.
 *
 * @param {{ modelProbability?: number|null, sourceDate?: string|null, gameId?: string|number|null,
 *           market?: string, americanOdds?: number }} leg
 * @param {{ productDate: string }} ctx  the current ET product date
 * @returns {{ eligible: boolean, grade: string|null, rubricVersion: number,
 *             components: object, explanation: string, ungradedReason: string|null }}
 */
export function gradeLeg(leg, { productDate }) {
  if (!productDate) throw new Error("gradeLeg: productDate is required");

  const base = { rubricVersion: GRADE_RUBRIC_VERSION, grade: null, eligible: false, components: {} };

  if (typeof leg.modelProbability !== "number" || !Number.isFinite(leg.modelProbability)) {
    return { ...base, ungradedReason: "not modelled — this leg shows a price tier only", explanation: "The source provides no model probability for this leg, so no confidence grade is possible. The price tier is market information, not a model view." };
  }
  if (leg.modelProbability <= 0 || leg.modelProbability >= 1) {
    return { ...base, ungradedReason: "model probability out of range", explanation: "The source's probability is outside (0,1) — treated as unmodelled rather than trusted." };
  }
  if (!leg.sourceDate || leg.sourceDate !== productDate) {
    return {
      ...base,
      ungradedReason: `model estimate is stale (from ${leg.sourceDate ?? "an unknown date"}, product date ${productDate})`,
      explanation: "The model's estimate comes from an earlier slate. A stale estimate is not confidence, so the leg stays ungraded until today's generation covers it.",
    };
  }
  const complete = leg.gameId != null && !!leg.market && typeof leg.americanOdds === "number";
  if (!complete) {
    return { ...base, ungradedReason: "incomplete leg data (game, market, or price missing)", explanation: "Part of what would be graded is missing, so no grade is issued." };
  }

  // Confidence is over the model's own probability of the pick side; a 30% longshot the model firmly
  // believes is 30% is LOW confidence in the pick occurring — the band reflects occurrence.
  const band = BANDS.find((b) => leg.modelProbability >= b.min) ?? BANDS[BANDS.length - 1];
  return {
    rubricVersion: GRADE_RUBRIC_VERSION,
    eligible: true,
    grade: band.grade,
    components: {
      modelProbability: leg.modelProbability,
      freshness: "current-slate",
      completeness: "complete",
      band: band.meaning,
    },
    ungradedReason: null,
    explanation:
      `Model confidence ${band.grade}: ${band.meaning} (${(leg.modelProbability * 100).toFixed(1)}% on fresh, complete inputs). ` +
      "Confidence is not a prediction of profit — the settled record shows the model does not beat the market overall.",
  };
}
