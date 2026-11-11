/**
 * NBA game-clustered percentile bootstrap — PURE, deterministic, no I/O. Shared by the champion/challenger evaluator
 * (champion-challenger.mjs re-exports it unchanged) and the grader's published-Elo block (grader-metrics.mjs).
 */

export const BOOTSTRAP_DEFAULTS = Object.freeze({ B: 2000, seed: 20261020, alpha: 0.05 });

const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(4)));

/** Deterministic PRNG (mulberry32) — a report must re-derive byte-for-byte from the same ledgers. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Cluster (by game) percentile bootstrap of the pooled mean of `values`.
 * @param clusters  Array<number[]> — one array of values per game (empty arrays ignored)
 */
export function clusterBootstrap(clusters, { B = BOOTSTRAP_DEFAULTS.B, seed = BOOTSTRAP_DEFAULTS.seed, alpha = BOOTSTRAP_DEFAULTS.alpha } = {}) {
  const cs = clusters.map((c) => c.filter(Number.isFinite)).filter((c) => c.length);
  const sums = cs.map((c) => c.reduce((s, x) => s + x, 0));
  const ns = cs.map((c) => c.length);
  const n = ns.reduce((s, x) => s + x, 0);
  if (!cs.length) return { n: 0, clusters: 0, mean: null, lo: null, hi: null, B, seed, alpha };
  const mean = sums.reduce((s, x) => s + x, 0) / n;
  if (cs.length < 2) return { n, clusters: cs.length, mean: r4(mean), lo: null, hi: null, B, seed, alpha, note: "one cluster — no interval" };
  const rnd = mulberry32(seed);
  const stats = new Float64Array(B);
  for (let b = 0; b < B; b += 1) {
    let s = 0, k = 0;
    for (let i = 0; i < cs.length; i += 1) { const j = Math.floor(rnd() * cs.length); s += sums[j]; k += ns[j]; }
    stats[b] = s / k;
  }
  stats.sort();
  const q = (p) => stats[Math.min(B - 1, Math.max(0, Math.floor(p * B)))];
  return { n, clusters: cs.length, mean: r4(mean), lo: r4(q(alpha / 2)), hi: r4(q(1 - alpha / 2)), B, seed, alpha };
}

/**
 * Percentile bootstrap of any statistic over whole clusters (one item per game): resamples `items` with replacement
 * using the same PRNG, B, seed and alpha as clusterBootstrap, and applies `stat` to each resample. For statistics that
 * are not a pooled mean (e.g. ECE).
 */
export function bootstrapStatistic(items, stat, { B = BOOTSTRAP_DEFAULTS.B, seed = BOOTSTRAP_DEFAULTS.seed, alpha = BOOTSTRAP_DEFAULTS.alpha } = {}) {
  const xs = Array.isArray(items) ? items : [];
  if (!xs.length) return { n: 0, value: null, lo: null, hi: null, B, seed, alpha };
  const value = stat(xs);
  if (xs.length < 2) return { n: xs.length, value: r4(value), lo: null, hi: null, B, seed, alpha, note: "one cluster — no interval" };
  const rnd = mulberry32(seed);
  const stats = new Float64Array(B);
  const sample = new Array(xs.length);
  for (let b = 0; b < B; b += 1) {
    for (let i = 0; i < xs.length; i += 1) sample[i] = xs[Math.floor(rnd() * xs.length)];
    stats[b] = stat(sample);
  }
  stats.sort();
  const q = (p) => stats[Math.min(B - 1, Math.max(0, Math.floor(p * B)))];
  return { n: xs.length, value: r4(value), lo: r4(q(alpha / 2)), hi: r4(q(1 - alpha / 2)), B, seed, alpha };
}
