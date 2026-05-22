"use client";

import { useMemo, useState } from "react";
import type { MlbBoardLean, MlbScheduleGame } from "@/lib/types-mlb";
import MlbGameSection from "./mlb-game-section";
import MlbFilterConsole, {
  applyMlbFilters,
  type MlbFilterState,
} from "./mlb-filter-console";

/**
 * MlbBoardClient — owns the filter/sort/density state for the MLB board.
 *
 * Receives the FULL set of leans + games from the server component, then
 * filters/sorts client-side and renders the game sections. The Top Clean
 * Leans strip is intentionally server-rendered above this component
 * (always shows the day's best calls regardless of filters), so this
 * client component only handles the interactive scan tools.
 */
interface Props {
  leans: MlbBoardLean[];
  games: MlbScheduleGame[];
  teamOptions: string[];
  /** {gamePk -> "final" | "live" | "pregame"} derived from MLB Stats API. */
  gameStateByPk?: Record<number, "final" | "live" | "pregame">;
  /** Set of gamePks whose graded rows exist on MLB Results. */
  settledGamePks?: number[];
}

export default function MlbBoardClient({
  leans,
  games,
  teamOptions,
  gameStateByPk,
  settledGamePks,
}: Props) {
  const settledSet = new Set(settledGamePks || []);
  const [state, setState] = useState<MlbFilterState>({
    market: "all",
    confidence: "all",
    team: "all",
    sort: "featured",
    density: "detailed",
  });

  // Filtered + sorted leans (memoized — recomputes only when filters
  // change, not on every parent re-render).
  const filteredLeans = useMemo(
    () => applyMlbFilters(leans, state),
    [leans, state],
  );

  // Index filtered leans by gameId for fast per-game lookup.
  const visibleByGameId = useMemo(() => {
    const map: Record<string, MlbBoardLean[]> = {};
    for (const l of filteredLeans) {
      if (!map[l.gameId]) map[l.gameId] = [];
      map[l.gameId].push(l);
    }
    return map;
  }, [filteredLeans]);

  // Total leans per game (unfiltered) for the "X of Y" chip.
  const totalByGameId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of leans) {
      map[l.gameId] = (map[l.gameId] || 0) + 1;
    }
    return map;
  }, [leans]);

  // Resolve each schedule game to its Odds-API event id. Reuse the
  // home/away team match used in the server page.
  const gameIdByMatchup = useMemo(() => {
    const map: Record<string, string> = {};
    const seenIds = new Set<string>();
    for (const l of leans) {
      if (seenIds.has(l.gameId)) continue;
      seenIds.add(l.gameId);
      const key = `${l.awayTeamAbbr}-${l.homeTeamAbbr}`;
      map[key] = l.gameId;
    }
    return map;
  }, [leans]);

  return (
    <>
      <MlbFilterConsole
        state={state}
        teamOptions={teamOptions}
        onChange={setState}
        visibleCount={filteredLeans.length}
        totalCount={leans.length}
      />

      {/* Game sections — wrapped in overflow-hidden to clip aurora-halo bleed.
          Accordion default: only the first game with visible leans opens
          on mount. Reduces initial DOM ~80% on dense MLB slates. */}
      <section className="mt-8 px-1 sm:px-2 overflow-hidden">
        <div className="flex flex-col gap-5">
          {(() => {
            // Pick the first game that has any visible leans; if every
            // game is hidden by filters or pending, fall back to the
            // chronologically first.
            const firstWithLeans = games.find((g) => {
              const id = gameIdByMatchup[`${g.awayTeamAbbr}-${g.homeTeamAbbr}`];
              return id && (visibleByGameId[id]?.length ?? 0) > 0;
            });
            const openKey =
              firstWithLeans?.gamePk ??
              games[0]?.gamePk ??
              null;
            return games.map((g) => {
              const matchupKey = `${g.awayTeamAbbr}-${g.homeTeamAbbr}`;
              const gameId = gameIdByMatchup[matchupKey];
              const gameLeans = gameId ? visibleByGameId[gameId] ?? [] : [];
              const totalForGame = gameId ? totalByGameId[gameId] ?? 0 : 0;
              const gpk = g.gamePk;
              const gameState =
                gpk && gameStateByPk ? gameStateByPk[gpk] ?? null : null;
              const settled = gpk ? settledSet.has(gpk) : false;
              return (
                <MlbGameSection
                  key={g.gamePk ?? matchupKey}
                  game={g}
                  leans={gameLeans}
                  totalLeansForGame={totalForGame}
                  density={state.density}
                  gameState={gameState}
                  settled={settled}
                  defaultOpen={openKey != null && g.gamePk === openKey}
                />
              );
            });
          })()}
        </div>
      </section>
    </>
  );
}
