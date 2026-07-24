/**
 * CANONICAL PREDICTION-DECISION CONTRACT (Sprint 009 · Phase 1). ONE deterministic decision object per game,
 * derived purely from the Sprint 008 full-game simulation artifact plus the current market SNAPSHOT (used
 * only as the threshold + a comparison — never as the direction of the prediction). Every surface (Game
 * Report hero, /today, homepage, social drafts) consumes THIS object so they can never disagree.
 *
 * PREDICTION ≠ EDGE. The prediction is the simulation's directional answer; it is stated even when the market
 * agrees. Nothing here is "edge", "value", "advantage", a "best bet", or a profitability claim.
 */

import type { FullGameCompleteness, MarketComparison } from "@/lib/mlb/full-game/types";
import type { StrengthLabel } from "./strength";

export type Side = "home" | "away";
export type TotalPick = "OVER" | "UNDER" | "PUSH" | "UNAVAILABLE";
/** How the simulation probability relates to the market-implied probability (descriptive, never "edge"). */
export type MarketAgreement = "ALIGNED" | "MODEL HIGHER" | "MODEL LOWER" | "NO MARKET";

export interface MoneylinePrediction {
  side: Side;
  team: string;
  simulationProbability: number;
  marketImpliedProbability: number | null;
  marketAgreement: MarketAgreement;
  strengthLabel: StrengthLabel;
}

export interface TotalPrediction {
  /** The posted market total line the pick is evaluated against (null → no line → UNAVAILABLE). */
  line: number | null;
  pick: TotalPick;
  overProbability: number | null;
  underProbability: number | null;
  pushProbability: number | null;
  /** Median simulated total runs (evidence; NOT the basis of the pick). */
  simulationMedian: number | null;
  marketImpliedOver: number | null;
  strengthLabel: StrengthLabel | null;
  unavailableReason?: string;
}

export interface RunLinePrediction {
  /** Which team is the run-line favorite (lays −1.5), from the simulation win probability. */
  favorite: Side;
  /** The standard MLB run-line magnitude (1.5). */
  line: number;
  /** Human pick, e.g. "SF -1.5" or "LAA +1.5". */
  pick: string;
  pickSide: Side;
  pickLine: number; // −1.5 or +1.5
  coverProbability: number;
  opposingCoverProbability: number;
  pushProbability: number;
  strengthLabel: StrengthLabel;
}

export interface TeamTotalPrediction {
  team: string;
  side: Side;
  /** The posted team-total line, or null when no market line exists (→ pick UNAVAILABLE). */
  line: number | null;
  pick: TotalPick;
  overProbability: number | null;
  underProbability: number | null;
  pushProbability: number | null;
  /** Simulated team-run median (shown as evidence even when there is no market line to pick against). */
  simulationMedian: number;
  unavailableReason?: string;
}

export interface PlayerPrediction {
  player: string;
  team: string;
  market: string;
  marketLabel: string;
  line: number;
  pick: "OVER" | "UNDER";
  simulationProbability: number;
  marketImpliedProbability: number | null;
  strengthLabel: StrengthLabel;
  /** Which engine produced this line-level probability (legacy prop engine until parity migration). */
  source: "unified_full_game" | "legacy_prop_engine";
}

export interface GamePredictionDecision {
  gamePk: number;
  slateDate: string;
  slug: string;
  awayTeam: string;
  homeTeam: string;
  awayTeamName: string;
  homeTeamName: string;
  /** Identity of the exact simulation the decision was read from (for later grading). */
  artifactHash: string;
  decisionEngineVersion: string;
  status: "ready" | "degraded" | "unavailable";
  completeness: FullGameCompleteness;
  predictedWinner: { side: Side; team: string } | null;
  /** Canonical projected score = MEDIAN simulated team runs (one methodology, used everywhere). */
  projectedScore: { away: number; home: number; label: string } | null;
  moneyline: MoneylinePrediction | null;
  total: TotalPrediction | null;
  runLine: RunLinePrediction | null;
  teamTotals: TeamTotalPrediction[];
  topPlayerPredictions: PlayerPrediction[];
  /** Human-readable reasons for any market family that could not be predicted. */
  unavailableReasons: string[];
  /** The market snapshot the decision compared against (threshold + comparison only). */
  market: MarketComparison | null;
}
