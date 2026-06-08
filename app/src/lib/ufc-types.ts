/**
 * ufc-types — UFC schema + FAIL-CLOSED launch gates.
 *
 * Real infrastructure, no fabricated data. Types model UFC events / bouts /
 * fighters / odds / projections / graded results. The launch-gate resolver
 * decides what UFC may surface publicly and stays fail-closed until REAL odds,
 * fighter stats, results-grading, and a backtest exist. Today only the schedule
 * exists (free ESPN MMA source), so the resolver returns "schedule-only".
 *
 * No public UFC pick/projection/parlay is produced from this module — it only
 * encodes the gate policy + shapes. No banned copy.
 */

export type UfcMarketKey = "winner" | "method" | "rounds_total" | "goes_distance";

/** Markets we would eventually support, gated individually. */
export const UFC_SUPPORTED_MARKETS: readonly UfcMarketKey[] = [
  "winner",
  "method",
  "rounds_total",
  "goes_distance",
] as const;

export interface UfcFighter {
  /** Provider id when available; null if only a display name is known. */
  id: string | null;
  name: string;
  /** Optional structured stats — present ONLY when a fighter-stat provider is wired. */
  record?: string | null;
  stance?: string | null;
}

export interface UfcBout {
  boutId: string;
  weightClass: string | null;
  fighterA: UfcFighter;
  fighterB: UfcFighter;
  /** Title/main-card flags from the schedule source, when available. */
  isMainEvent?: boolean;
}

export interface UfcEvent {
  eventId: string;
  name: string;
  dateIso: string;
  venue?: string | null;
  bouts: UfcBout[];
  /** "pre" | "in" | "post" from the schedule source. */
  status: string;
}

export interface UfcMarketOdds {
  boutId: string;
  market: UfcMarketKey;
  book: string;
  /** De-vigged two-sided implied probability when both sides priced; else null. */
  impliedProbability: number | null;
  /** ISO timestamp the odds were captured — for freshness/leakage checks. */
  capturedAtIso: string;
}

/** A projection is NEVER published unless the launch gates pass. `source`
 *  distinguishes a pure market-implied baseline (odds de-vig only — not a model
 *  claim) from a real model projection. */
export interface UfcProjection {
  boutId: string;
  market: UfcMarketKey;
  probability: number;
  source: "market_implied" | "model";
  /** Honest data-quality flags; missing data must surface, never be hidden. */
  dataFlags: {
    missingFighterStats: boolean;
    missingHistory: boolean;
    smallSample: boolean;
    stale: boolean;
  };
}

export interface UfcGradedBout {
  boutId: string;
  winnerId: string | null;
  method: "ko_tko" | "submission" | "decision" | null;
  round: number | null;
  timeSeconds: number | null;
  status: "final" | "no_contest" | "overturned" | "cancelled";
}

/** The real, current launch gates — each is a hard provider/dataset prerequisite. */
export interface UfcLaunchGates {
  hasSchedule: boolean; // free ESPN MMA source
  hasOdds: boolean; // Odds API MMA ingestion (two-sided, de-vig)
  hasFighterStats: boolean; // a fighter-stat provider
  hasResultsGrading: boolean; // a results source + grading contract
  hasBacktest: boolean; // sample-controlled historical sanity check
}

export type UfcPublicLevel =
  | "schedule-only"
  | "odds-internal"
  | "projections-internal"
  | "projections-public"
  | "parlays-public";

/** Fail-closed escalation: each public level requires ALL lower prerequisites.
 *  Odds alone (no fighter stats) stays INTERNAL — we never publish a
 *  winner pick from odds/name alone. Public projections require grading; public
 *  parlays require grading AND a backtest. */
export function ufcPublicLevel(g: UfcLaunchGates): UfcPublicLevel {
  if (!g.hasSchedule || !g.hasOdds) return "schedule-only";
  if (!g.hasFighterStats) return "odds-internal";
  if (!g.hasResultsGrading || !g.hasBacktest) return "projections-internal";
  return "parlays-public";
}

export function ufcCanShowSchedule(g: UfcLaunchGates): boolean {
  return g.hasSchedule;
}
export function ufcCanPublishProjections(g: UfcLaunchGates): boolean {
  const lvl = ufcPublicLevel(g);
  return lvl === "projections-public" || lvl === "parlays-public";
}
export function ufcCanPublishParlays(g: UfcLaunchGates): boolean {
  return ufcPublicLevel(g) === "parlays-public";
}
export function ufcMarketSupported(market: string): market is UfcMarketKey {
  return (UFC_SUPPORTED_MARKETS as readonly string[]).includes(market);
}

/** The REAL gate state today: schedule only (ESPN, free). Everything else is a
 *  missing provider. Update each flag only when the real capability lands. */
export const UFC_CURRENT_GATES: UfcLaunchGates = {
  hasSchedule: true,
  hasOdds: false,
  hasFighterStats: false,
  hasResultsGrading: false,
  hasBacktest: false,
};

/** Compliant schedule-only copy — no picks, no banned terms. */
export const UFC_SCHEDULE_ONLY_COPY = {
  status: "UFC coverage is being built.",
  schedule: "Schedule available.",
  gate: "Predictions publish only after data and grading gates pass.",
  noCards: "No UFC suggested cards yet.",
} as const;
