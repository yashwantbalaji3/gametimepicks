/**
 * MULTI-SPORT FREESIM REPORT CONTRACT — one honest report spine every sport renders, whatever its data
 * source. MLB has a real market-anchored sim; soccer/World Cup is MARKET-IMPLIED (not an independent
 * 10k-run model); UFC is MARKET-IMPLIED moneyline (model gated until validated). The contract makes those
 * differences explicit + machine-checkable so no sport can overclaim.
 *
 * The spine (rendered top→bottom): Market Snapshot → Simulation Output → Main Read → Top Leans → Key
 * Takeaways → Expandable Details. Pure types + a validator; no io, no components. Extensionless imports.
 *
 * The one opinion the validator encodes: a report may only make a claim its `sourceMode` actually
 * supports — a `market_implied` report can never claim an independent simulation, a 10,000-run count,
 * positive EV, or a model edge; and a market that isn't `available` in the snapshot can never be a lean.
 */

export type SimulationSourceMode =
  | "independent_simulation"      // a real independent model (fitted, not market-anchored)
  | "market_anchored_simulation"  // sampled distributions anchored to the market (MLB full-game)
  | "market_implied_simulation"   // de-vigged market probabilities presented as a read (soccer / UFC ML)
  | "projection_only"             // projections without a market
  | "unavailable";                // no usable data

export type ReportSport = "mlb" | "soccer" | "ufc" | "nba" | "nfl";
export type MarketStatus = "available" | "provider_needed" | "settlement_needed" | "coming_soon" | "blocked";

export interface ReportMarket {
  key: string;
  label: string;
  available: boolean;
  source?: string;
  oddsAmerican?: number;
  impliedProbability?: number;
  noVigProbability?: number;
  status: MarketStatus;
}

export interface ReportLean {
  market: string;
  selection: string;
  rationale: string;
  confidence?: string;
  oddsAmerican?: number;
  settlementSupported: boolean;
  sourceMode: SimulationSourceMode;
}

export interface MultiSportGameReport {
  schemaVersion: string;
  sport: ReportSport;
  slateDate: string;
  eventId: string;
  eventName: string;
  status: "scheduled" | "live" | "final" | "postponed" | "unknown";
  sourceMode: SimulationSourceMode;
  sourceLabel: string;
  publicClaims: {
    canClaimIndependentSimulation: boolean;
    canClaimTenThousandRuns: boolean;
    canClaimPositiveEV: boolean;
    canClaimModelEdge: boolean;
  };
  marketSnapshot: { markets: ReportMarket[] };
  simulationOutput: {
    headline: string;
    sourceMode: SimulationSourceMode;
    runCount?: number;
    winProbabilities?: Array<{ label: string; probability: number }>;
    outcomeDistribution?: Array<{ label: string; probability: number }>;
    notes: string[];
  };
  mainRead: { label: string; confidence?: string; explanation: string; paperOnly: boolean };
  topLeans: ReportLean[];
  keyTakeaways: string[];
  details: { methodology: string[]; unavailableMarkets: string[]; dataGaps: string[]; settlementNotes: string[] };
}

export interface ReportValidation { valid: boolean; errors: string[]; warnings: string[] }

const MODES: SimulationSourceMode[] = ["independent_simulation", "market_anchored_simulation", "market_implied_simulation", "projection_only", "unavailable"];
const RUN_MODES: SimulationSourceMode[] = ["independent_simulation", "market_anchored_simulation"];
const inUnit = (x: unknown): boolean => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;

/** Honest source-mode presets — the label + claims a mode may make (used by builders, checked here). */
export const SOURCE_MODE_LABEL: Record<SimulationSourceMode, string> = {
  independent_simulation: "Independent simulation",
  market_anchored_simulation: "Market-anchored simulation",
  market_implied_simulation: "Market-implied read",
  projection_only: "Projection",
  unavailable: "Report unavailable",
};

/**
 * Validate a report's STRUCTURE + HONESTY. Returns `{valid, errors, warnings}`; never mutates. The claims
 * flags are only allowed when the sourceMode actually supports them, and a lean must reference an
 * available market.
 */
export function validateMultiSportGameReport(a: Partial<MultiSportGameReport> | null | undefined): ReportValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!a || typeof a !== "object") return { valid: false, errors: ["report is not an object"], warnings };

  if (typeof a.schemaVersion !== "string" || !a.schemaVersion) errors.push("schemaVersion required");
  if (!["mlb", "soccer", "ufc", "nba", "nfl"].includes(a.sport as string)) errors.push("sport invalid");
  if (typeof a.eventId !== "string" || !a.eventId) errors.push("eventId required");
  if (!MODES.includes(a.sourceMode as SimulationSourceMode)) errors.push("sourceMode invalid / missing");
  if (typeof a.sourceLabel !== "string" || !a.sourceLabel) errors.push("sourceLabel required (honest source name)");
  if (a.simulationOutput && a.simulationOutput.sourceMode !== a.sourceMode) errors.push("simulationOutput.sourceMode must match the report sourceMode");

  const c = a.publicClaims;
  if (!c) errors.push("publicClaims required");
  else {
    const mode = a.sourceMode;
    // Independent-simulation claim requires the independent mode.
    if (c.canClaimIndependentSimulation && mode !== "independent_simulation") errors.push("canClaimIndependentSimulation requires sourceMode 'independent_simulation'");
    // A 10k-run claim requires a real sampled mode + a positive run count.
    if (c.canClaimTenThousandRuns) {
      if (!RUN_MODES.includes(mode as SimulationSourceMode)) errors.push("canClaimTenThousandRuns requires a sampled sourceMode");
      if (!(typeof a.simulationOutput?.runCount === "number" && a.simulationOutput.runCount >= 1000)) errors.push("canClaimTenThousandRuns requires simulationOutput.runCount ≥ 1000");
    }
    // EV / model-edge claims may not be made from a market-implied read.
    if ((c.canClaimPositiveEV || c.canClaimModelEdge) && (mode === "market_implied_simulation" || mode === "unavailable" || mode === "projection_only")) {
      errors.push("a market-implied / projection-only / unavailable report cannot claim positive EV or a model edge");
    }
  }

  // Win/outcome probabilities must be well-formed when present.
  for (const arr of [a.simulationOutput?.winProbabilities, a.simulationOutput?.outcomeDistribution]) {
    if (!Array.isArray(arr)) continue;
    for (const p of arr) if (!inUnit(p?.probability)) errors.push("a probability is not in [0,1]");
  }

  // A lean may only reference a market that is present + available in the snapshot, and must be honest
  // about settlement support.
  const available = new Set((a.marketSnapshot?.markets ?? []).filter((m) => m.available && m.status === "available").map((m) => m.key));
  for (const [i, l] of (a.topLeans ?? []).entries()) {
    if (!MODES.includes(l.sourceMode)) errors.push(`topLeans[${i}].sourceMode invalid`);
    if (!available.has(l.market)) errors.push(`topLeans[${i}] references market "${l.market}" that is not available in the snapshot`);
    if (typeof l.settlementSupported !== "boolean") errors.push(`topLeans[${i}].settlementSupported must be a boolean`);
    if (l.settlementSupported === false) warnings.push(`topLeans[${i}] is not settlement-supported — surface as informational only`);
  }

  if (a.mainRead && a.mainRead.paperOnly !== true) errors.push("mainRead.paperOnly must be true (everything is paper-only)");
  if (a.sourceMode === "unavailable" && (a.topLeans?.length ?? 0) > 0) errors.push("an 'unavailable' report cannot carry top leans");

  return { valid: errors.length === 0, errors, warnings };
}

/** Convenience: the honest default claims block for a given source mode (never over-claims). */
export function defaultClaimsFor(mode: SimulationSourceMode): MultiSportGameReport["publicClaims"] {
  return {
    canClaimIndependentSimulation: mode === "independent_simulation",
    canClaimTenThousandRuns: false, // only true when a real runCount ≥ 1000 is attached by the builder
    canClaimPositiveEV: false,
    canClaimModelEdge: false,
  };
}
