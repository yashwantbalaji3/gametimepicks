/**
 * Public-suggestion VOLUME DISCIPLINE — pure, client-safe.
 *
 * ─── WHAT THIS IS (and is NOT) ──────────────────────────────────────
 * An anti-overpublishing policy, not a performance model. It caps how
 * many public Suggested-Parlay cards we show per slate and limits how
 * much one player / market / game can dominate the published set. It does
 * NOT use `edgePct` / `confidence` (the calibration audit found those
 * non-/anti-predictive — see docs/MODEL_CALIBRATION_2026-06-02.md), does
 * NOT reorder by any quality signal, and makes NO claim that the kept
 * cards are more likely to win. It simply keeps FEWER, less-repetitive
 * cards and lets sections be empty rather than padded.
 *
 * It preserves the optimizer's own within-section ordering (takes the
 * first N), so it adds no new ranking opinion. Honest: no "safe/safety",
 * no guaranteed-payout implication.
 * ────────────────────────────────────────────────────────────────────
 */

import { RISK_SECTION_ORDER, type RiskSectionKey } from "./parlay-risk-sections";

export interface VolumeCaps {
  /** Max cards shown per risk section. */
  perSection: Record<RiskSectionKey, number>;
  /** Max total public cards across all sections. */
  totalMax: number;
  /** Max published cards a single player may appear in. */
  maxPlayerExposure: number;
  /** Max published cards a single market may appear in. */
  maxMarketExposure: number;
  /** Max published cards built around a single game. */
  maxGameExposure: number;
}

/**
 * Default caps for a single-sport (or the All) Suggested view. These are an
 * editorial publishing-depth choice, not a tuned/performance number: they let a
 * full slate publish a healthy set of cards (per-section sums to 15) while the
 * per-player / per-market / per-game caps keep one entity from dominating the
 * published set. Sections still empty out honestly rather than being padded.
 */
export const PUBLIC_VOLUME_CAPS: VolumeCaps = {
  perSection: { low: 5, medium: 5, high: 3, longshot: 2 },
  totalMax: 15,
  maxPlayerExposure: 3,
  maxMarketExposure: 6,
  maxGameExposure: 5,
};

/**
 * Mixed (cross-sport) view caps. On a thin slate one sport may field only a
 * game or two, so virtually EVERY mixed slip reuses those few games — a low
 * game-exposure cap would collapse the Mixed section to a handful of cards even
 * when many genuinely distinct mixed slips exist. We relax the game-exposure cap
 * for Mixed (diversity is still enforced by the per-player cap) and keep
 * per-section / total depth comparable to single-sport. No fabrication: it only
 * ever keeps real generated slips.
 */
export const MIXED_VOLUME_CAPS: VolumeCaps = {
  perSection: { low: 4, medium: 4, high: 3, longshot: 2 },
  totalMax: 13,
  maxPlayerExposure: 3,
  maxMarketExposure: 8,
  maxGameExposure: 13,
};

/**
 * Caps for the active Suggested sport view. The "multi" (Mixed) view relaxes
 * game exposure (see MIXED_VOLUME_CAPS); every other view (nba / mlb / all) uses
 * PUBLIC_VOLUME_CAPS. Pure + deterministic.
 */
export function capsForSuggestedView(view: string | null | undefined): VolumeCaps {
  return view === "multi" ? MIXED_VOLUME_CAPS : PUBLIC_VOLUME_CAPS;
}

interface DiscLeg {
  playerId?: number | null;
  playerName?: string | null;
  market?: string | null;
  gameId?: string | number | null;
  gameKey?: string | null;
}
interface DiscSlip {
  legs: ReadonlyArray<DiscLeg>;
}

export interface VolumeDisciplineResult<T> {
  sections: Record<RiskSectionKey, T[]>;
  keptTotal: number;
  inputTotal: number;
}

function keysOf(slip: DiscSlip) {
  const players = new Set<string>();
  const markets = new Set<string>();
  const games = new Set<string>();
  for (const l of slip.legs) {
    const pk = l.playerId != null ? `id:${l.playerId}` : l.playerName ? `n:${l.playerName}` : "";
    if (pk) players.add(pk);
    if (l.market) markets.add(l.market);
    const gk = l.gameId != null ? String(l.gameId) : (l.gameKey ?? "");
    if (gk) games.add(gk);
  }
  return { players, markets, games };
}

/**
 * Apply the volume policy across the four sections. Iterates Low → Medium
 * → High → Longshot, keeping each section's slips IN THE GIVEN ORDER while
 * every cap holds. A slip that would push any player/market/game over its
 * exposure cap is skipped (the next slip in that section is tried). Pure +
 * deterministic: same input + caps ⇒ same output, so the rendered cards
 * and the "Showing N" count never disagree.
 */
export function applyVolumeDiscipline<T extends DiscSlip>(
  sections: Partial<Record<RiskSectionKey, ReadonlyArray<T>>>,
  caps: VolumeCaps = PUBLIC_VOLUME_CAPS,
): VolumeDisciplineResult<T> {
  const out: Record<RiskSectionKey, T[]> = { low: [], medium: [], high: [], longshot: [] };
  const playerCt = new Map<string, number>();
  const marketCt = new Map<string, number>();
  const gameCt = new Map<string, number>();
  let total = 0;
  let inputTotal = 0;
  for (const sec of RISK_SECTION_ORDER) inputTotal += (sections[sec] ?? []).length;

  for (const sec of RISK_SECTION_ORDER) {
    if (total >= caps.totalMax) break;
    for (const slip of sections[sec] ?? []) {
      if (out[sec].length >= caps.perSection[sec]) break;
      if (total >= caps.totalMax) break;
      const { players, markets, games } = keysOf(slip);
      const exceeds =
        [...players].some((p) => (playerCt.get(p) ?? 0) + 1 > caps.maxPlayerExposure) ||
        [...markets].some((m) => (marketCt.get(m) ?? 0) + 1 > caps.maxMarketExposure) ||
        [...games].some((g) => (gameCt.get(g) ?? 0) + 1 > caps.maxGameExposure);
      if (exceeds) continue;
      out[sec].push(slip);
      total += 1;
      for (const p of players) playerCt.set(p, (playerCt.get(p) ?? 0) + 1);
      for (const m of markets) marketCt.set(m, (marketCt.get(m) ?? 0) + 1);
      for (const g of games) gameCt.set(g, (gameCt.get(g) ?? 0) + 1);
    }
  }
  return { sections: out, keptTotal: total, inputTotal };
}
