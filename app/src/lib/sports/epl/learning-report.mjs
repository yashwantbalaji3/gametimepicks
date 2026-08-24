/**
 * IS THE MODEL ACTUALLY GETTING BETTER — AND IS IT WORTH ANYTHING?
 *
 * Two different questions, and a learning loop that answers only the first is how a project spends a
 * season congratulating itself. MLB answered the second here three separate times and got the same
 * reply: the model added nothing beyond the market. R&D was suspended on a preregistered stopping
 * rule rather than on someone's patience running out. EPL inherits that discipline from its first
 * graded match instead of its hundredth.
 *
 * WHAT THIS COMPUTES, and nothing else:
 *   - the model's mean log loss and Brier over graded matches;
 *   - the MARKET's, on exactly the same matches, from the de-vigged price recorded before kickoff;
 *   - the difference, with the sign stated in words so it cannot be misread;
 *   - whether the sample is large enough for any of that to mean anything.
 *
 * WHAT IT REFUSES TO DO. It does not fit anything, tune anything, or recommend a change. It reports.
 * A loop that both measures and adjusts on the same pass will always find an adjustment that helps,
 * because it is scoring the fit on the data that produced it.
 *
 * MATCHES WITHOUT A RECORDED PRICE ARE EXCLUDED FROM THE COMPARISON — not counted as a market miss.
 * The first EPL match ever graded has no baseline because the market was not being persisted yet,
 * and an absent price is a gap in our records, never evidence about the market.
 */

/** Below this, a mean is an anecdote with a decimal point. Stated once, used everywhere. */
export const MIN_SAMPLE_FOR_COMPARISON = 30;

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x, n = 6) => (x == null ? null : Number(x.toFixed(n)));

/**
 * @param rows  graded-forecasts.jsonl entries, newest or oldest first — order is irrelevant
 * @param opts.minSample  override only for testing the boundary itself
 */
export function buildEplLearningReport(rows, { minSample = MIN_SAMPLE_FOR_COMPARISON } = {}) {
  const graded = (rows ?? []).filter((r) => r?.scores && Number.isFinite(r.scores.logLoss));
  const paired = graded.filter((r) => r?.market?.scores && Number.isFinite(r.market.scores.logLoss));

  const modelAll = { n: graded.length, logLoss: round(mean(graded.map((r) => r.scores.logLoss))), brier: round(mean(graded.map((r) => r.scores.brier))) };

  // The comparison runs ONLY on matches where both spoke. Averaging the model over 40 matches and
  // the market over the 12 that happened to carry a price compares two different seasons.
  const model = { logLoss: round(mean(paired.map((r) => r.scores.logLoss))), brier: round(mean(paired.map((r) => r.scores.brier))) };
  const market = { logLoss: round(mean(paired.map((r) => r.market.scores.logLoss))), brier: round(mean(paired.map((r) => r.market.scores.brier))) };

  // Lower log loss is better, so a NEGATIVE difference means the model beat the price. The sign is a
  // classic place to be quietly wrong, so the verdict below is derived once and stated in words.
  const logLossDelta = model.logLoss != null && market.logLoss != null ? round(model.logLoss - market.logLoss) : null;
  const brierDelta = model.brier != null && market.brier != null ? round(model.brier - market.brier) : null;

  let comparison;
  if (paired.length === 0) {
    comparison = { state: "NO_PAIRED_MATCHES", detail: "no graded match carries a price recorded before kickoff, so the model has not been compared to anything." };
  } else if (paired.length < minSample) {
    comparison = {
      state: "SAMPLE_TOO_SMALL",
      detail: `${paired.length} of ${minSample} matches needed before a difference means anything. The figures below are reported for transparency and support no conclusion in either direction.`,
    };
  } else {
    comparison = {
      state: logLossDelta < 0 ? "MODEL_AHEAD" : logLossDelta > 0 ? "MODEL_BEHIND" : "LEVEL",
      detail: logLossDelta < 0
        ? `the model's mean log loss is ${Math.abs(logLossDelta)} lower than the market's over ${paired.length} matches.`
        : `the model's mean log loss is ${Math.abs(logLossDelta)} HIGHER than the market's over ${paired.length} matches — it is losing to the price it stood next to.`,
    };
  }

  /*
   * COVERAGE ACCOUNTING (P196 · Release D). An unpaired match is excluded from the comparison —
   * that rule stands — but exclusion without a cause makes "is pairing failing for a fixable
   * reason?" unanswerable. Every unpaired row is counted BY CAUSE: NO_PRICE_ON_FORECAST is
   * reality (nothing was posted); the MALFORMED_/AMBIGUOUS_/UNPLACEABLE_ causes are OUR defects
   * and each one showing up here is an engineering item, not a reality gate. Rows graded before
   * causes were recorded are named as exactly that rather than folded into either bucket.
   */
  const unpaired = graded.filter((r) => !(r?.market?.scores && Number.isFinite(r.market.scores.logLoss)));
  const byCause = {};
  for (const r of unpaired) {
    const cause = r.marketAbsence ?? "UNRECORDED_CAUSE_PRE_P196";
    byCause[cause] = (byCause[cause] ?? 0) + 1;
  }

  return {
    sample: { graded: graded.length, pairedWithMarket: paired.length, minSampleForComparison: minSample },
    coverage: {
      paired: paired.length,
      unpaired: { total: unpaired.length, byCause },
      engineeringOwnedCauses: Object.keys(byCause).filter((c) => c !== "NO_PRICE_ON_FORECAST" && c !== "UNRECORDED_CAUSE_PRE_P196"),
    },
    model: modelAll,
    comparison: { ...comparison, onPairedMatches: { model, market, logLossDelta, brierDelta } },
    stoppingRule: stoppingRule(paired.length, logLossDelta, minSample),
  };
}

/**
 * THE STOPPING RULE, preregistered here rather than decided later when the numbers are known.
 *
 * The failure mode it exists to prevent is not a wrong answer, it is an endless one: a model that
 * loses to the market, gets a tweak, loses again, gets another tweak, and consumes a season. MLB ran
 * that loop three times before a rule was written down. Writing it before EPL has a sample means it
 * cannot be adjusted to spare a result.
 *
 * `minSample` is threaded through so the boundary can be tested; the DECISION thresholds are fixed.
 */
export function stoppingRule(pairedCount, logLossDelta, minSample = MIN_SAMPLE_FOR_COMPARISON) {
  if (pairedCount < minSample || logLossDelta == null) {
    return { state: "NOT_YET_ASSESSABLE", detail: `the rule applies from ${minSample} paired matches; there are ${pairedCount}.` };
  }
  if (logLossDelta >= 0.02) {
    /*
     * Every modelled market in the baseball lane reached exactly this verdict and was demoted to
     * market context. That precedent is the reason for the threshold and belongs in the reasoning;
     * it does not belong in the shipped string, where naming another lane inside this one is what
     * the cross-lane isolation guard exists to prevent. The verdict has to stand on its own terms.
     */
    return {
      state: "STOP_AND_DEMOTE",
      detail: "the model is materially worse than the market over a real sample. It becomes market context rather than a prediction surface. Do not tune and re-run: that is the loop this rule exists to end.",
    };
  }
  if (logLossDelta > -0.005) {
    return {
      state: "NO_MEASURABLE_ADVANTAGE",
      detail: "the model tracks the market without beating it. Publishing the distribution stays honest; claiming it adds information does not.",
    };
  }
  return {
    state: "CONTINUE",
    detail: "the model is ahead of the market by more than the noise floor. Continue, and re-examine at every doubling of the sample.",
  };
}
