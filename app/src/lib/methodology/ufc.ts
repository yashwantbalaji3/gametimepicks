/**
 * UFC feature registry (machine-readable subset; full catalog in
 * docs/methodology/ufc_prediction_methodology.md). Honest implementation status.
 * UFC is path-dependent: project HOW the fight is likely to occur, not just who is better.
 */
import type { SportFeatureRegistry, FeatureDefinition } from "./types";

const f = (
  name: string, group: FeatureDefinition["group"], status: FeatureDefinition["status"],
  description: string, dataSource: string, freshnessThresholdMinutes: number | null,
  leakageRule: string, required = false,
): FeatureDefinition => ({ name, group, status, description, dataSource, freshnessThresholdMinutes, leakageRule, required });

export const UFC_REGISTRY: SportFeatureRegistry = {
  sport: "UFC",
  priorities: [
    "availability_and_weigh_in", "short_notice_context", "style_matchup", "phase_specific_skill_edge",
    "fight_duration_projection", "durability_finish_risk", "cardio", "wrestling_grappling_control",
    "striking_volume_defense", "camp_age_layoff_context", "referee_judging", "market",
  ],
  features: [
    f("weigh_in_completed_flag", "availability", "not_available", "Made weight at the official weigh-in.", "weigh-in results", 1440, "Only if known before prediction_time.", true),
    f("missed_weight_flag", "availability", "not_available", "Missed weight (rehydration/penalty context).", "weigh-in results", 1440, "Pre-fight only."),
    f("short_notice_flag", "availability", "partial", "Replacement / short-notice fighter.", "event news", null, "Known pre-fight."),
    f("expected_fight_minutes", "opportunity", "planned", "Projected time on feet / on the mat.", "derived", null, "Projection; never target-fight round stats."),
    f("five_round_fight_flag", "role", "implemented", "Scheduled 5-round (main event/title).", "event card", null, "Static pre-fight."),
    f("significant_strike_accuracy", "efficiency", "partial", "Sig-strike accuracy (career, excl. target).", "fighter stats", null, "Excludes the target fight."),
    f("takedown_accuracy", "efficiency", "partial", "Takedown accuracy (career).", "fighter stats", null, "Excludes target fight."),
    f("style_matchup_score", "matchup", "planned", "Striker/wrestler/grappler style interaction.", "derived", null, "Pre-fight profiles only.", true),
    f("durability_finish_risk", "matchup", "planned", "Knockdown/finish risk from durability + power.", "derived", null, "Career profiles; never target-fight result."),
    f("layoff_days", "context", "partial", "Days since last fight / ring rust.", "fight history", null, "Through the announced date."),
    f("referee_stoppage_tendency", "context", "not_available", "Referee early/late stoppage tendency.", "referee data", null, "Only if ref assigned pre-fight."),
    f("market_implied_probability", "market", "implemented", "No-vig moneyline implied probability.", "the_odds_api", 120, "Never closing odds if predicted earlier."),
    f("cardio_red_flag", "uncertainty", "planned", "Late-round cardio collapse risk.", "derived", null, "n/a"),
    f("leakage_validation_passed", "validation", "implemented", "Pre-event timing checks passed.", "methodology.validation", null, "n/a", true),
  ],
};
