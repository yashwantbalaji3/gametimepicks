/**
 * RESULTS · NBA OFFICIAL FORECAST vs FINAL (founder mandate 2026-10-24). Pure.
 *
 * For every game in the public NBA lane (app/public/data/nba/experimental-public/<date>.json), the published winner
 * side — the lane's Elo side, the official NBA side (founder N2) — against the committed official final
 * (app/public/data/nba/results/finals-<season>.json, read through finals-record.mjs `finalFor`).
 *
 * WHAT COUNTS AS PUBLISHED BEFORE TIP. The side is the forecast of record only when the game's own `frozenAt` AND the
 * lane file that published it (`generatedAt`) are both before tip. Anything else is NOT_BEFORE_TIP and is never
 * compared — a side stamped after the game started is not a forecast.
 *
 * STATES (one per game):
 *   MATCHED / MISSED   published before tip, final recorded, the side won / lost
 *   PENDING            no official final recorded yet — never a miss
 *   HELD               the final is disputed (finals-record conflict), the release owner holds the event (401901822
 *                      is the standing hold), or the final's home/away teams are not the lane's — never compared
 *                      until it is resolved
 *   NO_SIDE            the lane published no side for the game
 *   NOT_BEFORE_TIP     no evidence the side was published before tip
 * Counts are counts: no percentage below the preregistered minimum (V18 §6: 300 graded games for the winner market).
 */
import { finalFor } from "../sports/nba/finals-record.mjs";
import { canonicalTricodeFromEspnAbbr } from "../sports/nba/boxscore-parse.mjs";

export const NBA_WINNER_MIN_GRADED = 300; // docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md §6, winner/margin/total
export const NBA_STANDING_HOLDS = Object.freeze(["401901822"]);

const ms = (v) => Date.parse(String(v ?? ""));

/**
 * @param {Array<Record<string, any>>} laneDays  lane snapshots (one per ET date)
 * @param {Record<string, any>|null} finals      the finals record
 * @param {{ holds?: Iterable<string> }} [opts]
 */
export function nbaForecastVsActual(laneDays, finals, { holds = NBA_STANDING_HOLDS } = {}) {
  const held = new Set([...holds].map(String));
  const games = [];
  for (const day of laneDays ?? []) {
    for (const g of day?.games ?? []) {
      const id = String(g.providerEventId);
      const tip = ms(g.tipUtc);
      const side = g.elo?.state === "FAVOURED" && g.elo?.favoured ? g.elo.favoured : null;
      /* Compare SIDES, never team codes: the lane writes ESPN-style codes (WSH, NY, GS) and the finals record its
         own tricodes (WAS, NYK, GSW) for the same event id, so a code match would score a correct side as a miss. */
      const sideKey = side && side === g.home?.abbr ? "home" : side && side === g.away?.abbr ? "away" : null;
      const before = Number.isFinite(tip) && ms(g.frozenAt) < tip && ms(day.generatedAt) < tip;
      const f = finalFor(finals, id);
      const base = {
        date: g.etDate ?? day.date, providerEventId: id, away: g.away?.abbr ?? null, home: g.home?.abbr ?? null,
        tipUtc: g.tipUtc ?? null, frozenAt: g.frozenAt ?? null, publishedAt: day.generatedAt ?? null, side,
        final: f.state === "FINAL" || f.state === "FINAL_UNDER_REVIEW"
          ? { away: f.ftAway, home: f.ftHome, winnerSide: f.winnerSide === "home" || f.winnerSide === "away" ? f.winnerSide : null,
              winner: f.winnerSide === "home" ? g.home?.abbr ?? f.home : f.winnerSide === "away" ? g.away?.abbr ?? f.away : null }
          : null,
      };
      /* The final's teams must BE the lane's teams, side for side (ESPN code → canonical tricode, never guessed); a
         swapped or mismatched event is held rather than scored against the wrong team. */
      const sameTeams = !base.final || (canonicalTricodeFromEspnAbbr(g.home?.abbr) === f.home && canonicalTricodeFromEspnAbbr(g.away?.abbr) === f.away);
      let state;
      if (!side || !sideKey) state = "NO_SIDE";
      else if (!before) state = "NOT_BEFORE_TIP";
      else if (held.has(id) || f.state === "FINAL_UNDER_REVIEW" || !sameTeams) state = "HELD";
      else if (f.state !== "FINAL" || !base.final?.winnerSide) state = "PENDING";
      else state = base.final.winnerSide === sideKey ? "MATCHED" : "MISSED";
      games.push({ ...base, state });
    }
  }
  games.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.tipUtc).localeCompare(String(b.tipUtc)) || a.providerEventId.localeCompare(b.providerEventId));
  const counts = { games: games.length, matched: 0, missed: 0, pending: 0, held: 0, noSide: 0, notBeforeTip: 0 };
  for (const g of games) {
    if (g.state === "MATCHED") counts.matched += 1;
    else if (g.state === "MISSED") counts.missed += 1;
    else if (g.state === "PENDING") counts.pending += 1;
    else if (g.state === "HELD") counts.held += 1;
    else if (g.state === "NO_SIDE") counts.noSide += 1;
    else counts.notBeforeTip += 1;
  }
  const graded = counts.matched + counts.missed;
  return { games, counts: { ...counts, graded }, minGraded: NBA_WINNER_MIN_GRADED, belowMinimum: graded < NBA_WINNER_MIN_GRADED };
}
