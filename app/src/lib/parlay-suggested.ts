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
  | "aggressive"
  | "star_power";
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
  /** Up to 10 most recent stat values for the market — used by the
   *  recent-form popup. Optional; older snapshot files may not carry
   *  it. */
  recentSeries?: number[];
  /** PR #114: optional enriched recent-form rows. When the pipeline
   *  has the data, each row carries the game date, opponent
   *  abbreviation, and home/away flag — so the drawer can render
   *  "May 23 · vs NYK · 8 REB · UNDER" instead of "G-1 · 8 · UNDER".
   *  We don't fabricate this — when the source doesn't have it,
   *  drawer falls back to the legacy `recentSeries` numeric list. */
  recentGames?: Array<{
    /** ISO YYYY-MM-DD. */
    date?: string | null;
    /** Opponent team abbreviation (NBA/MLB short code). */
    opponent?: string | null;
    /** True if the player's team was home for this game. */
    isHome?: boolean | null;
    /** Player's stat value for the leg's market on that day. */
    value: number;
  }>;
  /** Star metadata (PR #99). `starTier` ∈
   *  {"none","regular","core","superstar"}. Optional on legacy
   *  snapshots. */
  starTier?: "none" | "regular" | "core" | "superstar";
  isStar?: boolean;
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
  // Star Power is its own lane — model-ranked, not "safer". Order
  // value is between Conservative and Aggressive so the suggestedScore
  // sort doesn't disadvantage it inside cross-profile views.
  star_power: 1,
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
 * The legacy implementation grouped by the slip-level `sport` tag,
 * which meant a slip tagged `"multi"` (e.g. one NBA leg + one MLB leg)
 * disappeared from the NBA tab entirely. That hid today's NBA game on
 * dates with only one NBA matchup (the slate can't satisfy a NBA-only
 * profile but it CAN appear as a leg inside a multi slip).
 *
 * New rule:
 *   - `nba` bucket = every slip with ≥1 NBA leg (single-sport OR
 *     multi-sport that includes NBA).
 *   - `mlb` bucket = every slip with ≥1 MLB leg.
 *   - `multi` bucket = slips with legs from BOTH sports (strict).
 *   - `all` bucket = every slip, ranked.
 *
 * That matches the user's mental model: tapping NBA should surface
 * NBA exposure today, even when it has to come via a mixed slip.
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
    const sportsOnSlip = new Set<string>();
    for (const leg of slip.legs ?? []) {
      const s = (leg.sport ?? "").toLowerCase();
      if (s) sportsOnSlip.add(s);
    }
    // Fall back to slip-level sport tag if legs lack metadata.
    if (sportsOnSlip.size === 0 && slip.sport) {
      sportsOnSlip.add((slip.sport ?? "").toLowerCase());
    }
    if (sportsOnSlip.has("nba")) buckets.nba.push(slip);
    if (sportsOnSlip.has("mlb")) buckets.mlb.push(slip);
    if (sportsOnSlip.size > 1) buckets.multi.push(slip);
  }
  for (const key of Object.keys(buckets) as SuggestedSport[]) {
    buckets[key] = buckets[key].slice().sort(_bySuggestedScore);
  }
  return buckets;
}

/**
 * Diversified "All tab" ordering. Used by the homepage so the first
 * card on All is never a long string of MLB-only slips when NBA
 * mixed slips exist alongside.
 *
 * Algorithm:
 *   1. Bucket slips into [conservative, balanced, aggressive].
 *   2. Within each profile bucket, sort by `suggestedScore` desc.
 *   3. Walk each profile in order picking top-K alternately:
 *      conservative #1, balanced #1, aggressive #1,
 *      conservative #2, balanced #2, …
 *      With a small bias: when an NBA-containing slip is available
 *      and the last picked slip had no NBA legs, prefer the NBA one
 *      next so the rail surfaces NBA naturally.
 *
 * This is purely a display order — no slip is filtered out.
 */
export function diversifiedAllOrder(
  slips: ParlaySlip[],
): ParlaySlip[] {
  const byProfile: Record<ParlayRiskProfile, ParlaySlip[]> = {
    conservative: [],
    balanced: [],
    aggressive: [],
    star_power: [],
  };
  for (const s of slips) byProfile[s.riskProfile]?.push(s);
  for (const k of Object.keys(byProfile) as ParlayRiskProfile[]) {
    byProfile[k] = byProfile[k].slice().sort(_bySuggestedScore);
  }
  const out: ParlaySlip[] = [];
  const order: ParlayRiskProfile[] = [
    "conservative",
    "balanced",
    "star_power",
    "aggressive",
  ];
  const idx: Record<ParlayRiskProfile, number> = {
    conservative: 0,
    balanced: 0,
    aggressive: 0,
    star_power: 0,
  };
  // Track consecutive non-NBA picks. Once it hits a threshold we swap
  // in the next-best NBA slip (if any) to keep NBA visible. We
  // intentionally do NOT swap on the first pick — that would push the
  // top-scored slip below an NBA slip that scored lower.
  const consecutiveNonNbaThreshold = 2;
  let consecutiveNonNba = 0;
  let remaining = slips.length;
  while (remaining > 0) {
    for (const profile of order) {
      const pool = byProfile[profile];
      if (idx[profile] >= pool.length) continue;
      let pick = pool[idx[profile]];
      const pickHasNba = (pick.legs ?? []).some((l) => l.sport === "nba");
      if (!pickHasNba && consecutiveNonNba >= consecutiveNonNbaThreshold) {
        const nbaPick = pool
          .slice(idx[profile])
          .find((s) => (s.legs ?? []).some((l) => l.sport === "nba"));
        if (nbaPick) {
          const pos = pool.indexOf(nbaPick, idx[profile]);
          pool.splice(pos, 1);
          pool.splice(idx[profile], 0, nbaPick);
          pick = nbaPick;
        }
      }
      out.push(pick);
      consecutiveNonNba =
        (pick.legs ?? []).some((l) => l.sport === "nba")
          ? 0
          : consecutiveNonNba + 1;
      idx[profile] += 1;
      remaining -= 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Slip-level inspection helpers (used by sport/team/player filters)
// ---------------------------------------------------------------------------

export function getSlipSports(slip: ParlaySlip): Set<string> {
  const out = new Set<string>();
  for (const leg of slip.legs ?? []) {
    const s = (leg.sport ?? "").toLowerCase();
    if (s) out.add(s);
  }
  if (out.size === 0 && slip.sport) {
    out.add((slip.sport ?? "").toLowerCase());
  }
  return out;
}

export function slipContainsSport(slip: ParlaySlip, sport: string): boolean {
  return getSlipSports(slip).has(sport.toLowerCase());
}

export function getSlipTeams(slip: ParlaySlip): Set<string> {
  const out = new Set<string>();
  for (const leg of slip.legs ?? []) {
    const t = (leg.team ?? "").toUpperCase().trim();
    if (t) out.add(t);
  }
  return out;
}

export function slipContainsTeam(slip: ParlaySlip, team: string): boolean {
  return getSlipTeams(slip).has(team.toUpperCase().trim());
}

export function getSlipPlayers(slip: ParlaySlip): string[] {
  return (slip.legs ?? [])
    .map((l) => (l.playerName ?? "").trim())
    .filter(Boolean);
}

export function slipContainsPlayer(slip: ParlaySlip, name: string): boolean {
  const target = name.toLowerCase().trim();
  return getSlipPlayers(slip).some((p) => p.toLowerCase().trim() === target);
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

// ---------------------------------------------------------------------------
// Team-first filtering helpers (client-safe — no fs imports anywhere)
// ---------------------------------------------------------------------------

/** Sports that have at least one slip in the pool, in tab-friendly order. */
export function getAvailableSportsFromSlips(
  slips: ParlaySlip[],
): SuggestedSport[] {
  const present = new Set<string>();
  for (const slip of slips) {
    const s = (slip.sport ?? "").toLowerCase();
    if (s) present.add(s);
  }
  const order: SuggestedSport[] = ["all", "nba", "mlb", "multi"];
  const out: SuggestedSport[] = [];
  if (slips.length > 0) out.push("all");
  for (const s of order) {
    if (s === "all") continue;
    if (present.has(s)) out.push(s);
  }
  return out;
}

/**
 * Unique teams across the slips' legs, filtered to the given sport
 * (or all sports when sport === "all"). Sorted alphabetically. Skips
 * legs with no team metadata. This is the team picker source — never
 * fabricates a team.
 *
 * NBA tab includes teams from any leg whose sport === "nba", whether
 * the slip itself is sport-tagged "nba" or "multi". Same for MLB.
 */
export function getAvailableTeamsFromSlips(
  slips: ParlaySlip[],
  sport: SuggestedSport,
): Array<{ team: string; sport: string }> {
  const seen = new Map<string, { team: string; sport: string }>();
  for (const slip of slips) {
    if (sport !== "all" && !slipContainsSport(slip, sport)) continue;
    for (const leg of slip.legs ?? []) {
      if (sport !== "all" && sport !== "multi") {
        // For sport-specific tabs, only show teams from THAT sport's legs.
        if ((leg.sport ?? "").toLowerCase() !== sport) continue;
      }
      const t = (leg.team ?? "").toUpperCase().trim();
      if (!t) continue;
      const key = `${leg.sport}|${t}`;
      if (!seen.has(key)) {
        seen.set(key, { team: t, sport: leg.sport });
      }
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.team.localeCompare(b.team));
}

/**
 * Players that appear on a leg matching the given (sport, team) filter.
 * If `team` is empty, returns every player for the sport.
 *
 * Sport-aware: NBA tab returns only NBA legs (not MLB legs that live
 * inside a multi-sport slip), so the player dropdown stays scoped to
 * what the user just picked.
 */
export function getAvailablePlayersForTeam(
  slips: ParlaySlip[],
  sport: SuggestedSport,
  team: string | null,
): Array<{ name: string; sport: string; team: string | null }> {
  const wantedTeam = (team ?? "").toUpperCase().trim();
  const seen = new Map<
    string,
    { name: string; sport: string; team: string | null }
  >();
  for (const slip of slips) {
    if (sport !== "all" && !slipContainsSport(slip, sport)) continue;
    for (const leg of slip.legs ?? []) {
      if (sport !== "all" && sport !== "multi") {
        if ((leg.sport ?? "").toLowerCase() !== sport) continue;
      }
      const legTeam = (leg.team ?? "").toUpperCase().trim();
      if (wantedTeam && legTeam !== wantedTeam) continue;
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

/**
 * Filter slips so every leg passes (sport, team, player) — when
 * `team` is given, EVERY leg must be on that team; when `playerNames`
 * is given, every player must appear on the slip.
 *
 * Returns `[]` when no slip matches, so the caller can fall back to
 * unfiltered suggestions with a clear note.
 */
export function filterSlipsBySportTeamPlayer(
  slips: ParlaySlip[],
  filter: {
    sport: SuggestedSport;
    team?: string | null;
    playerNames?: string[];
  },
): ParlaySlip[] {
  const wantedTeam = (filter.team ?? "").toUpperCase().trim() || null;
  const wantedPlayers = (filter.playerNames ?? [])
    .map((p) => p.toLowerCase().trim())
    .filter(Boolean);
  return slips.filter((slip) => {
    if (filter.sport === "multi") {
      // Mixed tab strictly requires legs from BOTH sports.
      if (getSlipSports(slip).size < 2) return false;
    } else if (filter.sport !== "all") {
      // PR #114 contract change: NBA / MLB tab now requires the slip
      // to be SINGLE-SPORT for the requested sport. Previously the
      // filter used `slipContainsSport()` which let any slip with ≥1
      // leg of that sport pass — meaning a Mixed slip with one NBA
      // leg would surface under the NBA tab. That misled users who
      // expected an NBA-only build.
      // New behavior:
      //   - "nba" → every leg must be NBA (no MLB legs allowed).
      //   - "mlb" → every leg must be MLB.
      //   - "all" → no sport filter.
      //   - "multi" → must contain ≥2 sports.
      const sports = getSlipSports(slip);
      if (sports.size !== 1) return false;
      if (!sports.has(filter.sport)) return false;
    }
    if (wantedTeam) {
      const anyOnTeam = (slip.legs ?? []).some(
        (l) => (l.team ?? "").toUpperCase().trim() === wantedTeam,
      );
      if (!anyOnTeam) return false;
    }
    if (wantedPlayers.length > 0) {
      const slipPlayers = (slip.legs ?? []).map((l) =>
        (l.playerName ?? "").toLowerCase().trim(),
      );
      const everyRequested = wantedPlayers.every((p) =>
        slipPlayers.includes(p),
      );
      if (!everyRequested) return false;
    }
    return true;
  });
}

/**
 * Honest fallback: when filtered slips are empty, return the top-N
 * unfiltered slips ranked by `suggestedScore`. Caller renders an
 * inline note explaining the fallback so the user sees what happened.
 */
export function fallbackToBestUnfilteredSlips(
  slips: ParlaySlip[],
  sport: SuggestedSport,
  limit: number = 3,
): ParlaySlip[] {
  const scored = slips
    .filter((s) => {
      // PR #114 contract: keep this in sync with
      // `filterSlipsBySportTeamPlayer`. Single-sport pills require
      // the slip's sport-set to be exactly that sport.
      if (sport === "all") return true;
      if (sport === "multi") return getSlipSports(s).size > 1;
      const sports = getSlipSports(s);
      return sports.size === 1 && sports.has(sport);
    })
    .slice()
    .sort((a, b) => suggestedScore(b) - suggestedScore(a));
  return scored.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Display-level cross-bucket diversity
// ---------------------------------------------------------------------------

/**
 * Display-level diversity penalty table (PR #100 follow-up).
 *
 * The Python optimizer's `_select_diverse` runs per bucket
 * (nba / mlb / multi / all). The homepage and Parlay Lab pool slips
 * ACROSS buckets before showing visible cards — so a single dominant
 * leg (e.g. the highest-edge MLB hitter on the slate) can still
 * anchor every visible Conservative card because it wins both the
 * multi-bucket #1 slot and the mlb-bucket #1 slot.
 *
 * This selector runs AFTER pooling and pushes near-duplicate visible
 * cards down so the first three slots don't all share the same
 * player. It is stronger than the Python-side penalty because it
 * needs to overcome cross-bucket score parity.
 *
 *   conservative — strongest: a 3rd repeat of the same player loses
 *                 ~0.80; same player + same market loses ~1.40.
 *   balanced     — moderate.
 *   aggressive   — light: high-variance cards may legitimately repeat
 *                 value players (Schroder, Foscue) because their edges
 *                 are real.
 *
 * `mixedSportPenalty` (PR #110 safety filter D):
 *   Subtracted from the adjusted score of any multi-sport (Mixed) slip.
 *   Mixed slips went 0-26 on 5/25 — every visible Mixed card lost. The
 *   penalty steers Conservative/Balanced toward single-sport
 *   alternatives unless the Mixed slip is *materially* better. We do
 *   NOT hard-filter — if Mixed is the only viable option, it can still
 *   surface, but the bar is now higher.
 *     conservative — strongest (0.50). Roughly equivalent to a 1.5×
 *                    same-player repeat penalty.
 *     balanced     — moderate (0.30).
 *     star_power   — light (0.10). Star-led slips often span sports
 *                    naturally; only nudge.
 *     aggressive   — none (0.00). High Variance lane is allowed to
 *                    take mixed-sport longshots.
 */
const _DISPLAY_PENALTY: Record<
  ParlayRiskProfile,
  {
    perPlayer: number;
    perPlayerMarketExtra: number;
    mixedSportPenalty: number;
  }
> = {
  conservative: {
    perPlayer: 0.4,
    perPlayerMarketExtra: 0.3,
    mixedSportPenalty: 0.5,
  },
  balanced: {
    perPlayer: 0.25,
    perPlayerMarketExtra: 0.2,
    mixedSportPenalty: 0.3,
  },
  aggressive: {
    perPlayer: 0.12,
    perPlayerMarketExtra: 0.08,
    mixedSportPenalty: 0.0,
  },
  // Star Power — diversify between visible star-led slips like
  // Balanced. Same player still allowed when the only alternative
  // is a non-star (the lane's Python-side require_star already
  // guarantees no non-star ever enters).
  star_power: {
    perPlayer: 0.3,
    perPlayerMarketExtra: 0.25,
    mixedSportPenalty: 0.1,
  },
};

/**
 * Pick the top-N visible slips for a single risk profile, applying a
 * cross-slip recurrence penalty so the same player doesn't anchor
 * every visible card.
 *
 * The penalty is *bounded* — when no diverse alternative exists, the
 * same player can still repeat. We rank-down, we never fabricate or
 * promote junk just to hit a diversity target.
 *
 * Algorithm (greedy):
 *   1. Sort candidates by `suggestedScore` desc.
 *   2. For each remaining slip, compute an adjusted score:
 *        adj = suggestedScore(slip)
 *                − Σ (perPlayer × times player already chosen)
 *                − Σ (perPlayerMarketExtra × times player+market
 *                     already chosen)
 *   3. Pick the slip with the best adjusted score. Add its players
 *      and player+market keys to the running counts.
 *   4. Repeat until `limit` reached or no slips remain.
 *
 * The first pick is always the top-`suggestedScore` slip (penalty is
 * zero for the first pick), so a clearly-best slip stays #1.
 */
export function selectDiverseForDisplay(
  slips: ParlaySlip[],
  profile: ParlayRiskProfile,
  limit: number,
): ParlaySlip[] {
  if (limit <= 0 || slips.length === 0) return [];
  const penalties = _DISPLAY_PENALTY[profile] ?? _DISPLAY_PENALTY.balanced;
  const remaining = slips
    .slice()
    .sort((a, b) => suggestedScore(b) - suggestedScore(a));
  const chosen: ParlaySlip[] = [];
  const playerCounts = new Map<string, number>();
  const playerMarketCounts = new Map<string, number>();
  while (chosen.length < limit && remaining.length > 0) {
    let bestIdx = 0;
    let bestAdj = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const slip = remaining[i];
      let penalty = 0;
      for (const leg of slip.legs ?? []) {
        const pKey = (leg.playerName ?? "").toLowerCase().trim();
        if (!pKey) continue;
        const pCount = playerCounts.get(pKey) ?? 0;
        if (pCount > 0) penalty += pCount * penalties.perPlayer;
        const market = (leg.market ?? "").toLowerCase().trim();
        const pmKey = `${pKey}|${market}`;
        const pmCount = playerMarketCounts.get(pmKey) ?? 0;
        if (pmCount > 0) penalty += pmCount * penalties.perPlayerMarketExtra;
      }
      // PR #110 safety filter D: penalize Mixed (multi-sport) slips so
      // Conservative/Balanced prefer single-sport alternatives. Mixed
      // slips went 0-26 on 5/25. A Mixed slip can still win if it is
      // *materially* better than every single-sport alternative — we
      // do not hard-filter.
      if (penalties.mixedSportPenalty > 0 && getSlipSports(slip).size > 1) {
        penalty += penalties.mixedSportPenalty;
      }
      const adj = suggestedScore(slip) - penalty;
      if (adj > bestAdj) {
        bestAdj = adj;
        bestIdx = i;
      }
    }
    const pick = remaining.splice(bestIdx, 1)[0];
    chosen.push(pick);
    for (const leg of pick.legs ?? []) {
      const pKey = (leg.playerName ?? "").toLowerCase().trim();
      if (!pKey) continue;
      playerCounts.set(pKey, (playerCounts.get(pKey) ?? 0) + 1);
      const market = (leg.market ?? "").toLowerCase().trim();
      const pmKey = `${pKey}|${market}`;
      playerMarketCounts.set(pmKey, (playerMarketCounts.get(pmKey) ?? 0) + 1);
    }
  }
  return chosen;
}
