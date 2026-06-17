/**
 * Soccer World Cup feature registry (machine-readable subset; full catalog in
 * docs/methodology/world_cup_prediction_methodology.md). Honest implementation status.
 * Key rules: 90_minute_result != advancement; national-team samples are small → blend country role
 * with club form, but never assume club role == country role.
 */
import type { SportFeatureRegistry, FeatureDefinition } from "./types";

const f = (
  name: string, group: FeatureDefinition["group"], status: FeatureDefinition["status"],
  description: string, dataSource: string, freshnessThresholdMinutes: number | null,
  leakageRule: string, required = false,
): FeatureDefinition => ({ name, group, status, description, dataSource, freshnessThresholdMinutes, leakageRule, required });

export const WORLD_CUP_REGISTRY: SportFeatureRegistry = {
  sport: "WORLD_CUP",
  priorities: [
    "starting_status", "projected_minutes", "role_for_country", "team_strength", "team_implied_goals",
    "tactical_matchup", "set_pieces", "penalty_role", "tournament_context", "referee", "venue_weather",
    "club_form_blended_with_country_role", "market",
  ],
  features: [
    f("confirmed_starter_flag", "availability", "partial", "Confirmed in the starting XI.", "api_football lineups", 120, "Only if the XI is confirmed before prediction_time (posts ~1h pre-kickoff).", true),
    f("projected_minutes", "opportunity", "partial", "Projected minutes given role + rotation.", "derived", 240, "Projection; never target-match minutes."),
    f("team_implied_goals", "opportunity", "partial", "Team implied goals from the 3-way + totals.", "the_odds_api", 120, "Snapshot at/before prediction_time."),
    f("penalty_taker_flag", "role", "planned", "Designated penalty taker for the country.", "role data", null, "Pre-match role."),
    f("set_piece_taker_flag", "role", "planned", "Corner / free-kick taker.", "role data", null, "Pre-match role."),
    f("role_for_country", "role", "partial", "Role for the national team (≠ club role).", "derived", null, "Pre-match; blend with club form, don't assume club role."),
    f("national_team_xG_per_90", "efficiency", "partial", "Country xG/90 (excl. target).", "api_football", null, "Rolling window excludes target match; small-sample flag required."),
    f("club_xG_per_90", "efficiency", "planned", "Club xG/90 blended in for sample.", "club data", null, "Excludes target match."),
    f("tactical_matchup_score", "matchup", "planned", "Press vs build-up, width vs fullback, etc.", "derived", null, "Pre-match profiles."),
    f("opponent_center_back_quality", "matchup", "planned", "Opponent CB quality for goalscorer props.", "derived", null, "Pre-match."),
    f("recent_form", "context", "implemented", "Last-5 W/D/L for each side (API-Football).", "api_football", null, "Excludes the target match.", true),
    f("group_standings_context", "context", "partial", "Must-win / draw-is-enough incentives.", "standings", null, "Through prior matchday."),
    f("referee_card_rate", "context", "not_available", "Referee fouls/cards/penalty tendency.", "referee data", null, "Only if ref assigned pre-match."),
    f("double_chance_market", "market", "implemented", "Double-chance / DNB / 3-way de-vigged prices.", "the_odds_api", 120, "Snapshot at/before prediction_time; never closing if predicted earlier.", true),
    f("lineup_not_confirmed_flag", "uncertainty", "implemented", "XI unconfirmed → player-prop DNP risk.", "derived", 120, "n/a"),
    f("limited_data_flag", "uncertainty", "implemented", "Market-implied / small-sample player props.", "derived", null, "n/a"),
    f("leakage_validation_passed", "validation", "implemented", "Pre-event timing checks passed.", "methodology.validation", null, "n/a", true),
  ],
};
