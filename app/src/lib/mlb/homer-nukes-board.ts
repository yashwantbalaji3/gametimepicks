/**
 * HOMER NUKES reader — the model's home-run board for a slate.
 *
 * Fail-closed on the date, like every other slate reader here: a board built for a different day is
 * not this day's board, and the surface renders nothing rather than yesterday's names under today's
 * heading. (That exact failure shipped on /mlb, where a June market artifact rendered under
 * "Implied by current sportsbook prices" for two months.)
 *
 * Separate from `homer-nukes.ts`, which loads the RETIRED parlay product built from a provider
 * anytime-HR feed. This one reads the model artifact and carries probabilities, not a ticket.
 */
import fs from "node:fs";
import path from "node:path";

export interface HomerNukePick {
  readonly playerId: number;
  readonly player: string;
  readonly teamId: number | null;
  readonly teamAbbr: string | null;
  readonly teamName: string | null;
  readonly opponentAbbr: string | null;
  readonly opponentTeamId: number | null;
  readonly matchup: string;
  readonly gamePk: number | null;
  readonly gameDate: string | null;
  readonly venue: string | null;
  readonly opposingPitcher: string | null;
  readonly opposingPitcherId: number | null;
  /** Model P(≥1 home run today), 0–1. */
  readonly probability: number;
  readonly seasonHr: number;
  readonly seasonPa: number;
  readonly seasonRate: number;
  readonly adjustedRate: number;
  readonly pitcherHrAllowed: number | null;
  readonly pitcherBattersFaced: number | null;
  readonly pitcherMultiplier: number;
  /** One line naming the numbers that produced the probability. */
  readonly reason: string;
}

export interface HomerNukesBoard {
  readonly date: string;
  readonly generatedAt: string;
  readonly model: {
    readonly id: string;
    readonly state: string;
    readonly method: string;
    readonly leagueHrPerPa: number;
    readonly expectedPlateAppearances: number;
    readonly minimumPa: number;
    readonly notModelled: readonly string[];
    readonly honestLimit: string;
  };
  readonly slate: { readonly games: number; readonly candidatesRanked: number };
  readonly picks: readonly HomerNukePick[];
}

export function loadHomerNukesBoard(root: string, date: string): HomerNukesBoard | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, "mlb", "homer-nukes", `${date}.json`), "utf8")) as HomerNukesBoard;
    if (!raw?.picks?.length) return null;
    if (raw.date !== date) return null; // a board for another slate is not this slate's board
    return raw;
  } catch {
    return null;
  }
}

/**
 * How many of the published picks share a single pitcher. The model concentrates when one starter
 * is genuinely the homer-prone spot of the day — on 2026-08-17 three of five faced the same arm at
 * 1.66× the league rate — and that is a finding worth naming rather than a flaw worth hiding.
 */
export function sharedPitcher(picks: readonly HomerNukePick[]): { pitcher: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const p of picks) if (p.opposingPitcher) counts.set(p.opposingPitcher, (counts.get(p.opposingPitcher) ?? 0) + 1);
  let best: { pitcher: string; count: number } | null = null;
  for (const [pitcher, count] of counts) if (count > 1 && (!best || count > best.count)) best = { pitcher, count };
  return best;
}
