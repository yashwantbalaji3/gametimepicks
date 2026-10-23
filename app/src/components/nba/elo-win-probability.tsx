/**
 * The Elo rating's game-winner probability, as every NBA surface prints it (founder decision 2026-10-23). SERVER.
 *
 * One accessor (lib/sports/nba/elo-win-probability.mjs eloWinProbabilityOf), one text (eloWinProbabilityText), one data
 * attribute carrying the receipt's exact home number — so the /nba hub card, the Theater page's Official Forecast panel,
 * the /nba/projections boards and the Level A rows print the same thing for the same game. Renders nothing when the
 * accessor refuses (switch off, no field, or provenance that is not this game's own freeze and receipt).
 */
import React from "react";
import { eloWinProbabilityOf, eloWinProbabilityText } from "@/lib/sports/nba/elo-win-probability.mjs";

type LaneGameLike = Parameters<typeof eloWinProbabilityOf>[0];
export type EloCtx = { enabled: boolean; disclosure: string };

export function EloWinProbability({ game, ctx, as: Tag = "span", className }: { game: LaneGameLike; ctx: EloCtx; as?: "span" | "p" | "dd"; className?: string }) {
  const v = eloWinProbabilityOf(game, { enabled: ctx.enabled });
  if (!v) return null;
  return <Tag className={className} data-nba-elo-wp={v.eventId} data-nba-elo-wp-home={String(v.home)}>{eloWinProbabilityText(v)}</Tag>;
}

/** The disclosure, once per surface (only when at least one game on it shows the number). */
export function EloAccuracyDisclosure({ games, ctx, className }: { games: LaneGameLike[]; ctx: EloCtx; className?: string }) {
  if (!games.some((g) => eloWinProbabilityOf(g, { enabled: ctx.enabled }))) return null;
  return <p className={className} data-nba-elo-wp-disclosure="">{ctx.disclosure}</p>;
}
