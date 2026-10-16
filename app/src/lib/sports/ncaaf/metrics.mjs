/**
 * NCAAF · proper scoring and uncertainty for NCAAF-002 (MODEL_EVALUATION_PROTOCOL.md §5). PRIVATE_RESEARCH.
 *
 * Pure functions over plain numbers. The bootstrap resamples WEEK clusters (season × week), never games or
 * simulation draws, because games in one week share conditions and draws are not observations.
 */

/** Deterministic PRNG (mulberry32). Same seed → same stream on every platform. */
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

const EPS = 1e-12;
const clip = (p) => Math.min(1 - EPS, Math.max(EPS, p));

export const logLoss = (p, y) => -(y ? Math.log(clip(p)) : Math.log(1 - clip(p)));
export const brier = (p, y) => (p - y) ** 2;

/** erf, Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7). */
export function erf(x) {
  const s = x < 0 ? -1 : 1, ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return s * y;
}
export const normalCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
export const normalPdf = (z) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

/** CRPS of a Normal(mu, sd) forecast at outcome x (closed form; Gneiting & Raftery 2007). */
export function normalCrps(mu, sd, x) {
  if (!(sd > 0)) throw new Error(`normalCrps: sd must be > 0 (got ${sd})`);
  const z = (x - mu) / sd;
  return sd * (z * (2 * normalCdf(z) - 1) + 2 * normalPdf(z) - 1 / Math.sqrt(Math.PI));
}

/** z for a central interval of `level` (0.8 → 1.2816). Bisection on normalCdf, deterministic. */
export function centralZ(level) {
  const target = 0.5 + level / 2;
  let lo = 0, hi = 10;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (normalCdf(mid) < target) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
const Z80 = centralZ(0.8);
export const inCentral80 = (mu, sd, x) => Math.abs(x - mu) <= Z80 * sd;

/** Expected calibration error over `bins` equal-width probability bins (weighted by bin count). */
export function ece(ps, ys, bins = 10) {
  const n = ps.length;
  if (!n) return null;
  const acc = Array.from({ length: bins }, () => ({ n: 0, p: 0, y: 0 }));
  ps.forEach((p, i) => { const b = Math.min(bins - 1, Math.floor(p * bins)); acc[b].n++; acc[b].p += p; acc[b].y += ys[i]; });
  return acc.reduce((s, b) => (b.n ? s + (b.n / n) * Math.abs(b.p / b.n - b.y / b.n) : s), 0);
}

/** Reliability table for reports: per bin count, mean forecast, observed rate. */
export function reliability(ps, ys, bins = 10) {
  const acc = Array.from({ length: bins }, (_, b) => ({ bin: [b / bins, (b + 1) / bins], n: 0, meanP: 0, observed: 0 }));
  ps.forEach((p, i) => { const b = Math.min(bins - 1, Math.floor(p * bins)); acc[b].n++; acc[b].meanP += p; acc[b].observed += ys[i]; });
  return acc.map((b) => (b.n ? { ...b, meanP: b.meanP / b.n, observed: b.observed / b.n } : { ...b, meanP: null, observed: null }));
}

/**
 * Logistic recalibration y ~ a + b·logit(p) by Newton–Raphson. Perfect calibration: a = 0, b = 1.
 * b < 1 means forecasts are too extreme; b > 1 too timid.
 */
export function calibrationSlopeIntercept(ps, ys) {
  const x = ps.map((p) => Math.log(clip(p) / (1 - clip(p))));
  let a = 0, b = 1;
  for (let it = 0; it < 100; it++) {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
    for (let i = 0; i < x.length; i++) {
      const q = 1 / (1 + Math.exp(-(a + b * x[i])));
      const r = ys[i] - q, w = q * (1 - q);
      g0 += r; g1 += r * x[i]; h00 += w; h01 += w * x[i]; h11 += w * x[i] * x[i];
    }
    const det = h00 * h11 - h01 * h01;
    if (!(Math.abs(det) > 1e-12)) break;
    const da = (h11 * g0 - h01 * g1) / det, db = (h00 * g1 - h01 * g0) / det;
    a += da; b += db;
    if (Math.abs(da) + Math.abs(db) < 1e-10) break;
  }
  return { intercept: a, slope: b };
}

const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;

/**
 * Week-cluster bootstrap of a statistic. `records` carry `cluster`; `stat(records) → number`.
 * Returns the point estimate and the percentile 95% interval. Deterministic for a given seed.
 */
export function clusterBootstrap(records, stat, { reps = 2000, seed = 20261009 } = {}) {
  const clusters = new Map();
  for (const r of records) { if (!clusters.has(r.cluster)) clusters.set(r.cluster, []); clusters.get(r.cluster).push(r); }
  const keys = [...clusters.keys()].sort();
  const rand = mulberry32(seed);
  const draws = [];
  for (let i = 0; i < reps; i++) {
    const sample = [];
    for (let k = 0; k < keys.length; k++) sample.push(...clusters.get(keys[Math.floor(rand() * keys.length)]));
    draws.push(stat(sample));
  }
  draws.sort((a, b) => a - b);
  const q = (f) => draws[Math.min(draws.length - 1, Math.max(0, Math.floor(f * draws.length)))];
  return { estimate: stat(records), lo: q(0.025), hi: q(0.975), clusters: keys.length, reps, seed };
}

/** Full metric block for one candidate's forecasts on one population. */
export function scoreForecasts(f) {
  const n = f.length;
  if (!n) return { n: 0 };
  const ps = f.map((r) => r.pHome), ys = f.map((r) => r.homeWin);
  return {
    n,
    logLoss: mean(f.map((r) => logLoss(r.pHome, r.homeWin))),
    brier: mean(f.map((r) => brier(r.pHome, r.homeWin))),
    ece: ece(ps, ys),
    calibration: calibrationSlopeIntercept(ps, ys),
    margin: {
      crps: mean(f.map((r) => normalCrps(r.marginMean, r.marginSd, r.margin))),
      mae: mean(f.map((r) => Math.abs(r.margin - r.marginMean))),
      bias: mean(f.map((r) => r.marginMean - r.margin)),
      coverage80: mean(f.map((r) => (inCentral80(r.marginMean, r.marginSd, r.margin) ? 1 : 0))),
    },
    total: {
      crps: mean(f.map((r) => normalCrps(r.totalMean, r.totalSd, r.total))),
      mae: mean(f.map((r) => Math.abs(r.total - r.totalMean))),
      bias: mean(f.map((r) => r.totalMean - r.total)),
      coverage80: mean(f.map((r) => (inCentral80(r.totalMean, r.totalSd, r.total) ? 1 : 0))),
    },
  };
}
