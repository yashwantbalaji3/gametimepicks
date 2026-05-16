/**
 * Phase 16 — Parlay Builder.
 *
 * Mode B / C of Parlay Lab. Takes the user's selections (players, games,
 * markets, risk profile) and generates candidate parlay combinations
 * from REAL available leans on the slate. No fabrication; if the model
 * doesn't have a lean on a player, that player isn't an option.
 *
 * Key contract:
 *   - Every leg in every candidate is sourced from a real PropLean
 *     present on the slate. We never invent alternate lines, projected
 *     odds, or fake players.
 *   - Risk profile is a filter + a max-legs cap. Conservative legs
 *     prefer high confidence with valid recent10 and playerId; aggressive
 *     allows lower confidence and looser data quality.
 *   - We emit candidate parlays sorted by an internal score, but the UI
 *     must always frame them as "candidates for analysis", never as
 *     "recommended bets". Profitability claims are forbidden.
 *
 * Pure logic. Browser-safe. No fetches, no globals.
 */

import type { PropLean, ConfidenceTier, ScheduleGame } from "./types";
import type { LegAnalysis } from "./parlay";
import { analyzeLeg, americanToImplied, impliedToAmerican } from "./parlay";
import { topCorePlayerKeysPerTeam, playerKeyForLean } from "./core-players";

export type RiskProfile = "conservative" | "balanced" | "aggressive";

export type BuilderMode = "selected_players" | "top_props";

export interface BuilderOptions {
  mode: BuilderMode;
  /** When mode === selected_players, these names limit candidate legs. */
  selectedPlayerNames?: string[];
  /** When set, restrict legs to these gameIds. */
  selectedGameIds?: string[];
  /** When set, restrict legs to these markets. Defaults to all three. */
  selectedMarkets?: ("PTS" | "REB" | "AST")[];
  /** Risk profile drives filters + max legs. */
  riskProfile: RiskProfile;
  /** How many candidate parlays to return. Default 3. */
  numCandidates?: number;
  /**
   * Phase 17: when false (the default), restrict candidate leg generation
   * to the top N "core" players per team (e.g. starters / stars).
   * When true, include bench / role players too. UI exposes this as the
   * "include full rotation" toggle, off by default.
   */
  includeBenchPlayers?: boolean;
  /** Phase 17: how many "core" players per team to include when bench
   *  is excluded. Default 3.
   */
  corePlayersPerTeam?: number;
}

export interface ParlayCandidate {
  /** Each leg analyzed exactly like a paste-mode leg. */
  legs: LegAnalysis[];
  /** Distinct games this candidate covers. */
  uniqueGames: number;
  /** True iff 2+ legs share the same gameId — surface a warning. */
  hasSameGameLegs: boolean;
  /** True iff at least one leg carries the R5 model-anomaly flag. */
  hasAnomalyLegs: boolean;
  /** Combined American odds when every leg has odds. null otherwise. */
  combinedOddsAmerican: number | null;
  /** Implied combined probability. null when any leg missing odds. */
  combinedImpliedProbability: number | null;
  /** Internal score used to rank candidates. Higher is "better fit". */
  score: number;
  /** Human-readable framing — always framed as analysis, never advice. */
  rationale: string;
  /** The risk profile this candidate was generated under. */
  riskProfile: RiskProfile;
}

// ---------------------------------------------------------------------------
// Filter rules per risk profile
// ---------------------------------------------------------------------------

interface ProfileRules {
  /** Allowed confidence tiers. */
  confidence: ConfidenceTier[];
  /** Minimum edgePct to pass. */
  minEdgePct: number;
  /** Maximum legs in a candidate. */
  maxLegs: number;
  /** Minimum legs (we won't return fewer). */
  minLegs: number;
  /** Require valid recent10 sample (at least 5 logs)? */
  requireRecent10: boolean;
  /** Require playerId > 0? */
  requireValidPlayerId: boolean;
  /** Maximum legs per single game (reduces correlated risk). */
  maxLegsPerGame: number;
  /**
   * When true, leans flagged as R5 model anomaly (suspicious_edge)
   * are excluded from the eligible pool entirely. Conservative and
   * Balanced default to true so the lower-variance modes never carry a
   * capped extreme-edge leg.
   */
  excludeAnomalies: boolean;
  /**
   * Soft cap: at most this many R5-anomaly legs may appear inside a
   * single candidate. Aggressive allows up to 1 anomaly leg so the
   * mode can carry a high-variance shot when the user opts in.
   * Ignored when `excludeAnomalies` is true.
   */
  maxAnomalyLegs: number;
}

const PROFILE_RULES: Record<RiskProfile, ProfileRules> = {
  conservative: {
    confidence: ["High"],
    minEdgePct: 3,
    maxLegs: 3,
    minLegs: 2,
    requireRecent10: true,
    requireValidPlayerId: true,
    maxLegsPerGame: 1,
    excludeAnomalies: true,
    maxAnomalyLegs: 0,
  },
  balanced: {
    confidence: ["High", "Medium"],
    minEdgePct: 2,
    maxLegs: 4,
    minLegs: 2,
    requireRecent10: false,
    requireValidPlayerId: true,
    maxLegsPerGame: 2,
    excludeAnomalies: true,
    maxAnomalyLegs: 0,
  },
  aggressive: {
    confidence: ["High", "Medium"],
    minEdgePct: 1,
    maxLegs: 5,
    minLegs: 3,
    requireRecent10: false,
    requireValidPlayerId: false,
    maxLegsPerGame: 3,
    excludeAnomalies: false,
    maxAnomalyLegs: 1,
  },
};

/** Helper — does this lean carry the R5 suspicious-edge risk flag? */
function isAnomaly(lean: PropLean): boolean {
  return (lean.riskFlags ?? []).includes("suspicious_edge");
}

// ---------------------------------------------------------------------------
// Per-leg quality score — used to sort candidates
// ---------------------------------------------------------------------------

function legScore(lean: PropLean): number {
  // Confidence weight (High > Medium > Low > others)
  const cw =
    lean.confidence === "High"
      ? 1.0
      : lean.confidence === "Medium"
        ? 0.65
        : lean.confidence === "Low"
          ? 0.3
          : 0.1;
  // Edge contribution (clip to avoid runaway from data anomalies)
  const edgePct = Math.max(0, Math.min(20, lean.edgePct ?? 0));
  // Recent10 bonus
  const recent =
    Array.isArray(lean.recent10) && lean.recent10.length >= 5 ? 0.15 : 0;
  // Valid playerId bonus
  const pid = (lean.playerId ?? 0) > 0 ? 0.1 : 0;
  return cw * 0.7 + (edgePct / 20) * 0.3 + recent + pid;
}

// ---------------------------------------------------------------------------
// Eligibility filter
// ---------------------------------------------------------------------------

function isEligible(
  lean: PropLean,
  rules: ProfileRules,
  opts: BuilderOptions,
): boolean {
  // Must be a pickable side
  if (lean.lean !== "Over" && lean.lean !== "Under") return false;
  // Confidence tier
  if (!rules.confidence.includes(lean.confidence as ConfidenceTier)) return false;
  // Minimum edge
  if ((lean.edgePct ?? 0) < rules.minEdgePct) return false;
  // Recent10 requirement
  if (rules.requireRecent10) {
    if (!Array.isArray(lean.recent10) || lean.recent10.length < 5) return false;
  }
  // playerId requirement
  if (rules.requireValidPlayerId && (lean.playerId ?? 0) <= 0) return false;
  // Anomaly exclusion (Conservative + Balanced never carry capped
  // extreme-edge legs; Aggressive allows them but with a soft cap
  // enforced inside greedyBuild).
  if (rules.excludeAnomalies && isAnomaly(lean)) return false;
  // Game restriction. lean.gameId is optional; when the user has
  // restricted to specific games, leans without a gameId are excluded
  // (we can't honestly claim they belong to a selected game).
  if (opts.selectedGameIds && opts.selectedGameIds.length > 0) {
    if (!lean.gameId) return false;
    if (!opts.selectedGameIds.includes(lean.gameId)) return false;
  }
  // Market restriction
  if (opts.selectedMarkets && opts.selectedMarkets.length > 0) {
    if (!opts.selectedMarkets.includes(lean.market as "PTS" | "REB" | "AST"))
      return false;
  }
  // Selected-player restriction (mode B)
  if (
    opts.mode === "selected_players" &&
    opts.selectedPlayerNames &&
    opts.selectedPlayerNames.length > 0
  ) {
    const target = new Set(
      opts.selectedPlayerNames.map((n) => normalizePlayer(n)),
    );
    if (!target.has(normalizePlayer(lean.playerName))) return false;
  }
  return true;
}

function normalizePlayer(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ---------------------------------------------------------------------------
// Combined-odds helper
// ---------------------------------------------------------------------------

function combinedOdds(legs: LegAnalysis[]): {
  combinedOddsAmerican: number | null;
  combinedImpliedProbability: number | null;
} {
  let pProduct = 1;
  let allHaveOdds = true;
  for (const la of legs) {
    const lean = la.matchedLean;
    if (!lean) {
      allHaveOdds = false;
      break;
    }
    // Pick the odds that match the side the model agrees with
    const o = lean.lean === "Over" ? lean.oddsOver : lean.oddsUnder;
    if (o == null || !Number.isFinite(o)) {
      allHaveOdds = false;
      break;
    }
    pProduct *= americanToImplied(o);
  }
  if (!allHaveOdds || pProduct <= 0 || pProduct >= 1) {
    return { combinedOddsAmerican: null, combinedImpliedProbability: null };
  }
  return {
    combinedOddsAmerican: impliedToAmerican(pProduct),
    combinedImpliedProbability: pProduct,
  };
}

// ---------------------------------------------------------------------------
// Greedy candidate generator
//
// Strategy: sort eligible leans by score (descending), then build a
// candidate by walking the list and adding legs while respecting the
// maxLegsPerGame and uniquePlayer constraints. We generate multiple
// candidates by starting from offset 0, 1, 2, ... — gives us diverse
// top-of-board candidates without combinatorial explosion.
// ---------------------------------------------------------------------------

export function buildParlayCandidates(
  slateLeans: PropLean[],
  opts: BuilderOptions,
): ParlayCandidate[] {
  const rules = PROFILE_RULES[opts.riskProfile];
  const numCandidates = Math.max(
    1,
    Math.min(8, opts.numCandidates ?? 3),
  );

  // Phase 17: by default, restrict the candidate pool to the top N core
  // players per team. The user toggles "include full rotation" to bypass
  // this, but it's off by default for trustworthiness.
  const corePool = opts.includeBenchPlayers
    ? slateLeans
    : (() => {
        const coreKeys = topCorePlayerKeysPerTeam(
          slateLeans,
          opts.corePlayersPerTeam ?? 3,
        );
        // Honest fallback: if the core filter would empty the pool
        // (e.g. team metadata totally missing on every lean), fall back
        // to the full pool rather than returning zero candidates.
        const filtered = slateLeans.filter((l) =>
          coreKeys.has(playerKeyForLean(l)),
        );
        return filtered.length > 0 ? filtered : slateLeans;
      })();

  // 1. Filter to eligible leans
  const eligible = corePool.filter((l) => isEligible(l, rules, opts));

  // 2. Dedupe per (playerId or normalized name) + market — only the highest-
  //    scoring lean for each player+market combo is a candidate leg. We
  //    don't want a parlay with 2 legs on the same player+market.
  const byKey = new Map<string, PropLean>();
  for (const lean of eligible) {
    const pkey =
      (lean.playerId ?? 0) > 0
        ? `pid:${lean.playerId}`
        : `name:${normalizePlayer(lean.playerName)}`;
    const k = `${pkey}|${lean.market}`;
    const prev = byKey.get(k);
    if (!prev || legScore(lean) > legScore(prev)) byKey.set(k, lean);
  }
  const dedupedSorted = [...byKey.values()].sort(
    (a, b) => legScore(b) - legScore(a),
  );

  if (dedupedSorted.length < rules.minLegs) {
    return [];
  }

  // 3. Generate candidates by walking starting positions
  const candidates: ParlayCandidate[] = [];
  for (let start = 0; start < dedupedSorted.length && candidates.length < numCandidates; start++) {
    const candidate = greedyBuild(dedupedSorted, start, rules, slateLeans, opts.riskProfile);
    if (candidate && candidate.legs.length >= rules.minLegs) {
      // Dedupe by leg signature — don't return identical candidates
      const sig = candidateSignature(candidate);
      if (!candidates.some((c) => candidateSignature(c) === sig)) {
        candidates.push(candidate);
      }
    }
  }

  // 4. Sort final candidates by score
  return candidates.sort((a, b) => b.score - a.score);
}

function candidateSignature(c: ParlayCandidate): string {
  return c.legs
    .map((la) => {
      const m = la.matchedLean;
      return m ? `${m.playerId}|${m.market}|${m.line}|${m.lean}` : "?";
    })
    .sort()
    .join("//");
}

function greedyBuild(
  pool: PropLean[],
  startIdx: number,
  rules: ProfileRules,
  slateLeans: PropLean[],
  riskProfile: RiskProfile,
): ParlayCandidate | null {
  const picked: PropLean[] = [];
  const playersUsed = new Set<string>();
  const gameLegCount = new Map<string, number>();
  let anomalyCount = 0;

  // Walk pool starting at startIdx, then wrap around
  const order = [
    ...pool.slice(startIdx),
    ...pool.slice(0, startIdx),
  ];

  for (const lean of order) {
    if (picked.length >= rules.maxLegs) break;
    const pkey =
      (lean.playerId ?? 0) > 0
        ? `pid:${lean.playerId}`
        : `name:${normalizePlayer(lean.playerName)}`;
    if (playersUsed.has(pkey)) continue;

    // Anomaly soft cap inside Aggressive (Conservative + Balanced already
    // filtered out anomalies via isEligible). Aggressive allows at most
    // `maxAnomalyLegs` anomaly legs per candidate.
    const anomaly = isAnomaly(lean);
    if (anomaly && anomalyCount >= rules.maxAnomalyLegs) continue;

    // Only count same-game correlation when gameId is a real non-empty
    // string. Leans with no gameId can't be correlated to anything by
    // gameId, so they don't trip the maxLegsPerGame cap (the cap only
    // applies to runs of legs that genuinely share a known game).
    const gid = lean.gameId && lean.gameId.length > 0 ? lean.gameId : null;
    if (gid !== null) {
      const used = gameLegCount.get(gid) ?? 0;
      if (used >= rules.maxLegsPerGame) continue;
      picked.push(lean);
      playersUsed.add(pkey);
      gameLegCount.set(gid, used + 1);
    } else {
      picked.push(lean);
      playersUsed.add(pkey);
    }
    if (anomaly) anomalyCount++;
  }

  if (picked.length < rules.minLegs) return null;

  // Convert picked leans → LegAnalysis via the existing analyzer so the UI
  // gets the same shape it sees in paste mode. We synthesize a "PastedLeg"
  // describing the model's lean, since that's the side the builder is
  // proposing. The verdict will be `model_agrees` for every leg.
  const legs: LegAnalysis[] = picked.map((lean) => {
    const synthetic = {
      rawPlayerName: lean.playerName,
      market: lean.market as "PTS" | "REB" | "AST",
      side: lean.lean as "Over" | "Under",
      line: lean.line,
      oddsAmerican:
        lean.lean === "Over" ? lean.oddsOver : lean.oddsUnder,
      sportsbook: lean.bookmaker,
    };
    return analyzeLeg(synthetic, slateLeans);
  });

  // uniqueGames / hasSameGameLegs use only legs with a real gameId.
  // Leans without a gameId don't count toward correlation.
  const realGameIds = picked
    .map((l) => l.gameId)
    .filter((gid): gid is string => Boolean(gid && gid.length > 0));
  const uniqueGames = new Set(realGameIds).size;
  const hasSameGameLegs = uniqueGames < realGameIds.length;
  const oddsInfo = combinedOdds(legs);

  // Aggregate score: average per-leg score with a small penalty for same-
  // game legs (doesn't change candidate validity, just ranks dispersed
  // candidates higher).
  const avgLegScore =
    picked.reduce((acc, l) => acc + legScore(l), 0) / picked.length;
  const correlationPenalty = hasSameGameLegs ? 0.08 : 0;
  const score = avgLegScore - correlationPenalty;

  const hasAnomalyLegs = picked.some((l) => isAnomaly(l));
  return {
    legs,
    uniqueGames,
    hasSameGameLegs,
    hasAnomalyLegs,
    combinedOddsAmerican: oddsInfo.combinedOddsAmerican,
    combinedImpliedProbability: oddsInfo.combinedImpliedProbability,
    score,
    rationale: rationaleFor(legs, riskProfile, hasSameGameLegs, hasAnomalyLegs),
    riskProfile,
  };
}

function rationaleFor(
  legs: LegAnalysis[],
  riskProfile: RiskProfile,
  hasSameGameLegs: boolean,
  hasAnomalyLegs: boolean,
): string {
  const n = legs.length;
  const parts: string[] = [];
  parts.push(
    riskProfile === "conservative"
      ? `${n}-leg conservative mix · High-confidence clean leans only · same-game capped at 1`
      : riskProfile === "aggressive"
        ? `${n}-leg aggressive mix · wider edge tolerance · higher variance`
        : `${n}-leg balanced mix · model leans with moderate edge · clean only`,
  );
  if (hasSameGameLegs) {
    parts.push("Includes same-game legs — outcomes can correlate");
  }
  if (hasAnomalyLegs) {
    parts.push("Includes a model-anomaly leg (R5 cap) — confidence capped at Low");
  }
  parts.push("Educational analysis · not betting advice");
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Helpers exported for the UI: list of unique players / games on a slate
// ---------------------------------------------------------------------------

export interface PlayerOption {
  playerId: number;
  playerName: string;
  team: string;
  gameId: string;
  /** True when at least one lean for this player has High confidence. */
  hasHighConfidence: boolean;
  /** Number of distinct markets (PTS/REB/AST) the model has on this player. */
  marketCount: number;
}

export function uniquePlayersFromLeans(
  slateLeans: PropLean[],
  opts: { coreOnly?: boolean; corePlayersPerTeam?: number } = {},
): PlayerOption[] {
  // Phase 17: restrict picker pool to core players by default.
  const pool = opts.coreOnly
    ? (() => {
        const coreKeys = topCorePlayerKeysPerTeam(
          slateLeans,
          opts.corePlayersPerTeam ?? 3,
        );
        const filtered = slateLeans.filter((l) =>
          coreKeys.has(playerKeyForLean(l)),
        );
        return filtered.length > 0 ? filtered : slateLeans;
      })()
    : slateLeans;

  const map = new Map<string, PlayerOption & { markets: Set<string> }>();
  for (const lean of pool) {
    if (lean.lean !== "Over" && lean.lean !== "Under") continue;
    const pkey =
      (lean.playerId ?? 0) > 0
        ? `pid:${lean.playerId}`
        : `name:${normalizePlayer(lean.playerName)}`;
    const existing = map.get(pkey);
    if (existing) {
      existing.markets.add(lean.market);
      if (lean.confidence === "High") existing.hasHighConfidence = true;
    } else {
      map.set(pkey, {
        playerId: lean.playerId ?? 0,
        playerName: lean.playerName,
        team: lean.team || "",
        gameId: lean.gameId || "",
        hasHighConfidence: lean.confidence === "High",
        marketCount: 0,
        markets: new Set([lean.market]),
      });
    }
  }
  return [...map.values()]
    .map(({ markets, ...rest }) => ({ ...rest, marketCount: markets.size }))
    .sort((a, b) => a.playerName.localeCompare(b.playerName));
}

export interface GameOption {
  gameId: string;
  label: string;
  legCount: number;
}

export function uniqueGamesFromLeans(
  slateLeans: PropLean[],
  gamesByGameId?: Record<string, ScheduleGame>,
): GameOption[] {
  const map = new Map<string, GameOption>();
  for (const lean of slateLeans) {
    const gid = lean.gameId || "unknown";
    const existing = map.get(gid);
    if (existing) {
      existing.legCount += 1;
    } else {
      const label = formatGameOptionLabel(gid, lean, gamesByGameId);
      map.set(gid, { gameId: gid, label, legCount: 1 });
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function formatGameOptionLabel(
  gid: string,
  lean: PropLean,
  gamesByGameId?: Record<string, ScheduleGame>,
): string {
  const game = gamesByGameId?.[gid];
  if (game?.awayTeamAbbr && game?.homeTeamAbbr) {
    const base = `${game.awayTeamAbbr} @ ${game.homeTeamAbbr}`;
    return game.tipoff ? `${base} · ${game.tipoff}` : base;
  }
  if (lean.team && lean.opponent) {
    return `${lean.team} @ ${lean.opponent}`;
  }
  return `Game ${gid}`;
}
