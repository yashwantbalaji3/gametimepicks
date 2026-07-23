/**
 * RECORD FAMILIES — the four DISTINCT performance/record families GameTimePicks tracks, and the rule that they are
 * never combined into a single figure. Mixing them (e.g. showing the simulation's projection hit-rate as the paper
 * "record", or summing research settlement into the money W–L) would be a misleading claim. This registry is the
 * single source of truth for the separation; record-family-separation.test.mjs enforces it.
 *
 * No modeling, no money mutation — this is documentation + a typed contract only.
 */
export type RecordFamilyId = "official-paper-record" | "public-sim-accuracy" | "research-observation-settlement" | "market-baseline-benchmark";

export interface RecordFamily {
  id: RecordFamilyId;
  label: string;
  /** Where its numbers legitimately come from. */
  source: string;
  /** Is this family allowed to be shown on public pages? */
  public: boolean;
  /** Plain-English scope so nobody re-labels one family as another. */
  isNot: string;
}

export const RECORD_FAMILIES: Record<RecordFamilyId, RecordFamily> = {
  "official-paper-record": {
    id: "official-paper-record",
    label: "Official paper-product record",
    source: "public/data/mr-dub/portfolio.json (canonical) via money-integrity / flagship / crown-summary",
    public: true,
    isNot: "NOT a simulation accuracy figure, NOT research settlement, NOT profitability of a real account.",
  },
  "public-sim-accuracy": {
    id: "public-sim-accuracy",
    label: "Public simulation projection accuracy",
    source: "public/data/mlb/results/comparison_report_<date>.json (sim projections vs official box scores)",
    public: true,
    isNot: "NOT the paper-product W–L record, NOT bankroll/crown, NOT proof the model beats the market.",
  },
  "research-observation-settlement": {
    id: "research-observation-settlement",
    label: "Research observation settlement",
    source: "data/internal/mlb/pregame-archive (internal warehouse) — GATED, never web-served",
    public: false,
    isNot: "NOT a public metric; internal only until the modeling gate passes + founder approval.",
  },
  "market-baseline-benchmark": {
    id: "market-baseline-benchmark",
    label: "Market-baseline benchmark",
    source: "data/internal/mlb/pregame-archive/status/benchmark.json (internal) — currently INSUFFICIENT",
    public: false,
    isNot: "NOT a public claim; a future model must beat this out-of-sample before anything is called predictive.",
  },
};

/** The canonical money figures — the ONLY place these numbers are authored is portfolio.json. Pinned for guards. */
export const OFFICIAL_PAPER_RECORD = {
  recordLabel: "19-14",
  portfolioMd5: "affe6b21071f2b3be96bb2774eb347c3",
} as const;

/** Rule: no public surface may present a number that blends two families. */
export const NEVER_COMBINE = "The four record families are reported separately and never summed, averaged, or re-labelled as one another.";
