/**
 * NBA feature registry (machine-readable subset; full catalog in
 * docs/methodology/nba_prediction_methodology.md). Honest implementation status.
 * NBA principle: recent ROLE matters more than recent box-score form.
 */
import type { SportFeatureRegistry, FeatureDefinition } from "./types";

const f = (
  name: string, group: FeatureDefinition["group"], status: FeatureDefinition["status"],
  description: string, dataSource: string, freshnessThresholdMinutes: number | null,
  leakageRule: string, required = false,
): FeatureDefinition => ({ name, group, status, description, dataSource, freshnessThresholdMinutes, leakageRule, required });

export const NBA_REGISTRY: SportFeatureRegistry = {
  sport: "NBA",
  priorities: [
    "projected_minutes", "starter_status", "rotation_stability", "injury_context", "vacated_usage",
    "usage_rate", "touches", "pace", "team_implied_total", "stat_specific_opportunity", "matchup",
    "rest_travel", "blowout_risk", "efficiency", "market",
  ],
  features: [
    f("active_status", "availability", "partial", "Active / out / questionable status.", "injury report", 360, "Pre-game status only; confirmed before prediction_time.", true),
    f("projected_minutes", "opportunity", "partial", "Projected minutes (the single biggest driver).", "derived + rotation", 360, "Projection from pre-game rotation; never target-game minutes.", true),
    f("usage_rate", "opportunity", "implemented", "Usage rate (excl. target).", "nba_api", null, "Rolling window excludes target game."),
    f("vacated_usage", "opportunity", "planned", "Usage/minutes vacated by out teammates — allocated by on/off, NOT split equally.", "derived on/off", 360, "Based on confirmed-out teammates pre-game."),
    f("starter_flag", "role", "partial", "Starter vs bench today.", "lineups/rotation", 360, "Pre-game role only."),
    f("rotation_stability_score", "role", "planned", "How stable the player's role has been.", "derived", null, "Excludes target game."),
    f("true_shooting_percentage", "efficiency", "implemented", "TS% (excl. target).", "nba_api", null, "Rolling window excludes target game."),
    f("primary_defender_matchup", "matchup", "planned", "Likely primary defender + their rim/perimeter profile.", "matchup data", null, "Pre-game projection."),
    f("opponent_pace_allowed", "matchup", "partial", "Opponent pace / scheme.", "nba_api", null, "Excludes target game."),
    f("team_implied_total", "context", "partial", "Team implied total from the spread+total.", "the_odds_api", 120, "Snapshot at/before prediction_time."),
    f("rest_back_to_back_flag", "context", "implemented", "B2B / 3-in-4 / rest days.", "schedule", null, "Schedule through yesterday."),
    f("blowout_risk", "context", "partial", "Blowout → garbage-time minutes risk.", "derived from spread", 120, "From pre-game spread."),
    f("market_implied_probability", "market", "implemented", "No-vig implied probability.", "the_odds_api", 120, "Never closing odds if predicted earlier."),
    f("minutes_uncertainty_score", "uncertainty", "implemented", "Volatility of projected minutes.", "derived", null, "n/a"),
    f("leakage_validation_passed", "validation", "implemented", "Pre-event timing checks passed.", "methodology.validation", null, "n/a", true),
  ],
};
