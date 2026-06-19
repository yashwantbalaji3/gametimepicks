/**
 * Balanced risk-bucket generation targets. Each scope tries to fill every bucket up to its target —
 * but a target is a CEILING and an ASPIRATION, never a quota to fabricate toward. When the slate can't
 * supply a real card in a band (e.g. no 2-leg combo prices into Low), the bucket stays empty with a
 * diagnostic reason. Used to cap the suggested-display counts so no single bucket floods the board.
 */
import type { RiskBucket } from "./risk-taxonomy";

export type BalancedScope =
  | "world_cup_single_game" | "world_cup_multi_game" | "mlb" | "mixed" | "moonshot" | "bank_builder";

export const RISK_BUCKET_TARGETS: Record<BalancedScope, Record<RiskBucket, number>> = {
  world_cup_single_game: { low: 1, medium: 1, high: 1, longshot: 1 },
  world_cup_multi_game: { low: 4, medium: 4, high: 4, longshot: 4 },
  mlb: { low: 4, medium: 4, high: 4, longshot: 4 },
  mixed: { low: 4, medium: 4, high: 4, longshot: 4 },
  moonshot: { low: 0, medium: 0, high: 0, longshot: 1 },
  bank_builder: { low: 0, medium: 2, high: 0, longshot: 0 },
};

/** Underfilled / empty reason codes surfaced in diagnostics. */
export type BalancedReason =
  | "no_two_leg_combo_in_low_risk_band"
  | "single_leg_low_disabled"
  | "started_game_excluded"
  | "missing_player_props"
  | "missing_team_markets"
  | "combined_odds_out_of_bucket"
  | "correlation_blocked"
  | "active_card_excluded"
  | "not_enough_distinct_games"
  | "quality_gate_failed";
