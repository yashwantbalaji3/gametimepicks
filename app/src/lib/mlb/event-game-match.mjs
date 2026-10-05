/**
 * MLB ODDS EVENT → gamePk, FAIL-CLOSED (MLB Department, 2026-10-05). Pure, no I/O.
 *
 * ⚠ THE BUG THIS REPLACES. The pregame market capture mapped every Odds API event to a gamePk with
 *   new Map(sched.map((g) => [`${g.away}|${g.home}`, g.gamePk]))
 * — team pair only, no date, last write wins. The odds endpoint returns every upcoming event, so (a) the
 * first game of a doubleheader was stamped with the second game's gamePk, and (b) tomorrow's game in the
 * same series was stamped with today's gamePk. The settlement join then graded those rows against the wrong
 * box score (2026-09-22/823494 held rows from three provider events). The closing-odds backfill and the
 * player-prop schedule fallback had the same team-pair-only join.
 *
 * THE RULE. An event matches a scheduled game only when the teams match AND the scheduled start is within
 * `toleranceMinutes` of the event's commence time. Exactly one such game → its gamePk. None → null. More
 * than one (a doubleheader whose two starts are both near the event, e.g. 2026-09-25 BAL@NYY 20:05Z/20:10Z,
 * game 2's start a placeholder) → null. An unmatched row is left without a gamePk, never guessed.
 */

export const EVENT_MATCH_TOLERANCE_MINUTES = 90;

const t = (s) => (typeof s === "string" ? Date.parse(s) : NaN);

/**
 * @param {{ away: string, home: string, commenceTime: string }} event
 * @param {{ gamePk: number, away: string, home: string, commenceTime: string }[]} games  the schedule
 * @param {{ norm?: (s: string) => string, toleranceMinutes?: number }} [opts]
 * @returns {{ gamePk: number|null, reason: "MATCHED"|"NO_GAME"|"AMBIGUOUS"|"NO_EVENT_TIME", candidates: number }}
 */
export function matchEventToGamePk(event, games, { norm = (s) => String(s ?? ""), toleranceMinutes = EVENT_MATCH_TOLERANCE_MINUTES } = {}) {
  const at = t(event?.commenceTime);
  if (!Number.isFinite(at)) return { gamePk: null, reason: "NO_EVENT_TIME", candidates: 0 };
  const away = norm(event.away);
  const home = norm(event.home);
  const hits = (games ?? []).filter((g) => {
    if (norm(g.away) !== away || norm(g.home) !== home) return false;
    const start = t(g.commenceTime);
    return Number.isFinite(start) && Math.abs(start - at) <= toleranceMinutes * 60e3;
  });
  if (hits.length === 1) return { gamePk: hits[0].gamePk ?? null, reason: "MATCHED", candidates: 1 };
  return { gamePk: null, reason: hits.length === 0 ? "NO_GAME" : "AMBIGUOUS", candidates: hits.length };
}

/**
 * The reverse join, for scripts that start from a final and look for its odds event: the one event with the
 * game's teams within tolerance of its start, or null. A game with no known start (finals carry none) is only
 * matched when the date holds no other game between the same teams — a doubleheader without times is refused.
 * @param {{ away: string, home: string, commenceTime?: string|null }} game
 * @param {{ away: string, home: string, commenceTime: string }[]} events
 * @param {{ norm?: (s: string) => string, toleranceMinutes?: number, sameTeamGamesOnDate?: number }} [opts]
 */
export function matchGameToEvent(game, events, { norm = (s) => String(s ?? ""), toleranceMinutes = EVENT_MATCH_TOLERANCE_MINUTES, sameTeamGamesOnDate = 1 } = {}) {
  const away = norm(game?.away);
  const home = norm(game?.home);
  const start = t(game?.commenceTime);
  if (!Number.isFinite(start) && sameTeamGamesOnDate !== 1) return null;
  const hits = (events ?? []).filter((e) => {
    if (norm(e.away) !== away || norm(e.home) !== home) return false;
    if (!Number.isFinite(start)) return true;
    const at = t(e.commenceTime);
    return Number.isFinite(at) && Math.abs(at - start) <= toleranceMinutes * 60e3;
  });
  return hits.length === 1 ? hits[0] : null;
}
