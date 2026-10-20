/**
 * nba-possession-sim-v0 · PARAMETERS, each with its source. PURE.
 * NBA RESEARCH PROTOTYPE · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * FITTED values come from app/scripts/nba/research/fit-possession-sim-v0.mjs run on the 2023-24 regular season ONLY
 * (corpus season 2024; boxscores of seasons ≤ 2024 loaded, nothing later) and are stored with their derivations in
 * data/internal/research/nba/reports/possession-sim-v0-fit-2024.json. They are copied here (rounded) and frozen
 * BEFORE any 2024-25 (development season) number was computed. The fit test (possession-sim-params.test.mjs) checks
 * every copied value against that report.
 *
 * RULE values are NBA playing rules, not fitted. INHERITED values are v1 constants (themselves fitted on 2023-24 in
 * sim-v1-calibration-2024.json) imported read-only. MATH values are bounds that keep probabilities in [0, 1].
 */
import { V1_PARAMS } from "../../game-sim-v1.mjs";

export const POSSESSION_SIM_VERSION = "nba-possession-sim-v0";
export const DATA_CLASS = "PRIVATE_RESEARCH";
export const PRODUCT_ELIGIBLE = false;

export const FIT_REPORT = "data/internal/research/nba/reports/possession-sim-v0-fit-2024.json";

/** Fitted on 2023-24 (see FIT_REPORT → fit.*; method in the fit script header). */
export const FITTED = Object.freeze({
  // MLE over 2023-24 player-games of P(FTA odd) = (1 − (1−2θ)^FGM · e^(−2τ·MIN)) / 2:
  AND_ONE_PER_FGM: 0.0608,            // θ — one-shot trips per made field goal
  THREE_SHOT_TRIPS_PER_MIN: 0.001083, // τ — odd trips not tied to a make (three-shot fouls, technicals), per player-minute
  // league ratios, 2023-24 player box-score sums:
  STEAL_SHARE_OF_TOV: 0.5794,         // Σ STL(defence) / Σ TOV(offence)
  BLOCK_PER_MISS2: 0.2067,            // NNLS: BLK(defence) ≈ β2·missed 2PA(offence) + β3·missed 3PA(offence)
  BLOCK_PER_MISS3: 0.0055,
  PLAYER_REBOUND_SHARE: 0.8826,       // Σ(OREB + opp DREB) / Σ live misses (missed FGA + missed last FT of each trip)
  // home ÷ away league ratios (2023-24), applied as √ratio to the home side and 1/√ratio to the away side:
  HOME_FG_RATIO: 1.0153,
  HOME_TOV_RATIO: 0.9989,
  HOME_TRIP_RATIO: 1.0196,
  // game segments per 48 = PACE_OFFSET + PACE_SLOPE · (pace_home + pace_away)/2   (OLS, as-of team paces; slope > 1
  // because the shrunk as-of paces are compressed toward the league, as v1's TOTAL_WEIGHT)
  PACE_OFFSET: -186.625,
  PACE_SLOPE: 1.7832,
  // segment duration ~ min(SHOT_CLOCK, Gamma(shape, ·)) with the shape matching the residual variance of game segments
  SEGMENT_DURATION_SHAPE: 1.274,
  // late-game intentional fouling: in period ≥ 4 with ≤ W deciseconds left, a defence trailing by 1..D fouls
  // (grid fit on simulated 2023-24 games: matches winner-minus-loser FTA in games with final margin 1–3 / 4–6 / 7–10;
  // W is an EFFECTIVE window — the engine's foul segments take a normal segment's time, real intentional fouls are faster)
  LATE_FOUL_WINDOW_DS: 600,
  LATE_FOUL_MAX_DEFICIT: 6,
});

/** NBA playing rules (not fitted). */
export const RULES = Object.freeze({
  SHOT_CLOCK_DS: 240,               // 24-second shot clock — caps any one timed segment
  PERSONAL_FOUL_LIMIT: 6,           // disqualification on the 6th personal foul
  MANDATORY_TIMEOUT_CLOCKS_DS: Object.freeze([4200, 1800]), // mandatory-timeout points since 2017-18: first dead ball after 7:00 and 3:00 of each regulation period — the substitution windows
  JUMP_BALL_PERIODS: Object.freeze([1, "OT"]),             // opening tip and every OT start; Q2/Q3 to the tip loser, Q4 to the tip winner
});

/** Inherited from nba-sim-v1-coherent (fitted on 2023-24, sim-v1-calibration-2024.json), read-only. */
export const INHERITED = Object.freeze({
  MINUTES_POWER: V1_PARAMS.MINUTES_POWER, // target-minutes water-filling exponent
});

/** Structural choices (documented in docs/nba/NBA_POSSESSION_SIM_V0_RESEARCH.md §Structure; no numeric constant). */
export const STRUCTURE = Object.freeze({
  jumpBallWinProbability: "0.5 — symmetric; no jump-ball data in the corpus",
  substitutionRule: "at each window the 5 eligible players with the largest remaining target seconds are on court",
  lateFoulVictim: "fouled player drawn ∝ two-shot-trip rate among the offence on court",
});

export const POSSESSION_PARAMS = Object.freeze({ ...FITTED, ...INHERITED, ...RULES });
