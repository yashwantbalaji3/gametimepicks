/**
 * Phase 17 — top-N core players per team filter.
 *
 * The user requested that Parlay Lab focus on the "top 3 star/core players
 * per team" by default, excluding bench/role players to keep the builder
 * trustworthy. This module handles the ranking honestly using only data
 * we already have on the slate.
 *
 * Ranking strategy (in priority order):
 *   1. Sum of model projections across PTS/REB/AST. A player with full
 *      coverage (all three markets) and meaningful projection numbers
 *      ranks higher than someone with only one market.
 *   2. If projections are flat zero (occurs in older boards where
 *      modelProjection wasn't always populated), fall back to a
 *      deterministic ranking by edge × confidence-weight.
 *
 * No hard-coded names. No external API. Pure function.
 *
 * When a team has fewer than N qualifying players, we return all of them.
 * When team metadata is missing on every lean, we treat them as a single
 * bucket — better to surface SOMETHING than to silently drop everything.
 */

import type { PropLean, ConfidenceTier } from "./types";

/** Stable normalizer used everywhere we identify a player. */
function playerKey(lean: PropLean): string {
  if ((lean.playerId ?? 0) > 0) return `pid:${lean.playerId}`;
  const n = (lean.playerName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `name:${n || "unknown"}`;
}

/** Confidence → numeric weight for fallback ranking. */
function confWeight(c: ConfidenceTier | string | undefined): number {
  if (c === "High") return 1.0;
  if (c === "Medium") return 0.6;
  if (c === "Low") return 0.3;
  return 0.1;
}

interface PlayerScore {
  key: string;
  team: string;
  /** Sum of model projections across markets — primary score. */
  projectionSum: number;
  /** Fallback score: sum(edgePct × confWeight). */
  edgeWeight: number;
  /** Distinct markets the player has on the slate (PTS/REB/AST). */
  marketCount: number;
}

/**
 * Return the set of player keys that are top-N "core" players per team.
 *
 * Use this set to filter `slateLeans` down to only core-player leans
 * before passing to the parlay builder.
 *
 * Example:
 *   const coreKeys = topCorePlayerKeysPerTeam(leans, 3);
 *   const coreLeans = leans.filter((l) => coreKeys.has(playerKey(l)));
 */
export function topCorePlayerKeysPerTeam(
  slateLeans: PropLean[],
  n: number = 3,
): Set<string> {
  if (n <= 0 || slateLeans.length === 0) return new Set();

  // Aggregate per (team, player). When team is missing on every lean,
  // we still rank — the bucket is just a single empty-string team.
  const scoresByTeamPlayer = new Map<string, Map<string, PlayerScore>>();

  for (const lean of slateLeans) {
    if (lean.lean !== "Over" && lean.lean !== "Under") continue;
    const team = (lean.team || "").trim();
    const pkey = playerKey(lean);
    let teamMap = scoresByTeamPlayer.get(team);
    if (!teamMap) {
      teamMap = new Map();
      scoresByTeamPlayer.set(team, teamMap);
    }
    let s = teamMap.get(pkey);
    if (!s) {
      s = {
        key: pkey,
        team,
        projectionSum: 0,
        edgeWeight: 0,
        marketCount: 0,
      };
      teamMap.set(pkey, s);
    }
    const proj = Number(lean.projection ?? 0);
    if (Number.isFinite(proj) && proj > 0) {
      s.projectionSum += proj;
    }
    const edge = Number(lean.edgePct ?? 0);
    s.edgeWeight += Math.max(0, edge) * confWeight(lean.confidence);
    s.marketCount += 1;
  }

  const coreKeys = new Set<string>();
  for (const teamMap of scoresByTeamPlayer.values()) {
    const ranked = [...teamMap.values()].sort((a, b) => {
      // Primary: projection sum descending
      if (b.projectionSum !== a.projectionSum) {
        return b.projectionSum - a.projectionSum;
      }
      // Fallback: edge×confidence descending
      if (b.edgeWeight !== a.edgeWeight) {
        return b.edgeWeight - a.edgeWeight;
      }
      // Tertiary: market coverage descending
      if (b.marketCount !== a.marketCount) {
        return b.marketCount - a.marketCount;
      }
      // Tiebreak: stable key sort for determinism
      return a.key.localeCompare(b.key);
    });
    for (const s of ranked.slice(0, n)) {
      coreKeys.add(s.key);
    }
  }
  return coreKeys;
}

/**
 * Convenience: filter slate leans down to only core-player leans.
 * Preserves order and other lean properties.
 */
export function filterToCorePlayers(
  slateLeans: PropLean[],
  n: number = 3,
): PropLean[] {
  const coreKeys = topCorePlayerKeysPerTeam(slateLeans, n);
  return slateLeans.filter((l) => coreKeys.has(playerKey(l)));
}

/** Exported for use in tests + UI badges. */
export const playerKeyForLean = playerKey;
