/**
 * NBA DISTRIBUTION SCORES over each engine's FROZEN RECEIPT QUANTILES — PURE, no I/O. DIAGNOSTIC: promotes nothing.
 *
 * Inputs are only the quantiles a receipt stores (p10 / p25 / p50 / p75 / p90, whichever are present — v0.1 stores
 * p10 / p50 / p90; v1 also p25 / p75). Never a representative run, never simulation draws, never mean/sd.
 *
 *   1. CRPS (approximate). Quantile (pinball) decomposition: CRPS(F, y) = 2 ∫₀¹ ρ_τ(y − F⁻¹(τ)) dτ, with
 *      ρ_τ(u) = u·(τ − 1{u < 0}). On a SPARSE stored set this is approximated by 2 × the mean pinball loss over the
 *      stored levels L (documented on every result). It is an approximation of CRPS on that level set, not CRPS.
 *      Two engines are compared only on the levels BOTH store (levels one lacks are dropped).
 *   2. INTERVAL SCORE (Gneiting & Raftery 2007): IS_α(l, u; y) = (u − l) + (2/α)(l − y)·1{y < l} + (2/α)(y − u)·1{y > u}.
 *      p10–p90 → α = 0.2 (80 % central interval); p25–p75 → α = 0.5 (50 %) only where stored.
 *   3. THRESHOLD LOG SCORES: −log P̂ of the realised side of "X ≥ k" for standard thresholds. P(X ≥ k) is read from the
 *      stored quantiles with the SAME rule as app/src/lib/consistency/market-evaluator.mjs (quantileCdf + integer
 *      continuity): F piecewise-linear through the stored (value, level) points, exponential tails whose density matches
 *      the adjacent segment, truncated at a lower bound (0 for counts), and P(X ≥ k) = 1 − F(k − ½). That module imports
 *      TypeScript (projection-framework.ts), so it cannot be imported by these plain-node scripts; the CDF below is a
 *      transcription of its `quantileCdf`, and distribution-scores.test.mjs asserts parity against `lineProbabilities`
 *      (P(X ≥ k) = P(over k − 0.5)) under tsx. For a whole line k the half line k − 0.5 is the same event; whole-line
 *      pushes are not scored.
 * Lower is better for every score here.
 */
export const DISTRIBUTION_SCORES_VERSION = "nba-distribution-scores-1";
export const QUANTILE_LEVELS = Object.freeze({ p10: 0.1, p25: 0.25, p50: 0.5, p75: 0.75, p90: 0.9 });
/** Standard thresholds (coordinator / release-owner scope, 2026-10-20). Reporting keys only; nothing is fitted to them. */
export const THRESHOLDS = Object.freeze({ pts: Object.freeze([10, 15, 20, 25, 30]), reb: Object.freeze([5, 10]), ast: Object.freeze([5, 10]), threePm: Object.freeze([1, 2, 3]) });
export const PLAYER_MARKETS = Object.freeze(["pts", "reb", "ast", "threePm", "pra", "ptsReb", "ptsAst", "minutes"]);
export const TEAM_MARKETS = Object.freeze(["margin", "total"]);
/** Support lower bound per market (counts and minutes ≥ 0; a margin is signed). */
export const LOWER_BOUND = Object.freeze({ margin: -Infinity });

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r6 = (x) => (isNum(x) ? Number(x.toFixed(6)) : null);

/** The stored quantiles of a receipt block as [{ key, tau, v }], ascending level. */
export function storedQuantiles(block) {
  return Object.entries(QUANTILE_LEVELS).filter(([k]) => isNum(block?.[k])).map(([key, tau]) => ({ key, tau, v: block[key] }));
}

/** Pinball (quantile) loss ρ_τ(y − q). */
export const pinball = (tau, q, y) => { const u = y - q; return u * (tau - (u < 0 ? 1 : 0)); };

/** Interval score IS_α for the central interval [l, u]. */
export function intervalScore(l, u, y, alpha) {
  if (![l, u, y, alpha].every(isNum)) return null;
  return (u - l) + (2 / alpha) * (l - y) * (y < l ? 1 : 0) + (2 / alpha) * (y - u) * (y > u ? 1 : 0);
}

/** Approximate CRPS = 2 × mean pinball loss over `keys` (levels), from a per-level pinball map. */
export function crpsFromPinball(pinballByKey, keys) {
  const xs = keys.map((k) => pinballByKey?.[k]);
  if (!keys.length || !xs.every(isNum)) return null;
  return (2 * xs.reduce((s, x) => s + x, 0)) / xs.length;
}

/** Transcription of market-evaluator.mjs `quantileCdf` (points: [{ q, v }]). */
export function quantileCdf(points, lowerBound = -Infinity) {
  const pts = points.filter((p) => isNum(p.q) && isNum(p.v)).slice().sort((a, b) => a.q - b.q || a.v - b.v);
  const n = pts.length;
  const slopeAt = (from, dir) => {
    for (let i = from; dir > 0 ? i < n - 1 : i > 0; i += dir) {
      const a = pts[dir > 0 ? i : i - 1]; const b = pts[dir > 0 ? i + 1 : i];
      if (b.v > a.v) return (b.q - a.q) / (b.v - a.v);
    }
    return 0;
  };
  const fLow = slopeAt(0, +1);
  const fHigh = slopeAt(n - 1, -1);
  return (x) => {
    if (!n) return NaN;
    if (x < lowerBound) return 0;
    if (x < pts[0].v) {
      const q1 = pts[0].q;
      return fLow > 0 && q1 > 0 ? q1 * Math.exp(-(pts[0].v - x) * fLow / q1) : 0;
    }
    let j = -1;
    for (let i = 0; i < n; i++) if (pts[i].v <= x) j = i;
    if (j === n - 1) {
      const qn = pts[n - 1].q;
      if (x === pts[n - 1].v) return qn;
      return fHigh > 0 && qn < 1 ? 1 - (1 - qn) * Math.exp(-(x - pts[n - 1].v) * fHigh / (1 - qn)) : 1;
    }
    const a = pts[j]; const b = pts[j + 1];
    return a.q + (b.q - a.q) * (x - a.v) / (b.v - a.v);
  };
}

/** P(X ≥ k) for an integer stat under the stored quantiles (integer continuity: 1 − F(k − ½)). */
export function probAtLeast(block, k, lowerBound = 0) {
  const pts = storedQuantiles(block).map(({ tau, v }) => ({ q: tau, v }));
  if (pts.length < 2 || !isNum(k)) return null;
  const F = quantileCdf(pts, lowerBound);
  return 1 - F(k - 0.5);
}

const clamp = (p) => Math.min(1 - 1e-12, Math.max(1e-12, p));
/** Log score (−log P̂ of what happened) of the event "X ≥ k". */
export const thresholdLogScore = (pGe, actual, k) => (isNum(pGe) && isNum(actual) ? -Math.log(clamp(actual >= k ? pGe : 1 - pGe)) : null);

/**
 * Every score for one market row: per-level pinball, interval scores, and P(X ≥ k) per standard threshold.
 * Stored on the grade so a paired comparison can choose the levels both engines hold.
 */
export function scoreQuantileBlock(block, actual, { market, lowerBound = LOWER_BOUND[market] ?? 0 } = {}) {
  if (!isNum(actual)) return null;
  const qs = storedQuantiles(block);
  if (!qs.length) return null;
  const pinballByKey = Object.fromEntries(qs.map(({ key, tau, v }) => [key, r6(pinball(tau, v, actual))]));
  const thresholds = THRESHOLDS[market] ?? [];
  const pGe = Object.fromEntries(thresholds.map((k) => [k, r6(probAtLeast(block, k, lowerBound))]).filter(([, p]) => p != null));
  return {
    actual,
    levels: qs.map((x) => x.key),
    pinball: pinballByKey,
    is80: isNum(block?.p10) && isNum(block?.p90) ? r6(intervalScore(block.p10, block.p90, actual, 0.2)) : null,
    is50: isNum(block?.p25) && isNum(block?.p75) ? r6(intervalScore(block.p25, block.p75, actual, 0.5)) : null,
    pGe,
  };
}

/** Common stored levels of two score rows (levels one engine lacks are dropped). */
export const commonLevels = (a, b) => (a?.levels ?? []).filter((k) => (b?.levels ?? []).includes(k));

/** Aggregate one engine × market over score rows: CRPS (on the levels every row stores), IS80, IS50, threshold log scores. */
export function aggregateScores(rows, market) {
  const xs = rows.filter(Boolean);
  const levels = Object.keys(QUANTILE_LEVELS).filter((k) => xs.length && xs.every((r) => r.levels.includes(k)));
  const mean = (v) => { const f = v.filter(isNum); return { n: f.length, mean: f.length ? r6(f.reduce((s, x) => s + x, 0) / f.length) : null }; };
  const thr = {};
  for (const k of THRESHOLDS[market] ?? []) {
    const ls = xs.map((r) => thresholdLogScore(r.pGe?.[k], r.actual, k));
    const hits = xs.filter((r) => isNum(r.pGe?.[k])).map((r) => (r.actual >= k ? 1 : 0));
    thr[`ge${k}`] = { ...mean(ls), baseRate: hits.length ? r6(hits.reduce((s, x) => s + x, 0) / hits.length) : null, meanP: mean(xs.map((r) => r.pGe?.[k])).mean };
  }
  return {
    market, n: xs.length,
    crps: { ...mean(xs.map((r) => crpsFromPinball(r.pinball, levels))), levels, note: `2 × mean pinball over stored levels {${levels.join(", ")}} — approximates CRPS on a sparse quantile set` },
    is80: mean(xs.map((r) => r.is80)),
    is50: mean(xs.map((r) => r.is50)),
    thresholdLogScore: thr,
  };
}
