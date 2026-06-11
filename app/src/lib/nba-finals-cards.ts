/**
 * NBA Finals Same-Game Cards — an EXPLICIT, separately-labeled product mode for
 * single-game NBA slates (e.g. the Finals).
 *
 * WHY THIS EXISTS (and why it does NOT weaken the global optimizer):
 * The global Suggested-Parlay risk sections couple each tier to a leg count
 * (Low 2-3, Medium 3-4, High 4-5, Longshot 5-6). On a one-game slate a
 * correlation-safe NBA parlay can only carry 2-3 legs, so it can never populate
 * High/Longshot under the global rules — by design. Rather than loosen those
 * rules, this mode builds same-game cards whose risk tier is driven by COMBINED
 * ODDS ONLY (legs stay 2-3), and labels every card as a single-game build with a
 * correlation note. It is a parallel, clearly-disclosed surface — the global
 * multi-game optimizer is unchanged.
 *
 * HONESTY CONTRACT:
 *   - Legs are real model leans from the board (with real book odds). Nothing
 *     is fabricated; combined odds are the exact product of per-leg decimals.
 *   - Cards are de-duplicated; player recurrence is capped for diversity.
 *   - Volatile BLK/STL legs are limited in the safer tiers.
 *   - This is NOT presented as low-correlation: every card says the legs share
 *     one game.
 */
import { combinedAmericanOddsFromLegs } from "./parlay-risk-sections";

export type FinalsTier = "low" | "medium" | "high" | "longshot";

export interface FinalsLeg {
  leanId?: string;
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
  recentSeries?: number[];
  recentGames?: unknown[];
  isAnomaly?: boolean;
  legScore?: number;
}

export interface FinalsCard {
  cardId: string;
  tier: FinalsTier;
  legs: FinalsLeg[];
  combinedAmerican: number;
  combinedDecimal: number;
  sameGame: true;
  correlationNote: string;
  volatileLegCount: number;
}

// Odds-only tier windows for SAME-GAME cards (legs stay 2-3 throughout).
const TIER_BOUNDS: Record<FinalsTier, { lo: number; hi: number }> = {
  low: { lo: Number.NEGATIVE_INFINITY, hi: 250 },
  medium: { lo: 250, hi: 500 },
  high: { lo: 500, hi: 900 },
  longshot: { lo: 900, hi: Number.POSITIVE_INFINITY },
};
export const FINALS_TIER_ORDER: FinalsTier[] = ["low", "medium", "high", "longshot"];

const VOLATILE = new Set(["BLK", "STL"]);

function decimalFromAmerican(o: number): number {
  return o > 0 ? 1 + o / 100 : 1 + 100 / Math.abs(o);
}

function tierFor(american: number): FinalsTier | null {
  for (const t of FINALS_TIER_ORDER) {
    if (american >= TIER_BOUNDS[t].lo && american < TIER_BOUNDS[t].hi) return t;
  }
  return null;
}

/** k-combinations (k = 2 or 3) of an array, returned as index tuples. */
function combos<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const n = arr.length;
  if (k === 2) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([arr[i], arr[j]]);
  } else if (k === 3) {
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        for (let l = j + 1; l < n; l++) out.push([arr[i], arr[j], arr[l]]);
  }
  return out;
}

export interface BuildOptions {
  /** Max cards published per tier (target 3-5). */
  perTier?: number;
  /** Max cards any single player may appear in, per tier. */
  maxPerPlayerPerTier?: number;
  /** Eligible per-leg odds band — excludes near-locks + noise. */
  oddsBand?: { lo: number; hi: number };
}

/**
 * Build NBA Finals same-game cards grouped by odds-driven tier.
 * Pure + deterministic (stable sort, no randomness).
 */
export function buildFinalsCards(
  legsIn: FinalsLeg[],
  opts: BuildOptions = {},
): Record<FinalsTier, FinalsCard[]> {
  const perTier = opts.perTier ?? 5;
  const maxPerPlayer = opts.maxPerPlayerPerTier ?? 2;
  const band = opts.oddsBand ?? { lo: -400, hi: 600 };

  // Eligibility: real, non-anomaly legs with a usable price inside the band.
  const eligible = legsIn.filter(
    (l) =>
      !l.isAnomaly &&
      typeof l.oddsForSide === "number" &&
      Number.isFinite(l.oddsForSide) &&
      (l.oddsForSide as number) >= band.lo &&
      (l.oddsForSide as number) <= band.hi,
  );

  // Pool = each player's top 2 DISTINCT-market leans (by legScore). Keeping a
  // second market per player lets the builder assemble cards with real market
  // variety (PTS / 3PM / AST / BLK / STL / PRA) instead of an all-rebounds wall,
  // while distinct-player enforcement below keeps each card's players unique.
  const byPlayer = new Map<string, FinalsLeg[]>();
  for (const l of eligible) {
    const arr = byPlayer.get(l.playerName) ?? [];
    arr.push(l);
    byPlayer.set(l.playerName, arr);
  }
  const pool: FinalsLeg[] = [];
  for (const arr of byPlayer.values()) {
    const seenMarket = new Set<string>();
    const top = arr
      .slice()
      .sort((a, b) => (b.legScore ?? 0) - (a.legScore ?? 0) || (a.leanId ?? "").localeCompare(b.leanId ?? ""))
      .filter((l) => {
        const m = (l.market || "").toUpperCase();
        if (seenMarket.has(m)) return false;
        seenMarket.add(m);
        return true;
      })
      .slice(0, 2);
    pool.push(...top);
  }
  pool.sort(
    (a, b) => (b.legScore ?? 0) - (a.legScore ?? 0) || a.playerName.localeCompare(b.playerName),
  );

  // Candidate cards: every 2- and 3-leg combo with DISTINCT players.
  const candidates: FinalsCard[] = [];
  for (const k of [2, 3]) {
    for (const set of combos(pool, k)) {
      const names = set.map((l) => l.playerName);
      if (new Set(names).size !== names.length) continue; // distinct players only
      const american = combinedAmericanOddsFromLegs(set);
      if (american == null) continue;
      const tier = tierFor(american);
      if (!tier) continue;
      const volatileLegCount = set.filter((l) => VOLATILE.has((l.market || "").toUpperCase())).length;
      // Safer tiers: at most one volatile (BLK/STL) leg.
      if ((tier === "low" || tier === "medium") && volatileLegCount > 1) continue;
      let decimal = 1;
      for (const l of set) decimal *= decimalFromAmerican(l.oddsForSide as number);
      const cardId = set
        .map((l) => l.leanId ?? `${l.playerName}-${l.market}-${l.side}`)
        .sort()
        .join("__");
      candidates.push({
        cardId,
        tier,
        legs: set,
        combinedAmerican: american,
        combinedDecimal: Math.round(decimal * 100) / 100,
        sameGame: true,
        correlationNote:
          "Single-game card — every leg is from tonight's game, so the legs are more connected than a multi-game parlay.",
        volatileLegCount,
      });
    }
  }

  // Score each candidate by total legScore (quality), tie-break by cardId for
  // determinism. Then greedily fill each tier with player-recurrence caps and
  // exact-set dedup.
  // Card quality = total legScore + a market-diversity bonus so varied cards
  // (PTS + 3PM + AST) outrank monotone ones (REB + REB + REB).
  const DIVERSITY_BONUS = 0.6;
  const quality = (c: FinalsCard): number => {
    const score = c.legs.reduce((s, l) => s + (l.legScore ?? 0), 0);
    const distinctMarkets = new Set(c.legs.map((l) => (l.market || "").toUpperCase())).size;
    return score + DIVERSITY_BONUS * (distinctMarkets - 1);
  };
  const out: Record<FinalsTier, FinalsCard[]> = { low: [], medium: [], high: [], longshot: [] };
  for (const tier of FINALS_TIER_ORDER) {
    const ranked = candidates
      .filter((c) => c.tier === tier)
      .sort((a, b) => quality(b) - quality(a) || a.cardId.localeCompare(b.cardId));
    const seenSets = new Set<string>();
    const playerUse = new Map<string, number>();
    for (const card of ranked) {
      if (out[tier].length >= perTier) break;
      if (seenSets.has(card.cardId)) continue;
      if (card.legs.some((l) => (playerUse.get(l.playerName) ?? 0) >= maxPerPlayer)) continue;
      out[tier].push(card);
      seenSets.add(card.cardId);
      for (const l of card.legs) playerUse.set(l.playerName, (playerUse.get(l.playerName) ?? 0) + 1);
    }
  }
  return out;
}

/** "+289" / "-120" formatting. */
export function fmtAmerican(o: number): string {
  return o > 0 ? `+${o}` : `${o}`;
}

/**
 * Pick a single FEATURED 2-leg NBA Finals card for the Bank Builder spotlight.
 * Honest selection: a 2-leg same-game card in a sensible odds window where BOTH
 * legs are model-supported (Medium+ confidence). Returns the highest-quality
 * such card, or null when none qualifies (caller keeps the canonical slip).
 * Deterministic — never random.
 */
export function selectFeaturedFinalsCard(
  cards: Record<FinalsTier, FinalsCard[]>,
  opts: { minAmerican?: number; maxAmerican?: number } = {},
): FinalsCard | null {
  const minA = opts.minAmerican ?? 150;
  const maxA = opts.maxAmerican ?? 400;
  const okConf = (c: string | null | undefined) =>
    (c || "").toLowerCase() === "high" || (c || "").toLowerCase() === "medium";
  const pool = [...cards.low, ...cards.medium].filter(
    (c) =>
      c.legs.length === 2 &&
      c.combinedAmerican >= minA &&
      c.combinedAmerican <= maxA &&
      c.legs.every((l) => okConf(l.confidence)),
  );
  if (pool.length === 0) return null;
  pool.sort(
    (a, b) =>
      b.legs.reduce((s, l) => s + (l.legScore ?? 0), 0) -
        a.legs.reduce((s, l) => s + (l.legScore ?? 0), 0) || a.cardId.localeCompare(b.cardId),
  );
  return pool[0];
}
