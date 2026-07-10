/**
 * RNG + count-model sampling for the MLB team-scoring Monte Carlo engine.
 *
 * Pure + DETERMINISTIC: a `mulberry32` seeded generator drives a Gamma→Poisson negative-binomial
 * sampler, so the same (seed, inputs) always reproduce the same runs. No network, no fs, no money.
 * Team runs are modelled as an overdispersed count (negative binomial, variance = mean × VMR) because
 * real MLB team runs are more variable than Poisson — this is a documented modelling assumption, not a
 * fitted independent model (see the model-design doc).
 */

/** Seeded uniform [0,1) generator. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller (consumes two uniforms). */
export function sampleNormal(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Gamma(shape, scale) via Marsaglia–Tsang. shape > 0. */
export function sampleGamma(shape: number, scale: number, rng: () => number): number {
  if (shape < 1) {
    const u = Math.max(rng(), 1e-12);
    return sampleGamma(1 + shape, scale, rng) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  // Bounded loop — accepts with high probability each pass; the cap is a safety net, never hit in practice.
  for (let i = 0; i < 1000; i += 1) {
    let x: number;
    let v: number;
    do {
      x = sampleNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v * scale;
    if (Math.log(Math.max(u, 1e-12)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
  }
  return d * scale; // deterministic fallback (mean) — unreachable in practice
}

/** Poisson(lambda) via Knuth (lambda is small here — team runs ~ few). */
export function samplePoisson(lambda: number, rng: () => number): number {
  if (!(lambda > 0)) return 0;
  // For safety on any large lambda, fall back to a rounded normal approximation.
  if (lambda > 60) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * sampleNormal(rng)));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > L);
  return k - 1;
}

/**
 * Negative-binomial team-run sample with mean μ and variance μ·vmr (vmr ≥ 1). Implemented as a
 * Gamma–Poisson mixture: Λ ~ Gamma(shape = μ/(vmr−1), scale = vmr−1), runs ~ Poisson(Λ). vmr = 1 ⇒
 * plain Poisson. μ is floored at 0.05 so a heavy favourite's opponent still scores occasionally.
 */
export function sampleTeamRuns(mean: number, vmr: number, rng: () => number): number {
  const mu = Math.max(mean, 0.05);
  if (vmr <= 1.0001) return samplePoisson(mu, rng);
  const theta = vmr - 1;
  const shape = mu / theta;
  const lambda = sampleGamma(shape, theta, rng);
  return samplePoisson(lambda, rng);
}

/** Inverse standard-normal CDF (Acklam's rational approximation). Used to anchor the run margin to the market win prob. */
export function invNorm(p: number): number {
  const pp = Math.min(Math.max(p, 1e-9), 1 - 1e-9);
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;
  if (pp < pLow) {
    q = Math.sqrt(-2 * Math.log(pp));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (pp <= pHigh) {
    q = pp - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - pp));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
