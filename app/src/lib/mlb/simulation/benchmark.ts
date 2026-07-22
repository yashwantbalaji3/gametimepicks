/**
 * MLB research BENCHMARK framework — pure metrics + baselines (2026-07-22).
 *
 * Scoring rules for comparing a FUTURE model against baselines (sportsbook implied, de-vig market, a simple
 * historical baseline, a player-average baseline). Pure + deterministic; NO model, NO prediction here. The runner
 * (app/scripts/mlb-research-benchmark.mjs) will not score anything until enough settled observations exist and the
 * founder approves — until then it reports INSUFFICIENT.
 */

export interface Prediction { p: number; outcome: 0 | 1 } // p = P(over/win); outcome = did it happen

const clamp = (x: number, lo = 1e-6, hi = 1 - 1e-6) => Math.min(hi, Math.max(lo, x));

/** Brier score = mean squared error of probabilities. Lower is better. */
export function brierScore(preds: Prediction[]): number | null {
  if (!preds.length) return null;
  return +(preds.reduce((a, d) => a + (d.p - d.outcome) ** 2, 0) / preds.length).toFixed(6);
}

/** Log loss (cross-entropy). Lower is better. */
export function logLoss(preds: Prediction[]): number | null {
  if (!preds.length) return null;
  const s = preds.reduce((a, d) => { const p = clamp(d.p); return a + (d.outcome ? Math.log(p) : Math.log(1 - p)); }, 0);
  return +(-s / preds.length).toFixed(6);
}

/** Accuracy at a decision threshold (default 0.5). */
export function accuracy(preds: Prediction[], threshold = 0.5): number | null {
  if (!preds.length) return null;
  const correct = preds.filter((d) => (d.p >= threshold ? 1 : 0) === d.outcome).length;
  return +(correct / preds.length).toFixed(4);
}

/** Reliability/calibration bins: predicted mean vs observed rate per bin. */
export function calibrationBins(preds: Prediction[], nBins = 10): { bin: number; predMean: number; obsRate: number; n: number }[] {
  const bins = Array.from({ length: nBins }, () => ({ sumP: 0, sumO: 0, n: 0 }));
  for (const d of preds) { const i = Math.min(nBins - 1, Math.floor(clamp(d.p) * nBins)); bins[i].sumP += d.p; bins[i].sumO += d.outcome; bins[i].n++; }
  return bins.map((b, i) => ({ bin: i, predMean: b.n ? +(b.sumP / b.n).toFixed(4) : 0, obsRate: b.n ? +(b.sumO / b.n).toFixed(4) : 0, n: b.n })).filter((b) => b.n > 0);
}

/** Flat-stake paper ROI: bet 1 unit when the model prob beats the break-even implied by the odds. Research only. */
export function roiSim(bets: { pModel: number; decimalOdds: number; outcome: 0 | 1 }[]): { bets: number; roiPct: number | null; units: number } {
  let staked = 0, ret = 0;
  for (const b of bets) {
    const breakEven = 1 / b.decimalOdds;
    if (b.pModel > breakEven) { staked += 1; ret += b.outcome ? b.decimalOdds - 1 : -1; }
  }
  return { bets: staked, units: +ret.toFixed(3), roiPct: staked ? +((100 * ret) / staked).toFixed(2) : null };
}

/** The baselines every future model must beat OUT OF SAMPLE before it can be called predictive. */
export const BASELINES = [
  { key: "sportsbook_implied", label: "Sportsbook implied probability", prob: (o: BaselineObs) => o.impliedProbability },
  { key: "market_devig", label: "De-vig market probability", prob: (o: BaselineObs) => o.noVigProbability },
  { key: "historical_base_rate", label: "Simple historical base rate (per market)", prob: (o: BaselineObs) => o.historicalBaseRate },
  { key: "player_average", label: "Player-average baseline", prob: (o: BaselineObs) => o.playerAverageProb },
] as const;

export interface BaselineObs { impliedProbability: number | null; noVigProbability: number | null; historicalBaseRate: number | null; playerAverageProb: number | null }

/** Player-average baseline: historical rate at which THIS player cleared the line (needs settled history). */
export function playerAverageBaseline(exceededLine: number, gamesWithData: number): number | null {
  return gamesWithData > 0 ? +(exceededLine / gamesWithData).toFixed(4) : null;
}

/** League-average baseline: rate at which ANY player cleared this market's line (needs settled history). */
export function leagueAverageBaseline(leagueExceeded: number, leagueGames: number): number | null {
  return leagueGames > 0 ? +(leagueExceeded / leagueGames).toFixed(4) : null;
}

/** A baseline is only usable once it has enough settled history; below MIN it is INSUFFICIENT (never guessed). */
export const BASELINE_MIN_HISTORY = 20;
export function baselineSufficiency(n: number): "sufficient" | "insufficient" { return n >= BASELINE_MIN_HISTORY ? "sufficient" : "insufficient"; }

export const BENCHMARK_GATE = {
  minSettledEligibleObs: 500, minDistinctDates: 30, plusFounderApproval: true,
  note: "No benchmark is scored until >= 500 settled-eligible observations across >= 30 dates exist AND the founder approves; a model is 'predictive' only if it beats the de-vig market baseline OUT OF SAMPLE.",
} as const;
