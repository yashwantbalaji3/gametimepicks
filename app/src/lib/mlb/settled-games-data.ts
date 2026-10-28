/**
 * Settled MLB game pages — the data (SERVER / BUILD TIME ONLY). Rule: settled-games.ts.
 * Reads committed PUBLIC files only: the graded record /results/mlb grades from, and the day's prediction file for the
 * two team NAMES (names only — no number is read from a day file a lineup refresh may have rewritten after first pitch).
 */
import fs from "node:fs";
import path from "node:path";

import { EXPIRED_GAMES_MAX_DAYS } from "@/components/expired/expired-games.mjs";
import { mlbSettledGames, type GradedRow, type SettledMlbGame } from "./settled-games";

const DATA = () => path.join(process.cwd(), "public", "data", "mlb");
const daysBefore = (today: string, n: number) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

/** The window matches the expired-link index: older links keep the 404 tombstone. */
export const MLB_SETTLED_MAX_DAYS = EXPIRED_GAMES_MAX_DAYS;

let rowsMemo: GradedRow[] | null = null;
function gradedRows(): GradedRow[] {
  if (rowsMemo) return rowsMemo;
  try {
    rowsMemo = fs.readFileSync(path.join(DATA(), "results", "game-predictions-graded.jsonl"), "utf8").split("\n").filter(Boolean)
      .flatMap((l) => { try { return [JSON.parse(l) as GradedRow]; } catch { return []; } });
  } catch { rowsMemo = []; }
  return rowsMemo;
}

const memo = new Map<string, SettledMlbGame[]>();
export function settledMlbGames(today: string): SettledMlbGame[] {
  if (!memo.has(today)) memo.set(today, mlbSettledGames(gradedRows(), { sinceDate: daysBefore(today, MLB_SETTLED_MAX_DAYS), today }));
  return memo.get(today)!;
}

export function settledMlbGame(slug: string, today: string): SettledMlbGame | null {
  return settledMlbGames(today).find((g) => g.slug === slug) ?? null;
}

/** Team names for a settled game, from its date's prediction file; abbreviations when the file does not name them. */
export function settledTeamNames(g: SettledMlbGame): { away: string; home: string } {
  try {
    const day = JSON.parse(fs.readFileSync(path.join(DATA(), "predictions", `${g.date}.json`), "utf8")) as { predictions?: Array<{ gamePk?: number | string; awayTeamName?: string; homeTeamName?: string }> };
    const p = day.predictions?.find((x) => String(x.gamePk) === g.gamePk);
    return { away: p?.awayTeamName || g.away, home: p?.homeTeamName || g.home };
  } catch {
    return { away: g.away, home: g.home };
  }
}
