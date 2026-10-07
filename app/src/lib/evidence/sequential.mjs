/**
 * SEQUENTIAL EVIDENCE EVALUATOR (Architecture slice E-1) — REPORT ONLY.
 *
 * The §15 rule (founder F-1 YES): for each graded forecast, d = loss(model) − loss(baseline). Below zero means the
 * model did better. Keep an ALWAYS-VALID 95% confidence sequence on mean(d), so looking every night does not inflate
 * false promotions, and cluster by slate, so a 15-game MLB day counts as one correlated block, not 15 wins.
 *
 * THE BOUND. An asymptotic normal-mixture confidence sequence (Waudby-Smith, Wu, Ramdas et al., "Time-uniform
 * central limit theory", two-sided form), applied to slate sums:
 *
 *     N = Σ n_k events,  S = Σ D_k (D_k = sum of d over slate k),  μ̂ = S / N
 *     V = max( (K+1)/(K−4) · Σ (D_k − n_k μ̂)² , Σ (d_i − μ̂)² )   (slate-clustered, small-slate inflated,
 *                                                                  floored at the event-level spread; K ≥ 3)
 *     half-width = √( 2 (Vρ² + 1) / (N² ρ²) · ln( √(Vρ² + 1) / α ) )
 *
 * ρ² = (−2 ln α + ln(1 − 2 ln α)) / (σ̂² · n*) tunes the bound to be tightest near a pre-registered n* events. It
 * is "asymptotic": validity rests on the slate sums behaving like a martingale with a variance V estimates. The
 * small-slate inflation is an engineering correction, checked by simulation (sequential.test.mjs: ≤ 5% of null paths
 * ever cross over 60 nightly looks, independent and day-correlated). That is stated in the artifact, not hidden. The bound is wider than a fixed-n 95% interval — that is the price of being
 * allowed to look every night.
 *
 * BACKTEST AS A DISCOUNTED PRIOR. A walk-forward backtest may enter worth at most `maxPriorSlates` (4) forward
 * slates. It moves the bound; it never satisfies the forward floors, so a backtest alone can never promote.
 *
 * NOTHING HERE CHANGES A STATUS. The verdict is a "would be" for the founder and for E-5 to read later.
 */

export const ALPHA = 0.05;
export const DEFAULT_PLANNED_EVENTS = 200;
export const MAX_PRIOR_SLATES = 4;
/** No bound before three slates: a spread estimated from fewer is not worth a verdict. */
export const MIN_BOUND_SLATES = 3;

/** §15 floors: below them the meter says "too early to judge" (the forecast is still published). */
export const FLOORS = Object.freeze({
  minSlates: 3,
  minEventsProbability: 30,
  minEventsDistribution: 20,
});

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (v) => (isNum(v) ? Number(v.toFixed(4)) : null);
const r6 = (v) => (isNum(v) ? Number(v.toFixed(6)) : null);

/**
 * Group per-event differences into slates, in slate order. `items` = [{ slate: "YYYY-MM-DD", d: number }].
 * Non-finite d are dropped (missing is not zero).
 */
export function clusterBySlate(items) {
  const m = new Map();
  for (const it of items) {
    if (!it || typeof it.slate !== "string" || !isNum(it.d)) continue;
    const c = m.get(it.slate) ?? { slate: it.slate, n: 0, sum: 0, sumSq: 0 };
    c.n += 1;
    c.sum += it.d;
    c.sumSq += it.d * it.d;
    m.set(it.slate, c);
  }
  return [...m.values()].sort((a, b) => (a.slate < b.slate ? -1 : a.slate > b.slate ? 1 : 0));
}

/**
 * Turn a walk-forward backtest summary into the discounted prior the bound adds.
 * prior = { meanDiff, sdPerEvent, events, slates }. Capped at `maxPriorSlates` slates' worth of events.
 */
export function discountedPrior(prior, { maxPriorSlates = MAX_PRIOR_SLATES } = {}) {
  if (!prior || !isNum(prior.meanDiff) || !isNum(prior.sdPerEvent) || !(prior.events > 0) || !(prior.slates > 0)) return null;
  const slates = Math.min(prior.slates, maxPriorSlates);
  const events = prior.events * (slates / prior.slates);
  return { slates, events, sum: prior.meanDiff * events, variance: prior.sdPerEvent ** 2 * events };
}

/**
 * The always-valid bound on mean(d) after these slates (plus an optional discounted prior).
 * Returns { n, slates, meanDiff, lower, upper, halfWidth } — bounds null when there is no spread to measure yet.
 */
export function confidenceSequence(clusters, { alpha = ALPHA, plannedEvents = DEFAULT_PLANNED_EVENTS, prior = null } = {}) {
  const fwdN = clusters.reduce((a, c) => a + c.n, 0);
  const fwdS = clusters.reduce((a, c) => a + c.sum, 0);
  const N = fwdN + (prior?.events ?? 0);
  const S = fwdS + (prior?.sum ?? 0);
  const K = clusters.length;
  const out = { n: fwdN, slates: K, priorEvents: prior ? r4(prior.events) : 0, meanDiff: N ? r6(S / N) : null, lower: null, upper: null, halfWidth: null };
  if (!N || K < MIN_BOUND_SLATES) return out;
  const mu = S / N;
  // Slate-clustered spread, inflated for few slates ((K + 1) / (K − 4), 6 up to four slates) and never below the event-level
  // spread. A variance from a handful of slates is itself noisy: without this, two or three lucky slates look
  // spread-free and the bound closes early. The simulation test pins the result at ≤ 5% false verdicts.
  const smallSlate = K > 4 ? (K + 1) / (K - 4) : 6;
  const vCluster = smallSlate * clusters.reduce((a, c) => a + (c.sum - c.n * mu) ** 2, 0);
  const hasSq = clusters.every((c) => isNum(c.sumSq));
  const fwdMu = fwdS / fwdN;
  const vEvent = hasSq ? clusters.reduce((a, c) => a + c.sumSq, 0) - fwdN * fwdMu * fwdMu : 0;
  let V = Math.max(vCluster, vEvent);
  if (prior) V += prior.variance;
  if (!(V > 0)) return out;
  const sigma2 = V / N;
  const c = -2 * Math.log(alpha) + Math.log(1 - 2 * Math.log(alpha));
  const rho2 = c / (sigma2 * plannedEvents);
  const vr = V * rho2;
  const half = Math.sqrt(((2 * (vr + 1)) / (N * N * rho2)) * Math.log(Math.sqrt(vr + 1) / alpha));
  return { ...out, lower: r6(mu - half), upper: r6(mu + half), halfWidth: r6(half) };
}

/** The bound after each slate, for the report's trajectory (always-valid, so every point is a fair look). */
export function confidencePath(clusters, opts = {}) {
  const path = [];
  for (let k = 1; k <= clusters.length; k += 1) {
    const cs = confidenceSequence(clusters.slice(0, k), opts);
    path.push({ slate: clusters[k - 1].slate, n: cs.n, meanDiff: r4(cs.meanDiff), lower: r4(cs.lower), upper: r4(cs.upper) });
  }
  return path;
}

/**
 * Logistic recalibration: logit P(y=1) = a + b · logit(p). Perfect calibration is a = 0, b = 1. Newton/IRLS with
 * Wald 95% intervals. Event-level (not slate-clustered) — the report says so. Binary families only.
 */
export function calibrationFit(pairs, { maxIter = 50, minEvents = FLOORS.minEventsProbability } = {}) {
  const EPS = 1e-6;
  const xs = [];
  const ys = [];
  for (const { p, y } of pairs) {
    if (!isNum(p) || (y !== 0 && y !== 1)) continue;
    const q = Math.min(1 - EPS, Math.max(EPS, p));
    xs.push(Math.log(q / (1 - q)));
    ys.push(y);
  }
  const n = xs.length;
  const pos = ys.reduce((a, b) => a + b, 0);
  if (n < minEvents || pos === 0 || pos === n) return { state: "NOT_COMPUTABLE", n, reason: n < minEvents ? `fewer than ${minEvents} graded events` : "outcomes all one class" };
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  if (xs.every((x) => Math.abs(x - xMean) < 1e-9)) return { state: "NOT_COMPUTABLE", n, reason: "every forecast has the same probability" };
  let a = 0;
  let b = 1;
  let info = null;
  for (let it = 0; it < maxIter; it += 1) {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
    for (let i = 0; i < n; i += 1) {
      const eta = a + b * xs[i];
      const mu = 1 / (1 + Math.exp(-eta));
      const w = mu * (1 - mu);
      g0 += ys[i] - mu;
      g1 += (ys[i] - mu) * xs[i];
      h00 += w;
      h01 += w * xs[i];
      h11 += w * xs[i] * xs[i];
    }
    const det = h00 * h11 - h01 * h01;
    if (!(det > 1e-12)) return { state: "NOT_COMPUTABLE", n, reason: "singular information matrix" };
    const da = (h11 * g0 - h01 * g1) / det;
    const db = (h00 * g1 - h01 * g0) / det;
    a += da;
    b += db;
    info = { h00, h01, h11, det };
    if (Math.abs(da) < 1e-10 && Math.abs(db) < 1e-10) break;
  }
  if (!isNum(a) || !isNum(b)) return { state: "NOT_COMPUTABLE", n, reason: "did not converge" };
  const seA = Math.sqrt(info.h11 / info.det);
  const seB = Math.sqrt(info.h00 / info.det);
  const slopeLo = b - 1.96 * seB;
  const slopeHi = b + 1.96 * seB;
  const interceptLo = a - 1.96 * seA;
  const interceptHi = a + 1.96 * seA;
  return {
    state: "COMPUTED",
    n,
    method: "logistic recalibration on logit(p), Wald 95%, event-level",
    slope: r4(b), slopeLo: r4(slopeLo), slopeHi: r4(slopeHi),
    intercept: r4(a), interceptLo: r4(interceptLo), interceptHi: r4(interceptHi),
    slopeContainsOne: slopeLo <= 1 && slopeHi >= 1,
    interceptContainsZero: interceptLo <= 0 && interceptHi >= 0,
  };
}

/**
 * The report-only verdict for one family × model version against its pre-registered baseline.
 *   meter:  TOO_EARLY | EVIDENCE_BUILDING | BETTER_THAN_BASELINE | WORSE_THAN_BASELINE  (+ `lean` while building)
 *   wouldBe: NONE | ESTABLISHED_ELIGIBLE | PAUSE_SIGNAL — what the §15 table would do. Changes nothing.
 */
export function evidenceVerdict({ cs, distribution = false, calibration = null, healthState = null }) {
  const minEvents = distribution ? FLOORS.minEventsDistribution : FLOORS.minEventsProbability;
  const floorsMet = cs.slates >= FLOORS.minSlates && cs.n >= minEvents;
  const reasons = [];
  if (!floorsMet) reasons.push(`floors: ${cs.slates}/${FLOORS.minSlates} slates, ${cs.n}/${minEvents} graded events`);
  const bounded = isNum(cs.lower) && isNum(cs.upper);
  let meter = "TOO_EARLY";
  let lean = null;
  if (floorsMet && bounded) {
    if (cs.upper < 0) meter = "BETTER_THAN_BASELINE";
    else if (cs.lower > 0) meter = "WORSE_THAN_BASELINE";
    else {
      meter = "EVIDENCE_BUILDING";
      lean = cs.meanDiff < 0 ? "LEANING_BETTER" : cs.meanDiff > 0 ? "LEANING_WORSE" : null;
    }
  }
  let wouldBe = "NONE";
  if (healthState === "BREACHED") {
    wouldBe = "PAUSE_SIGNAL";
    reasons.push("model-health says BREACHED");
  }
  if (meter === "WORSE_THAN_BASELINE") {
    wouldBe = "PAUSE_SIGNAL";
    reasons.push("lower bound of mean(d) > 0");
  }
  if (wouldBe === "NONE" && meter === "BETTER_THAN_BASELINE") {
    const cal = calibration?.state === "COMPUTED" ? calibration : null;
    if (!cal) reasons.push("calibration not computable, so not Established-eligible");
    else if (!cal.slopeContainsOne) reasons.push("calibration slope interval excludes 1");
    else if (!cal.interceptContainsZero) reasons.push("calibration intercept interval excludes 0");
    else {
      wouldBe = "ESTABLISHED_ELIGIBLE";
      reasons.push("upper bound of mean(d) < 0, calibration slope ~1, intercept ~0, floors met, not BREACHED");
    }
  }
  return { floorsMet, minEvents, minSlates: FLOORS.minSlates, meter, lean, wouldBe, reasons };
}

/** Market badge: same bound, baseline = the recorded market. Separate from the maturity question by design. */
export function marketBadge(cs, { distribution = false } = {}) {
  if (!cs || cs.n === 0) return "NOT_COMPUTABLE";
  const minEvents = distribution ? FLOORS.minEventsDistribution : FLOORS.minEventsProbability;
  if (cs.slates < FLOORS.minSlates || cs.n < minEvents || !isNum(cs.lower)) return "TOO_EARLY";
  if (cs.upper < 0) return "BEATS_MARKET";
  if (cs.lower > 0) return "TRAILS_MARKET";
  return "UNDECIDED";
}
