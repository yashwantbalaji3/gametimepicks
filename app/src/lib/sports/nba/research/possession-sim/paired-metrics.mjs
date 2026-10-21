/**
 * nba-possession-sim-v0 · PAIRED METRICS for the research harness. PURE, deterministic (seeded bootstrap). No I/O.
 * Same approach as app/scripts/nba/research/paired-metrics.mjs on claude/nba-winner-head-paired-eval (winner scores,
 * mulberry32 bootstrap, percentile 95 % interval, `excludesZero`), generalised to a GAME-CLUSTERED bootstrap of any
 * per-row difference so player rows from one game are resampled together.
 */
const clampP = (p) => Math.min(1 - 1e-12, Math.max(1e-12, p));
export const logLossOf = (p, y) => -(y ? Math.log(clampP(p)) : Math.log(1 - clampP(p)));
export const brierOf = (p, y) => (p - y) ** 2;
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(4)));
const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(5)));

/** Brier, log loss, ECE (10 equal-width bins), accuracy, n. */
export function winnerScores(p, y) {
  const n = p.length;
  if (!n || n !== y.length) throw new Error("winnerScores: p and y must be non-empty and equal length");
  let brier = 0, ll = 0, hit = 0;
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  for (let i = 0; i < n; i += 1) {
    brier += brierOf(p[i], y[i]); ll += logLossOf(p[i], y[i]);
    hit += ((p[i] >= 0.5 ? 1 : 0) === y[i]) ? 1 : 0;
    const b = bins[Math.min(9, Math.floor(p[i] * 10))]; b.n += 1; b.p += p[i]; b.y += y[i];
  }
  const ece = bins.reduce((s, b) => s + (b.n ? (b.n / n) * Math.abs(b.p / b.n - b.y / b.n) : 0), 0);
  return { n, brier: r4(brier / n), logLoss: r4(ll / n), ece: r4(ece), accuracy: r4(hit / n) };
}

/** mulberry32 over a 32-bit FNV-style hash of the seed string. */
export function seededRandom(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const quantile = (sorted, q) => { const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };

/**
 * Game-clustered paired bootstrap of the mean of per-row differences.
 * @param {number[][]} clusters  one array of per-row differences (model A − model B) per game
 * @returns {{ mean, lo95, hi95, excludesZero, rows, clusters, iterations, seed }}
 */
export function clusteredBootstrap(clusters, { iterations = 2000, seed = "possession-sim-v0" } = {}) {
  const cs = clusters.filter((c) => c.length);
  const G = cs.length;
  if (!G) return { mean: null, lo95: null, hi95: null, excludesZero: false, rows: 0, clusters: 0, iterations, seed };
  const sums = cs.map((c) => c.reduce((s, x) => s + x, 0)), counts = cs.map((c) => c.length);
  const rows = counts.reduce((a, b) => a + b, 0);
  const mean = sums.reduce((a, b) => a + b, 0) / rows;
  const rnd = seededRandom(seed);
  const boot = new Float64Array(iterations);
  for (let b = 0; b < iterations; b += 1) {
    let s = 0, n = 0;
    for (let i = 0; i < G; i += 1) { const j = Math.floor(rnd() * G); s += sums[j]; n += counts[j]; }
    boot[b] = s / n;
  }
  const sorted = Array.from(boot).sort((a, b) => a - b);
  const lo = quantile(sorted, 0.025), hi = quantile(sorted, 0.975);
  return { mean: r5(mean), lo95: r5(lo), hi95: r5(hi), excludesZero: lo > 0 || hi < 0, rows, clusters: G, iterations, seed };
}

/** Per-game paired winner differences (A − B) in log loss and Brier, bootstrapped over games. */
export function pairedWinner(pA, pB, y, opts = {}) {
  return {
    logLoss: clusteredBootstrap(y.map((yy, i) => [logLossOf(pA[i], yy) - logLossOf(pB[i], yy)]), { ...opts, seed: `${opts.seed ?? "pw"}:ll` }),
    brier: clusteredBootstrap(y.map((yy, i) => [brierOf(pA[i], yy) - brierOf(pB[i], yy)]), { ...opts, seed: `${opts.seed ?? "pw"}:brier` }),
  };
}

/** Smallest k with Poisson(λ) CDF ≥ q (the ceil(q·n) convention of the engines' quantiles, in the limit). */
export function poissonQuantile(lambda, q) {
  if (!(lambda > 0)) return 0;
  let k = 0, p = Math.exp(-lambda), c = p;
  while (c < q && k < 1000) { k += 1; p *= lambda / k; c += p; }
  return k;
}
