/**
 * World Cup player-prop MODEL PICKS — turns the fixture's raw prop inventory into a short, ranked
 * list of model-ranked picks (the recommended side only), instead of a wall of every outcome.
 *
 * World Cup player props are currently market-implied only (no independent model edge → edgePct 0),
 * so we rank by: edge when present, then the de-vigged market-implied likelihood, then confidence,
 * then the shorter (more likely) price. We keep ONE side per player+market (the higher-probability
 * side) so the list reads as picks, not a both-sides inventory. Pure + deterministic → unit-tested.
 * Never fabricates: only odds-backed props with a named player are eligible.
 */
import type { PublicProjection } from "@/lib/normalize";

const CONF_RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

/** True when this prop is odds-backed and attached to a real player (the floor for a "pick"). */
export function isModelPickEligible(p: PublicProjection): boolean {
  return p.participantType === "player" && p.americanOdds != null && Boolean(p.player?.name);
}

/** True when the fixture's props are limited-data / market-implied only (no independent model edge). */
export function isLimitedDataProps(props: PublicProjection[]): boolean {
  const odds = props.filter(isModelPickEligible);
  if (odds.length === 0) return false;
  return odds.every((p) => !p.edgePct || Math.abs(p.edgePct) < 0.01);
}

/** Ranking key (higher is stronger): edge → market-implied likelihood → confidence → shorter price. */
function rankKey(p: PublicProjection): [number, number, number, number] {
  const edge = p.edgePct ?? 0;
  const likelihood = p.marketProbability ?? p.modelProbability ?? 0;
  const conf = CONF_RANK[p.confidence] ?? 0;
  const priceability = -Math.abs(p.americanOdds ?? 100000); // shorter price = more likely
  return [edge, likelihood, conf, priceability];
}

/** Lexicographic compare of two rank keys: returns >0 when a is stronger than b. */
function cmp(a: PublicProjection, b: PublicProjection): number {
  const ka = rankKey(a), kb = rankKey(b);
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
  return 0;
}

/**
 * Rank a fixture's player props into the top model picks (recommended side only).
 * @param props fixture-scoped player projections (already joined to this game)
 * @param limit max picks to return (default 8)
 */
export function worldCupPlayerModelPicks(props: PublicProjection[], limit = 8): PublicProjection[] {
  const eligible = props.filter(isModelPickEligible);
  // Keep the stronger side per player+market so we surface a pick, not both Over and Under.
  const bestByKey = new Map<string, PublicProjection>();
  for (const p of eligible) {
    const key = `${p.player?.name ?? ""}|${p.market}`;
    const prev = bestByKey.get(key);
    if (!prev || cmp(p, prev) > 0) bestByKey.set(key, p);
  }
  const picks = [...bestByKey.values()].sort((a, b) => cmp(b, a));
  return picks.slice(0, Math.max(0, limit));
}
