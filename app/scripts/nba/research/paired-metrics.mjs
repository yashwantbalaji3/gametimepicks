/**
 * Paired winner-head metrics for research harnesses. Pure, deterministic (seeded bootstrap). No I/O.
 */

const clampP = (p) => Math.min(1 - 1e-12, Math.max(1e-12, p));
const logLossOf = (p, y) => -(y ? Math.log(clampP(p)) : Math.log(1 - clampP(p)));
const brierOf = (p, y) => (p - y) ** 2;
const r4 = (x) => Number(x.toFixed(4));

/** Brier, log loss, ECE (10 equal-width bins), accuracy, n. */
export function winnerScores(p, y) {
  const n = p.length;
  if (!n || n !== y.length) throw new Error("winnerScores: p and y must be non-empty and equal length");
  let brier = 0, ll = 0, hit = 0;
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  for (let i = 0; i < n; i++) {
    brier += brierOf(p[i], y[i]); ll += logLossOf(p[i], y[i]);
    hit += ((p[i] >= 0.5 ? 1 : 0) === y[i]) ? 1 : 0;
    const b = bins[Math.min(9, Math.floor(p[i] * 10))]; b.n += 1; b.p += p[i]; b.y += y[i];
  }
  const ece = bins.reduce((s, b) => s + (b.n ? (b.n / n) * Math.abs(b.p / b.n - b.y / b.n) : 0), 0);
  return { n, brier: r4(brier / n), logLoss: r4(ll / n), ece: r4(ece), accuracy: r4(hit / n) };
}

/** mulberry32 over a 32-bit hash of the seed string. */
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

const quantile = (sorted, q) => {
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

/**
 * Paired bootstrap of the per-game difference (v1 − elo) in log loss and Brier, resampling games with replacement.
 * @param {{y: 0|1, elo: number, v1: number}[]} pairs
 * @returns {{ logLoss: {mean, lo95, hi95, excludesZero}, brier: {mean, lo95, hi95, excludesZero}, iterations, seed }}
 */
export function pairedBootstrap(pairs, { iterations = 2000, seed = "paired" } = {}) {
  const n = pairs.length;
  if (!n) throw new Error("pairedBootstrap: no pairs");
  const dLL = pairs.map((p) => logLossOf(p.v1, p.y) - logLossOf(p.elo, p.y));
  const dB = pairs.map((p) => brierOf(p.v1, p.y) - brierOf(p.elo, p.y));
  const rnd = seededRandom(seed);
  const bl = [], bb = [];
  for (let b = 0; b < iterations; b++) {
    let sl = 0, sb = 0;
    for (let i = 0; i < n; i++) { const j = Math.floor(rnd() * n); sl += dLL[j]; sb += dB[j]; }
    bl.push(sl / n); bb.push(sb / n);
  }
  bl.sort((a, b) => a - b); bb.sort((a, b) => a - b);
  const summary = (d, boot) => {
    const mean = d.reduce((s, x) => s + x, 0) / n;
    const lo = quantile(boot, 0.025), hi = quantile(boot, 0.975);
    return { mean: Number(mean.toFixed(5)), lo95: Number(lo.toFixed(5)), hi95: Number(hi.toFixed(5)), excludesZero: lo > 0 || hi < 0 };
  };
  return { logLoss: summary(dLL, bl), brier: summary(dB, bb), iterations, seed };
}
