/**
 * EXPECTED RUNS — the market anchor. Splits the market total into home/away expected runs so that the
 * simulated win probability matches the market moneyline AND the simulated total matches the market
 * total, both by construction. This is why v1 is a MARKET-ANCHORED simulation, not an independent
 * predictive model: the point estimates come from the market; only the DISTRIBUTIONS are sampled.
 *
 * Closed form: with home/away runs modelled as independent overdispersed counts (variance = mean·VMR),
 * the margin's variance is total·VMR regardless of the split, so the margin that yields home-win-prob p
 * is m = Φ⁻¹(p)·√(total·VMR). Then homeExp = (total+m)/2, awayExp = (total−m)/2. Pure, no io.
 */
import { invNorm } from "./rng";
import type { MarketInput, ExpectedRunsResult } from "./types";

export class MissingTotalError extends Error {
  constructor() {
    super("cannot simulate: no market total to anchor expected runs");
    this.name = "MissingTotalError";
  }
}

export function buildExpectedRuns(market: MarketInput, vmr: number): ExpectedRunsResult {
  const warnings: string[] = [];
  const total = market.total;
  if (typeof total !== "number" || !Number.isFinite(total) || total <= 0) {
    throw new MissingTotalError();
  }

  let margin = 0;
  let winProbAnchored = false;
  const p = market.homeWinProb;
  if (typeof p === "number" && Number.isFinite(p) && p > 0 && p < 1) {
    // Anchor the margin to the market win prob. var(margin) = total·VMR (independent of the split).
    margin = invNorm(p) * Math.sqrt(total * Math.max(vmr, 1));
    winProbAnchored = true;
  } else {
    warnings.push("no market moneyline — expected runs split evenly (no win-probability anchor)");
  }

  // Keep the split physical: neither team's expected runs can be negative; cap the margin at the total.
  const cappedMargin = Math.max(-total * 0.98, Math.min(total * 0.98, margin));
  if (cappedMargin !== margin) warnings.push("margin capped to keep both expected-run means non-negative");

  const homeExp = (total + cappedMargin) / 2;
  const awayExp = (total - cappedMargin) / 2;
  return { homeExp, awayExp, total, margin: cappedMargin, anchored: { total: true, winProb: winProbAnchored }, warnings };
}
