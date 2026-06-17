/**
 * Global, sport-agnostic methodology rules: the opportunity-first hierarchy, leakage-safe rolling
 * windows, the never-use leakage list, and sample-size bucketing. Pure data + helpers.
 */
import type { FeatureGroup, SampleSizeBucket } from "./types";

/** Opportunity-first priority order applied across every sport. */
export const FEATURE_PRIORITY: FeatureGroup[] = [
  "availability",
  "opportunity",
  "role",
  "matchup",
  "efficiency",
  "context",
  "market", // optional but powerful
  "uncertainty",
  "validation",
];

/** Non-negotiable principle, in one line, for docs/UI. */
export const PRINCIPLE =
  "Opportunity first · Role second · Matchup third · Efficiency fourth · Context fifth · " +
  "Market optional but powerful · Historical head-to-head last and heavily downweighted.";

/** Rolling windows — ALL exclude the target event. */
export const ROLLING_WINDOWS = [
  "season_to_date_excluding_target",
  "last_30_days_excluding_target",
  "last_15_games_excluding_target",
  "last_10_games_excluding_target",
  "last_5_games_excluding_target",
  "last_3_games_excluding_target",
] as const;

/** Inputs that must NEVER be used as pre-event features (would leak the target outcome). */
export const NEVER_USE = [
  "target_game_final_score",
  "target_game_box_score",
  "target_game_minutes",
  "target_game_pitch_count",
  "target_game_plate_appearances",
  "target_game_starting_lineup_unless_confirmed_before_prediction_time",
  "target_game_starting_XI_unless_confirmed_before_prediction_time",
  "target_game_fight_result",
  "target_game_method",
  "target_game_round_stats",
  "rolling_averages_that_include_target_event",
  "closing_odds_if_prediction_time_was_before_closing_market",
  "post_event_injury_news",
  "post_event_weather_actuals",
] as const;

/** The hard prediction-time inequality, as a string for docs. */
export const PREDICTION_TIME_RULE = "feature_timestamp <= prediction_time < event_start_time";

export function sampleSizeBucket(n: number): SampleSizeBucket {
  if (n <= 0) return "sample_size_0";
  if (n <= 5) return "sample_size_1_to_5";
  if (n <= 15) return "sample_size_6_to_15";
  if (n <= 30) return "sample_size_16_to_30";
  return "sample_size_31_plus";
}

/** Recommended downweight per bucket (0 = ignore, 1 = full confidence). */
export function sampleWeight(n: number): number {
  switch (sampleSizeBucket(n)) {
    case "sample_size_0": return 0;
    case "sample_size_1_to_5": return 0.15;
    case "sample_size_6_to_15": return 0.45;
    case "sample_size_16_to_30": return 0.75;
    case "sample_size_31_plus": return 1;
  }
}

export function smallSampleFlag(n: number): boolean {
  return n > 0 && n <= 15;
}
