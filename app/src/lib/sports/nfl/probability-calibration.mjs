/** Fixed deciles with visible denominators, including empty bins. Development diagnostics. */
export function probabilityCalibration(points) {
  const bins = Array.from({ length: 10 }, (_, i) => ({ lower: i / 10, upper: (i + 1) / 10, n: 0, positives: 0, sumProbability: 0 }));
  for (const { p, hit } of points) {
    if (!Number.isFinite(p) || p < 0 || p > 1 || (hit !== 0 && hit !== 1)) throw new Error("invalid calibration observation");
    const b = bins[Math.min(9, Math.floor(p * 10))];
    b.n++; b.positives += hit; b.sumProbability += p;
  }
  const output = bins.map(({ sumProbability, ...b }) => ({ ...b, meanProbability: b.n ? sumProbability / b.n : null, observedRate: b.n ? b.positives / b.n : null }));
  return { n: points.length, ece: points.length ? output.reduce((s, b) => s + (b.n ? b.n * Math.abs(b.meanProbability - b.observedRate) : 0), 0) / points.length : null, bins: output };
}
