/** Finite Poisson exponential family parameterized by its MEAN, not its rate. */
const cache = new Map();
export function boundedCountProbabilities(mean, max) {
  if (!Number.isFinite(mean) || mean < 0 || !Number.isInteger(max) || max < 0 || max > 1000) throw new RangeError("invalid bounded count parameters");
  const target = Math.min(mean, max);
  const key = `${target}:${max}`;
  if (cache.has(key)) return cache.get(key);
  let probabilities;
  if (target === 0 || target === max) {
    probabilities = Array.from({ length: max + 1 }, (_, k) => Number(k === target));
  } else {
    const logs = [0];
    for (let k = 1; k <= max; k++) logs.push(logs[k - 1] + Math.log(k));
    const evaluate = theta => {
      const values = logs.map((f, k) => k * theta - f);
      const peak = Math.max(...values);
      const weights = values.map(x => Math.exp(x - peak));
      const total = weights.reduce((a, b) => a + b, 0);
      const p = weights.map(x => x / total);
      return { p, mean: p.reduce((s, x, k) => s + k * x, 0) };
    };
    let lo = -64, hi = 64;
    for (let i = 0; i < 90; i++) {
      const mid = (lo + hi) / 2;
      if (evaluate(mid).mean < target) lo = mid; else hi = mid;
    }
    probabilities = evaluate((lo + hi) / 2).p;
    if (Math.abs(probabilities.reduce((s, p, k) => s + p * k, 0) - target) > 1e-9) throw new Error("bounded count mean solve failed");
  }
  if (cache.size >= 4096) cache.clear();
  const result = Object.freeze(probabilities);
  cache.set(key, result);
  return result;
}

export function drawMeanPreservingBoundedCount(rng, mean, max) {
  const probabilities = boundedCountProbabilities(mean, max);
  let u = rng();
  if (!Number.isFinite(u) || u < 0 || u >= 1) throw new RangeError("invalid RNG output");
  for (let k = 0; k < probabilities.length; k++) {
    u -= probabilities[k];
    if (u < 0) return k;
  }
  return max;
}
