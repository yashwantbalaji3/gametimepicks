/**
 * DAILY BANK BUILDER / MOONSHOT CANDIDATES · POLICY (P0-E, 2026-10-30). Pure constants, each with its source.
 *
 * Nothing here is a new threshold. Every number is read from an existing documented rule, and
 * daily-candidates.test.mjs pins each one to the module that owns it, so a change there fails here.
 *
 *   Bank Builder leg floor 0.60   docs/MULTI_SPORT_BANK_BUILDER_MOONSHOT_DESIGN_2026-07-09.md, Bank Builder rule 3
 *                                 (calibratedProbability; the founder's 10-30 brief requires a calibrated probability)
 *   Bank Builder band +60..+180   parlay-suggested.ts BUILDER_PLUS100_FALLBACK_BAND, target +100
 *   Moonshot floor +700           world-cup/model-qualified-picks.ts MOONSHOT_MIN_COMBINED_ODDS (the live floor; the
 *                                 +600..+2000 band in moonshot/activation-rules.ts is documented as dormant)
 *   Moonshot 2..4 legs            design doc, Moonshot rule 2
 *   Example stake $10             parlay-payout.ts DEFAULT_STAKE (hypothetical, never a placed bet)
 */

export const DAILY_CANDIDATE_SCHEMA = "gtp.products.daily-candidate@1";
export const DAILY_CANDIDATE_RECEIPT_SCHEMA = "gtp.products.daily-candidate-receipt@1";
export const DAILY_CANDIDATE_STATUS_SCHEMA = "gtp.products.daily-candidate-status@1";

/** The four leg types the founder named on 2026-10-30. Other sports pass through the same engine by their own type. */
export const LEG_TYPE = Object.freeze({
  NBA_PLAYER_PROP: "nba_player_prop",
  NBA_GAME_WINNER: "nba_game_winner",
  NFL_PLAYER_PROP: "nfl_player_prop",
  NFL_GAME_WINNER: "nfl_game_winner",
});
export const REQUIRED_LEG_TYPES = Object.freeze(Object.values(LEG_TYPE));
export const LEG_TYPE_LABEL = Object.freeze({
  nba_player_prop: "NBA player props",
  nba_game_winner: "NBA game winner",
  nfl_player_prop: "NFL player props",
  nfl_game_winner: "NFL game winner",
});

export const POLICY = Object.freeze({
  "bank-builder": Object.freeze({
    id: "bank-builder-daily@1",
    product: "bank-builder",
    label: "Bank Builder",
    minLegs: 2,
    maxLegs: 2,
    minLegProbability: 0.6,
    combinedAmerican: Object.freeze({ lo: 60, hi: 180, target: 100 }),
    correlation: Object.freeze({ maxPerParticipant: 1, maxPerEvent: 1, maxPerTeam: 1 }),
  }),
  moonshot: Object.freeze({
    id: "moonshot-daily@1",
    product: "moonshot",
    label: "Moonshot",
    minLegs: 2,
    maxLegs: 4,
    minLegProbability: null,
    combinedAmerican: Object.freeze({ lo: 700, hi: null, target: null }),
    correlation: Object.freeze({ maxPerParticipant: 1, maxPerEvent: 1, maxPerTeam: 1 }),
  }),
});

export const EXAMPLE_STAKE = 10;

/**
 * Which leg types have a calibrated outcome probability that the strategy accepts. Evidence is quoted from the owning
 * artifacts; flipping one to true needs the validation it names AND the founder (see the investigation note
 * bank-moonshot-nba-nfl-2026-10-30.md). The engine still refuses any leg whose own basis is not MODEL_VALIDATED, so
 * this table can only add a refusal, never admit a leg.
 */
export const CALIBRATION_STATUS = Object.freeze({
  nba_player_prop: Object.freeze({
    calibrated: false,
    detail: "The official NBA forecast publishes player medians, not over or under probabilities. The approved direction rule checks where the median sits (above-median share 0.45 to 0.55, at least 300 graded rows); it is not a calibration of the chance a player goes over a line.",
  }),
  nba_game_winner: Object.freeze({
    calibrated: false,
    detail: "The NBA win figure is an Elo-derived estimate whose accuracy is not established: there is no graded regular-season record yet.",
  }),
  nfl_player_prop: Object.freeze({
    calibrated: false,
    detail: "No NFL player family is qualified, and passing and rushing yards are ESTIMATE values shown for research only.",
  }),
  nfl_game_winner: Object.freeze({
    calibrated: false,
    detail: "The NFL win head was evaluated on past seasons, but every game this week is classified experimental and only a validated pick may become a product leg (0 of 13 qualify).",
  }),
});

/** NFL families that are ESTIMATE values (research display only, never a recommended leg). */
export const NFL_ESTIMATE_FAMILIES = Object.freeze(["pass_yds", "rush_yds"]);

/**
 * PUBLIC SWITCHES. `candidateCardsPublic` is committed false: a qualifying candidate renders as "drafted, awaiting
 * founder review" with no legs until the founder flips it. The section itself (which today can only explain why there
 * is no candidate) can be hidden with GTP_DAILY_CANDIDATES_SECTION=off.
 */
export const DAILY_CANDIDATE_SWITCH = Object.freeze({ candidateCardsPublic: false });
export const DAILY_CANDIDATE_SECTION_ENV = "GTP_DAILY_CANDIDATES_SECTION";
export const dailyCandidateSectionEnabled = (env = process.env) => String(env?.[DAILY_CANDIDATE_SECTION_ENV] ?? "").trim().toLowerCase() !== "off";
