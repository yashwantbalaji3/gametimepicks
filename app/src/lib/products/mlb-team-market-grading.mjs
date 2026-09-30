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
import { resolveGamePks } from "../game-simulations/mlb-generator.ts";

export const TEAM_MARKETS = Object.freeze(["mlb_moneyline", "mlb_total_runs", "mlb_run_line"]);
export const isTeamMarket = (m) => TEAM_MARKETS.includes(String(m));

/** Canonical market key out of a leg id: `MLB:<gameId>:mlb_moneyline:Seattle_Mariners_to_win`. */
export function teamMarketKeyOf(leg) {
  const parts = String(leg?.id ?? leg?.legId ?? "").split(":");
  return parts.find((p) => TEAM_MARKETS.includes(p)) ?? null;
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * The odds provider's event id a team leg was built on. The daily portfolio writes it as `eventId`;
 * a settled receipt keeps only `id` = `MLB:<eventId>:<market>:<selection>`.
 */
export function legEventIdOf(leg) {
  if (leg?.eventId) return String(leg.eventId);
  const parts = String(leg?.id ?? leg?.legId ?? "").split(":");
  return parts.length >= 3 && parts[0] === "MLB" && parts[1] ? parts[1] : null;
}

/**
 * PROVE WHICH GAME A TEAM LEG WAS ON, from the slate's own committed artifacts (2026-09-23).
 *
 * A doubleheader shares teams and date, so the team+date join below cannot tell its games apart. The
 * slate already can: the odds schedule (`mlb/schedule/<D>.json`) lists one provider event per game with
 * its commence time, and the board's StatsAPI schedule (`mlb/boards/<D>.json` games[]) lists one gamePk
 * per game with its scheduled start. `resolveGamePks` — the MLB generator's doubleheader-safe identity
 * owner — pairs the two by a strict, tie-free time-order bijection or fails closed. This reuses it;
 * there is no second resolver.
 *
 * @param {object} leg
 * @param {{schedule?: object[]|null, board?: {games?: object[], leans?: object[]}|null}} slate
 * @returns {undefined | {gamePk: number|null, resolved: boolean, method: string, doubleheader: boolean}}
 *   `undefined` when the slate artifacts are absent — the caller then keeps the legacy join exactly.
 */
export function resolveLegGameIdentity(leg, slate) {
  /* F3 (Session 1B): a receipt written after 2026-09-30 carries the gamePk its settlement proved. That is
     the strongest identity there is — it needs no re-pairing, and it still works after the slate's
     schedule artifacts have aged out. A legacy receipt (no gamePk) falls through to the slate proof. */
  const stored = Number(leg?.gamePk);
  if (Number.isInteger(stored) && stored > 0) return { gamePk: stored, resolved: true, method: "receipt-gamePk", doubleheader: false };
  const events = Array.isArray(slate?.schedule) ? slate.schedule : [];
  const boardGames = Array.isArray(slate?.board?.games) ? slate.board.games : [];
  const leans = Array.isArray(slate?.board?.leans) ? slate.board.leans : [];
  if (!events.length && !boardGames.length) return undefined;

  const eventId = legEventIdOf(leg);
  const [away, home] = String(leg?.matchup ?? "").split(/\s+@\s+/);
  const pair = `${norm(away)}@${norm(home)}`;
  const pairOf = (a, h) => `${norm(a)}@${norm(h)}`;

  // One identity group per provider event of the slate (first-seen order), named by full team names —
  // the same names the linescore join already requires to be equal.
  const groups = [];
  const seen = new Set();
  const leanPk = new Map();
  for (const l of leans) if (l?.gameId && l.gamePk != null && !leanPk.has(l.gameId)) leanPk.set(l.gameId, Number(l.gamePk));
  for (const e of events) {
    if (!e?.gameId || seen.has(e.gameId)) continue;
    seen.add(e.gameId);
    groups.push({ gameId: e.gameId, awayTeamAbbr: e.away, homeTeamAbbr: e.home, commenceTime: e.commenceTime, leanGamePk: leanPk.get(e.gameId) });
  }
  const scheduleGames = boardGames.map((g) => ({ gamePk: Number(g.gamePk), awayTeamAbbr: g.awayTeamName, homeTeamAbbr: g.homeTeamName, gameDate: g.gameDate }));

  const doubleheader = scheduleGames.filter((g) => pairOf(g.awayTeamAbbr, g.homeTeamAbbr) === pair).length > 1
    || groups.filter((g) => pairOf(g.awayTeamAbbr, g.homeTeamAbbr) === pair).length > 1;

  const mine = eventId ? groups.find((g) => g.gameId === eventId) : null;
  if (!mine || pairOf(mine.awayTeamAbbr, mine.homeTeamAbbr) !== pair) {
    // The leg's event is not on the slate (or names another matchup): nothing proves its game.
    return { gamePk: null, resolved: false, method: eventId ? "event-not-on-slate" : "leg-has-no-event-id", doubleheader };
  }
  const r = resolveGamePks(groups, scheduleGames).get(eventId);
  if (!r || !r.resolved || r.gamePk == null) return { gamePk: null, resolved: false, method: r?.method ?? "unresolved", doubleheader };
  return { gamePk: Number(r.gamePk), resolved: true, method: r.method, doubleheader };
}

/**
 * Find the one linescore for this leg's game.
 *
 * `identity` (optional, from `resolveLegGameIdentity`):
 *   · absent                      → the team+date join, unchanged.
 *   · a proven gamePk             → the row(s) carrying THAT gamePk on the date, and only those. The row
 *                                   must name the leg's teams; a Postponed stub of the same gamePk is
 *                                   not a result, so exactly one FINAL row wins, two finals refuse.
 *                                   With no final on the date, exactly one LATER final of the same
 *                                   gamePk (`makeup`) is the postponed game's makeup and grades it (F3).
 *   · unproven on a doubleheader  → refused, even when the final-only cache shows a single row (the
 *                                   twin may simply not be final).
 *   · unproven otherwise          → the team+date join, unchanged.
 *
 * @returns {{ok: true, line: object} | {ok: false, reason: string}}
 */
export function findLinescore(leg, linescores, dateEt, identity, { makeup = [] } = {}) {
  const matchup = String(leg?.matchup ?? "");
  const m = matchup.split(/\s+@\s+/);
  if (m.length !== 2) return { ok: false, reason: `leg matchup "${matchup}" is not "away @ home"` };
  const [away, home] = m.map(norm);

  const sameDay = (linescores ?? []).filter((l) => !dateEt || l.officialDate === dateEt);

  if (identity && identity.gamePk != null) {
    const pk = Number(identity.gamePk);
    const rows = sameDay.filter((l) => Number(l.gamePk) === pk);
    const foreign = rows.find((l) => norm(l.homeTeam) !== home || norm(l.awayTeam) !== away);
    if (foreign) return { ok: false, reason: `gamePk ${pk} is ${foreign.awayTeam} @ ${foreign.homeTeam} in the linescore cache — contradicts the leg's ${matchup}; held` };
    const finals = rows.filter((l) => l.isFinal);
    if (finals.length > 1) return { ok: false, reason: `${rows.length} linescore rows carry gamePk ${pk} on ${dateEt} (${finals.length} final) — cannot tell which is the result; held` };
    if (finals.length === 1) return { ok: true, line: finals[0] };
    /*
     * POSTPONED → MAKEUP (founder decision F3, Session 1B). Rescheduling does not void a leg: when the
     * PROVEN gamePk has no final on the leg's date, the same gamePk's final on a LATER date is the same
     * canonical event, and it grades the leg. Only by gamePk — never by teams + date — and only when
     * exactly one later final carries it and names the leg's teams. Anything else holds the leg.
     */
    const later = (makeup ?? []).filter((l) => Number(l.gamePk) === pk && l.isFinal && (!dateEt || String(l.officialDate) > dateEt));
    const laterForeign = later.find((l) => norm(l.homeTeam) !== home || norm(l.awayTeam) !== away);
    if (laterForeign) return { ok: false, reason: `gamePk ${pk}'s makeup on ${laterForeign.officialDate} is ${laterForeign.awayTeam} @ ${laterForeign.homeTeam} — contradicts the leg's ${matchup}; held` };
    const laterDates = [...new Set(later.map((l) => l.officialDate))];
    if (later.length === 1) return { ok: true, line: later[0], makeupOf: dateEt };
    if (later.length > 1) return { ok: false, reason: `gamePk ${pk} has ${later.length} later finals (${laterDates.join(", ")}) — cannot tell which is the makeup; held` };
    if (rows.length === 1) return { ok: true, line: rows[0] };   // one non-final row: the grader holds it with its status
    if (rows.length === 0) return { ok: false, reason: `no linescore for gamePk ${pk} (${matchup}) on ${dateEt ?? "any date"} or a later makeup` };
    return { ok: false, reason: `${rows.length} linescore rows carry gamePk ${pk} on ${dateEt} (0 final) — cannot tell which is the result; held` };
  }
  if (identity && identity.doubleheader) {
    return { ok: false, reason: `${matchup} is a doubleheader on ${dateEt} and the leg's game could not be proven (${identity.method}) — held, not guessed` };
  }

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
