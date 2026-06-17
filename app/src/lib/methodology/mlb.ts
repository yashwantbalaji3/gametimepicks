/**
 * MLB feature registry. A machine-readable subset of the full MLB methodology (the complete
 * catalog lives in docs/methodology/mlb_prediction_methodology.md). Each feature carries its group,
 * leakage rule, freshness threshold, and HONEST implementation status — features we don't yet
 * compute are marked "planned"/"not_available", never implied.
 */
import type { SportFeatureRegistry, FeatureDefinition } from "./types";

const f = (
  name: string, group: FeatureDefinition["group"], status: FeatureDefinition["status"],
  description: string, dataSource: string, freshnessThresholdMinutes: number | null,
  leakageRule: string, required = false,
): FeatureDefinition => ({ name, group, status, description, dataSource, freshnessThresholdMinutes, leakageRule, required });

export const MLB_REGISTRY: SportFeatureRegistry = {
  sport: "MLB",
  priorities: [
    "confirmed_lineup", "expected_plate_appearances", "lineup_spot", "starting_pitcher_confirmation",
    "pitch_count_projection", "expected_innings", "handedness", "platoon_advantage", "pitch_mix",
    "park_factors", "weather", "bullpen_fatigue", "umpire", "market", "batter_vs_pitcher_downweighted",
  ],
  features: [
    f("confirmed_in_lineup_flag", "availability", "partial", "Batter confirmed in today's lineup.", "mlb_stats_api lineups", 240, "Only counts if confirmed BEFORE prediction_time.", true),
    f("starter_confirmed_flag", "availability", "implemented", "Probable/confirmed starting pitcher.", "mlb_stats_api probables", 360, "Use the pre-game probable; never the actual starter from the box score.", true),
    f("expected_plate_appearances", "opportunity", "partial", "Projected PAs from lineup spot + team pace.", "derived", 240, "From projected lineup, never target-game PAs."),
    f("lineup_spot", "opportunity", "partial", "Batting-order position today.", "mlb_stats_api lineups", 240, "Confirmed/projected pre-game spot only."),
    f("pitch_count_projection", "opportunity", "planned", "Projected pitch count / leash for the starter.", "derived", 360, "Projection only — never the target-game pitch count."),
    f("expected_innings", "opportunity", "planned", "Projected innings for the starter.", "derived", 360, "Never target-game innings."),
    f("pitcher_handedness", "role", "implemented", "Starter handedness (L/R).", "mlb_stats_api", null, "Static; not leakage-sensitive."),
    f("platoon_advantage_flag", "role", "partial", "Batter vs opposing-starter handedness platoon edge.", "derived", null, "Based on confirmed/projected starter handedness."),
    f("pitcher_K_rate", "efficiency", "implemented", "Season strikeout rate (excl. target).", "mlb_stats_api gameLog", null, "Rolling window excludes the target game.", true),
    f("pitcher_CSW_rate", "efficiency", "planned", "Called-strike + whiff rate.", "statcast", null, "Excludes target game."),
    f("batter_xwOBA", "efficiency", "partial", "Expected wOBA (excl. target).", "statcast", null, "Rolling window excludes the target game."),
    f("pitch_mix_matchup_score", "matchup", "planned", "Pitcher pitch-mix vs opposing lineup strength.", "statcast", null, "Derived from pre-game profiles only."),
    f("batter_vs_pitcher_history", "matchup", "planned", "BvP history — HEAVILY downweighted by sample size.", "mlb_stats_api", null, "Excludes the target game; sample-size flag required.", false),
    f("ballpark_run_factor", "context", "planned", "Park run/HR factors.", "static park factors", null, "Static."),
    f("weather_run_environment_score", "context", "planned", "Forecast temp/wind/air-density score.", "weather forecast", 180, "FORECAST captured pre-game only; never post-event actuals."),
    f("home_plate_umpire_tendency", "context", "not_available", "Umpire strike-zone / run tendency.", "umpire data", 360, "Only if the home-plate ump is known pre-game."),
    f("bullpen_fatigue_score", "context", "planned", "Bullpen innings used last 1-3 days.", "mlb_stats_api", 720, "Through yesterday; never the target game."),
    f("market_implied_probability", "market", "implemented", "No-vig implied probability from current odds.", "the_odds_api", 120, "Snapshot must be at/before prediction_time; never closing odds if predicted earlier."),
    f("line_movement", "market", "planned", "Open→current line/odds movement.", "the_odds_api", 120, "Only movement up to prediction_time."),
    f("lineup_not_confirmed_flag", "uncertainty", "implemented", "Lineup unconfirmed → DNP risk.", "derived", 240, "n/a"),
    f("small_sample_flag", "uncertainty", "implemented", "Historical/matchup sample below threshold.", "derived", null, "n/a"),
    f("leakage_validation_passed", "validation", "implemented", "All pre-event timing checks passed.", "methodology.validation", null, "n/a", true),
  ],
};
