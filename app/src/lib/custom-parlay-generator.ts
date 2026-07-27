/**
 * Custom Parlay Generator — synthesizes 1–N parlay previews from
 * the existing `legPool` using the same scoring + correlation +
 * diversity rules as the Python optimizer.
 *
 * Key contract (PR #115):
 *   - The output is **never persisted** and **never tracked
 *     publicly**. The Custom Parlay Generator is a user-facing
 *     planning tool; official Results numbers stay clean.
 *   - We never fabricate legs. Every leg in every generated slip
 *     comes from the on-disk `legPool` — the same pool the
 *     optimizer's official lanes drew from.
 *   - We never substitute junk to hit the requested slip count.
 *     If the safe pool is small, the generator returns fewer
 *     slips (or zero) with an honest reason on the result.
 *
 * Honesty rules carried forward:
 *   - DNP guard from PR #115 still applies to "safe" mode.
 *   - "warn" mode allows DNP-risk legs but each slip is flagged.
 *   - Mixed-sport slips are explicitly opt-in (`sport: "multi"`).
 *   - Banned betting copy is impossible by construction — labels
 *     come from leg metadata only.
 */
import type { OptimizerLeg } from "./parlay-optimizer";
import { filterBuildYourOwnLegs, type SportEligibility } from "./sport-capabilities";
import {
  computeCombinedAmericanOdds,
  evaluateCustomParlay,
  type CustomParlayEvaluation,
} from "./custom-parlay";

export type GeneratorRisk =
  | "conservative"
  | "balanced"
  | "star_power"
  | "aggressive";

export interface GenerateOptions {
  /** "all" | "nba" | "mlb" | "multi" — applied as a hard filter. */
  sport?: "all" | "nba" | "mlb" | "multi";
  /** Risk profile drives the slot-count and the DNP/star gates. */
  risk?: GeneratorRisk;
  /** Optional: restrict the pool to one game. */
  gameId?: string | null;
  /** Optional: restrict to legs on a single team. */
  team?: string | null;
  /** Optional: require every slip to contain at least one of
   *  these player names. */
  playerNames?: ReadonlyArray<string>;
  /** Optional: restrict markets (e.g. ["PTS", "AST"]). */
  markets?: ReadonlyArray<string>;
  /** How many slip previews to attempt. Default 5. We never
   *  return more than the safe pool supports. */
  count?: number;
  /** Skip the DNP guard. Default false. When true the generator
   *  surfaces legs with thin recent-activity and stamps each slip
   *  with an `unsafe-recent` warning. */
  allowRiskLegs?: boolean;
}

export type GeneratorReason =
  | "ok"
  | "empty-pool"
  | "no-legs-after-filters"
  | "below-target";

export interface GeneratedSlip {
  /** Stable slip id — useful as React `key`. */
  slipId: string;
  /** Sport of the slip — "nba" / "mlb" / "multi". */
  sport: "nba" | "mlb" | "multi";
  /** Risk profile the generator targeted. */
  risk: GeneratorRisk;
  /** Number of legs. Always >= 1, never > max-legs-for-risk. */
  legCount: number;
  /** The actual legs (already on disk — never invented). */
  legs: OptimizerLeg[];
  /** Combined American odds across all legs (null if any leg
   *  has unknown odds). */
  combinedOdds: number | null;
  /** Full leg-pool evaluation (correlation, diversity, etc.). */
  evaluation: CustomParlayEvaluation;
  /** True if any leg in this slip would have been blocked by the
   *  PR #115 DNP guard. */
  containsRiskLeg: boolean;
}

export interface GeneratorResult {
  slips: GeneratedSlip[];
  /** Why we returned the count we did. */
  reason: GeneratorReason;
  /** Total eligible-after-filter legs the generator drew from. */
  poolSize: number;
  /** How many legs we excluded for DNP/insufficient-recent. */
  excludedDnp: number;
}

// ---------------------------------------------------------------------------
// Risk → slot count + DNP threshold
// ---------------------------------------------------------------------------

/** Mirror of the Python `ProfileRules` slot counts. */
const _RISK_CONFIG: Record<GeneratorRisk, {
  minLegs: number;
  maxLegs: number;
  /** NBA leg requires `recent10Count >= dnpMinNba`. */
  dnpMinNba: number;
  /** MLB leg requires `len(recentSeries) >= dnpMinMlb`. */
  dnpMinMlb: number;
  /** When true, every leg must be a "star" (starTier !== "none"). */
  requireStar: boolean;
}> = {
  conservative: { minLegs: 2, maxLegs: 2, dnpMinNba: 7, dnpMinMlb: 5, requireStar: false },
  balanced:     { minLegs: 2, maxLegs: 3, dnpMinNba: 5, dnpMinMlb: 5, requireStar: false },
  star_power:   { minLegs: 2, maxLegs: 3, dnpMinNba: 7, dnpMinMlb: 5, requireStar: true  },
  aggressive:   { minLegs: 3, maxLegs: 4, dnpMinNba: 3, dnpMinMlb: 3, requireStar: false },
};

function _isDnpSafe(leg: OptimizerLeg, risk: GeneratorRisk): boolean {
  const cfg = _RISK_CONFIG[risk];
  if (leg.sport === "nba") {
    return (leg.recent10Count ?? 0) >= cfg.dnpMinNba;
  }
  if (leg.sport === "mlb") {
    const seriesLen = leg.recentSeries?.length ?? 0;
    return seriesLen >= cfg.dnpMinMlb;
  }
  // Unknown sport — let the higher-level sport filter decide.
  return true;
}

// ---------------------------------------------------------------------------
// Filter the pool
// ---------------------------------------------------------------------------

interface FilterResult {
  pool: OptimizerLeg[];
  excludedDnp: number;
}

function _filterPool(
  legs: ReadonlyArray<OptimizerLeg>,
  opts: GenerateOptions,
  isEligible?: SportEligibility,
): FilterResult {
  const risk = opts.risk ?? "balanced";
  const cfg = _RISK_CONFIG[risk];
  const sport = opts.sport ?? "all";
  const wantedTeam = (opts.team ?? "").toUpperCase().trim() || null;
  const wantedPlayers = new Set(
    (opts.playerNames ?? [])
      .map((p) => p.toLowerCase().trim())
      .filter(Boolean),
  );
  const wantedMarkets = new Set(
    (opts.markets ?? [])
      .map((m) => m.toUpperCase().trim())
      .filter(Boolean),
  );
  const pool: OptimizerLeg[] = [];
  let excludedDnp = 0;
  // Capability gate FIRST, and here rather than only at the caller. The UI path already hands us
  // a `getLegPool` result (which filters), but this function is exported and takes an arbitrary
  // array — and "multi" mode deliberately keeps every sport, so an unfiltered caller would let an
  // ineligible sport into a generated slip. Filtering here is idempotent for an already-filtered
  // pool and makes the boundary fail-closed regardless of caller.
  const eligibleLegs = isEligible
    ? filterBuildYourOwnLegs(legs as OptimizerLeg[], isEligible)
    : filterBuildYourOwnLegs(legs as OptimizerLeg[]);
  for (const leg of eligibleLegs) {
    // View filter. `sport` is the selected VIEW, not a capability — eligibility was settled above.
    if (sport === "nba" || sport === "mlb") {
      if ((leg.sport ?? "").toLowerCase() !== sport) continue;
    } else if (sport === "multi") {
      // Multi mode keeps every ELIGIBLE sport in pool; slip-build picks the mix.
    }
    // Game filter.
    if (opts.gameId && leg.gameId !== opts.gameId) continue;
    // Team filter.
    if (wantedTeam && (leg.team ?? "").toUpperCase().trim() !== wantedTeam) {
      continue;
    }
    // Player filter — when given, the leg's player must be in the set.
    if (
      wantedPlayers.size > 0 &&
      !wantedPlayers.has((leg.playerName ?? "").toLowerCase().trim())
    ) {
      continue;
    }
    // Market filter — match against either market or marketLabel.
    if (wantedMarkets.size > 0) {
      const m1 = (leg.market ?? "").toUpperCase().trim();
      const m2 = (leg.marketLabel ?? "").toUpperCase().trim();
      if (!wantedMarkets.has(m1) && !wantedMarkets.has(m2)) continue;
    }
    // Star requirement — Star Power excludes non-stars.
    if (cfg.requireStar) {
      const tier = leg.starTier ?? "none";
      if (tier === "none") continue;
    }
    // DNP guard — when opt-in for risk, downgrade rather than drop.
    if (!opts.allowRiskLegs && !_isDnpSafe(leg, risk)) {
      excludedDnp += 1;
      continue;
    }
    pool.push(leg);
  }
  return { pool, excludedDnp };
}

// ---------------------------------------------------------------------------
// Slip assembly
// ---------------------------------------------------------------------------

function _legScore(leg: OptimizerLeg): number {
  // Optimizer-derived score if present; otherwise rank by edge.
  return typeof leg.legScore === "number"
    ? leg.legScore
    : (leg.edgePct ?? 0) / 10;
}

function _sortPoolByScore(pool: OptimizerLeg[]): OptimizerLeg[] {
  return pool.slice().sort((a, b) => _legScore(b) - _legScore(a));
}

/**
 * Greedy slip builder. For each requested slip:
 *   1. Pick the highest-score leg not used as anchor before.
 *   2. Add 1–N more legs (per risk slot count) that:
 *      - don't duplicate any leg already in this slip
 *      - don't share the same player as another leg in this slip
 *      - respect per-game cap (≤ 2 for any safe lane, ≤ 3 Longshot)
 *   3. Stop when we hit `count` slips or run out of viable anchors.
 *
 * Diversity goal: every slip should have a different anchor player
 * when alternatives exist. This mirrors the diversity rotation the
 * official optimizer applies, but in client code so it stays cheap.
 */
function _buildSlips(
  pool: OptimizerLeg[],
  risk: GeneratorRisk,
  desired: number,
  sport: GenerateOptions["sport"],
): GeneratedSlip[] {
  if (pool.length === 0) return [];
  const cfg = _RISK_CONFIG[risk];
  const maxPerGame = risk === "aggressive" ? 3 : 2;
  const sorted = _sortPoolByScore(pool);
  const usedAnchors = new Set<string>();
  const out: GeneratedSlip[] = [];
  for (let i = 0; i < sorted.length && out.length < desired; i++) {
    const anchor = sorted[i];
    const anchorKey = (anchor.playerName ?? "").toLowerCase().trim();
    if (usedAnchors.has(anchorKey)) continue;
    const slipLegs: OptimizerLeg[] = [anchor];
    const playersInSlip = new Set<string>([anchorKey]);
    const gameLegCounts = new Map<string, number>();
    if (anchor.gameId) gameLegCounts.set(anchor.gameId, 1);
    // Add additional legs greedily.
    for (let j = 0; j < sorted.length && slipLegs.length < cfg.maxLegs; j++) {
      if (j === i) continue;
      const candidate = sorted[j];
      const pKey = (candidate.playerName ?? "").toLowerCase().trim();
      if (playersInSlip.has(pKey)) continue;
      // Per-game cap.
      const gid = candidate.gameId ?? "";
      if (gid && (gameLegCounts.get(gid) ?? 0) >= maxPerGame) continue;
      // For "multi" sport mode, require that the final slip
      // contains ≥2 sports — defer that check; for "nba"/"mlb",
      // sport was already filtered upstream.
      slipLegs.push(candidate);
      playersInSlip.add(pKey);
      if (gid) gameLegCounts.set(gid, (gameLegCounts.get(gid) ?? 0) + 1);
    }
    // Reject slips below minLegs.
    if (slipLegs.length < cfg.minLegs) continue;
    // For multi-sport mode, require at least two distinct sports
    // OR fall through to be honest about the fail.
    if (sport === "multi") {
      const sports = new Set(slipLegs.map((l) => (l.sport ?? "").toLowerCase()));
      if (sports.size < 2) continue;
    }
    const evaluation = evaluateCustomParlay(slipLegs);
    const combinedOdds = computeCombinedAmericanOdds(slipLegs);
    const containsRiskLeg = slipLegs.some((l) => !_isDnpSafe(l, risk));
    const sportLabel: GeneratedSlip["sport"] =
      sport === "multi"
        ? "multi"
        : ((slipLegs[0]?.sport ?? "nba").toLowerCase() === "mlb" ? "mlb" : "nba");
    out.push({
      slipId: `gen-${risk}-${sportLabel}-${anchor.leanId ?? i}`,
      sport: sportLabel,
      risk,
      legCount: slipLegs.length,
      legs: slipLegs,
      combinedOdds,
      evaluation,
      containsRiskLeg,
    });
    usedAnchors.add(anchorKey);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate up to `count` custom parlay previews from the supplied
 * leg pool. Pure, deterministic, side-effect free. Caller is
 * responsible for showing the "Custom generated · not officially
 * tracked" label on every returned slip.
 */
export function generateCustomParlaysFromPool(
  legPool: ReadonlyArray<OptimizerLeg>,
  options: GenerateOptions = {},
  /** Eligibility gate. Production omits it and gets the real capability gate; tests inject a
   *  fixture predicate so sport-shaped mechanics (e.g. the NBA DNP guard, which reads different
   *  leg fields than MLB) stay covered without claiming any sport is currently modeled. */
  isEligible?: SportEligibility,
): GeneratorResult {
  const risk = options.risk ?? "balanced";
  const desired = Math.max(1, Math.min(options.count ?? 5, 10));
  if (!legPool || legPool.length === 0) {
    return { slips: [], reason: "empty-pool", poolSize: 0, excludedDnp: 0 };
  }
  const { pool, excludedDnp } = _filterPool(legPool, options, isEligible);
  if (pool.length === 0) {
    return {
      slips: [],
      reason: "no-legs-after-filters",
      poolSize: 0,
      excludedDnp,
    };
  }
  const slips = _buildSlips(pool, risk, desired, options.sport ?? "all");
  const reason: GeneratorReason =
    slips.length === 0
      ? "no-legs-after-filters"
      : slips.length < desired
        ? "below-target"
        : "ok";
  return { slips, reason, poolSize: pool.length, excludedDnp };
}

/** Convenience: friendly copy for a generator reason. */
export function describeGeneratorReason(
  reason: GeneratorReason,
  count: number,
  desired: number,
): string {
  if (reason === "empty-pool") {
    return "No optimizer leg pool available for this date.";
  }
  if (reason === "no-legs-after-filters") {
    return "No safe legs match these filters. Try widening the sport, team, or player picker.";
  }
  if (reason === "below-target") {
    return `Current filters found ${count} safe build${count === 1 ? "" : "s"} — fewer than the ${desired} requested.`;
  }
  return `Showing ${count} custom-generated build${count === 1 ? "" : "s"}.`;
}
