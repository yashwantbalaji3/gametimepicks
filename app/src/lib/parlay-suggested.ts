/**
 * Pure types + helpers for the parlay-first surfaces (homepage
 * carousel + Parlay Lab builder).
 *
 * Kept separate from `data-parlays.ts` because that file imports
 * `node:fs` for snapshot loading, which breaks client-component
 * bundling. Everything in this file is safe to import from a "use
 * client" component.
 *
 * `data-parlays.ts` re-exports the types from here for compatibility
 * with existing server-side imports; new code should import from
 * here directly.
 */

export type ParlaySlipStatus = "pending" | "win" | "loss" | "push" | "void";
export type ParlayRiskProfile =
  | "conservative"
  | "balanced"
  | "aggressive";
export type ParlayLegResult = "win" | "loss" | "push" | "unresolved";

export interface ParlayLeg {
  sport: string;
  gameId: string | null;
  gameDate: string;
  playerId: number | null;
  playerName: string;
  team: string | null;
  opponent: string | null;
  market: string;
  marketLabel?: string | null;
  side: string;
  line: number | null;
  projection: number | null;
  edgePct: number | null;
  confidence: string | null;
  bookmaker: string | null;
  oddsForSide: number | null;
  riskFlags?: string[];
  result?: ParlayLegResult;
  finalStat?: number | null;
  settlementSource?: string | null;
}

export interface ParlaySlip {
  slipId: string;
  riskProfile: ParlayRiskProfile;
  sport: string;
  status: ParlaySlipStatus;
  legs: ParlayLeg[];
  score: number;
  sameGame: boolean;
  hasAnomalyLeg: boolean;
  gradedAt?: string;
}

export interface ParlaySnapshot {
  date: string;
  generatedAt: string;
  sportsIncluded: string[];
  sourceBoardDates: string[];
  profilesGenerated: string[];
  slipsCount: number;
  slips: ParlaySlip[];
  gradedAt?: string;
}

export interface ParlaySummary {
  generatedAt: string;
  byDate: Array<{
    date: string;
    wins: number;
    losses: number;
    pushes: number;
    pending: number;
  }>;
  lifetime: {
    wins: number;
    losses: number;
    pushes: number;
    pending: number;
    decisive: number;
    hitRate: number | null;
  };
  byProfile: Record<
    string,
    {
      wins: number;
      losses: number;
      pushes: number;
      pending: number;
      decisive: number;
      hitRate: number | null;
    }
  >;
}

export type SuggestedSport = "all" | "nba" | "mlb" | "multi";

const _PROFILE_ORDER: Record<ParlayRiskProfile, number> = {
  conservative: 0,
  balanced: 1,
  aggressive: 2,
};

/**
 * Honest ranking score for a slip. Higher = more recommendable.
 *
 * Uses ONLY fields that already live on the snapshot (no fabricated
 * extras). The python builder writes `score` as edge × calibration ×
 * historical-market weight, so we ride that as the primary signal and
 * apply a few additional, transparent adjustments:
 *
 *  - Conservative > Balanced > Aggressive ordering — reflects the
 *    lifetime track record where aggressive has hit 4.5% vs
 *    conservative's 16.7% (see model_audit.json).
 *  - Penalty for same-game stacks — correlated outcomes inflate the
 *    apparent confidence.
 *  - Penalty for anomaly legs — extreme-edge legs are usually noise.
 *  - Small bonus for slips with `nba` or `mlb` sport (vs `multi`),
 *    since the audit only contains single-sport history we can trust
 *    today.
 */
export function suggestedScore(slip: ParlaySlip): number {
  let score = slip.score ?? 0;
  const profileOffset = _PROFILE_ORDER[slip.riskProfile] ?? 1;
  score -= profileOffset * 0.05;
  if (slip.sameGame) score -= 0.15;
  if (slip.hasAnomalyLeg) score -= 0.2;
  if (slip.sport === "multi") score -= 0.05;
  const legs = slip.legs?.length ?? 0;
  if (slip.riskProfile === "aggressive" && legs >= 5) score -= 0.1;
  return score;
}

function _bySuggestedScore(a: ParlaySlip, b: ParlaySlip): number {
  const sa = suggestedScore(a);
  const sb = suggestedScore(b);
  if (sb !== sa) return sb - sa;
  if (b.legs.length !== a.legs.length) return b.legs.length - a.legs.length;
  return a.slipId.localeCompare(b.slipId);
}

/**
 * Group + sort suggested parlays by sport for the homepage carousel.
 *
 * Returns one bucket per sport tab plus an "all" bucket. Each bucket
 * is sorted by `suggestedScore` desc. We do NOT invent slips for
 * empty buckets — the caller renders an honest empty-state tile when
 * the sport has nothing.
 */
export function groupSuggestedBySport(
  slips: ParlaySlip[],
): Record<SuggestedSport, ParlaySlip[]> {
  const buckets: Record<SuggestedSport, ParlaySlip[]> = {
    all: [],
    nba: [],
    mlb: [],
    multi: [],
  };
  for (const slip of slips) {
    buckets.all.push(slip);
    const sport = (slip.sport ?? "").toLowerCase();
    if (sport === "nba") buckets.nba.push(slip);
    else if (sport === "mlb") buckets.mlb.push(slip);
    else if (sport === "multi") buckets.multi.push(slip);
  }
  for (const key of Object.keys(buckets) as SuggestedSport[]) {
    buckets[key] = buckets[key].slice().sort(_bySuggestedScore);
  }
  return buckets;
}

/**
 * Best slip per risk profile, filtered to the given sport and an
 * optional set of player names (used by the Parlay Lab builder UI).
 *
 * Honest behavior: if no slip matches the filters for a profile, that
 * profile is silently dropped from the result (no fake slip inserted).
 */
export function getBestSuggestedByRisk(
  slips: ParlaySlip[],
  filter: {
    sport?: SuggestedSport;
    playerNames?: string[];
  } = {},
): Array<{ profile: ParlayRiskProfile; slip: ParlaySlip }> {
  const sport = filter.sport ?? "all";
  const wantedPlayers = filter.playerNames?.map((n) => n.toLowerCase().trim()) ?? [];

  const passes = (slip: ParlaySlip): boolean => {
    if (sport !== "all") {
      const sportKey = (slip.sport ?? "").toLowerCase();
      if (sportKey !== sport) return false;
    }
    if (wantedPlayers.length > 0) {
      const slipPlayers = (slip.legs ?? []).map((l) =>
        (l.playerName ?? "").toLowerCase().trim(),
      );
      const everyRequested = wantedPlayers.every((p) =>
        slipPlayers.some((sp) => sp === p),
      );
      if (!everyRequested) return false;
    }
    return true;
  };

  const profiles: ParlayRiskProfile[] = [
    "conservative",
    "balanced",
    "aggressive",
  ];
  const out: Array<{ profile: ParlayRiskProfile; slip: ParlaySlip }> = [];
  for (const profile of profiles) {
    const candidates = slips
      .filter((s) => s.riskProfile === profile && passes(s))
      .slice()
      .sort(_bySuggestedScore);
    if (candidates.length === 0) continue;
    out.push({ profile, slip: candidates[0] });
  }
  return out;
}

/**
 * Unique players appearing on any leg across the given slips. Used by
 * the Parlay Lab player selector. Sorted alphabetically; deduplicated
 * case-insensitively.
 */
export function playersFromSlips(slips: ParlaySlip[]): Array<{
  name: string;
  sport: string;
  team: string | null;
}> {
  const seen = new Map<
    string,
    { name: string; sport: string; team: string | null }
  >();
  for (const slip of slips) {
    for (const leg of slip.legs ?? []) {
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
  return Array.from(seen.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
