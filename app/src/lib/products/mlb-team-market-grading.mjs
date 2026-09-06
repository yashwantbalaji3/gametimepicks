/**
 * GRADING A TEAM MARKET, which nothing could do.
 *
 * Program 236 gave Bank Builder and Moonshot a live pool of MLB team markets — moneyline, total runs
 * and run line. On 2026-09-06 both products published from it for the first time: four cards, $250
 * of paper exposure, publicly visible on /bank-builder. Every leg was unsettleable.
 *
 *   market=Moneyline   settleable=false   player=""   gamePk=""
 *
 * The only wired settler grades PLAYER PROPS by looking a name up in a box score. A team leg has no
 * player, and its id carries the board's content-derived `gameId` rather than a numeric gamePk, so
 * neither the player grader nor the ladder settler could touch it. Cards that cannot be graded are
 * unfalsifiable — the exact defect P236 existed to fix, reintroduced by P236's own pool wiring.
 *
 * THE JOIN. The leg knows its matchup and date; the committed linescore cache knows gamePk,
 * officialDate, homeTeam, awayTeam and the final runs. Team names plus date are enough — EXCEPT for
 * a doubleheader, where two games share all three. That case is refused, not guessed: a card graded
 * against the wrong game of a doubleheader is worse than one left pending.
 */
import { LEG } from "./lifecycle.mjs";

export const TEAM_MARKETS = Object.freeze(["mlb_moneyline", "mlb_total_runs", "mlb_run_line"]);
export const isTeamMarket = (m) => TEAM_MARKETS.includes(String(m));

/** Canonical market key out of a leg id: `MLB:<gameId>:mlb_moneyline:Seattle_Mariners_to_win`. */
export function teamMarketKeyOf(leg) {
  const parts = String(leg?.id ?? leg?.legId ?? "").split(":");
  return parts.find((p) => TEAM_MARKETS.includes(p)) ?? null;
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Find the one linescore for this leg's game.
 *
 * @returns {{ok: true, line: object} | {ok: false, reason: string}}
 */
export function findLinescore(leg, linescores, dateEt) {
  const matchup = String(leg?.matchup ?? "");
  const m = matchup.split(/\s+@\s+/);
  if (m.length !== 2) return { ok: false, reason: `leg matchup "${matchup}" is not "away @ home"` };
  const [away, home] = m.map(norm);

  const sameDay = (linescores ?? []).filter((l) => !dateEt || l.officialDate === dateEt);
  const hits = sameDay.filter((l) => norm(l.homeTeam) === home && norm(l.awayTeam) === away);
  if (hits.length === 0) return { ok: false, reason: `no linescore for ${matchup} on ${dateEt ?? "any date"}` };
  if (hits.length > 1) {
    // A doubleheader. Team names and a date do not identify which game, and guessing would grade a
    // card against a game it was never placed on.
    return { ok: false, reason: `${hits.length} games match ${matchup} on ${dateEt} (doubleheader) — the leg carries no gamePk to disambiguate` };
  }
  return { ok: true, line: hits[0] };
}

/**
 * Grade one team-market leg against a final linescore.
 *
 * Every non-final path holds. A game still in progress or missing from the cache is PENDING, never a
 * loss — the same asymmetry the player grader uses, for the same reason.
 *
 * @returns {{result: string, actual: number|string|null, note: string}}
 */
export function gradeTeamLeg({ marketKey, selection, matchup, line }) {
  if (!line) return { result: LEG.PENDING, actual: null, note: "no linescore yet" };
  if (!line.isFinal) return { result: LEG.PENDING, actual: null, note: `game is ${line.status ?? "not final"}` };

  const homeRuns = Number(line.homeRuns), awayRuns = Number(line.awayRuns);
  if (!Number.isFinite(homeRuns) || !Number.isFinite(awayRuns)) {
    return { result: LEG.UNAVAILABLE, actual: null, note: "the linescore carries no final runs" };
  }
  const parts = String(matchup ?? "").split(/\s+@\s+/);
  const awayName = norm(parts[0]), homeName = norm(parts[1]);
  const sel = String(selection ?? "");

  if (marketKey === "mlb_moneyline") {
    const team = norm(sel.replace(/\s+to win$/i, ""));
    if (!team) return { result: LEG.UNAVAILABLE, actual: null, note: `cannot read a team from "${sel}"` };
    const picked = team === homeName ? "home" : team === awayName ? "away" : null;
    if (!picked) return { result: LEG.UNAVAILABLE, actual: null, note: `"${sel}" names neither side of ${matchup}` };
    if (homeRuns === awayRuns) return { result: LEG.PUSH, actual: `${awayRuns}-${homeRuns}`, note: "tie" };
    const won = picked === "home" ? homeRuns > awayRuns : awayRuns > homeRuns;
    return { result: won ? LEG.WON : LEG.LOST, actual: `${awayRuns}-${homeRuns}`, note: "" };
  }

  if (marketKey === "mlb_total_runs") {
    const m = sel.match(/^(over|under)\s+([\d.]+)$/i);
    if (!m) return { result: LEG.UNAVAILABLE, actual: null, note: `cannot read a total from "${sel}"` };
    const total = homeRuns + awayRuns;
    const l = Number(m[2]);
    if (total === l) return { result: LEG.PUSH, actual: total, note: "landed on the number" };
    const over = m[1].toLowerCase() === "over";
    return { result: (total > l) === over ? LEG.WON : LEG.LOST, actual: total, note: "" };
  }

  if (marketKey === "mlb_run_line") {
    const m = sel.match(/^(.+?)\s+([+-][\d.]+)$/);
    if (!m) return { result: LEG.UNAVAILABLE, actual: null, note: `cannot read a run line from "${sel}"` };
    const team = norm(m[1]), handicap = Number(m[2]);
    const picked = team === homeName ? "home" : team === awayName ? "away" : null;
    if (!picked) return { result: LEG.UNAVAILABLE, actual: null, note: `"${sel}" names neither side of ${matchup}` };
    const margin = (picked === "home" ? homeRuns - awayRuns : awayRuns - homeRuns) + handicap;
    if (margin === 0) return { result: LEG.PUSH, actual: `${awayRuns}-${homeRuns}`, note: "landed on the number" };
    return { result: margin > 0 ? LEG.WON : LEG.LOST, actual: `${awayRuns}-${homeRuns}`, note: "" };
  }

  return { result: LEG.UNAVAILABLE, actual: null, note: `market ${marketKey} has no team-market rule` };
}
