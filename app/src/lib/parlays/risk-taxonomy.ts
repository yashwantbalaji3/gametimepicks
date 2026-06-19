/**
 * Canonical risk taxonomy for every public surface. Internal buckets are low/medium/high/longshot;
 * the PUBLIC labels are standardized to "Low Risk / Medium Risk / High Risk / Longshot". Old engine/
 * data strings (lower_variance / balanced / higher_return) are read via normalizeRiskBucket but never
 * shown — UI always renders the canonical label. Also the home for the generation-target matrix and the
 * per-bucket risk gates so the card factory and its diagnostics share one source of truth.
 */
import type { RiskLevel } from "@/lib/parlays/types";

export const RISK_BUCKETS = ["low", "medium", "high", "longshot"] as const;
export type RiskBucket = (typeof RISK_BUCKETS)[number];

export const RISK_LABELS: Record<RiskBucket, string> = {
  low: "Low Risk",
  medium: "Medium Risk",
  high: "High Risk",
  longshot: "Longshot",
};

/** Old/alias strings → canonical bucket. Returns null for unknown input. */
export function normalizeRiskBucket(value: string | null | undefined): RiskBucket | null {
  if (!value) return null;
  const v = String(value).toLowerCase().replace(/[\s-]+/g, "_");
  const map: Record<string, RiskBucket> = {
    low: "low", lower_variance: "low", lower_volatility: "low", conservative: "low", safe: "low",
    medium: "medium", balanced: "medium", moderate: "medium",
    high: "high", higher_return: "high", higher_volatility: "high", aggressive: "high",
    longshot: "longshot", long_shot: "longshot", lottery: "longshot",
  };
  return map[v] ?? (RISK_BUCKETS.includes(v as RiskBucket) ? (v as RiskBucket) : null);
}

/** Canonical public label for any bucket/alias. Falls back to a title-cased input for safety. */
export function riskLabel(value: string | null | undefined): string {
  const b = normalizeRiskBucket(value);
  if (b) return RISK_LABELS[b];
  return value ? value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";
}

/** Short, public-friendly description of what a bucket means (no banned copy). */
export const RISK_REASONS: Record<RiskBucket, string> = {
  low: "Lower-volatility — fewest legs, shortest combined price, highest model survival.",
  medium: "Balanced payout and survival — two to three independent legs.",
  high: "Higher-volatility — stronger payout across more legs, more variance accepted.",
  longshot: "Highest-volatility — many legs for a big payout; explicitly the riskiest bucket.",
};

/** Per-bucket gates the card factory targets (combined American odds band, leg counts). */
export interface RiskGate {
  legs: { min: number; max: number };
  combinedOdds: { min: number; max: number }; // American
  volatility: "lower" | "balanced" | "higher" | "highest";
}
export const RISK_GATES: Record<RiskBucket, RiskGate> = {
  low: { legs: { min: 2, max: 2 }, combinedOdds: { min: -200, max: 180 }, volatility: "lower" },
  medium: { legs: { min: 2, max: 3 }, combinedOdds: { min: 100, max: 400 }, volatility: "balanced" },
  high: { legs: { min: 2, max: 4 }, combinedOdds: { min: 300, max: 900 }, volatility: "higher" },
  longshot: { legs: { min: 3, max: 5 }, combinedOdds: { min: 800, max: 100000 }, volatility: "highest" },
};

/** How many cards the factory aims to produce per scope × bucket (never forced — see diagnostics). */
export type CardScope = "world_cup_single_game" | "world_cup_multi_game" | "mlb" | "mixed";
export interface GenTarget { min: number; target: number; max: number }
export const CARD_GENERATION_TARGETS: Record<CardScope, Record<RiskBucket, GenTarget>> = {
  world_cup_single_game: {
    low: { min: 1, target: 2, max: 4 }, medium: { min: 1, target: 3, max: 5 },
    high: { min: 1, target: 2, max: 4 }, longshot: { min: 0, target: 1, max: 3 },
  },
  world_cup_multi_game: {
    low: { min: 2, target: 4, max: 6 }, medium: { min: 2, target: 5, max: 8 },
    high: { min: 1, target: 4, max: 6 }, longshot: { min: 0, target: 2, max: 4 },
  },
  mlb: {
    low: { min: 2, target: 4, max: 8 }, medium: { min: 2, target: 5, max: 10 },
    high: { min: 1, target: 4, max: 8 }, longshot: { min: 0, target: 2, max: 6 },
  },
  mixed: {
    low: { min: 2, target: 4, max: 8 }, medium: { min: 2, target: 5, max: 10 },
    high: { min: 1, target: 4, max: 8 }, longshot: { min: 0, target: 2, max: 6 },
  },
};
