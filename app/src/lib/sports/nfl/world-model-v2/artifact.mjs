/**
 * NFL WORLD MODEL V2 — artifact identity, evidence status, unsupported families and limitations, written into every
 * per-game artifact. (The Top boards moved to lib/sports/nfl/forecast-view.mjs, which ranks the same rows the game page
 * renders.)
 */

export const WORLD_MODEL_V2 = Object.freeze({
  id: "nfl-world-model-v2",
  version: "2.1.0",
  label: "World Model V2",
  components: Object.freeze({
    score: "published margin and total heads of nfl-regular-season-public-v1 (normal draws, snapped)",
    overtime: "10-minute-OT outcome record 2017–2025; winner by the margin head",
    scoring: "nfl-game-worlds-v1 TD|points table + exact historical scoring compositions",
    opportunity: "nfl-opportunity-allocation-v1 (allocV1) shares, reallocation and volume",
    worlds: "nfl-allocation-worlds-v1 Dirichlet-multinomial allocation, binomial catches, gamma yards",
  }),
});

/** Evidence ladder — each rung is a separate claim; none implies the next. */
export const STATUS = Object.freeze({
  label: "UNDER_FORWARD_EVALUATION",
  developmentTested: Object.freeze({ value: true, scope: "player receptions, receiving / rushing / passing yards from game worlds: development look PROCEED_TO_FORWARD_SHADOW (2022–2025)" }),
  prospectivelyCaptured: Object.freeze({ value: true, scope: "Week 5 2026 candidates frozen before kickoff (private captures 2026-10-08T18:21Z, T18:27Z)" }),
  forwardEvaluated: Object.freeze({ value: false, scope: "no graded forward sample yet" }),
  productEligible: Object.freeze({ value: false, scope: "needs forward evaluation against the preregistered bars" }),
  productionPromoted: Object.freeze({ value: false, scope: "the published game forecast remains the forecast of record" }),
});

export const UNSUPPORTED = Object.freeze([
  Object.freeze({ family: "anytime_td", reason: "Touchdown scorer probabilities from these worlds failed their evaluation (log loss 0.5138 vs 0.5109 for the red-zone model; calibration error 0.034). Diagnosis: a scorer must touch the ball in the same world, which double-counts opportunity and moves touchdowns from part-time to every-down players. Not published as probabilities; anytime-touchdown chances shown on the site come from the separate touchdown model." }),
  Object.freeze({ family: "passing_td", reason: "Passing touchdowns are credited to the passer in every world, but no evaluation of passing-touchdown distributions exists. Not published as probabilities." }),
  Object.freeze({ family: "interceptions, sacks, kicking and defensive player stats", reason: "Not simulated." }),
]);

export const LIMITATIONS = Object.freeze([
  "Scores come from the published margin and total heads; they do not see injuries or who plays quarterback.",
  "Simulated final scores do not cluster on 3- and 7-point margins the way real NFL scores do, so exact-score frequencies from these games are not published.",
  "The win chance here is counted from these simulated games and can differ from the published win chance, which comes from a separate rating.",
  "Overtime outcomes are drawn from the 2017–2025 record, not simulated play by play.",
  "Player volume does not yet adjust to an opposing defense beyond the team-level volume fit.",
  "Red-zone history ends with 2025; 2026 games add no red-zone evidence.",
  "Plays by players outside the named active set are counted in team totals only.",
]);
