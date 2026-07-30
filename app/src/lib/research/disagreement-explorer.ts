/**
 * MARKET DISAGREEMENT EXPLORER — view assembly and the copy that goes with it.
 *
 * The explorer answers one question per row: the sportsbook says X, the simulation says Y, they differ
 * by Z, this is what happened, and this is how rows that differed by about Z have done before.
 *
 * TWO CONSTRAINTS SHAPE EVERYTHING HERE
 *
 *  1. Only rows whose provenance is PROVEN are shown. A row whose capture time relative to first pitch
 *     is unknown cannot support the sentence "the market said X before the game started", and most of
 *     the settled corpus is in that position. Those rows are not deleted — they are counted in the
 *     historical buckets, where the denominator is stated — but they are not displayed as individual
 *     evidence. `lib/research/row-lineage.ts` decides which is which.
 *
 *  2. Every sentence is produced here, not in the component, so the guard test can scan the strings a
 *     reader will actually see rather than grep a `.tsx` file and hope. `disagreement-explorer.test.mjs`
 *     renders the full copy surface from fixtures and fails on any wager-, stake-, ROI- or
 *     advantage-shaped word.
 *
 * Pure: no I/O, no React. The reading lives in `disagreement-explorer-loader.ts`.
 */
import type { MarketFamily } from "@/lib/analytics/event-contract";
import { isPredictionDisabled, MLB_MARKET_CALIBRATION } from "@/lib/mlb/model-calibration-status";

import {
  bucketSummaryForGap,
  orderByEventTime,
  rankByGap,
  type GapBucketSummary,
  type GapBucketTable,
  type OrderableRow,
} from "./disagreement-buckets";

import { COVERAGE_LABEL, COVERAGE_MEANING, type RowCoverageState } from "./row-lineage";

/** Coarse analytics family for a market key. A FAMILY bucket only — never a line, price, or payload. */
export function analyticsMarketFamily(marketKey: string | null | undefined): MarketFamily {
  switch (marketKey) {
    case "h2h":
      return "moneyline";
    case "spreads":
      return "run_line";
    case "totals":
      return "total";
    case "pitcher_strikeouts":
      return "strikeouts";
    case "batter_hits":
      return "hits";
    case "batter_total_bases":
      return "total_bases";
    case "batter_hits_runs_rbis":
      return "hits_runs_rbis";
    case "batter_home_runs":
      return "home_runs";
    default:
      return "other";
  }
}

export type SettlementState = "WIN" | "LOSS" | "VOID" | "PENDING" | "WITHHELD";

/** Map a ledger outcome string onto the explorer's settlement state. Unknown strings stay PENDING. */
export function settlementStateOf(outcome: string | null | undefined): SettlementState {
  switch (String(outcome ?? "").toLowerCase()) {
    case "win":
      return "WIN";
    case "loss":
      return "LOSS";
    case "void":
    case "push":
      return "VOID";
    default:
      return "PENDING";
  }
}

export const SETTLEMENT_LABEL: Readonly<Record<SettlementState, string>> = {
  WIN: "Came in",
  LOSS: "Did not come in",
  VOID: "Voided",
  PENDING: "Not settled yet",
  WITHHELD: "Withheld",
};

export interface MarketPolicyView {
  readonly marketKey: string;
  /** Registry status from the public research contract. Read, never recomputed. */
  readonly registryStatus: string;
  readonly predictionDisabled: boolean;
  readonly note: string;
}

/**
 * The policy line for a market.
 *
 * `batter_total_bases` states its disablement in the row itself rather than only in a footnote,
 * because the reason it is disabled — a full-corpus hit-rate interval entirely below 50% — is exactly
 * the thing a reader scanning a table of probabilities would otherwise not know.
 */
export function marketPolicy(marketKey: string, registryStatus: string): MarketPolicyView {
  const disabled = isPredictionDisabled(marketKey);
  const cal = MLB_MARKET_CALIBRATION[marketKey];
  const note = disabled
    ? "Predictions are switched off for this market: across the full settled corpus its hit-rate interval sits entirely below 50%. History stays visible; the row is never placed in a difference-ordered list."
    : cal
      ? `Measured on ${cal.sampleSize.toLocaleString()} settled rows, this market's simulated probability scores worse than the sportsbook price on both Brier and log loss. It is shown as market context, not as a better estimate.`
      : "This market has no published calibration record yet, so nothing is claimed about how its simulated probability has performed.";
  return { marketKey, registryStatus, predictionDisabled: disabled, note };
}

export interface ExplorerRowInput extends OrderableRow {
  readonly date: string;
  readonly player: string;
  readonly marketLabel: string;
  readonly line: number | null;
  readonly side: "over" | "under";
  readonly matchup: string;
  /** De-vigged sportsbook probability for the leaned side. Null when the snapshot was one-sided. */
  readonly marketProbability: number | null;
  /**
   * The no-vig probability the pregame archive itself recorded, when it recorded one.
   *
   * Carried alongside `marketProbability` rather than replacing it. The archive captured the price at
   * its own moment and the board captured it at another; across 2026-07-27 they differ by about a
   * percentage point on average and up to four. The gap is measured against `marketProbability` so a
   * row is comparable with the historical table, and this figure is shown as provenance.
   */
  readonly capturedNoVigProbability: number | null;
  /** The simulation's own output. Never overwritten. */
  readonly rawProbability: number;
  /** Raw, corrected by a calibrator fitted on strictly earlier data. Null when none applies. */
  readonly calibratedProbability: number | null;
  readonly displayedProbability: number;
  readonly displayedSource: "raw" | "calibrated";
  readonly outcome: string | null;
  readonly coverageState: RowCoverageState;
  readonly registryStatus: string;
  readonly capturedAt: string | null;
  readonly eventStart: string | null;
  readonly settlementSourceRef: string | null;
  readonly eventId: string | null;
}

export interface ExplorerRow extends ExplorerRowInput {
  readonly gapDirection: "above" | "below" | "level" | null;
  readonly settlementState: SettlementState;
  readonly bucket: GapBucketSummary | null;
  readonly policy: MarketPolicyView;
  readonly lineageLabel: string;
  readonly lineageMeaning: string;
  readonly analyticsFamily: MarketFamily;
  readonly interpretation: string;
  readonly bucketSentence: string;
}

const pct = (p: number | null | undefined, digits = 1): string =>
  typeof p === "number" && Number.isFinite(p) ? `${(p * 100).toFixed(digits)}%` : "not available";

const pp = (v: number | null | undefined, digits = 1): string =>
  typeof v === "number" && Number.isFinite(v) ? `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)} pp` : "—";

/**
 * The sentence describing one bucket.
 *
 * Always carries the denominator, the window and the interval together. A rate without its denominator
 * is the single most reliably over-read number on a research surface, and one without its window
 * quietly claims to describe the present.
 */
export function bucketSentence(summary: GapBucketSummary | null): string {
  if (!summary) return "This difference does not fall in any measured range, so there is no history to compare it against.";
  if (summary.n === 0 || summary.observedRate == null) {
    return `No settled rows ${summary.bucket.label} yet, so there is no rate to report for this range.`;
  }
  const ci = summary.interval;
  const range = ci ? ` (95% interval ${pct(ci.low)}–${pct(ci.high)})` : "";
  const brier = summary.brier == null ? "" : ` Brier ${summary.brier.toFixed(3)}.`;
  const window = summary.window ? ` between ${summary.window.from} and ${summary.window.to}` : "";
  return `Rows ${summary.bucket.label} have come in ${pct(summary.observedRate)} of the time across ${summary.n.toLocaleString()} settled rows${window}${range}.${brier}`;
}

export interface BuildExplorerInput {
  readonly rows: readonly ExplorerRowInput[];
  readonly table: GapBucketTable;
}

/**
 * Attach bucket, policy, lineage labels and copy to each row. Ordering is applied separately.
 *
 * The difference is measured as the SIMULATION'S OWN OUTPUT minus the market — not the calibrated
 * figure. Two reasons: the raw number is the evidence, unmodified by anything fitted afterwards; and
 * the historical table a row's bucket comes from is built the same way, so a row and its comparison
 * set mean the same thing. The calibrated figure is shown beside it as its own layer.
 */
export function buildExplorerRows(input: BuildExplorerInput): ExplorerRow[] {
  return input.rows.map((r) => {
    const summary = bucketSummaryForGap(input.table, r.gapPp);
    const policy = marketPolicy(r.marketKey, r.registryStatus);
    const gapDirection =
      r.gapPp == null ? null : r.gapPp > 0 ? "above" : r.gapPp < 0 ? "below" : "level";

    const side = r.side === "over" ? "over" : "under";
    const lineText = r.line == null ? r.marketLabel : `${r.marketLabel} ${r.line}`;
    const head = `On ${r.player} ${side} ${lineText}, the sportsbook price converts to ${pct(r.marketProbability)} and the simulation produced ${pct(r.rawProbability)}.`;
    const calibratedNote =
      r.calibratedProbability == null
        ? " No calibrator applies to this market, so the simulation's own number is the one shown."
        : ` Calibrated against earlier settled results that becomes ${pct(r.calibratedProbability)}.`;
    const sentence = bucketSentence(summary);
    const disabledNote = policy.predictionDisabled ? ` ${policy.note}` : "";

    const interpretation =
      r.gapPp == null || r.marketProbability == null
        ? `${head}${calibratedNote} Only one side of this market was captured, so the two cannot be compared on a like-for-like basis.${disabledNote}`
        : `${head}${calibratedNote} The simulation's own number sits ${pp(r.gapPp)} ${gapDirection === "level" ? "level with" : gapDirection} the market. ${sentence}${disabledNote}`;

    return {
      ...r,
      gapDirection,
      settlementState: r.coverageState === "QUARANTINED" ? "WITHHELD" : settlementStateOf(r.outcome),
      bucket: summary,
      policy,
      lineageLabel: COVERAGE_LABEL[r.coverageState],
      lineageMeaning: COVERAGE_MEANING[r.coverageState],
      analyticsFamily: analyticsMarketFamily(r.marketKey),
      interpretation,
      bucketSentence: sentence,
    };
  });
}

export type ExplorerOrder = "event_time" | "largest_gap";

export interface OrderedExplorerRows<T extends OrderableRow> {
  readonly order: ExplorerOrder;
  readonly rows: readonly T[];
  /** Rows the chosen ordering will not rank, each with its reason. Always rendered. */
  readonly notRankable: readonly { readonly row: T; readonly reason: string }[];
}

/**
 * Apply an ordering.
 *
 * The largest-gap ordering keeps prediction-disabled markets out of the ranked list entirely and
 * returns them separately, so the caller can render them in neutral order with the reason attached.
 *
 * Generic over the row shape so the same ordering runs on the server type and on the flattened view
 * the client receives — one implementation, so the two cannot drift into ordering differently.
 */
export function orderExplorerRows<T extends OrderableRow>(
  rows: readonly T[],
  order: ExplorerOrder,
): OrderedExplorerRows<T> {
  if (order === "event_time") {
    return { order, rows: orderByEventTime(rows), notRankable: [] };
  }
  const { ranked, notRankable } = rankByGap(rows);
  return { order, rows: ranked, notRankable: notRankable.map((e) => ({ row: e.row, reason: e.reason })) };
}

// ── the flat, JSON-safe shape the client receives ──────────────────────────────────────────────

/**
 * One row, flattened.
 *
 * Bucket EDGES are deliberately absent: they are `±Infinity` for the open ranges, and a serialization
 * boundary is not the place to discover which encodings survive it. The client renders the bucket's
 * label and counts, which is what a reader needs.
 */
export interface ExplorerRowView extends OrderableRow {
  readonly date: string;
  readonly player: string;
  readonly marketLabel: string;
  readonly line: number | null;
  readonly side: "over" | "under";
  readonly matchup: string;
  readonly marketProbability: number | null;
  readonly capturedNoVigProbability: number | null;
  readonly rawProbability: number;
  readonly calibratedProbability: number | null;
  readonly gapDirection: "above" | "below" | "level" | null;
  readonly settlementState: SettlementState;
  readonly settlementLabel: string;
  readonly bucketLabel: string | null;
  readonly bucketN: number;
  readonly bucketRate: number | null;
  readonly bucketBrier: number | null;
  readonly bucketLow: number | null;
  readonly bucketHigh: number | null;
  readonly bucketFrom: string | null;
  readonly bucketTo: string | null;
  readonly bucketSuppressedReason: string | null;
  readonly registryStatus: string;
  readonly predictionDisabled: boolean;
  readonly policyNote: string;
  readonly coverageState: RowCoverageState;
  readonly lineageLabel: string;
  readonly lineageMeaning: string;
  readonly capturedAt: string | null;
  readonly eventStart: string | null;
  readonly settlementSourceRef: string | null;
  readonly eventId: string | null;
  readonly analyticsFamily: MarketFamily;
  readonly interpretation: string;
  readonly bucketSentence: string;
}

export function toExplorerRowViews(rows: readonly ExplorerRow[]): ExplorerRowView[] {
  return rows.map((r) => ({
    rowId: r.rowId,
    marketKey: r.marketKey,
    startTime: r.startTime,
    gapPp: r.gapPp,
    date: r.date,
    player: r.player,
    marketLabel: r.marketLabel,
    line: r.line,
    side: r.side,
    matchup: r.matchup,
    marketProbability: r.marketProbability,
    capturedNoVigProbability: r.capturedNoVigProbability,
    rawProbability: r.rawProbability,
    calibratedProbability: r.calibratedProbability,
    gapDirection: r.gapDirection,
    settlementState: r.settlementState,
    settlementLabel: SETTLEMENT_LABEL[r.settlementState],
    bucketLabel: r.bucket?.bucket.label ?? null,
    bucketN: r.bucket?.n ?? 0,
    bucketRate: r.bucket?.observedRate ?? null,
    bucketBrier: r.bucket?.brier ?? null,
    bucketLow: r.bucket?.interval?.low ?? null,
    bucketHigh: r.bucket?.interval?.high ?? null,
    bucketFrom: r.bucket?.window?.from ?? null,
    bucketTo: r.bucket?.window?.to ?? null,
    bucketSuppressedReason: r.bucket?.suppressedReason ?? null,
    registryStatus: r.registryStatus,
    predictionDisabled: r.policy.predictionDisabled,
    policyNote: r.policy.note,
    coverageState: r.coverageState,
    lineageLabel: r.lineageLabel,
    lineageMeaning: r.lineageMeaning,
    capturedAt: r.capturedAt,
    eventStart: r.eventStart,
    settlementSourceRef: r.settlementSourceRef,
    eventId: r.eventId,
    analyticsFamily: r.analyticsFamily,
    interpretation: r.interpretation,
    bucketSentence: r.bucketSentence,
  }));
}

/** One historical range, flattened for the client. Every figure keeps its denominator and window. */
export interface GapBucketView {
  readonly id: string;
  readonly label: string;
  readonly n: number;
  readonly observedRate: number | null;
  readonly brier: number | null;
  readonly low: number | null;
  readonly high: number | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly suppressedReason: string | null;
}

export function toGapBucketViews(table: GapBucketTable): GapBucketView[] {
  return table.buckets.map((b) => ({
    id: b.bucket.id,
    label: b.bucket.label,
    n: b.n,
    observedRate: b.observedRate,
    brier: b.brier,
    low: b.interval?.low ?? null,
    high: b.interval?.high ?? null,
    from: b.window?.from ?? null,
    to: b.window?.to ?? null,
    suppressedReason: b.suppressedReason,
  }));
}

// ── standing copy ──────────────────────────────────────────────────────────────────────────────

export const EXPLORER_TITLE = "Market disagreement explorer";

export const EXPLORER_INTRO =
  "For each row: what the sportsbook price converts to, what the simulation produced, how far apart they are, " +
  "what happened afterwards, and how rows that disagreed by a similar amount have performed historically. " +
  "A difference is a disagreement between two estimates. On settled history the sportsbook price has been the " +
  "better estimate, so a large difference is something to look at and never a recommendation. Paper and educational only.";

export const EXPLORER_ELIGIBILITY_NOTE =
  "Only rows with a pregame capture record are listed individually — rows whose observation time relative to " +
  "first pitch cannot be proven are excluded from the list. They still appear inside the historical ranges below, " +
  "where the number of rows behind every figure is shown.";

export const EXPLORER_PROBABILITY_NOTE =
  "Three probabilities are kept apart on purpose. The sportsbook figure is the posted price with the margin " +
  "removed, converted by GameTimePicks. The simulation figure is the model's own output. The calibrated figure " +
  "is that output mapped onto what actually happened, using a calibrator fitted only on earlier dates. " +
  "Calibration makes the stated number closer to true; measured on the same rows it does not close the gap to the " +
  "sportsbook price.";

/** The honest empty state. Never "no data" — always which precondition failed. */
export function explorerUnavailableReason(input: {
  artifactPresent: boolean;
  dateAvailable: boolean;
  eligibleRows: number;
}): string | null {
  if (!input.artifactPresent) {
    return "The per-row lineage file has not been built for this slate, so nothing is listed. Rows are not shown without it, because a row with no provenance record cannot be described honestly.";
  }
  if (!input.dateAvailable) {
    return "No settled slate has a per-row lineage file yet.";
  }
  if (input.eligibleRows === 0) {
    return "This slate has a lineage file, but no row on it has a pregame capture record, so no row can be listed individually.";
  }
  return null;
}
