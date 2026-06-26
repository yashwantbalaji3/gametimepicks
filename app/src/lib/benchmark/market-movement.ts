/**
 * Market Benchmark — pre-kickoff line-movement engine (v1).
 *
 * Purpose: track how a market's posted price evolves across the pre-game window so movement can become
 * another *model feature* — NOT a signal to blindly follow. Pure functions over real captured snapshots;
 * nothing here fabricates odds, and every output is reproducible from the stored snapshot rows.
 *
 * A "line" is one (matchId, market, selection) tuple. A capture is one timestamped read of every line on
 * the slate. `capture-market-benchmark.mjs` appends real captures to
 * `world-cup/benchmark/<date>.json`; this lib derives movement from ≥1 captures.
 *
 * Honest by construction: with a single capture there is no movement yet — `direction:"flat"`,
 * `confidence:"opening-only"`, and a low score. Steam/velocity only become meaningful once multiple real
 * captures accrue across the day; we never invent intermediate points.
 */

/** One real, timestamped read of one line. `impliedProb` is the vig-included book probability. */
export interface BenchmarkRow {
  capturedAt: string; // ISO timestamp of the capture
  matchId: string;
  game: string;
  market: string;
  selection: string;
  americanOdds: number;
  impliedProb: number; // 0..1, from the posted American price (vig included)
}

export interface MarketMovement {
  matchId: string;
  market: string;
  selection: string;
  openingOdds: number; // earliest captured American price
  currentOdds: number; // latest captured American price
  openingProb: number;
  currentProb: number;
  netAmerican: number; // currentOdds − openingOdds (sign is informational only)
  impliedProbDelta: number; // currentProb − openingProb (the calibrated movement measure)
  pctMove: number; // relative move in implied probability, %
  direction: "shortening" | "drifting" | "flat"; // prob ↑ = shortening (more likely), ↓ = drifting
  steps: number; // number of distinct captures backing this line
  /** 0–100. Magnitude of probability move scaled by how consistently it moved one way. */
  confidenceScore: number;
  confidence: "opening-only" | "low" | "medium" | "high";
}

/** Implied probability (vig included) from American odds. */
export function americanToImpliedProb(odds: number): number {
  if (!Number.isFinite(odds) || odds === 0) return 0;
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

const round = (n: number, p = 4) => Math.round(n * 10 ** p) / 10 ** p;

/**
 * Movement for one line from its time-ordered capture rows. Rows may arrive unsorted; we sort by
 * capturedAt. A single row yields a flat, "opening-only" movement (no fabricated trend).
 */
export function computeMovement(rows: BenchmarkRow[]): MarketMovement | null {
  if (!rows || rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const open = sorted[0];
  const cur = sorted[sorted.length - 1];
  const openingProb = open.impliedProb || americanToImpliedProb(open.americanOdds);
  const currentProb = cur.impliedProb || americanToImpliedProb(cur.americanOdds);
  const impliedProbDelta = round(currentProb - openingProb);
  const pctMove = openingProb > 0 ? round((impliedProbDelta / openingProb) * 100, 2) : 0;

  // Consistency: of the consecutive prob changes, what share moved the same way as the net move?
  // A clean one-directional drift scores 1.0; a choppy back-and-forth scores lower.
  let consistency = 1;
  if (sorted.length >= 3 && impliedProbDelta !== 0) {
    const netSign = Math.sign(impliedProbDelta);
    let agree = 0, moves = 0;
    for (let i = 1; i < sorted.length; i++) {
      const d = sorted[i].impliedProb - sorted[i - 1].impliedProb;
      if (d === 0) continue;
      moves++;
      if (Math.sign(d) === netSign) agree++;
    }
    consistency = moves > 0 ? agree / moves : 1;
  }

  // Score: scale the absolute prob move (a 10pp pre-game move is large) by consistency. Capped 0–100.
  const magnitude = Math.min(1, Math.abs(impliedProbDelta) / 0.1);
  const confidenceScore = sorted.length < 2 ? 0 : Math.round(magnitude * consistency * 100);

  const direction: MarketMovement["direction"] =
    sorted.length < 2 || impliedProbDelta === 0 ? "flat" : impliedProbDelta > 0 ? "shortening" : "drifting";

  const confidence: MarketMovement["confidence"] =
    sorted.length < 2 ? "opening-only" : confidenceScore >= 66 ? "high" : confidenceScore >= 33 ? "medium" : "low";

  return {
    matchId: open.matchId,
    market: open.market,
    selection: open.selection,
    openingOdds: open.americanOdds,
    currentOdds: cur.americanOdds,
    openingProb: round(openingProb),
    currentProb: round(currentProb),
    netAmerican: cur.americanOdds - open.americanOdds,
    impliedProbDelta,
    pctMove,
    direction,
    steps: sorted.length,
    confidenceScore,
    confidence,
  };
}

/** Group flat rows into per-line series, then compute movement for each. Key = matchId|market|selection. */
export function computeAllMovements(rows: BenchmarkRow[]): MarketMovement[] {
  const byLine = new Map<string, BenchmarkRow[]>();
  for (const r of rows) {
    const key = `${r.matchId}|${r.market}|${r.selection}`;
    (byLine.get(key) ?? byLine.set(key, []).get(key)!).push(r);
  }
  return [...byLine.values()].map(computeMovement).filter((m): m is MarketMovement => m !== null);
}
