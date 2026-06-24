/**
 * Product Performance ledger — pure, deterministic computation of a product's track record from a list of
 * SETTLED results. It reads settled outcomes (produced by the settlement engine) and derives daily,
 * cumulative, rolling-7d, rolling-30d, and lifetime windows plus longest streaks. It does NOT settle, does
 * NOT fetch, and does NOT touch a bankroll — give it real settled results and it accounts for them; give
 * it none and every window honestly reads zero. No fabrication.
 */

export type SettledOutcome = "won" | "lost" | "push" | "void";

/** One settled bet for a product. `stake`/`payout` are paper units; payout = total returned (stake+win). */
export interface SettledResult {
  productId: string;
  date: string;        // YYYY-MM-DD
  outcome: SettledOutcome;
  stake: number;
  payout: number;      // amount returned: stake×decimal on win, stake on push/void, 0 on loss
}

export interface PerfWindow {
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  stake: number;       // total staked on counted (non-void) bets
  returned: number;    // total returned
  profit: number;      // returned − stake
  roi: number;         // profit / stake (0 when no stake)
  units: number;       // profit measured in average-stake units
  winRate: number;     // wins / (wins + losses)
}

export interface ProductPerformance {
  productId: string;
  daily: Record<string, PerfWindow>;
  cumulative: PerfWindow;
  rolling7d: PerfWindow;
  rolling30d: PerfWindow;
  longestWinStreak: number;
  longestLossStreak: number;
  /** Settled-result series for an ROI sparkline: cumulative profit after each settled bet, in order. */
  roiSeries: Array<{ date: string; cumulativeProfit: number }>;
}

const round = (n: number) => Number(n.toFixed(2));

function emptyWindow(): PerfWindow {
  return { bets: 0, wins: 0, losses: 0, pushes: 0, voids: 0, stake: 0, returned: 0, profit: 0, roi: 0, units: 0, winRate: 0 };
}

/** Fold a set of settled results into one window. Voids/pushes don't count toward win rate or staked ROI. */
function windowOf(results: SettledResult[]): PerfWindow {
  const w = emptyWindow();
  let unitSum = 0, unitCount = 0;
  for (const r of results) {
    w.bets += 1;
    if (r.outcome === "won") w.wins += 1;
    else if (r.outcome === "lost") w.losses += 1;
    else if (r.outcome === "push") w.pushes += 1;
    else w.voids += 1;
    if (r.outcome !== "void") { w.stake += r.stake; w.returned += r.payout; unitSum += r.stake; unitCount += 1; }
  }
  w.profit = round(w.returned - w.stake);
  w.roi = w.stake > 0 ? round((w.profit / w.stake) * 100) : 0;
  const avgStake = unitCount > 0 ? unitSum / unitCount : 0;
  w.units = avgStake > 0 ? round(w.profit / avgStake) : 0;
  w.winRate = (w.wins + w.losses) > 0 ? round((w.wins / (w.wins + w.losses)) * 100) : 0;
  w.stake = round(w.stake); w.returned = round(w.returned);
  return w;
}

/** Days difference a−b (a,b are YYYY-MM-DD). Pure string-date math, no Date() (timezone-safe + resumable). */
function daysBetween(a: string, b: string): number {
  const toNum = (s: string) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toNum(a) - toNum(b)) / 86400000);
}

/**
 * Compute a product's full performance from its settled results. `asOf` (YYYY-MM-DD) anchors the rolling
 * windows; defaults to the latest settled date. Results need not be pre-sorted.
 */
export function computeProductPerformance(productId: string, results: SettledResult[], asOf?: string): ProductPerformance {
  const own = results.filter((r) => r.productId === productId).slice().sort((a, b) => a.date.localeCompare(b.date));
  const anchor = asOf ?? own[own.length - 1]?.date ?? "1970-01-01";

  const daily: Record<string, PerfWindow> = {};
  const byDate = new Map<string, SettledResult[]>();
  for (const r of own) { const g = byDate.get(r.date) ?? []; g.push(r); byDate.set(r.date, g); }
  for (const [date, rs] of byDate) daily[date] = windowOf(rs);

  const within = (n: number) => own.filter((r) => { const d = daysBetween(anchor, r.date); return d >= 0 && d < n; });

  // Longest streaks + ROI series (chronological, counting only decisive bets for streaks).
  let longestWin = 0, longestLoss = 0, curWin = 0, curLoss = 0, cumProfit = 0;
  const roiSeries: ProductPerformance["roiSeries"] = [];
  for (const r of own) {
    if (r.outcome === "won") { curWin += 1; curLoss = 0; }
    else if (r.outcome === "lost") { curLoss += 1; curWin = 0; }
    longestWin = Math.max(longestWin, curWin);
    longestLoss = Math.max(longestLoss, curLoss);
    if (r.outcome !== "void") { cumProfit = round(cumProfit + (r.payout - r.stake)); roiSeries.push({ date: r.date, cumulativeProfit: cumProfit }); }
  }

  return {
    productId,
    daily,
    cumulative: windowOf(own),
    rolling7d: windowOf(within(7)),
    rolling30d: windowOf(within(30)),
    longestWinStreak: longestWin,
    longestLossStreak: longestLoss,
    roiSeries,
  };
}
