/**
 * Diamond Specials generator — the PURE builder that turns a normalized MLB prop pool into the five
 * daily cards (Homer · Hits · Bases · Pitching · Longshot). Deterministic, no I/O: a generation script
 * reads `mlb/player-props/<date>.json`, calls this, and writes `mlb/diamond-specials/<date>.json` (the
 * snapshot `loadDiamondSpecials` reads). Empty pool → empty cards (never a fabricated parlay).
 *
 * Selection: each themed card takes the 2 strongest legs of its market group; the Longshot card takes
 * the 3 highest-priced legs across groups. Every card enforces max one leg per game to limit
 * correlation. "Strongest" = highest model probability when present, else the shortest (lowest-variance) price.
 */
import type { NormalizedProp } from "./ingest-normalize";

export interface GeneratorLeg {
  player: string;
  team: string | null;
  opponent: string | null;
  matchup: string;
  gameId: string;
  market: string;
  marketLabel: string;
  selection: string;
  odds: number;
  modelProbability: number;
  provider: string | null;
}
export interface GeneratedCard {
  id: string;
  category: string;
  legs: GeneratorLeg[];
  combinedOdds: number;
  stake: number;
  projectedReturn: number;
  result: null;
}
export interface DiamondSpecialsSnapshot { date: string; generatedAt: string; cards: GeneratedCard[] }

export const STAKE = 20;
const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const decToAmerican = (d: number) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)));
const round2 = (n: number) => Number(n.toFixed(2));

type Prop = NormalizedProp & { modelProbability?: number };
const impliedProb = (a: number) => 1 / dec(a);
const strength = (p: Prop) => (typeof p.modelProbability === "number" ? p.modelProbability : impliedProb(p.americanOdds));

function toLeg(p: Prop): GeneratorLeg {
  return {
    player: p.player, team: p.team ?? null, opponent: p.opponent ?? null, matchup: p.matchup, gameId: p.gameId,
    market: p.market, marketLabel: p.marketLabel, selection: `${p.player} · ${p.selection}`,
    odds: p.americanOdds, modelProbability: round2(strength(p)), provider: p.provider ?? null,
  };
}

/** Take up to `n` legs from `pool`, strongest first, max one per game. */
function pickLegs(pool: Prop[], n: number, by: "strength" | "longshot"): GeneratorLeg[] {
  const sorted = [...pool].sort((a, b) => by === "longshot" ? dec(b.americanOdds) - dec(a.americanOdds) : strength(b) - strength(a));
  const legs: GeneratorLeg[] = [];
  const seenGames = new Set<string>();
  for (const p of sorted) {
    if (legs.length >= n) break;
    if (p.gameId && seenGames.has(p.gameId)) continue;
    if (p.gameId) seenGames.add(p.gameId);
    legs.push(toLeg(p));
  }
  return legs;
}

function makeCard(date: string, category: string, legs: GeneratorLeg[]): GeneratedCard | null {
  if (legs.length < 1) return null;
  const combinedDecimal = legs.reduce((d, l) => d * dec(l.odds), 1);
  return {
    id: `diamond:${date}:${category.toLowerCase().replace(/\s+/g, "-")}`,
    category, legs, combinedOdds: decToAmerican(combinedDecimal), stake: STAKE,
    projectedReturn: round2(STAKE * combinedDecimal), result: null,
  };
}

/**
 * Build the day's Diamond Specials from the prop pool. Returns up to 5 cards (one per category that has
 * legs). An empty pool returns zero cards — the loader then surfaces the honest data-gated empty state.
 */
export function generateDiamondSpecials(props: Prop[], date: string, generatedAt: string): DiamondSpecialsSnapshot {
  const byGroup = (g: string) => props.filter((p) => p.group === g);
  const cards: GeneratedCard[] = [];
  const themed: Array<[string, Prop[]]> = [
    ["Homer Special", byGroup("hr")],
    ["Hits Special", byGroup("hits")],
    ["Bases Special", byGroup("bases")],
    ["Pitching Special", byGroup("pitchers")],
  ];
  for (const [category, pool] of themed) {
    const card = makeCard(date, category, pickLegs(pool, 2, "strength"));
    if (card) cards.push(card);
  }
  // Longshot — 3 highest-priced legs across every group, max one per game.
  const longshot = makeCard(date, "Longshot Special", pickLegs(props, 3, "longshot"));
  if (longshot) cards.push(longshot);

  return { date, generatedAt, cards };
}
