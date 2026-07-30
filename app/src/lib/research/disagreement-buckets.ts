/**
 * GAP BUCKETS — the historical answer to "rows that disagreed with the market by this much, before."
 *
 * WHY THE ARITHMETIC LIVES HERE AND NOT IN A COMPONENT
 * A rate rendered inside a component is a rate nobody can test. Every number the Market Disagreement
 * Explorer shows — denominator, observed rate, Brier, Wilson interval — is produced by this file and
 * asserted in `disagreement-explorer.test.mjs`. The component receives finished values and formats
 * them.
 *
 * WHAT THE MEASURED HISTORY SAYS
 * Over the settled corpus (2026-05-16 → 2026-07-27, quarantined dates excluded), bucketing by how far
 * the simulation's probability sat above the de-vigged market price on the side it leaned:
 *
 *     gap  +2 to  +5 pp   n=4052   observed 52.5%   Brier 0.240
 *     gap  +5 to +10 pp   n=6010   observed 51.9%   Brier 0.245
 *     gap +10 to +20 pp   n=6905   observed 49.4%   Brier 0.266
 *     gap +20 pp and up   n=1566   observed 46.5%   Brier 0.311
 *
 * The biggest disagreements performed the WORST, on both the hit rate and the Brier score. That is the
 * opposite of the intuition a "largest difference" sort invites, so any surface offering that ordering
 * has to say so in the same view — see `largestGapCaution`, which derives the sentence from the table
 * rather than hardcoding a claim that could drift from the data.
 *
 * A gap is a disagreement and nothing more. Nothing here ranks a row as preferable to another.
 *
 * Pure: no I/O, no React.
 */
import { isPredictionDisabled } from "@/lib/mlb/model-calibration-status";

/** 95% two-sided. Fixed so every interval on the site means the same thing. */
export const WILSON_Z = 1.96;

/**
 * Wilson score interval for a binomial proportion.
 *
 * Wilson rather than normal-approximation because the buckets at the extremes are small and the rates
 * sit near 0.5 — the naive interval is wrong exactly where the reader is most likely to over-read a
 * number. Returns null at n = 0: an interval around no observations is not a wide interval, it is no
 * interval.
 */
export function wilsonInterval(wins: number, n: number, z = WILSON_Z): { low: number; high: number } | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  const p = wins / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return {
    low: Math.max(0, (centre - spread) / denom),
    high: Math.min(1, (centre + spread) / denom),
  };
}

/** Mean squared error of stated probability against the binary outcome. Null at n = 0. */
export function brierScore(rows: readonly { statedProbability: number; won: boolean }[]): number | null {
  if (rows.length === 0) return null;
  let sum = 0;
  for (const r of rows) sum += (r.statedProbability - (r.won ? 1 : 0)) ** 2;
  return sum / rows.length;
}

/**
 * De-vig a two-way price into a fair probability for one side.
 *
 * Null unless both sides are present: the stored corpus holds roughly a 6.9% overround, so comparing a
 * model probability against a raw implied one is comparing against a number that is not a probability.
 */
export function noVigProbability(
  impliedOver: number | null | undefined,
  impliedUnder: number | null | undefined,
  side: "over" | "under",
): number | null {
  if (typeof impliedOver !== "number" || typeof impliedUnder !== "number") return null;
  const sum = impliedOver + impliedUnder;
  if (!(sum > 0)) return null;
  return (side === "over" ? impliedOver : impliedUnder) / sum;
}

// ── buckets ────────────────────────────────────────────────────────────────────────────────────

export interface GapBucketDefinition {
  readonly id: string;
  /** Inclusive lower edge in percentage points. `-Infinity` for the open bucket. */
  readonly fromPp: number;
  /** Exclusive upper edge in percentage points. `Infinity` for the open bucket. */
  readonly toPp: number;
  readonly label: string;
}

/**
 * Bucket edges in percentage points of (simulation probability − no-vig market probability).
 *
 * Negative buckets are defined even though the published board only ever leans in the direction the
 * simulation favours, so they are empty today. They stay because an empty bucket must render as "no
 * observations" rather than disappear — a table that silently omits its zero rows teaches the reader
 * that every bucket shown is populated.
 */
export const GAP_BUCKETS: readonly GapBucketDefinition[] = [
  { id: "lte-neg-2", fromPp: -Infinity, toPp: -2, label: "2 pp or more below the market" },
  { id: "neg-2-to-2", fromPp: -2, toPp: 2, label: "within 2 pp of the market" },
  { id: "2-to-5", fromPp: 2, toPp: 5, label: "2–5 pp above the market" },
  { id: "5-to-10", fromPp: 5, toPp: 10, label: "5–10 pp above the market" },
  { id: "10-to-20", fromPp: 10, toPp: 20, label: "10–20 pp above the market" },
  { id: "gte-20", fromPp: 20, toPp: Infinity, label: "20 pp or more above the market" },
];

/** The bucket a signed percentage-point gap falls in, or null when the gap is not a number. */
export function bucketForGap(gapPp: number | null | undefined): GapBucketDefinition | null {
  if (typeof gapPp !== "number" || !Number.isFinite(gapPp)) return null;
  return GAP_BUCKETS.find((b) => gapPp >= b.fromPp && gapPp < b.toPp) ?? null;
}

/** One settled observation feeding the historical table. */
export interface HistoricalGapRow {
  readonly date: string;
  readonly marketKey: string;
  /** Signed percentage points: simulation probability minus no-vig market probability. */
  readonly gapPp: number;
  /** The probability actually stated for this row, used for the Brier score. */
  readonly statedProbability: number;
  readonly won: boolean;
  /** False for anything an integrity gate refused. Such rows never reach a denominator. */
  readonly countsTowardRates: boolean;
}

export interface GapBucketSummary {
  readonly bucket: GapBucketDefinition;
  /** Rows in the denominator. Always shown, including when it is zero. */
  readonly n: number;
  readonly wins: number;
  /** Null at n = 0 — never 0%, which reads as a measured result. */
  readonly observedRate: number | null;
  readonly brier: number | null;
  readonly interval: { readonly low: number; readonly high: number } | null;
  /** Earliest and latest settled date in the bucket, so every rate carries its window. */
  readonly window: { readonly from: string; readonly to: string } | null;
  /** Why there is no rate, when there is none. Null when a rate is present. */
  readonly suppressedReason: string | null;
}

export interface GapBucketTable {
  readonly buckets: readonly GapBucketSummary[];
  readonly totalRows: number;
  /** Rows excluded because an integrity gate refused them. Reported, never silently dropped. */
  readonly excludedRows: number;
  readonly window: { readonly from: string; readonly to: string } | null;
}

const NO_ROWS = "no settled rows in this range yet";

/**
 * Build the historical table.
 *
 * Rows with `countsTowardRates === false` are removed from every denominator and counted in
 * `excludedRows`. "n = 30" means something different when 400 rows were dropped to reach it, so the
 * number of exclusions travels with the table rather than being inferable only by subtraction.
 */
export function buildGapBucketTable(rows: readonly HistoricalGapRow[]): GapBucketTable {
  const usable = rows.filter((r) => r.countsTowardRates);
  const excludedRows = rows.length - usable.length;

  const grouped = new Map<string, HistoricalGapRow[]>();
  for (const r of usable) {
    const b = bucketForGap(r.gapPp);
    if (!b) continue;
    grouped.set(b.id, [...(grouped.get(b.id) ?? []), r]);
  }

  const span = (rs: readonly HistoricalGapRow[]) => {
    if (rs.length === 0) return null;
    const dates = rs.map((r) => r.date).sort();
    return { from: dates[0], to: dates[dates.length - 1] };
  };

  const buckets = GAP_BUCKETS.map((bucket): GapBucketSummary => {
    const rs = grouped.get(bucket.id) ?? [];
    const n = rs.length;
    const wins = rs.filter((r) => r.won).length;
    if (n === 0) {
      return {
        bucket, n: 0, wins: 0,
        observedRate: null, brier: null, interval: null, window: null,
        suppressedReason: NO_ROWS,
      };
    }
    return {
      bucket,
      n,
      wins,
      observedRate: wins / n,
      brier: brierScore(rs),
      interval: wilsonInterval(wins, n),
      window: span(rs),
      suppressedReason: null,
    };
  });

  return { buckets, totalRows: usable.length, excludedRows, window: span(usable) };
}

/** The bucket summary matching one row's gap, or null when the gap does not fall in any bucket. */
export function bucketSummaryForGap(
  table: GapBucketTable,
  gapPp: number | null | undefined,
): GapBucketSummary | null {
  const b = bucketForGap(gapPp);
  return b ? (table.buckets.find((s) => s.bucket.id === b.id) ?? null) : null;
}

// ── ordering ───────────────────────────────────────────────────────────────────────────────────

/** A row the explorer can order. Only the fields ordering is allowed to see. */
export interface OrderableRow {
  readonly rowId: string;
  readonly marketKey: string;
  readonly startTime: string | null;
  readonly gapPp: number | null;
}

export interface GapRanking<T extends OrderableRow> {
  readonly ranked: readonly T[];
  /** Rows kept out of the ranking, each with the reason. Rendered, never dropped. */
  readonly notRankable: readonly { readonly row: T; readonly reason: string }[];
}

/**
 * The DEFAULT ordering: event time, then row id. Neutral by construction.
 *
 * Never probability and never gap, because the most prominent position on a research surface is itself
 * a claim. The measured record makes the model's largest disagreements its worst ones, so a
 * gap-ordered default would put the least reliable rows at the top of the page.
 */
export function orderByEventTime<T extends OrderableRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const t = String(a.startTime ?? "").localeCompare(String(b.startTime ?? ""));
    return t !== 0 ? t : a.rowId.localeCompare(b.rowId);
  });
}

/**
 * The OPTIONAL largest-gap ordering.
 *
 * Markets whose predictions are disabled by the preregistered protocol are excluded outright rather
 * than ranked low: a disabled market appearing anywhere in a magnitude-ordered list is a
 * recommendation-shaped placement, and `batter_total_bases` has a full-corpus hit-rate interval
 * entirely below 50%. They are returned separately with the reason so the surface can still show them
 * in neutral order.
 */
export function rankByGap<T extends OrderableRow>(rows: readonly T[]): GapRanking<T> {
  const ranked: T[] = [];
  const notRankable: { row: T; reason: string }[] = [];

  for (const r of rows) {
    if (isPredictionDisabled(r.marketKey)) {
      notRankable.push({
        row: r,
        reason: "predictions are disabled for this market, so it is not placed in any magnitude-ordered list",
      });
      continue;
    }
    if (typeof r.gapPp !== "number" || !Number.isFinite(r.gapPp)) {
      notRankable.push({ row: r, reason: "no comparable market price, so there is no difference to order by" });
      continue;
    }
    ranked.push(r);
  }

  ranked.sort((a, b) => {
    const d = (b.gapPp as number) - (a.gapPp as number);
    return d !== 0 ? d : a.rowId.localeCompare(b.rowId);
  });

  return { ranked, notRankable };
}

/**
 * The sentence that must accompany the largest-gap ordering, derived from the table.
 *
 * Returns null when the history cannot support the comparison, and the caller must then withhold the
 * ordering rather than show it uncaptioned — a sort that invites a reading the data contradicts is not
 * neutral just because no claim was written next to it.
 *
 * The direction of the claim is taken from the Brier scores, not the hit rates. Hit rates across
 * adjacent buckets sit within each other's intervals; the Brier score separates them cleanly (0.240 in
 * the narrowest populated range against 0.313 in the widest), so it is the comparison that can carry a
 * statement without over-reading noise.
 */
export function largestGapCaution(table: GapBucketTable): string | null {
  const populated = table.buckets.filter((b) => b.n > 0 && b.observedRate != null && b.brier != null);
  if (populated.length < 2) return null;
  const narrowest = populated[0];
  const widest = populated[populated.length - 1];

  const rate = (b: GapBucketSummary) => `${((b.observedRate as number) * 100).toFixed(1)}%`;
  const brier = (b: GapBucketSummary) => (b.brier as number).toFixed(3);
  // A HIGHER Brier score is a worse one.
  const widestIsWorse = (widest.brier as number) > (narrowest.brier as number);
  const window = table.window ? `${table.window.from} to ${table.window.to}` : "the settled window";

  return (
    `Ordering by the size of the difference finds disagreement; it ranks nothing. Across settled history ` +
    `(${window}), rows ${widest.bucket.label} came in ${rate(widest)} of the time over ${widest.n.toLocaleString()} rows ` +
    `with a Brier score of ${brier(widest)}, while rows ${narrowest.bucket.label} came in ${rate(narrowest)} over ` +
    `${narrowest.n.toLocaleString()} rows with a Brier score of ${brier(narrowest)}. A higher Brier score is a worse one, ` +
    `so on that measure the largest disagreements have been the ${widestIsWorse ? "least" : "most"} accurate rows on the board, ` +
    `${widestIsWorse ? "not the most" : "not the least"}.`
  );
}
