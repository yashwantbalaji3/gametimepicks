/**
 * Model learning — calibration & scoring metrics (Phase 5 v1, pure functions).
 *
 * Consumes REAL settled observations only: each is a pre-kickoff predicted probability paired with the
 * official binary outcome (1 = hit, 0 = miss). Produces Brier score, log loss, and a reliability
 * (calibration) table. NOTHING here fabricates outcomes or uses post-kickoff information — feed it only
 * `{ predictedProb, outcome }` rows built from the model's pre-game projection + the official result.
 *
 * Until June-25 (and forward days) are officially settled there is no observation set to score; this lib
 * is the ready-to-run foundation, not a claim that learning has occurred. Honest by construction:
 * `summarize([])` returns `n:0` and null metrics rather than inventing a number.
 */

export interface Observation {
  predictedProb: number; // model's pre-kickoff probability, 0..1
  outcome: 0 | 1; // official settled result
  label?: string;
}

export interface CalibrationBin {
  lo: number; hi: number; // bin edges
  n: number;
  avgPredicted: number; // mean predicted prob in the bin
  empirical: number; // observed hit rate in the bin
  gap: number; // empirical − avgPredicted (positive = model underconfident)
}

export interface LearningSummary {
  n: number;
  brier: number | null; // mean squared error vs outcome; lower = better
  logLoss: number | null; // mean negative log-likelihood; lower = better
  meanPredicted: number | null;
  empiricalRate: number | null; // overall hit rate
  calibrationError: number | null; // mean |empirical − predicted| over non-empty bins (ECE)
  bins: CalibrationBin[];
}

const clampProb = (p: number) => Math.min(1 - 1e-9, Math.max(1e-9, p));
const round = (n: number, p = 4) => Math.round(n * 10 ** p) / 10 ** p;

export function brierScore(obs: Observation[]): number | null {
  if (!obs.length) return null;
  return round(obs.reduce((s, o) => s + (o.predictedProb - o.outcome) ** 2, 0) / obs.length);
}

export function logLoss(obs: Observation[]): number | null {
  if (!obs.length) return null;
  const ll = obs.reduce((s, o) => {
    const p = clampProb(o.predictedProb);
    return s + (o.outcome === 1 ? -Math.log(p) : -Math.log(1 - p));
  }, 0);
  return round(ll / obs.length);
}

/** Reliability table over `bins` equal-width buckets of predicted probability. */
export function calibrationBins(obs: Observation[], bins = 10): CalibrationBin[] {
  const out: CalibrationBin[] = [];
  for (let i = 0; i < bins; i++) {
    const lo = i / bins, hi = (i + 1) / bins;
    const inBin = obs.filter((o) => o.predictedProb >= lo && (i === bins - 1 ? o.predictedProb <= hi : o.predictedProb < hi));
    if (inBin.length === 0) { out.push({ lo, hi, n: 0, avgPredicted: 0, empirical: 0, gap: 0 }); continue; }
    const avgPredicted = inBin.reduce((s, o) => s + o.predictedProb, 0) / inBin.length;
    const empirical = inBin.reduce((s, o) => s + o.outcome, 0) / inBin.length;
    out.push({ lo, hi, n: inBin.length, avgPredicted: round(avgPredicted), empirical: round(empirical), gap: round(empirical - avgPredicted) });
  }
  return out;
}

/** Full learning summary. Empty input → n:0 with null metrics (never a fabricated score). */
export function summarize(obs: Observation[], bins = 10): LearningSummary {
  if (!obs.length) {
    return { n: 0, brier: null, logLoss: null, meanPredicted: null, empiricalRate: null, calibrationError: null, bins: [] };
  }
  const table = calibrationBins(obs, bins);
  const nonEmpty = table.filter((b) => b.n > 0);
  const ece = nonEmpty.length
    ? round(nonEmpty.reduce((s, b) => s + (b.n / obs.length) * Math.abs(b.gap), 0))
    : null;
  return {
    n: obs.length,
    brier: brierScore(obs),
    logLoss: logLoss(obs),
    meanPredicted: round(obs.reduce((s, o) => s + o.predictedProb, 0) / obs.length),
    empiricalRate: round(obs.reduce((s, o) => s + o.outcome, 0) / obs.length),
    calibrationError: ece,
    bins: table,
  };
}
