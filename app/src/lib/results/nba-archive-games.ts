/**
 * THE RETIRED NBA ARCHIVE, GAME BY GAME — one builder for both surfaces that show it (release owner 2026-10-24).
 *
 * /results/nba lists each game of the newest archive date as a summary row that links to that game's card on its day
 * page, /results/date/<d>/#nba-game-<gameId>, where every player row is rendered. Both read their games from HERE, so
 * the summary a reader taps and the rows they land on are the same rows, counted the same way. Pure over the settled
 * rows it is given (lib/settlement-data.ts); nothing is graded or recomputed beyond the counts the cards always showed.
 */
import type { SettledLeanRow } from "@/components/settled-game-detail";
import { getPlayoffContext } from "@/components/playoff-context";

type Row = {
  date?: string; gameId?: string | null; playerId?: string | number | null; playerName?: string | null; market?: string | null;
  side?: string | null; line?: number | null; modelProjection?: number | null; finalStat?: unknown; result?: string | null;
  confidence?: string | null; edgePct?: unknown; bookmaker?: string | null; oddsOver?: number | null; oddsUnder?: number | null;
  team?: string | null; opponent?: string | null;
};

export interface NbaArchiveGame {
  gameId: string; matchup: string; subtitle?: string;
  wins: number; losses: number; pushes: number; decisive: number; hitRate: number | null;
  rows: SettledLeanRow[];
}

/** The anchor of a game's card on its day page. */
export const nbaArchiveGameAnchor = (gameId: string) => `nba-game-${gameId}`;

/**
 * @param rows      one date's settled rows
 * @param date      that date
 * @param labelFor  the board's "AWAY @ HOME" by game id, when the date has a board (preferred: the row's team/opponent
 *                  is the player's side, not necessarily away/home)
 */
export function nbaArchiveGames(rows: Row[], date: string, labelFor: Record<string, string> = {}): NbaArchiveGame[] {
  const byGame = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.gameId ?? "_";
    byGame.set(k, [...(byGame.get(k) ?? []), r]);
  }
  return [...byGame.keys()].sort().map((gid) => {
    const g = byGame.get(gid) ?? [];
    const wins = g.filter((r) => r.result === "win").length;
    const losses = g.filter((r) => r.result === "loss").length;
    const pushes = g.filter((r) => r.result === "push").length;
    const decisive = wins + losses;
    const r0 = g[0];
    const ctx = getPlayoffContext(gid, r0?.team ?? undefined, r0?.opponent ?? undefined);
    return {
      gameId: gid,
      matchup: labelFor[gid] || (r0?.team && r0?.opponent ? `${r0.team} @ ${r0.opponent}` : "Settled NBA game"),
      subtitle: ctx.isPlayoffs ? `${ctx.roundLabel} · ${ctx.gameLabel}` : undefined,
      wins, losses, pushes, decisive, hitRate: decisive > 0 ? wins / decisive : null,
      rows: g.map((r, i) => ({
        id: `${date}-${gid}-${r.playerId}-${r.market}-${i}`,
        playerName: r.playerName ?? "—",
        marketLabel: r.market ?? "—",
        side: r.side ?? "Pass",
        line: r.line ?? null,
        projection: r.modelProjection ?? null,
        actual: typeof r.finalStat === "number" ? r.finalStat : null,
        outcome: r.result === "win" ? "Win" : r.result === "loss" ? "Loss" : r.result === "push" ? "Push" : "—",
        confidence: r.confidence ?? "—",
        edgePct: typeof r.edgePct === "number" ? r.edgePct : null,
        bookmaker: r.bookmaker ?? null,
        oddsForSide: r.side === "Over" ? r.oddsOver ?? null : r.oddsUnder ?? null,
      })),
    };
  });
}
