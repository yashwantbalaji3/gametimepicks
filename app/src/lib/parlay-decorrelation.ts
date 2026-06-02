/**
 * Parlay decorrelation helpers — pure, client-safe (no node:fs imports).
 *
 * ─── NON-AUTHORITATIVE, NOT WIRED ───────────────────────────────────
 * Companion to `leg-quality-gates.ts`. Where that module is a per-LEG
 * quality bar, this module is a per-SLIP structural bar: it measures how
 * correlated a slip's legs are (same game, same market, same side, same
 * team, duplicate players) and evaluates a slip against an explicit cap
 * config.
 *
 * Motivation (see `docs/MODEL_AUDIT_2026-06-02_PARLAY_QUALITY.md`): on the
 * cold June-1 slate, slips failed FAR worse than independence predicts
 * (actual slip% 2–7% vs ~18–21% expected) because the optimizer stacked
 * many same-market "Over" legs that miss together. Same-game/same-market
 * caps are the practical lever to decorrelate.
 *
 * Like `PROPOSED_SECTION_LEG_GATES`, the section cap presets here are
 * PROPOSED — they are NOT imported by any optimizer/snapshot/UI path and
 * change no published number. Wiring them into the live optimizer requires
 * the documented promotion path + explicit operator approval. This module
 * exists so the proposal is pure, testable, and usable by the offline
 * shadow audit.
 *
 * Honesty: no "safe/safety" language; a cap is "lower-variance", never a
 * guarantee. Caps reject correlated slips; they never invent legs.
 * ────────────────────────────────────────────────────────────────────
 */

import type { LegGateSection } from "./leg-quality-gates";

/** The subset of a slip leg this module reads (structural-typing friendly:
 *  a real OptimizerLeg is a superset and can be passed directly). */
export interface DecorrelationLeg {
  /** Game identifier — gameId preferred, gameKey fallback. */
  gameId?: string | number | null;
  gameKey?: string | null;
  market?: string | null;
  /** "Over" | "Under". */
  side?: string | null;
  team?: string | null;
  playerId?: number | null;
  playerName?: string | null;
}

/** Per-slip structural caps. Each is an INCLUSIVE maximum count. */
export interface SlipDecorrelationCaps {
  /** Max legs sharing one game. */
  maxSameGame: number;
  /** Max legs sharing one market (e.g. ≤1 stops a 2× batter_hits stack). */
  maxSameMarket: number;
  /** Max legs sharing one team. */
  maxSameTeam: number;
  /** Whether a duplicate player within a slip is allowed (always false
   *  in practice today; kept explicit for the gate). */
  allowDuplicatePlayer: boolean;
}

/** Measured correlation shape of a slip (pure description, no policy). */
export interface SlipCorrelationProfile {
  legs: number;
  maxLegsInOneGame: number;
  maxLegsInOneMarket: number;
  maxLegsInOneTeam: number;
  overCount: number;
  underCount: number;
  hasDuplicatePlayer: boolean;
}

export interface SlipDecorrelationResult {
  passes: boolean;
  failures: string[];
  profile: SlipCorrelationProfile;
}

function gameKeyOf(leg: DecorrelationLeg): string {
  const g = leg.gameId ?? leg.gameKey;
  return g == null ? "" : String(g);
}

/** Pure: measure a slip's correlation shape. Empty/identity-safe. */
export function slipCorrelationProfile(
  legs: ReadonlyArray<DecorrelationLeg>,
): SlipCorrelationProfile {
  const byGame = new Map<string, number>();
  const byMarket = new Map<string, number>();
  const byTeam = new Map<string, number>();
  const byPlayer = new Map<string, number>();
  let over = 0;
  let under = 0;

  for (const leg of legs) {
    const gk = gameKeyOf(leg);
    if (gk) byGame.set(gk, (byGame.get(gk) ?? 0) + 1);
    const mk = leg.market ?? "";
    if (mk) byMarket.set(mk, (byMarket.get(mk) ?? 0) + 1);
    const tm = leg.team ?? "";
    if (tm) byTeam.set(tm, (byTeam.get(tm) ?? 0) + 1);
    const pk =
      leg.playerId != null ? `id:${leg.playerId}` : `name:${leg.playerName ?? ""}`;
    if (pk !== "name:") byPlayer.set(pk, (byPlayer.get(pk) ?? 0) + 1);
    if (leg.side === "Over") over += 1;
    else if (leg.side === "Under") under += 1;
  }

  const maxOf = (m: Map<string, number>) =>
    m.size ? Math.max(...m.values()) : 0;

  return {
    legs: legs.length,
    maxLegsInOneGame: maxOf(byGame),
    maxLegsInOneMarket: maxOf(byMarket),
    maxLegsInOneTeam: maxOf(byTeam),
    overCount: over,
    underCount: under,
    hasDuplicatePlayer: maxOf(byPlayer) > 1,
  };
}

/** Pure predicate: does the slip clear every structural cap? Collects all
 *  failures (does not short-circuit) so an explainer can show the full
 *  picture. */
export function evaluateSlipDecorrelation(
  legs: ReadonlyArray<DecorrelationLeg>,
  caps: SlipDecorrelationCaps,
): SlipDecorrelationResult {
  const profile = slipCorrelationProfile(legs);
  const failures: string[] = [];

  if (profile.maxLegsInOneGame > caps.maxSameGame) {
    failures.push(
      `${profile.maxLegsInOneGame} legs in one game exceeds cap ${caps.maxSameGame}`,
    );
  }
  if (profile.maxLegsInOneMarket > caps.maxSameMarket) {
    failures.push(
      `${profile.maxLegsInOneMarket} legs in one market exceeds cap ${caps.maxSameMarket}`,
    );
  }
  if (profile.maxLegsInOneTeam > caps.maxSameTeam) {
    failures.push(
      `${profile.maxLegsInOneTeam} legs in one team exceeds cap ${caps.maxSameTeam}`,
    );
  }
  if (!caps.allowDuplicatePlayer && profile.hasDuplicatePlayer) {
    failures.push("duplicate player within slip");
  }

  return { passes: failures.length === 0, failures, profile };
}

/**
 * What the public sections effectively allow TODAY (inherited from the
 * Balanced/Aggressive caps in `pipeline/parlay_optimizer.py`): same-game
 * ≤2, same-team ≤2, NO same-market cap, no duplicate players. Used as the
 * "before" baseline in the offline shadow audit.
 */
export const PUBLIC_SECTION_DECORRELATION_CAPS_TODAY: SlipDecorrelationCaps = {
  maxSameGame: 2,
  maxSameMarket: Number.POSITIVE_INFINITY,
  maxSameTeam: 2,
  allowDuplicatePlayer: false,
};

/**
 * PROPOSED — NOT ENFORCED. Per-section structural caps that tighten as the
 * section gets lower-variance, so a "Low Risk" slip can't be two
 * same-market Overs in the same game. Mirrors the leg-gate ladder. Wiring
 * requires out-of-sample confirmation (the shadow audit) + explicit
 * operator approval.
 */
export const PROPOSED_SECTION_DECORRELATION_CAPS: Record<
  LegGateSection,
  SlipDecorrelationCaps
> = {
  low: { maxSameGame: 1, maxSameMarket: 1, maxSameTeam: 1, allowDuplicatePlayer: false },
  medium: { maxSameGame: 1, maxSameMarket: 2, maxSameTeam: 2, allowDuplicatePlayer: false },
  high: { maxSameGame: 2, maxSameMarket: 2, maxSameTeam: 2, allowDuplicatePlayer: false },
  longshot: { maxSameGame: 2, maxSameMarket: 3, maxSameTeam: 3, allowDuplicatePlayer: false },
};
