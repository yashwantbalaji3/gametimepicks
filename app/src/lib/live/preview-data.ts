/**
 * Server-side artifact reads for the Live preview. NODE ONLY — never imported by a client component.
 *
 * Everything here reads the SAME committed artifacts the public report pages read. Nothing is
 * recomputed and nothing new is generated: the preview shows the existing frozen forecast beside a
 * live feed, which is the entire v1.1 proposition.
 */
import fs from "node:fs";
import path from "node:path";

import { projectMlbForecast } from "./forecast-join.mjs";

const readPublic = (rel: string) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data", rel), "utf8"));
  } catch {
    return null;
  }
};

export interface PreviewEvent {
  sport: "nfl" | "mlb";
  eventId: string;
  matchup: string;
  startTime: string | null;
  playerBoard: any | null;
  mlbForecast: any | null;
  forecastGeneratedAt: string | null;
}

/** The NFL events that have BOTH a frozen forecast and a player board, newest week first. */
export function nflPreviewEvents(limit = 4): PreviewEvent[] {
  const index = readPublic("nfl/player-board/latest.json");
  const boards: any[] = Array.isArray(index?.boards) ? index.boards : [];
  const out: PreviewEvent[] = [];
  for (const b of boards) {
    const board = readPublic(`nfl/player-board/${b.providerEventId}.json`);
    if (!board) continue;
    out.push({
      sport: "nfl",
      eventId: String(b.providerEventId),
      matchup: b.matchup ?? board.matchup ?? b.providerEventId,
      startTime: b.kickoffUtc ?? board.kickoffUtc ?? null,
      playerBoard: board,
      mlbForecast: null,
      forecastGeneratedAt: board.generatedAt ?? index?.generatedAt ?? null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The most recently kicked-off NFL events that still have a committed player board.
 *
 * WHY THE PREVIEW NEEDS THESE. Upcoming games prove the PRE path and nothing else: a box score for a
 * game that has not started is empty, so the player-range comparison — the point of the NFL slice —
 * is invisible on a forward slate. A played game exercises it against real values.
 *
 * ⚠ This reads build time, and that is acceptable HERE and nowhere else. It selects which internal
 * preview rows to render; it makes no claim to a reader about whether anything is still offerable.
 * The rule Phase 6 established — a claim about the present is re-evaluated on the READER's clock —
 * is owned by the live envelope's own state, which this does not touch.
 */
export function nflRecentlyPlayedEvents(limit = 2, nowMs = Date.now()): PreviewEvent[] {
  let files: string[] = [];
  try {
    files = fs
      .readdirSync(path.join(process.cwd(), "public/data/nfl/player-board"))
      .filter((f) => /^\d+\.json$/.test(f));
  } catch {
    return [];
  }
  const played: Array<{ board: any; kickoff: number }> = [];
  for (const f of files) {
    const board = readPublic(`nfl/player-board/${f}`);
    const kickoff = Date.parse(board?.kickoffUtc ?? "");
    if (!board || !Number.isFinite(kickoff) || kickoff > nowMs) continue;
    played.push({ board, kickoff });
  }
  played.sort((a, b) => b.kickoff - a.kickoff);
  return played.slice(0, limit).map(({ board }) => ({
    sport: "nfl" as const,
    eventId: String(board.providerEventId),
    matchup: board.matchup ?? String(board.providerEventId),
    startTime: board.kickoffUtc ?? null,
    playerBoard: board,
    mlbForecast: null,
    forecastGeneratedAt: board.generatedAt ?? null,
  }));
}

/** MLB games from the most recent simulation slate that actually carry a ready simulation. */
export function mlbPreviewEvents(etDate: string, limit = 4): PreviewEvent[] {
  const slate = readPublic(`mlb/full-game-simulations/${etDate}.json`);
  const games: any[] = Array.isArray(slate?.games) ? slate.games : [];
  const out: PreviewEvent[] = [];
  for (const g of games) {
    const forecast = projectMlbForecast(g);
    // A game with no ready simulation is skipped here rather than shown with an empty forecast
    // block — the live half alone is a scoreboard, which is not what this page is demonstrating.
    if (!forecast) continue;
    out.push({
      sport: "mlb",
      eventId: String(g.gamePk),
      matchup: `${g.awayTeam} @ ${g.homeTeam}`,
      startTime: g.firstPitch ?? null,
      playerBoard: null,
      mlbForecast: forecast,
      forecastGeneratedAt: slate?.generatedAt ?? null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** The newest simulation slate on disk, so the preview never points at an empty date. */
export function latestMlbSlateDate(): string | null {
  try {
    const dir = path.join(process.cwd(), "public/data/mlb/full-game-simulations");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    return files.length ? files[files.length - 1].replace(/\.json$/, "") : null;
  } catch {
    return null;
  }
}
