/**
 * EXPLORER PROJECTION (Phase 5F · /mlb weight; Phase 5O pass 2). The player-props explorer is a client component, so
 * every field of every lean it receives is serialised into the page payload beside the HTML. It renders eighteen fields
 * (sixteen on the cards, two in the ranked view); a full `PublicProjection` carries twenty-six. This is the server-side
 * projection to exactly what the explorer, its cards and its grouping read — nothing rendered is lost.
 *
 * Phase 5F measured the explorer array at 656 KB of a 1,412 KB /mlb payload and dropped ≈ 100 KB of unread fields.
 * Phase 5O packs the two biggest remaining repeats, losslessly:
 *   recentGames  → `recent`: `[date, opponent, isHome, value]` tuples (same order, date string untouched)
 *   player.photo → `mlbPersonId` when the URL is EXACTLY the official StatsAPI headshot for that id (round-trip
 *                  checked); any other photo (another sport, another CDN) is kept verbatim.
 * Every page that hands the explorer or a PlayerPropCard rows goes through `toExplorerProjection` — one owner.
 */
import type { PublicProjection } from "@/lib/normalize";
import { mlbHeadshotUrl, mlbPersonIdFromHeadshotUrl } from "@/lib/player-headshots";

type SourceRecentGame = NonNullable<PublicProjection["recentGames"]>[number];

/** One recent game: [ISO date as the artifact wrote it, opponent, home (null when the artifact did not say), value]. */
export type RecentGameTuple = readonly [date: string, opponent: string, isHome: boolean | null, value: number];

export interface ExplorerPlayer {
  name: string;
  team?: string;
  /** A non-StatsAPI portrait URL, verbatim. */
  photo?: string | null;
  /** StatsAPI person id whose official headshot URL was the row's photo — rebuilt by `explorerPhoto`. */
  mlbPersonId?: string;
}

export type ExplorerProjection = Pick<PublicProjection,
  "id" | "market" | "marketLabel" | "projectionValue" | "pickLabel" | "line" | "americanOdds" |
  "bookmaker" | "modelProbability" | "marketProbability" | "edgePct" | "parlayEligible" | "lineupStatus" | "caveats" |
  "participantType" | "confidence"> & {
  player?: ExplorerPlayer | null;
  recent?: RecentGameTuple[];
};

export const EXPLORER_FIELDS = ["id", "market", "marketLabel", "projectionValue", "pickLabel", "line", "americanOdds", "bookmaker", "modelProbability", "marketProbability", "edgePct", "parlayEligible", "lineupStatus", "caveats", "participantType", "confidence"] as const;

function projectPlayer(pl: NonNullable<PublicProjection["player"]>): ExplorerPlayer {
  const out: ExplorerPlayer = { name: pl.name };
  if (pl.team !== undefined) out.team = pl.team;
  const id = mlbPersonIdFromHeadshotUrl(pl.photo);
  if (id) out.mlbPersonId = id;
  else if (pl.photo !== undefined) out.photo = pl.photo;
  return out;
}

export const encodeRecentGame = (g: SourceRecentGame): RecentGameTuple => [g.date, g.opponent, g.isHome ?? null, g.value];

/** Display-boundary decode: the object shape the card has always rendered. */
export function decodeRecentGames(recent: readonly RecentGameTuple[] | undefined): SourceRecentGame[] {
  return (recent ?? []).map(([date, opponent, isHome, value]) => (isHome == null ? { date, opponent, value } : { date, opponent, isHome, value }));
}

/** The portrait URL the full row carried (the official headshot rebuilt from its id, or the verbatim photo). */
export function explorerPhoto(pl: ExplorerPlayer | null | undefined): string | null {
  if (!pl) return null;
  return pl.photo ?? mlbHeadshotUrl(pl.mlbPersonId) ?? null;
}

export function toExplorerProjection(p: PublicProjection): ExplorerProjection {
  const out: Record<string, unknown> = {};
  for (const k of EXPLORER_FIELDS) if (p[k] !== undefined) out[k] = p[k];
  if (p.player !== undefined) out.player = p.player === null ? null : projectPlayer(p.player);
  if (p.recentGames !== undefined) out.recent = p.recentGames.map(encodeRecentGame);
  return out as ExplorerProjection;
}
