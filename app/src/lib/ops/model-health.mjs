/**
 * MODEL HEALTH — live results judged against a baseline, never against a point estimate (P303).
 *
 * Every sport grades its forecasts after the event, but until now nothing compared those live results with the
 * floor a published model must stay above. This module is the judgement, pure and deterministic; the builder
 * (scripts/ops/build-model-health.mjs) reads each sport's graded ledger and writes admin/model-health.json.
 *
 * States, in order of severity:
 *   INSUFFICIENT_SAMPLE  fewer graded events than the family's minimum — no verdict in either direction
 *   HOLDING              at least as good as the baseline on the point estimate
 *   WATCH                worse than the baseline on the point estimate, but the 95% interval still includes "no
 *                        worse" — keep publishing, keep watching
 *   BREACHED             worse than the baseline with the whole 95% interval on the wrong side
 *
 * A breach here is an ALARM, not an automatic demotion: only a preregistered forward receipt (the NFL share-level
 * pattern) switches what publishes. Thirty fights can make a good model look like a coin flip; the interval is
 * what keeps a noisy week from raising a false alarm.
 */

export const HEALTH_SEVERITY = Object.freeze({ INSUFFICIENT_SAMPLE: 0, HOLDING: 1, WATCH: 2, BREACHED: 3 });

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r4 = (v) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(4)));

/**
 * Per-event loss differences (model − baseline; below zero means the model did better). The interval resamples
 * events with a fixed seed, so the same ledger always yields the same verdict.
 */
export function comparePairedLoss(diffs, { minN, resamples = 2000, seed = 20260914 } = {}) {
  const clean = diffs.filter(Number.isFinite);
  const n = clean.length;
  const mean = n ? clean.reduce((a, b) => a + b, 0) / n : null;
  if (n < minN) return { state: "INSUFFICIENT_SAMPLE", n, needed: minN, meanDiff: r4(mean), lo95: null, hi95: null };
  const rand = mulberry32(seed);
  const stats = new Array(resamples);
  for (let b = 0; b < resamples; b += 1) {
    let s = 0;
    for (let i = 0; i < n; i += 1) s += clean[Math.floor(rand() * n)];
    stats[b] = s / n;
  }
  stats.sort((x, y) => x - y);
  const lo95 = stats[Math.floor(0.025 * resamples)];
  const hi95 = stats[Math.ceil(0.975 * resamples) - 1];
  return { state: lo95 > 0 ? "BREACHED" : mean > 0 ? "WATCH" : "HOLDING", n, needed: minN, meanDiff: r4(mean), lo95: r4(lo95), hi95: r4(hi95) };
}

/** An interval family's hit rate against its target (0.8 for an 80% range): a two-sided normal test. */
export function judgeCoverage({ hits, n, target, minN }) {
  const rate = n ? hits / n : null;
  if (n < minN) return { state: "INSUFFICIENT_SAMPLE", n, needed: minN, rate: r4(rate), target, z: null, direction: null };
  const z = (rate - target) / Math.sqrt((target * (1 - target)) / n);
  const direction = rate < target ? "ranges too narrow" : "ranges too wide";
  const state = Math.abs(z) >= 2.58 ? "BREACHED" : Math.abs(z) >= 1.96 ? "WATCH" : "HOLDING";
  return { state, n, needed: minN, rate: r4(rate), target, z: r4(z), direction: state === "HOLDING" ? null : direction };
}

/**
 * Probability level: how many events a set of probabilities expected against how many happened (Poisson-binomial
 * normal approximation). Catches a model whose probabilities run systematically low or high.
 */
export function judgeLevel({ probabilities, outcomes, minN }) {
  const n = probabilities.length;
  const expected = probabilities.reduce((a, p) => a + p, 0);
  const actual = outcomes.reduce((a, y) => a + y, 0);
  if (n < minN) return { state: "INSUFFICIENT_SAMPLE", n, needed: minN, expected: r4(expected), actual, z: null, direction: null };
  const variance = probabilities.reduce((a, p) => a + p * (1 - p), 0);
  const z = variance > 0 ? (actual - expected) / Math.sqrt(variance) : 0;
  const state = Math.abs(z) >= 2.58 ? "BREACHED" : Math.abs(z) >= 1.96 ? "WATCH" : "HOLDING";
  return { state, n, needed: minN, expected: r4(expected), actual, z: r4(z), direction: state === "HOLDING" ? null : actual > expected ? "probabilities run low" : "probabilities run high" };
}

/** The most severe state in a list (an empty list has no verdict). */
export function worstHealth(states) {
  return states.reduce((worst, s) => (HEALTH_SEVERITY[s] > HEALTH_SEVERITY[worst] ? s : worst), "INSUFFICIENT_SAMPLE");
}

/** Log loss of the probability given to what actually happened, clipped so a certainty that failed is finite. */
export const logLossOf = (p) => -Math.log(Math.min(1 - 1e-6, Math.max(1e-6, p)));
