/**
 * MLB PROVIDER EVENT ALIAS RECEIPTS (MLB Department, 2026-10-05). Pure, no I/O.
 *
 * Before #984 the pregame capture stamped odds events onto games by team pair only, so a settlement-join file
 * for game G can hold market rows whose providerEventId is not G's own: the next day's series game, the other
 * half of a doubleheader, or (most rows) the same game under a second provider id. Research's lineage loader
 * excludes every such foreign row by default and admits one only through a receipt written here.
 *
 * A receipt `foreignProviderEventId → gamePk` is written only when ALL of these hold, from recorded data only:
 *   1. the foreign event's own provider record (teams + commence time, never the stamped gamePk) is known and
 *      consistent across every capture that saw it;
 *   2. it is not the own event of another game's join file;
 *   3. game G is on that date's StatsAPI board and no other game between the same two clubs is on that board
 *      (no doubleheader that day);
 *   4. the #984 matcher, at a 30-minute tolerance against that board, returns exactly G (same home and away
 *      clubs, scheduled start within 30 minutes);
 *   5. every join file that holds the foreign id agrees on the same G;
 *   6. a second, independent source confirms it: the provider's own daily event listing for that date
 *      (app/public/data/mlb/schedule/<date>.json) lists that exact id with the same home and away clubs and a
 *      start within 30 minutes of G (founder decision 2026-10-06: "Strict 74"; an id the listing does not show is
 *      refused, never inferred from name/time similarity).
 * Anything else is refused with a reason. Nothing is guessed, and no archive row is edited or re-joined.
 */
import { matchEventToGamePk } from "./event-game-match.mjs";

export const ALIAS_TOLERANCE_MINUTES = 30;
export const ALIAS_SCHEMA_VERSION = "mlb-provider-event-aliases-1";

export const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const pairKey = (a, b) => [norm(a), norm(b)].sort().join("|");
const ET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
/** The ET calendar date (the board's date) of a zoned instant. */
export const etDate = (iso) => ET.format(new Date(iso));

/**
 * Fold provider records into one entry per providerEventId. An id seen with two different start times or team
 * pairs is marked inconsistent (and is never aliased).
 * @param {Iterable<{ providerEventId?: string, eventStartTime?: string, homeTeam?: string, awayTeam?: string }>} records
 * @param {Map<string, { start: string, home: string, away: string, inconsistent?: boolean }>} [index]
 */
export function indexProviderEvents(records, index = new Map()) {
  for (const r of records) {
    const id = r?.providerEventId;
    if (!id || !r.eventStartTime || !r.homeTeam || !r.awayTeam) continue;
    const prev = index.get(id);
    if (!prev) { index.set(id, { start: r.eventStartTime, home: r.homeTeam, away: r.awayTeam }); continue; }
    if (Date.parse(prev.start) !== Date.parse(r.eventStartTime) || norm(prev.home) !== norm(r.homeTeam) || norm(prev.away) !== norm(r.awayTeam)) prev.inconsistent = true;
  }
  return index;
}

/**
 * @param {{
 *   joinFiles: { file: string, date: string, gamePk: number, providerEventId: string, foreignRows: Record<string, number> }[],
 *   events: Map<string, { start: string, home: string, away: string, inconsistent?: boolean }>,
 *   boards: Map<string, { gamePk: number, away: string, home: string, commenceTime: string }[]>,
 * }} input
 */
export function buildProviderEventAliases({ joinFiles, events, boards, listings = new Map() }) {
  // Every gamePk whose join file names this id as its own event. More than one means the id was stamped onto
  // two games, so it proves neither.
  const ownersOf = new Map();
  for (const j of joinFiles) if (j.providerEventId) ownersOf.set(j.providerEventId, (ownersOf.get(j.providerEventId) ?? new Set()).add(j.gamePk));
  // Distinct provider start times per ET date and club pair. A reissued id for the same game shares its start;
  // two starts more than the tolerance apart on one date mean a doubleheader (or a moved game): refused.
  const startsByDatePair = new Map();
  for (const ev of events.values()) {
    if (ev.inconsistent) continue;
    const k = `${etDate(ev.start)}|${pairKey(ev.away, ev.home)}`;
    const list = startsByDatePair.get(k) ?? [];
    if (!list.some((t) => Math.abs(t - Date.parse(ev.start)) <= ALIAS_TOLERANCE_MINUTES * 60e3)) list.push(Date.parse(ev.start));
    startsByDatePair.set(k, list);
  }

  /** Does provider event `id` provably belong to join file `j`'s game? → { ok: true, ev, game } or { reason }. */
  const verify = (id, j, { requireListing = false } = {}) => {
    if ([...(ownersOf.get(id) ?? [])].some((pk) => pk !== j.gamePk)) return { reason: "OWNED_BY_ANOTHER_GAME" };
    const ev = events.get(id);
    if (!ev) return { reason: "NO_PROVIDER_RECORD" };
    if (ev.inconsistent) return { reason: "INCONSISTENT_PROVIDER_RECORD" };
    const board = boards.get(j.date);
    const game = board?.find((g) => g.gamePk === j.gamePk);
    if (!game) return { reason: "NOT_ON_BOARD" };
    if (board.filter((g) => pairKey(g.away, g.home) === pairKey(game.away, game.home)).length > 1) return { reason: "DOUBLEHEADER" };
    if ((startsByDatePair.get(`${j.date}|${pairKey(game.away, game.home)}`) ?? []).length > 1) return { reason: "DOUBLEHEADER" };
    const m = matchEventToGamePk({ away: ev.away, home: ev.home, commenceTime: ev.start }, board, { norm, toleranceMinutes: ALIAS_TOLERANCE_MINUTES });
    if (m.reason === "NO_EVENT_TIME") return { reason: "NO_EVENT_TIME" };
    if (m.reason !== "MATCHED") return { reason: "NOT_WITHIN_30_MIN_SAME_CLUBS" };
    if (m.gamePk !== j.gamePk) return { reason: "MATCHES_ANOTHER_GAME" };
    if (requireListing) {
      const listed = (listings.get(j.date) ?? []).find((l) => l.id === id);
      const confirms = listed && norm(listed.away) === norm(game.away) && norm(listed.home) === norm(game.home)
        && Math.abs(Date.parse(listed.commenceTime) - Date.parse(game.commenceTime)) <= ALIAS_TOLERANCE_MINUTES * 60e3;
      if (!confirms) return { reason: "NOT_CONFIRMED_BY_PROVIDER_DAILY_LISTING" };
      return { ok: true, ev, game, listed };
    }
    return { ok: true, ev, game };
  };

  /** @type {Map<string, { gamePks: Set<number>, evidence: object[], refusals: Set<string>, rows: number }>} */
  const byId = new Map();
  const refusedRows = {};
  // Join files whose OWN providerEventId cannot be verified as their game (e.g. 2026-09-19/824545, stamped with
  // the next day's event). Reported for Research, never corrected here.
  const ownEventUnverified = [];

  for (const j of joinFiles) {
    const own = j.providerEventId ? verify(j.providerEventId, j) : { ok: true }; // no own event: no rows to vouch for
    if (!own.ok) ownEventUnverified.push({ joinFile: j.file, gamePk: j.gamePk, ownProviderEventId: j.providerEventId, reason: own.reason });
    for (const [id, rows] of Object.entries(j.foreignRows)) {
      const slot = byId.get(id) ?? { gamePks: new Set(), evidence: [], refusals: new Set(), rows: 0 };
      byId.set(id, slot);
      slot.rows += rows;
      const v = verify(id, j, { requireListing: true });
      if (!v.ok) { slot.refusals.add(v.reason); continue; }
      slot.gamePks.add(j.gamePk);
      slot.evidence.push({
        joinFile: j.file, date: j.date, rows,
        providerEvent: { awayTeam: v.ev.away, homeTeam: v.ev.home, commenceTime: v.ev.start },
        scheduledGame: { gamePk: v.game.gamePk, awayTeam: v.game.away, homeTeam: v.game.home, gameDate: v.game.commenceTime },
        providerDailyListing: { file: `app/public/data/mlb/schedule/${j.date}.json`, awayTeam: v.listed.away, homeTeam: v.listed.home, commenceTime: v.listed.commenceTime },
        startDeltaMinutes: Math.round(Math.abs(Date.parse(v.ev.start) - Date.parse(v.game.commenceTime)) / 60e3),
        gamesBetweenClubsOnDate: 1,
      });
    }
  }

  const aliases = [];
  const refused = [];
  for (const [id, s] of [...byId.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const reasons = [...s.refusals];
    if (s.gamePks.size > 1) reasons.push("CONFLICTING_GAMES");
    if (reasons.length === 0 && s.gamePks.size === 1) {
      aliases.push({ foreignProviderEventId: id, gamePk: [...s.gamePks][0], rows: s.rows, evidence: s.evidence });
    } else {
      // One refusal anywhere refuses the id everywhere: an id is admitted only when every file agrees.
      const reason = reasons.sort()[0];
      refusedRows[reason] = (refusedRows[reason] ?? 0) + s.rows;
      refused.push({ foreignProviderEventId: id, rows: s.rows, reasons: reasons.sort() });
    }
  }
  const aliasedRows = aliases.reduce((n, a) => n + a.rows, 0);
  return {
    aliases, refused, ownEventUnverified,
    summary: { foreignEventIds: byId.size, aliased: aliases.length, aliasedRows, refused: refused.length, refusedRowsByFirstReason: refusedRows, joinFilesWithUnverifiedOwnEvent: ownEventUnverified.length },
  };
}
