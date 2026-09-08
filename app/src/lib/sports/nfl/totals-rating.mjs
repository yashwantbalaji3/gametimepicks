/**
 * MATCHUP TOTALS HEAD (P246 §4B-NFL) — matchup-totals-v1-decayed-points.
 *
 * Walk-forward, strictly pre-game team totals ratings: each team's exponentially decayed mean
 * of (points scored + points allowed) per game, REG+POST only, the exact recurrence the
 * committed backtest evaluated (scripts/nfl/backtest-matchup-totals.mjs). Parameters (a0, a1,
 * sigma, half-life, train mean rating) come ONLY from the evaluation receipt — fit evidence,
 * never constants — and the caller must refuse adoption unless that receipt's verdict is
 * ELIGIBLE. The margin head is untouched by any of this.
 */

export const NFL_TOTALS_HEAD_ID = "matchup-totals-v1-decayed-points";

/**
 * @param {Array<{dateUtc: string, home: string, away: string, ftHome: number, ftAway: number, phase?: number}>} rows
 *   finals rows in the corpus namespace (full team names); preseason rows (phase === 1) are
 *   excluded, matching the evaluated population.
 * @param {string} cutoffIso only games strictly before this instant fold in (pre-game rule).
 * @param {{ halfLifeSelection: { selected: number }, fit: { a0: number, a1: number, sigma: number, meanRatingTrain: number }, verdict: string }} receipt
 */
export function totalsStateAt({ rows, cutoffIso, receipt }) {
  if (receipt?.verdict !== "ELIGIBLE") {
    return { state: "REFUSED", reason: `totals receipt verdict ${receipt?.verdict ?? "ABSENT"} — the shared prior stands` };
  }
  const hl = Number(receipt.halfLifeSelection?.selected);
  const { a0, a1, sigma, meanRatingTrain } = receipt.fit ?? {};
  if (![hl, a0, a1, sigma, meanRatingTrain].every(Number.isFinite)) {
    return { state: "REFUSED", reason: "totals receipt is missing fitted parameters" };
  }
  const alpha = 1 - Math.exp(Math.log(0.5) / hl);
  const state = new Map();
  let leagueSum = 0;
  let leagueN = 0;
  const eligible = (rows ?? [])
    .filter((r) => r.phase !== 1 && r.seasonType !== 1 && Number.isFinite(r.ftHome) && Number.isFinite(r.ftAway) && r.dateUtc < cutoffIso)
    .sort((x, y) => (x.dateUtc < y.dateUtc ? -1 : x.dateUtc > y.dateUtc ? 1 : 0));
  for (const g of eligible) {
    const total = g.ftHome + g.ftAway;
    const mean = leagueN ? leagueSum / leagueN : 44;
    const rH = state.get(g.home) ?? mean;
    const rA = state.get(g.away) ?? mean;
    state.set(g.home, rH + alpha * (total - rH));
    state.set(g.away, rA + alpha * (total - rA));
    leagueSum += total;
    leagueN += 1;
  }
  const leagueMean = leagueN ? leagueSum / leagueN : 44;
  return {
    state: "READY",
    head: NFL_TOTALS_HEAD_ID,
    gamesFolded: leagueN,
    ratingFor: (teamName) => state.get(teamName) ?? leagueMean,
    /** Per-game mu/sigma for the sim: total ~ Normal(a0 + a1·s, sigma). */
    muFor: (homeName, awayName) => {
      const s = ((state.get(homeName) ?? leagueMean) + (state.get(awayName) ?? leagueMean)) / 2 - meanRatingTrain;
      return a0 + a1 * s;
    },
    sigma,
  };
}
