/**
 * /games/[sport]/[gameId] — fixture detail page. Statically generated for every game on today's
 * board (generateStaticParams). Renders the shared GameDetailPage from real artifacts only.
 */
import { notFound } from "next/navigation";
import { getGameDetail, gameDetailParams } from "@/lib/game-detail";
import { getGameSpecificCardsForGame, getWorldCupMultiGameCardsForGame } from "@/lib/world-cup/game-specific-cards";
import { buildGamePropParlays } from "@/lib/world-cup/game-prop-parlays";
import GameDetailPage from "@/components/game/game-detail-page";

export const dynamicParams = false;

export function generateStaticParams() {
  return gameDetailParams();
}

export function generateMetadata({ params }: { params: { sport: string; gameId: string } }) {
  const d = getGameDetail(params.sport, params.gameId);
  return {
    title: d ? `${d.title} · ${d.sportLabel} · GameTime Picks` : "Game · GameTime Picks",
    description: d
      ? `${d.title} — projections, player props, suggested cards, and market availability. Educational, paper-only.`
      : "Game detail — educational, paper-only.",
  };
}

export default function GameDetailRoute({ params }: { params: { sport: string; gameId: string } }) {
  const detail = getGameDetail(params.sport, params.gameId);
  if (!detail) notFound();
  // Engine game-specific suggested cards mapped to this fixture (World Cup only for now).
  const fixture = { matchId: detail.matchId, homeTeam: detail.homeTeam, awayTeam: detail.awayTeam };
  const engineCards = detail.sport === "world_cup" ? getGameSpecificCardsForGame(fixture) : null;
  // World Cup multi-game cards that include this fixture ("this game in multi-game cards").
  const multiGameCards = detail.sport === "world_cup" ? getWorldCupMultiGameCardsForGame(fixture) : null;
  // Per-fixture player-prop + team-prop parlays (Safe / Balanced / Longshot + same-game team combos).
  const propParlays = detail.sport === "world_cup" ? buildGamePropParlays(detail) : null;
  return (
    <GameDetailPage
      detail={detail}
      engineCards={engineCards}
      multiGameCards={multiGameCards}
      playerPropParlays={propParlays?.playerParlays}
      teamPropParlays={propParlays?.teamParlays}
    />
  );
}
