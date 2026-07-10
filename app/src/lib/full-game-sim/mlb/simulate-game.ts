/**
 * SIMULATE GAME — the Monte Carlo loop. Samples N (awayRuns, homeRuns) pairs from the overdispersed
 * count model at the market-anchored expected runs, and tallies win probability, projected score,
 * total/margin distributions, priced-line coverage, and the most common scorelines.
 *
 * Pure + deterministic (seeded). Ties (equal runs) are counted 0.5/0.5 for win probability — a modelled
 * stand-in for "headed to extra innings", documented in the model-design doc; a real game has no tie.
 */
import { mulberry32, sampleTeamRuns } from "./rng";
import type { ExpectedRunsResult, MarketInput, SimOptions, SimulationResult, DistBucket } from "./types";

const totalBand = (t: number): string => (t <= 3 ? "0-3" : t <= 6 ? "4-6" : t <= 9 ? "7-9" : t <= 12 ? "10-12" : "13+");
const TOTAL_BANDS = ["0-3", "4-6", "7-9", "10-12", "13+"];
const marginBand = (m: number): string => (m <= -4 ? "away 4+" : m < 0 ? "away 1-3" : m === 0 ? "even (extra innings)" : m < 4 ? "home 1-3" : "home 4+");
const MARGIN_BANDS = ["away 4+", "away 1-3", "even (extra innings)", "home 1-3", "home 4+"];

function toBuckets(order: string[], counts: Map<string, number>, n: number): DistBucket[] {
  return order.filter((b) => (counts.get(b) ?? 0) > 0).map((b) => ({ bucket: b, probability: Number(((counts.get(b) ?? 0) / n).toFixed(4)) }));
}

export function simulateMlbGame(expected: ExpectedRunsResult, market: MarketInput, opts: SimOptions): SimulationResult {
  const n = Math.max(1, Math.floor(opts.runCount));
  const rng = mulberry32(opts.seed);
  const vmr = Math.max(opts.vmr, 1);

  let homeWins = 0; // ties add 0.5 to each side
  let sumHome = 0;
  let sumAway = 0;
  const totalCounts = new Map<string, number>();
  const marginCounts = new Map<string, number>();
  const scoreCounts = new Map<string, number>();
  // Priced-line tallies.
  const hasTotal = typeof market.total === "number";
  const totalLine = market.total ?? 0;
  let over = 0;
  let under = 0;
  let push = 0;
  const rl = market.runLine;
  let rlCover = 0;

  for (let i = 0; i < n; i += 1) {
    const home = sampleTeamRuns(expected.homeExp, vmr, rng);
    const away = sampleTeamRuns(expected.awayExp, vmr, rng);
    sumHome += home;
    sumAway += away;
    if (home > away) homeWins += 1;
    else if (home === away) homeWins += 0.5;
    const t = home + away;
    totalCounts.set(totalBand(t), (totalCounts.get(totalBand(t)) ?? 0) + 1);
    const m = home - away;
    marginCounts.set(marginBand(m), (marginCounts.get(marginBand(m)) ?? 0) + 1);
    if (home <= 20 && away <= 20) { const k = `${away}-${home}`; scoreCounts.set(k, (scoreCounts.get(k) ?? 0) + 1); }
    if (hasTotal) { if (t > totalLine) over += 1; else if (t < totalLine) under += 1; else push += 1; }
    if (rl) { const favMargin = rl.favorite === "home" ? m : -m; if (favMargin + rl.line > 0) rlCover += 1; }
  }

  const topScorelines = [...scoreCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([k, c]) => { const [away, home] = k.split("-").map(Number); return { away, home, probability: Number((c / n).toFixed(4)) }; });

  return {
    runCount: n,
    seed: opts.seed,
    vmr,
    winProbability: { home: Number((homeWins / n).toFixed(4)), away: Number((1 - homeWins / n).toFixed(4)) },
    projectedScore: {
      homeMean: Number((sumHome / n).toFixed(2)),
      awayMean: Number((sumAway / n).toFixed(2)),
      totalMean: Number(((sumHome + sumAway) / n).toFixed(2)),
      marginMean: Number(((sumHome - sumAway) / n).toFixed(2)),
    },
    distributions: { totalRuns: toBuckets(TOTAL_BANDS, totalCounts, n), margin: toBuckets(MARGIN_BANDS, marginCounts, n) },
    coverage: {
      ...(hasTotal ? { total: { line: totalLine, overProbability: Number((over / n).toFixed(4)), underProbability: Number((under / n).toFixed(4)), pushProbability: Number((push / n).toFixed(4)) } } : {}),
      ...(rl ? { runLine: { line: rl.line, favorite: rl.favorite, coverProbability: Number((rlCover / n).toFixed(4)) } } : {}),
    },
    topScorelines,
    warnings: expected.warnings,
  };
}
