/**
 * MLB RELIABILITY — turn settled per-prop calibration rows into learned reliability tables.
 *
 * Pure, side-effect-free, and part of the DELIBERATELY UNWIRED calibration folder (see types.ts). It
 * takes already-loaded rows (no fs) and returns per-market / per-confidence / per-edge-bucket hit
 * rates plus a learned `historicalReliability` in [0,1] — the exact input `calibrate()` expects. The
 * scripts read rows from disk and call this; no public recommendation path imports it
 * (calibration.test.mjs enforces that).
 */
import { clamp01 } from "./reliability";

/** The minimal row shape this needs (a structural subset of an MlbCalibrationRow). */
export interface CalRow {
  market?: string | null;
  confidence?: string | null;
  edgePct?: number | null;
  outcome: string;
}

export interface ReliabilityBucket {
  key: string;
  n: number;
  wins: number;
  losses: number;
  hitRate: number;
  /** Learned reliability in [0,1] — feed as `historicalReliability` to calibrate(). */
  historicalReliability: number;
  sample: "no-conclusion" | "weak" | "reportable";
}

/** Sample tier by decisive n. */
export function sampleTier(n: number): ReliabilityBucket["sample"] {
  return n < 30 ? "no-conclusion" : n < 100 ? "weak" : "reportable";
}

/**
 * Learned reliability from a settled hit rate: centered at 0.5 (coin flip ⇒ defer to the market),
 * scaled by the edge over 50%. Held near neutral until the sample is reportable (n ≥ 100) so a thin
 * market can't earn a strong weight. This is the `historicalReliability` the blend consumes — NOT a
 * live recommendation weight.
 */
export function historicalReliability(hitRate: number, n: number): number {
  if (n < 100) return 0.3; // insufficient history — hold near the market
  return Number(clamp01(0.5 + (hitRate - 0.5) * 4).toFixed(2));
}

function tallyBy(rows: readonly CalRow[], keyOf: (r: CalRow) => string | null | undefined): ReliabilityBucket[] {
  const acc = new Map<string, { wins: number; losses: number }>();
  for (const r of rows) {
    if (r.outcome !== "win" && r.outcome !== "loss") continue; // decisive only
    const k = keyOf(r);
    if (k == null || k === "") continue;
    const b = acc.get(k) ?? { wins: 0, losses: 0 };
    if (r.outcome === "win") b.wins++; else b.losses++;
    acc.set(k, b);
  }
  return [...acc.entries()].map(([key, b]) => {
    const n = b.wins + b.losses;
    const hitRate = n > 0 ? b.wins / n : 0;
    return { key, n, wins: b.wins, losses: b.losses, hitRate: Number(hitRate.toFixed(4)), historicalReliability: historicalReliability(hitRate, n), sample: sampleTier(n) };
  });
}

/** Edge bucket label for a signed edge in pp (null when no edge). */
export function edgeBucket(e: number | null | undefined): string | null {
  if (typeof e !== "number" || !Number.isFinite(e)) return null;
  return e < 0 ? "<0" : e < 2.5 ? "0-2.5" : e < 5 ? "2.5-5" : e < 10 ? "5-10" : e < 20 ? "10-20" : "20+";
}

/** Per-market reliability, strongest first. */
export function computeMarketReliability(rows: readonly CalRow[]): ReliabilityBucket[] {
  return tallyBy(rows, (r) => r.market).sort((a, b) => b.hitRate - a.hitRate);
}

/** Per-confidence-tier reliability (High→Medium→Low order). */
export function computeConfidenceReliability(rows: readonly CalRow[]): ReliabilityBucket[] {
  const order: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  return tallyBy(rows, (r) => r.confidence).sort((a, b) => (order[a.key] ?? 9) - (order[b.key] ?? 9));
}

/** Per-edge-bucket reliability (fixed bucket order). */
export function computeEdgeBucketReliability(rows: readonly CalRow[]): ReliabilityBucket[] {
  const ORDER = ["<0", "0-2.5", "2.5-5", "5-10", "10-20", "20+"];
  return tallyBy(rows, (r) => edgeBucket(r.edgePct)).sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
}
