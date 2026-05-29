/**
 * TypeScript-side types for the optimizer snapshot written by
 * `pipeline.snapshot_optimizer`.
 *
 * Schema lock — keep these in sync with `pipeline/snapshot_optimizer.py`.
 *
 * Pure file (no node:fs imports) so client components can use these
 * types directly. Server pages load the snapshot via
 * `getOptimizerSnapshotForDate` in `data-parlays.ts`.
 */
import type {
  ParlayRiskProfile,
  SuggestedSport,
  ParlaySlip,
  ParlayLeg,
} from "./parlay-suggested";

export interface OptimizerLeg {
  sport: string;
  leanId: string;
  gameId: string | null;
  playerId: number | null;
  playerName: string;
  team: string | null;
  opponent: string | null;
  market: string;
  marketLabel: string | null;
  side: string;
  line: number | null;
  projection: number | null;
  edgePct: number | null;
  confidence: string | null;
  bookmaker: string | null;
  oddsForSide: number | null;
  recent10Count: number;
  /** Up to 10 most-recent numeric stat values for the leg's market.
   *  Persisted by `pipeline.snapshot_optimizer`. May be absent on
   *  older snapshot files. */
  recentSeries?: number[];
  /** PR #116 — per-game metadata parallel to `recentSeries`. Each
   *  entry: {date, opponent, isHome, value}. Empty list when the
   *  upstream board didn't attach metadata (legacy snapshots, MLB
   *  pre-enrichment). Never fabricated. */
  recentGames?: Array<{
    date: string | null;
    opponent: string | null;
    isHome: boolean | null;
    value: number;
  }>;
  isAnomaly: boolean;
  isVolatileMlb: boolean;
  /** Star metadata — PR #99. */
  starTier?: "none" | "regular" | "core" | "superstar";
  isStar?: boolean;
  /** PR `feature/leg-game-time-threading` — real game start time
   *  threaded from the source board. ISO UTC string when present
   *  (preferred — MLB boards write this directly). Null when the
   *  board didn't carry it. The frontend prefers `commenceTime` and
   *  falls back to `gameTime`; never fabricated. */
  commenceTime?: string | null;
  /** Pre-formatted ET display string from the NBA board's `tipoff`
   *  (e.g. `"8:30 PM ET"`). Used when the source only provides the
   *  display string rather than ISO UTC. Null when missing. */
  gameTime?: string | null;
  /** Per-leg scoring metadata (PR #101). Persisted by
   *  `pipeline.snapshot_optimizer._leg_to_payload`. Used by the
   *  custom-parlay builder so the slip score the user sees mirrors
   *  the optimizer's view without duplicating any formula in TS. */
  legScore?: number;
  marketStabilityWeight?: number;
  starBoost?: number;
  scoreBreakdown?: OptimizerLegScoreBreakdown;
}

/** Per-leg score components — sum of additive parts × market weight ×
 *  calibration = legScore. Exposed by the Python `leg_score_breakdown`
 *  helper so the client can reproduce the optimizer's slip score
 *  honestly. */
export interface OptimizerLegScoreBreakdown {
  legScore: number;
  confidenceComponent: number;
  edgeComponent: number;
  recent10Bonus: number;
  pidBonus: number;
  starBoost: number;
  marketWeight: number;
  calibrationFactor: number;
}

export interface OptimizerSlip {
  slipId: string;
  profile: ParlayRiskProfile;
  sport: "nba" | "mlb" | "multi";
  legs: OptimizerLeg[];
  sameGame: boolean;
  hasAnomalyLeg: boolean;
  score: number;
  correlationPenalty: number;
  rationale: string;
  /** PR `feature/nba-single-game-parlay-methodology` — true when the
   *  slip was emitted by the explicit single-game NBA path. The UI
   *  renders a "Single-game · higher variance" chip on these cards so
   *  users always see the framing that every leg shares one matchup
   *  and carries correlation risk. Optional for back-compat with any
   *  cached payload predating this PR. */
  singleGame?: boolean;
}

/** Leg pool consumed by the custom-parlay builder. NOT officially
 *  tracked in results — see comments in pipeline.snapshot_optimizer. */
export interface OptimizerLegPool {
  scoringProfile: ParlayRiskProfile;
  totalLegs: number;
  legs: OptimizerLeg[];
}

/** Public risk-section key — matches `RiskSectionKey` in
 *  `parlay-risk-sections.ts`. Kept as a string literal here to avoid a
 *  circular import. */
export type OptimizerPublicSectionKey =
  | "low"
  | "medium"
  | "high"
  | "longshot";

export interface OptimizerSnapshot {
  _disclaimer?: string;
  date: string;
  generatedAt: string;
  totalSlips: number;
  buckets: Record<
    ParlayRiskProfile,
    Record<"nba" | "mlb" | "multi" | "all", OptimizerSlip[]>
  >;
  sourcePools: {
    nbaCount: number;
    mlbCount: number;
  };
  /** Optional — only present on snapshots written after PR #101. */
  legPool?: OptimizerLegPool;
  /** PR `fix/public-risk-range-leg-counts` (2026-05-28) — server-side
   *  selector for the public risk sections (Low / Medium / High /
   *  Longshot). Each slip in here was generated under the strict
   *  "BOTH odds AND leg count match the section's window" rule.
   *  Optional for back-compat with snapshots written before this PR;
   *  when absent the UI falls back to client-side odds-only
   *  classification of the existing profile buckets. */
  publicRiskSections?: Record<
    OptimizerPublicSectionKey,
    Record<"all" | "nba" | "mlb" | "multi", OptimizerSlip[]>
  >;
}

// ---------------------------------------------------------------------------
// Convenience adapters
// ---------------------------------------------------------------------------

/**
 * Convert an OptimizerSlip into a ParlaySlip so the existing
 * ParlayTicketCard component can render it unchanged.
 *
 * This is a lossless mapping for everything the card reads. The
 * extra OptimizerSlip fields (rationale, correlationPenalty,
 * isVolatileMlb) are dropped on the floor; the card already shows
 * a "same-game" pill via `sameGame` and a "high-variance" badge for
 * aggressive — that's the level of context the card surfaces.
 */
export function optimizerSlipToParlaySlip(
  slip: OptimizerSlip,
  date: string,
): ParlaySlip {
  const legs: ParlayLeg[] = slip.legs.map((leg) => ({
    sport: leg.sport,
    gameId: leg.gameId,
    gameDate: date,
    playerId: leg.playerId,
    playerName: leg.playerName,
    team: leg.team,
    opponent: leg.opponent,
    market: leg.market,
    marketLabel: leg.marketLabel,
    side: leg.side,
    line: leg.line,
    projection: leg.projection,
    edgePct: leg.edgePct,
    confidence: leg.confidence,
    bookmaker: leg.bookmaker,
    oddsForSide: leg.oddsForSide,
    recentSeries: leg.recentSeries,
    // PR #116 — carry the rich per-game metadata through so the
    // drawer can render date + opponent + isHome rows when the
    // pipeline has populated them. Falls back to the numeric
    // `recentSeries` view when absent.
    recentGames: leg.recentGames,
    starTier: leg.starTier,
    isStar: leg.isStar,
    // PR `feature/leg-game-time-threading` — preserve real game-time
    // fields so the ticket card + drawer can render "May 28 · 8:30 PM
    // ET" instead of the date-only fallback. Both nullable; never
    // fabricated.
    commenceTime: leg.commenceTime ?? null,
    gameTime: leg.gameTime ?? null,
  }));
  return {
    slipId: slip.slipId,
    riskProfile: slip.profile,
    sport: slip.sport,
    status: "pending",
    legs,
    score: slip.score,
    sameGame: slip.sameGame,
    hasAnomalyLeg: slip.hasAnomalyLeg,
    // PR `feature/nba-single-game-parlay-methodology` — preserve the
    // single-game flag so the ParlayTicketCard can render the
    // "Single-game · higher variance" chip.
    singleGame: slip.singleGame ?? false,
  };
}

/**
 * Pick the best slip per (sport, risk profile) bucket — applying an
 * optional player-name filter. Used by the Parlay Lab builder.
 *
 * Returns one slip per profile that still contains every selected
 * player. When no slip survives the filter, that profile is dropped
 * from the result (we never invent a slip).
 */
export function bestOptimizerSlipsForRisk(
  payload: OptimizerSnapshot,
  filter: {
    sport: SuggestedSport;
    playerNames?: string[];
  },
): Array<{ profile: ParlayRiskProfile; slip: OptimizerSlip }> {
  const sportKey = filter.sport === "all" ? "all" : filter.sport;
  const wantedPlayers =
    (filter.playerNames ?? []).map((n) => n.toLowerCase().trim()).filter(Boolean);
  const profiles: ParlayRiskProfile[] = [
    "conservative",
    "balanced",
    "aggressive",
    "star_power",
  ];
  const out: Array<{ profile: ParlayRiskProfile; slip: OptimizerSlip }> = [];
  for (const profile of profiles) {
    const bucket = payload.buckets?.[profile]?.[sportKey] ?? [];
    if (bucket.length === 0) continue;
    let best: OptimizerSlip | null = null;
    for (const slip of bucket) {
      if (wantedPlayers.length > 0) {
        const slipPlayers = slip.legs.map((l) =>
          (l.playerName ?? "").toLowerCase().trim(),
        );
        const everyRequested = wantedPlayers.every((p) =>
          slipPlayers.includes(p),
        );
        if (!everyRequested) continue;
      }
      if (!best || (slip.score ?? 0) > (best.score ?? 0)) {
        best = slip;
      }
    }
    if (best) out.push({ profile, slip: best });
  }
  return out;
}

/**
 * Top-N slips across a sport bucket, sorted by optimizer score. Used
 * by the homepage carousel for the per-sport rail.
 */
export function topOptimizerSlipsForSport(
  payload: OptimizerSnapshot,
  sport: SuggestedSport,
  limit: number = 8,
): OptimizerSlip[] {
  const profiles: ParlayRiskProfile[] = [
    "conservative",
    "balanced",
    "aggressive",
    "star_power",
  ];
  const slips: OptimizerSlip[] = [];
  const seen = new Set<string>();
  for (const profile of profiles) {
    const bucket = payload.buckets?.[profile]?.[sport] ?? [];
    for (const slip of bucket) {
      if (seen.has(slip.slipId)) continue;
      seen.add(slip.slipId);
      slips.push(slip);
    }
  }
  slips.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return slips.slice(0, limit);
}

/**
 * Flatten an optimizer snapshot into a single list of slips, dedupe
 * by slipId so the same slip surfaced under "mlb" and "all" buckets
 * only appears once. Pure — safe in client components.
 */
export function flattenOptimizerSlips(
  payload: OptimizerSnapshot,
): OptimizerSlip[] {
  const seen = new Set<string>();
  const out: OptimizerSlip[] = [];
  const profiles: ParlayRiskProfile[] = [
    "conservative",
    "balanced",
    "aggressive",
    "star_power",
  ];
  const sports: SuggestedSport[] = ["all", "nba", "mlb", "multi"];
  for (const profile of profiles) {
    for (const sport of sports) {
      const slips = payload.buckets?.[profile]?.[sport] ?? [];
      for (const slip of slips) {
        if (seen.has(slip.slipId)) continue;
        seen.add(slip.slipId);
        out.push(slip);
      }
    }
  }
  out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return out;
}

/**
 * Unique players appearing on any leg across an optimizer payload's
 * `all` bucket. Used by the Parlay Lab player chip selector.
 */
export function playersFromOptimizerPayload(
  payload: OptimizerSnapshot,
  sport: SuggestedSport,
): Array<{ name: string; sport: string; team: string | null }> {
  const seen = new Map<
    string,
    { name: string; sport: string; team: string | null }
  >();
  const profiles: ParlayRiskProfile[] = [
    "conservative",
    "balanced",
    "aggressive",
    "star_power",
  ];
  for (const profile of profiles) {
    const bucket = payload.buckets?.[profile]?.[sport] ?? [];
    for (const slip of bucket) {
      for (const leg of slip.legs) {
        const key = (leg.playerName ?? "").toLowerCase().trim();
        if (!key) continue;
        if (!seen.has(key)) {
          seen.set(key, {
            name: leg.playerName,
            sport: leg.sport,
            team: leg.team,
          });
        }
      }
    }
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
