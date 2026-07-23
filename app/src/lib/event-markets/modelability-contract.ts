/**
 * EVENT-MARKET MODELABILITY CONTRACT.
 *
 * A sports EVENT contract (Kalshi/Polymarket-style: "MVP", "player next team", "coach fired before date",
 * "playoff qualification", "draft position", "tournament winner") is a DIFFERENT domain from the per-game prop
 * simulator — it resolves on news/rules over a long horizon, not on a box score. Before GameTimePicks ever shows an
 * independent probability for such a contract, we must first answer, honestly: *is this contract even modelable?*
 *
 * This module scores modelability from ten dimensions and classifies it. It produces NO probability and makes NO
 * prediction — a LOW/INFORMATION_ONLY contract is one where the honest product is market data + evidence + rules,
 * with the independent estimate left as "NOT YET MODELED". Category logic supplies sensible defaults, but the final
 * classification is driven by the actual dimension scores (never hardcoded per example).
 *
 * Pure + deterministic. No modeling, no money.
 */

export type ModelabilityClass =
  | "HIGH_MODELABILITY"
  | "MEDIUM_MODELABILITY"
  | "LOW_MODELABILITY"
  | "INFORMATION_ONLY"
  | "UNSUPPORTED";

/** Broad category of the event contract — supplies default priors for unscored dimensions. */
export type EventCategory =
  | "award" // MVP, ROY, Cy Young — voted, structured historical comparables
  | "qualification" // playoff berth, promotion/relegation — determined by standings
  | "tournament_winner" // champion/futures — many structured comparables
  | "draft_position" // pick N — semi-structured, some private info
  | "player_movement" // next team, traded-by-date — heavy private info, news-driven
  | "personnel" // coach fired/hired, GM — news-driven, few comparables
  | "retirement" // will player retire — idiosyncratic, low comparables
  | "other";

/** Each dimension is scored 0..5 (5 = most favorable to modeling). Omitted dimensions fall back to the category prior. */
export interface ModelabilityDimensions {
  outcomeClarity?: number; // is the winning outcome unambiguous?
  ruleClarity?: number; // are the resolution rules precise + public?
  evidenceAvailability?: number; // is there a steady stream of relevant public evidence?
  structuredDataAvailability?: number; // standings / vote history / stats that map to the outcome
  historicalComparables?: number; // enough past instances to calibrate against
  liquidity?: number; // is the market liquid enough for its price to be informative?
  timeToResolution?: number; // shorter, bounded horizons score higher
  privateInformationResistance?: number; // 5 = little hidden info moves it; 0 = insider-driven (trades, firings)
  sourceDiversity?: number; // 5 = many independent sources; 0 = one gatekeeper controls the outcome
  outcomeExhaustiveness?: number; // are the listed outcomes collectively exhaustive + mutually exclusive?
}

export interface ModelabilityInput {
  category: EventCategory;
  dimensions?: ModelabilityDimensions;
}

export interface ModelabilityResult {
  score: number; // 0..1 normalized
  classification: ModelabilityClass;
  byDimension: Required<ModelabilityDimensions>;
  reasons: string[];
  /** Hard rule: only HIGH/MEDIUM may ever carry an independent probability; the rest are information-only. */
  mayShowIndependentProbability: boolean;
}

const DIMS: (keyof ModelabilityDimensions)[] = [
  "outcomeClarity", "ruleClarity", "evidenceAvailability", "structuredDataAvailability", "historicalComparables",
  "liquidity", "timeToResolution", "privateInformationResistance", "sourceDiversity", "outcomeExhaustiveness",
];

/** Category priors (0..5) — defensible defaults, NOT conclusions. Real inputs override these per dimension. */
const CATEGORY_PRIORS: Record<EventCategory, Required<ModelabilityDimensions>> = {
  award:            { outcomeClarity: 5, ruleClarity: 4, evidenceAvailability: 4, structuredDataAvailability: 5, historicalComparables: 4, liquidity: 3, timeToResolution: 3, privateInformationResistance: 4, sourceDiversity: 4, outcomeExhaustiveness: 4 },
  qualification:    { outcomeClarity: 5, ruleClarity: 5, evidenceAvailability: 5, structuredDataAvailability: 5, historicalComparables: 5, liquidity: 3, timeToResolution: 4, privateInformationResistance: 5, sourceDiversity: 5, outcomeExhaustiveness: 5 },
  tournament_winner:{ outcomeClarity: 5, ruleClarity: 5, evidenceAvailability: 4, structuredDataAvailability: 4, historicalComparables: 4, liquidity: 4, timeToResolution: 3, privateInformationResistance: 4, sourceDiversity: 4, outcomeExhaustiveness: 5 },
  draft_position:   { outcomeClarity: 4, ruleClarity: 3, evidenceAvailability: 3, structuredDataAvailability: 3, historicalComparables: 3, liquidity: 2, timeToResolution: 3, privateInformationResistance: 2, sourceDiversity: 3, outcomeExhaustiveness: 3 },
  player_movement:  { outcomeClarity: 4, ruleClarity: 3, evidenceAvailability: 3, structuredDataAvailability: 1, historicalComparables: 2, liquidity: 3, timeToResolution: 2, privateInformationResistance: 1, sourceDiversity: 2, outcomeExhaustiveness: 3 },
  personnel:        { outcomeClarity: 4, ruleClarity: 3, evidenceAvailability: 3, structuredDataAvailability: 1, historicalComparables: 2, liquidity: 2, timeToResolution: 2, privateInformationResistance: 1, sourceDiversity: 2, outcomeExhaustiveness: 3 },
  retirement:       { outcomeClarity: 3, ruleClarity: 3, evidenceAvailability: 2, structuredDataAvailability: 1, historicalComparables: 1, liquidity: 2, timeToResolution: 1, privateInformationResistance: 1, sourceDiversity: 2, outcomeExhaustiveness: 3 },
  other:            { outcomeClarity: 3, ruleClarity: 3, evidenceAvailability: 3, structuredDataAvailability: 3, historicalComparables: 3, liquidity: 3, timeToResolution: 3, privateInformationResistance: 3, sourceDiversity: 3, outcomeExhaustiveness: 3 },
};

const clamp = (n: number) => Math.max(0, Math.min(5, n));

export function scoreModelability(input: ModelabilityInput): ModelabilityResult {
  const prior = CATEGORY_PRIORS[input.category] ?? CATEGORY_PRIORS.other;
  const byDimension = {} as Required<ModelabilityDimensions>;
  for (const d of DIMS) byDimension[d] = clamp(input.dimensions?.[d] ?? prior[d]);

  const score = DIMS.reduce((a, d) => a + byDimension[d], 0) / (DIMS.length * 5); // 0..1

  // HARD gates: a contract that resolves on private information, or lacks resolution-rule/outcome clarity, can never
  // be HIGH/MEDIUM regardless of average — those are the failure modes that make an "independent estimate" dishonest.
  const reasons: string[] = [];
  const privateInfoDriven = byDimension.privateInformationResistance <= 1;
  const rulesUnclear = byDimension.ruleClarity <= 1 || byDimension.outcomeClarity <= 1;
  const noStructure = byDimension.structuredDataAvailability <= 1 && byDimension.historicalComparables <= 1;

  let classification: ModelabilityClass;
  if (rulesUnclear) { classification = "UNSUPPORTED"; reasons.push("resolution rules or outcome are not clear enough to score"); }
  else if (privateInfoDriven) { classification = "INFORMATION_ONLY"; reasons.push("outcome is driven by private/insider information — surface market + evidence, never an independent number"); }
  else if (noStructure && score < 0.55) { classification = "INFORMATION_ONLY"; reasons.push("no structured data or historical comparables to calibrate against"); }
  else if (score >= 0.75) { classification = "HIGH_MODELABILITY"; }
  else if (score >= 0.55) { classification = "MEDIUM_MODELABILITY"; }
  else { classification = "LOW_MODELABILITY"; reasons.push("weak overall signal — treat as information-first"); }

  if (byDimension.liquidity <= 1) reasons.push("thin liquidity — the market price itself is only weakly informative");
  if (byDimension.sourceDiversity <= 1) reasons.push("a single gatekeeper controls the outcome — concentrated source risk");
  if (reasons.length === 0) reasons.push("clear rules + structured comparables + diverse public evidence");

  const mayShowIndependentProbability = classification === "HIGH_MODELABILITY" || classification === "MEDIUM_MODELABILITY";
  return { score: Number(score.toFixed(3)), classification, byDimension, reasons, mayShowIndependentProbability };
}
