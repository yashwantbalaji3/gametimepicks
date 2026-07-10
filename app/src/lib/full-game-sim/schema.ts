/**
 * FULL-GAME SIMULATION ARTIFACT — schema + a PURE structural validator.
 *
 * This is the shape a FUTURE true FreeSim-style MLB full-game simulation would take (projected score,
 * win probability, total/margin distributions, run-line/total coverage, score bands, confidence). It is
 * scaffolding: the validator checks STRUCTURE + HONESTY only — it never generates a value, reads an
 * artifact, or touches money. GameTime does not have a full-game score simulation yet; a partial,
 * market-implied readiness artifact is the most this repo can honestly produce today (see
 * docs/FULL_GAME_SIMULATION_GAP_AUDIT_2026-07-09.md).
 *
 * The one opinion it encodes: an artifact may only be labelled a simulation when it actually is one —
 * a `winProbability.source === "simulation"` (or a public artifact) can never coexist with a
 * `dataQuality.status === "blocked"`, and a simulation source requires a real positive run count.
 */

export type WinProbSource = "simulation" | "market_implied" | "hybrid_shadow";
export type FullGameSimStatus = "ready" | "partial" | "blocked";

export interface FullGameSimTeam { id?: string; name: string; abbreviation?: string }
export interface DistributionBucket { bucket: string; probability: number }
export interface ScorePair { awayRuns: number; homeRuns: number; probability: number }

export interface FullGameSimulationArtifact {
  schemaVersion: string;
  sport: "MLB";
  gameId: string;
  gamePk?: number;
  date: string;
  /** Deterministic marker (readiness uses the date); a real sim would stamp a generatedAt. */
  asOf?: string;
  generatedAt?: string;
  /** Present ONLY when a sampled simulation ran. Absent/undefined for a market-implied artifact. */
  runCount?: number;
  public: boolean;
  /** Which inputs the artifact drew on (provenance flags). */
  source: {
    marketSnapshot?: boolean;
    modelInputs?: string[];
    linescoreSettlement?: boolean;
    playerPropSimulation?: boolean;
    teamMarketLines?: boolean;
  };
  teams: { away: FullGameSimTeam; home: FullGameSimTeam };
  /** All means; omitted (not fabricated) when no scoring model backs them. */
  projectedScore?: { awayMean?: number; homeMean?: number; totalMean?: number; marginMean?: number; source?: WinProbSource };
  winProbability?: { away: number; home: number; source: WinProbSource };
  distributions?: {
    totalRuns?: DistributionBucket[];
    margin?: DistributionBucket[];
    awayRuns?: Array<{ runs: number; probability: number }>;
    homeRuns?: Array<{ runs: number; probability: number }>;
    scorePairs?: ScorePair[];
  };
  marketCoverage?: {
    moneyline?: { homeWinProb?: number; awayWinProb?: number; source: WinProbSource };
    runLine?: { line: number; favorite?: string; coverProbability?: number; source: WinProbSource };
    total?: { line: number; overProbability?: number; underProbability?: number; pushProbability?: number; source: WinProbSource };
    teamTotals?: unknown[];
  };
  topLeans?: unknown[];
  dataQuality: { status: FullGameSimStatus; reasons: string[]; missing: string[] };
  guardrails: { publicFormulaChanged: false; officialMoneyRecordAffected: false; activeProductCard: false };
}

export interface ValidationResult { valid: boolean; errors: string[]; warnings: string[] }

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const inUnit = (x: unknown): boolean => isNum(x) && x >= 0 && x <= 1;
const SUM_TOL = 0.02;

/** Probabilities in a distribution must land in [0,1] and sum to ~1. */
function checkDistribution(name: string, arr: Array<{ probability: number }>, errors: string[]): void {
  if (!Array.isArray(arr) || arr.length === 0) return;
  let sum = 0;
  for (const b of arr) {
    if (!inUnit(b?.probability)) { errors.push(`${name}: a bucket probability is not in [0,1]`); return; }
    sum += b.probability;
  }
  if (Math.abs(sum - 1) > SUM_TOL) errors.push(`${name}: probabilities sum to ${sum.toFixed(3)}, not ~1.0`);
}

/**
 * Validate the STRUCTURE + HONESTY of a full-game simulation artifact. Returns `{valid, errors,
 * warnings}`. It never mutates or fabricates. Optional blocks are only checked when present.
 */
export function validateFullGameSimArtifact(a: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const art = a as Partial<FullGameSimulationArtifact> | null | undefined;
  if (!art || typeof art !== "object") return { valid: false, errors: ["artifact is not an object"], warnings };

  // ── Required identity ──
  if (typeof art.schemaVersion !== "string" || art.schemaVersion.length === 0) errors.push("schemaVersion must be a non-empty string");
  if (art.sport !== "MLB") errors.push('sport must be "MLB"');
  if (typeof art.gameId !== "string" || art.gameId.length === 0) errors.push("gameId must be a non-empty string");
  if (typeof art.date !== "string" || art.date.length === 0) errors.push("date must be a non-empty string");
  if (typeof art.public !== "boolean") errors.push("public must be a boolean");
  if (!art.teams?.away?.name || !art.teams?.home?.name) errors.push("teams.away.name and teams.home.name are required");

  // ── Data quality ──
  const status = art.dataQuality?.status;
  if (status !== "ready" && status !== "partial" && status !== "blocked") errors.push('dataQuality.status must be "ready" | "partial" | "blocked"');
  if (!Array.isArray(art.dataQuality?.reasons)) errors.push("dataQuality.reasons must be an array");
  if (!Array.isArray(art.dataQuality?.missing)) errors.push("dataQuality.missing must be an array");

  // ── Guardrails (all must be literally false) ──
  const g = art.guardrails;
  if (!g || g.publicFormulaChanged !== false || g.officialMoneyRecordAffected !== false || g.activeProductCard !== false) {
    errors.push("guardrails.{publicFormulaChanged, officialMoneyRecordAffected, activeProductCard} must all be false");
  }

  // ── Run count (only when present) — a real sample count is a positive integer ──
  if (art.runCount !== undefined && (!Number.isInteger(art.runCount) || art.runCount <= 0)) {
    errors.push("runCount, when present, must be a positive integer");
  }

  // ── Win probability (only when present) ──
  const wp = art.winProbability;
  if (wp) {
    if (!inUnit(wp.away) || !inUnit(wp.home)) errors.push("winProbability.away/home must be in [0,1]");
    else if (Math.abs(wp.away + wp.home - 1) > SUM_TOL) errors.push(`winProbability.away + home = ${(wp.away + wp.home).toFixed(3)}, not ~1.0`);
    if (wp.source !== "simulation" && wp.source !== "market_implied" && wp.source !== "hybrid_shadow") errors.push('winProbability.source must be "simulation" | "market_implied" | "hybrid_shadow"');
  }

  // ── Distributions (only when present) ──
  const d = art.distributions;
  if (d) {
    checkDistribution("distributions.totalRuns", d.totalRuns ?? [], errors);
    checkDistribution("distributions.margin", d.margin ?? [], errors);
    checkDistribution("distributions.awayRuns", (d.awayRuns ?? []) as Array<{ probability: number }>, errors);
    checkDistribution("distributions.homeRuns", (d.homeRuns ?? []) as Array<{ probability: number }>, errors);
    checkDistribution("distributions.scorePairs", (d.scorePairs ?? []) as Array<{ probability: number }>, errors);
  }

  // ── HONESTY: a simulation claim requires a real simulation; blocked can never claim one ──
  const claimsSimulation = wp?.source === "simulation";
  if (claimsSimulation && status === "blocked") errors.push("dataQuality is blocked but winProbability.source claims simulation");
  if (claimsSimulation && art.runCount === undefined) errors.push("winProbability.source is simulation but no runCount is present");
  if (art.public === true && status === "blocked" && claimsSimulation) errors.push("a PUBLIC artifact cannot claim simulation while dataQuality is blocked");
  // A blocked artifact should not ship real projected distributions.
  if (status === "blocked" && d && Object.values(d).some((v) => Array.isArray(v) && v.length > 0)) {
    warnings.push("dataQuality is blocked but distributions are populated — confirm these are not fabricated");
  }

  return { valid: errors.length === 0, errors, warnings };
}
