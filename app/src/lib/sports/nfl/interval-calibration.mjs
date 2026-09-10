/**
 * INTERVAL CALIBRATION — does an interval labelled 80% actually contain the result 80% of the time?
 *
 * WHY THIS EXISTS. On 2026-09-10 the NE @ SEA forecast was reviewed after the fact. The headline
 * looked like a bad miss: projected 46 total points, actual 23. It was not the interesting failure.
 * The winner was right, the margin was right to within 3 points and sat comfortably inside its
 * published interval, and the total landed in roughly the bottom 5% of a head whose held-out
 * coverage was 78.6% against a nominal 80% — an honestly-calibrated interval doing exactly what an
 * honestly-calibrated interval does one game in twenty.
 *
 * The real finding was already sitting in the settlement ledger, measured and unread: across 43
 * settled preseason forecasts, the MARGIN interval this project prints on every game page as an
 * 80% interval had contained the actual result 28 times — 65.1%. That is not a tail. Binomially
 * that is z = -2.44, and it means the number beside the word "80%" was wrong in a direction that
 * flatters the model, on every game, for a whole preseason.
 *
 * Nothing was watching, because nothing in this repo compared a published confidence label against
 * its own realised frequency. The accuracy ledger computed the coverage and stopped there; the
 * public graded-picks artifact carried only the Winner market, so margin and total accuracy were
 * measured into a private file no surface read.
 *
 * WHAT THIS DOES AND DELIBERATELY DOES NOT DO. It measures, classifies, and proposes a scale
 * factor. It does not apply one. Silently widening an interval until the coverage number looks
 * right is fitting the label to the sample — the same move this project refuses everywhere else,
 * and it would destroy the evidence that the head is miscalibrated in the first place. Adoption
 * goes through a preregistration and a held-out evaluation like every other promotion here.
 *
 * THE MINIMUM SAMPLE IS LOAD-BEARING. Coverage on five games is noise: a run of three misses out of
 * five reads as 40% coverage and z = -2.2, which would fire this alarm on a perfectly calibrated
 * head. Below the floor the verdict is INSUFFICIENT and carries no claim at all — an alarm that
 * fires on a quiet week teaches everyone to ignore it, which is how the last one went unread.
 */

/** Preregistered thresholds. Frozen before the 2026 regular season, from the preseason cohort. */
export const CALIBRATION_BARS = Object.freeze({
  /* Below this, no claim. 20 is where a one-sided binomial can separate 65% from 80% at all. */
  MIN_SAMPLE: 20,
  /* Two standard deviations. Not three: this is a monitor that opens an investigation, not a
     promotion gate, and a miscalibrated public confidence label is worth investigating early. */
  Z_THRESHOLD: 2,
});

/**
 * Inverse standard-normal CDF (Acklam's rational approximation, |error| < 1.15e-9).
 *
 * Needed because the implied scale factor is a ratio of normal quantiles, and importing a stats
 * package for one function would be a strange trade in a repo with no such dependency.
 */
export function normInv(p) {
  if (!(p > 0 && p < 1)) return NaN;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425, pHigh = 1 - pLow;
  let q, r;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > pHigh) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
             ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
         (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * Judge one interval's realised coverage.
 *
 * @param {object} o
 * @param {number} o.n           settled forecasts in this cohort
 * @param {number} o.covered     how many contained the actual result
 * @param {number} o.nominal     the coverage we PRINT (0.80 for a p10–p90 interval)
 * @returns {{state,z,observed,expected,n,covered,impliedScale,claim}}
 */
export function coverageVerdict({ n, covered, nominal = 0.8 } = {}) {
  const insufficient = (reason) => ({
    state: "INSUFFICIENT", z: null, observed: null, expected: null,
    n: n ?? 0, covered: covered ?? 0, impliedScale: null, claim: reason,
  });
  if (!Number.isFinite(n) || !Number.isFinite(covered) || n <= 0) return insufficient("no settled forecasts to judge");
  if (n < CALIBRATION_BARS.MIN_SAMPLE) {
    return insufficient(`${n} settled forecast(s) — below the ${CALIBRATION_BARS.MIN_SAMPLE}-game floor, so no calibration claim is made`);
  }

  const observed = covered / n;
  const expected = nominal * n;
  const sd = Math.sqrt(n * nominal * (1 - nominal));
  const z = (covered - expected) / sd;

  /*
   * The scale factor that WOULD have produced nominal coverage, on a normal assumption.
   *
   * An interval is ±k·sigma. If the realised coverage is c, the true spread is wider (or narrower)
   * than assumed by the ratio of the two quantiles. Reported as guidance for a refit — never
   * applied here, and explicitly not a promotion.
   */
  const zNominal = normInv(0.5 + nominal / 2);
  const zObserved = normInv(0.5 + Math.min(0.9999, Math.max(0.0001, observed)) / 2);
  const impliedScale = zObserved > 0 ? Number((zNominal / zObserved).toFixed(3)) : null;

  let state = "CALIBRATED";
  let claim = `an interval printed as ${Math.round(nominal * 100)}% contained the result ${(observed * 100).toFixed(1)}% of the time over ${n} settled forecasts — consistent with the label`;
  if (z < -CALIBRATION_BARS.Z_THRESHOLD) {
    state = "OVERCONFIDENT";
    claim = `an interval printed as ${Math.round(nominal * 100)}% contained the result only ${(observed * 100).toFixed(1)}% of the time over ${n} settled forecasts (z ${z.toFixed(2)}) — the interval is too narrow and the label overstates what the model knows`;
  } else if (z > CALIBRATION_BARS.Z_THRESHOLD) {
    state = "UNDERCONFIDENT";
    claim = `an interval printed as ${Math.round(nominal * 100)}% contained the result ${(observed * 100).toFixed(1)}% of the time over ${n} settled forecasts (z ${z.toFixed(2)}) — the interval is wider than it needs to be`;
  }

  return {
    state,
    z: Number(z.toFixed(3)),
    observed: Number(observed.toFixed(4)),
    expected: Number(expected.toFixed(2)),
    n, covered, impliedScale, claim,
  };
}

/**
 * Judge every interval a cohort publishes.
 *
 * Cohorts are never merged. Preseason and regular-season football are different games — this repo
 * has kept those ledgers apart since P244 and a calibration monitor that pooled them would report a
 * number describing neither.
 */
export function judgeCohort(cohort) {
  const n = cohort?.decisive ?? cohort?.settledForecasts ?? 0;
  const round = (c) => (Number.isFinite(c) ? Math.round(c * n) : null);
  return {
    label: cohort?.label ?? "unknown",
    n,
    margin: coverageVerdict({ n, covered: round(cohort?.marginInterval80Coverage) }),
    total: coverageVerdict({ n, covered: round(cohort?.totalInterval80Coverage) }),
    winnerAccuracy: cohort?.winnerAccuracy ?? null,
    marginMAE: cohort?.marginMAE ?? null,
    totalMAE: cohort?.totalMAE ?? null,
  };
}

/** The worst state across every cohort and interval — what an operator should look at first. */
export function worstState(judged) {
  const rank = { OVERCONFIDENT: 3, UNDERCONFIDENT: 2, CALIBRATED: 1, INSUFFICIENT: 0 };
  let worst = "INSUFFICIENT";
  for (const c of judged ?? []) {
    for (const k of ["margin", "total"]) {
      if ((rank[c[k]?.state] ?? 0) > (rank[worst] ?? 0)) worst = c[k].state;
    }
  }
  return worst;
}
