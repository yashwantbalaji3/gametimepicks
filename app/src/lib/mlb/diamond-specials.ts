/**
 * Diamond Specials — the MLB version of World Cup Specials: 5 model-built parlays a day at $20 each
 * ($100/day), one per category, drawn from the single Mr. Dub bankroll and archived forever. The five
 * categories are Homer · Hits · Bases · Pitching · Longshot.
 *
 * HONEST BY CONSTRUCTION: builds only from real posted MLB markets. When the MLB board / prop markets
 * are not posted for the date (true today — see docs/audits/mlb-odds-empty-root-cause.md), it returns a
 * data-gated empty result with the category slots labeled "awaiting board" — never a fabricated parlay.
 * Pure read-side; no money mutation. Realized P/L comes only from official settlement.
 */
import fs from "node:fs";
import path from "node:path";

export const DIAMOND_SPECIALS_STAKE_PER_CARD = 20;
export const DIAMOND_SPECIALS_CARDS_PER_DAY = 5;
export const DIAMOND_SPECIALS_DAILY_ALLOCATION = DIAMOND_SPECIALS_STAKE_PER_CARD * DIAMOND_SPECIALS_CARDS_PER_DAY; // $100/day

export type DiamondCategory = "Homer Special" | "Hits Special" | "Bases Special" | "Pitching Special" | "Longshot Special";
export const DIAMOND_CATEGORIES: DiamondCategory[] = ["Homer Special", "Hits Special", "Bases Special", "Pitching Special", "Longshot Special"];

export interface DiamondSpecialLeg {
  player: string | null;
  team: string;
  teamAbbr: string | null;
  opponent: string | null;
  matchup: string;
  market: string;
  marketLabel: string;
  selection: string;
  odds: number;
  modelProbability: number;
  provider: string | null;
  photoUrl: string | null;
}

export interface DiamondSpecialCard {
  id: string;
  category: DiamondCategory;
  legs: DiamondSpecialLeg[];
  combinedOdds: number;
  stake: number;
  projectedReturn: number;
  result: string | null;   // null until officially settled
}

export interface DiamondSpecialsResult {
  date: string;
  available: boolean;
  categories: DiamondCategory[];
  cards: DiamondSpecialCard[];
  stakePerCard: number;
  dailyAllocation: number;
  note: string;
}

/** Load today's Diamond Specials. Prefers a committed snapshot (`mlb/diamond-specials/<date>.json`),
 *  the canonical output of the generation step; returns a data-gated empty result when none is posted. */
export function loadDiamondSpecials(root: string, date: string): DiamondSpecialsResult {
  const empty = (note: string): DiamondSpecialsResult => ({
    date, available: false, categories: DIAMOND_CATEGORIES, cards: [],
    stakePerCard: DIAMOND_SPECIALS_STAKE_PER_CARD, dailyAllocation: DIAMOND_SPECIALS_DAILY_ALLOCATION, note,
  });

  let raw: { date?: string; cards?: Array<Record<string, any>> } | null = null;
  for (const rel of [["mlb", "diamond-specials", `${date}.json`], ["mlb", "diamond-specials", "latest.json"]]) {
    try { raw = JSON.parse(fs.readFileSync(path.join(root, ...rel), "utf8")); break; } catch { /* try next */ }
  }
  if (!raw) return empty("Today's MLB board has not been posted yet, so the Diamond Specials can't be built. The five daily parlays appear here the moment real MLB markets post — no fabricated cards in the meantime.");
  if (raw.date && raw.date !== date) return empty("The posted Diamond Specials are for a different slate — fail-closed until today's MLB markets post.");

  const cards: DiamondSpecialCard[] = (raw.cards ?? []).slice(0, DIAMOND_SPECIALS_CARDS_PER_DAY).map((c, i) => ({
    id: String(c.id ?? `diamond:${date}:${i}`),
    category: (DIAMOND_CATEGORIES.includes(c.category) ? c.category : DIAMOND_CATEGORIES[i] ?? "Longshot Special") as DiamondCategory,
    legs: (c.legs ?? []).map((l: Record<string, any>) => ({
      player: l.player ?? null, team: String(l.team ?? ""), teamAbbr: l.teamAbbr ?? null,
      opponent: l.opponent ?? null, matchup: String(l.matchup ?? ""), market: String(l.market ?? ""),
      marketLabel: String(l.marketLabel ?? l.market ?? ""), selection: String(l.selection ?? ""),
      odds: Number(l.odds ?? 0), modelProbability: Number(l.modelProbability ?? 0),
      provider: l.provider ?? null, photoUrl: l.photoUrl ?? null,
    })),
    combinedOdds: Number(c.combinedOdds ?? 0), stake: DIAMOND_SPECIALS_STAKE_PER_CARD,
    projectedReturn: Number(c.projectedReturn ?? 0), result: c.result ?? null,
  }));
  if (cards.length === 0) return empty("No Diamond Specials cleared the board for this slate yet.");
  return {
    date, available: true, categories: DIAMOND_CATEGORIES, cards,
    stakePerCard: DIAMOND_SPECIALS_STAKE_PER_CARD, dailyAllocation: DIAMOND_SPECIALS_DAILY_ALLOCATION,
    note: `${cards.length} Diamond Specials today · $${DIAMOND_SPECIALS_STAKE_PER_CARD} each · settled P/L from official box scores. Paper-only.`,
  };
}
