/**
 * Games-board card signal — the ONE honest "what's the board's headline read?" line that turns a bare
 * fixture card on /games into a sportsbook game card that answers "what does the model like here?".
 *
 * Derived ONLY from artifacts already on the board — never fabricated:
 *   • World Cup → the unified game-script (winner + projected scoreline + confidence). Same engine the
 *     knockout board / game-detail / hub already render, so the read is identical everywhere.
 *   • MLB / NBA → the single highest MARKET-implied player prop for the game. There is no public,
 *     validated player-prop model layer for these yet, so it is labelled a MARKET lean ("NN% mkt"),
 *     never a fabricated model edge — consistent with the /mlb "Featured plays" section.
 *
 * Pure + synchronous: callers pass already-loaded data, so this unit-tests without touching disk.
 */
import type { GameScript } from "@/lib/world-cup/game-script";
import type { PublicProjection } from "@/lib/normalize";

export interface GameCardSignal {
  /** "script" = WC coherent game read; "prop" = MLB/NBA top market prop. Drives the honest card label. */
  kind: "script" | "prop";
  /** Headline pick — a team name / "Draw" (script), or "Player Over 1.5" (prop). */
  pick: string;
  /** Supporting line — the projected scoreline (script) or the market label (prop). null when none. */
  sub: string | null;
  /** WC game-script confidence (script only). */
  confidence?: GameScript["confidence"];
  /** Market-implied probability 0..1 (prop only) — rendered as "NN% mkt", never a model claim. */
  prob?: number | null;
}

/** World Cup: map the coherent game-script into a card signal. null when there is no live read. */
export function scriptSignal(script: GameScript | null | undefined): GameCardSignal | null {
  if (!script || !script.available || !script.winner) return null;
  // The projected scoreline is the richest single line; fall back to the total / BTTS lean when the
  // fixture has no totals market to size a scoreline (directional read only).
  const sub = script.scoreLean ?? script.totalLean ?? script.bttsLean ?? null;
  return { kind: "script", pick: script.winner, sub, confidence: script.confidence };
}

/**
 * MLB / NBA: the single highest market-implied prop for the game. Selecting by MARKET probability
 * (not model edge) surfaces the board's most market-backed lean and naturally avoids high-edge anomaly
 * picks. null when no projection carries a usable probability.
 */
export function topPropSignal(projections: PublicProjection[]): GameCardSignal | null {
  let best: PublicProjection | null = null;
  let bestProb = 0;
  for (const p of projections) {
    const prob = p.marketProbability;
    if (prob == null || !Number.isFinite(prob) || prob <= 0 || prob > 1) continue;
    // Only surface an ACTIONABLE pick. MLB board leans include "Pass" (the model declines to lean) — a
    // "Pass 0.5 Hits" headline is meaningless, so require a directional Over/Under pick label.
    if (!/^(over|under)\b/i.test((p.pickLabel ?? "").trim())) continue;
    if (!best || prob > bestProb) {
      best = p;
      bestProb = prob;
    }
  }
  if (!best) return null;
  const who = best.player?.name?.trim() || best.gameLabel;
  const pick = `${who} ${best.pickLabel}`.trim();
  return { kind: "prop", pick, sub: best.marketLabel || null, prob: bestProb };
}
