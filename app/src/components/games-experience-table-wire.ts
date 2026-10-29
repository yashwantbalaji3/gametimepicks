/**
 * The wire form of the /today games table — FILESYSTEM-FREE, imported by the client table and the server page alike.
 *
 * The client table's props are serialized into /today, so the rows travel as one tuple each, with every repeated
 * string (status, note) stored once in `strings` and referenced by index: on the 10-23 slate the same NBA and "can
 * update until the start" notes repeated across ~80 rows. The row id (used only server-side and in tests) is not sent.
 * Lossless for everything the table shows: unpack(pack(rows)) equals rows minus `id` (games-experience-table.test).
 *
 *   [date, startUtc, time, sport, matchup, status#, forecast#, read, note# (-1 = none), eventHref, resultHref]
 */
/* "Degraded inputs" (overnight 10-28): an MLB official snapshot marked degraded — a forecast exists, but it is never
   "Published"/"Frozen" without its qualifier. Appended last so a packed row's state index keeps its meaning. */
export type ForecastState = "Published" | "Frozen" | "Pending" | "Unavailable" | "Degraded inputs";
export interface GamesTableRow {
  id: string;
  date: string;
  startUtc: string | null;
  time: string;
  sport: string;
  sportLabel: string;
  matchup: string;
  status: string;
  forecast: ForecastState;
  /** A published probability (or side) for this event, verbatim from its public owner; null when none is published. */
  read: string | null;
  note: string | null;
  eventHref: string;
  resultHref: string | null;
}
export type ShownRow = Omit<GamesTableRow, "id">;

export type PackedGamesRow = [string, string | null, string, string, string, number, number, string | null, number, string, string | null];
export interface PackedGamesTable { strings: string[]; rows: PackedGamesRow[] }

export const SPORT_LABEL: Record<string, string> = { nfl: "NFL", nba: "NBA", mlb: "MLB", epl: "Premier League", "ligue-1": "Ligue 1", ufc: "UFC" };
export const FORECAST_STATES: readonly ForecastState[] = ["Published", "Frozen", "Pending", "Unavailable", "Degraded inputs"];

export function packGamesTable(rows: GamesTableRow[]): PackedGamesTable {
  const strings: string[] = [];
  const at = new Map<string, number>();
  const ref = (s: string | null) => {
    if (s == null) return -1;
    if (!at.has(s)) { at.set(s, strings.length); strings.push(s); }
    return at.get(s)!;
  };
  return {
    strings,
    rows: rows.map((r): PackedGamesRow => [r.date, r.startUtc, r.time, r.sport, r.matchup, ref(r.status), FORECAST_STATES.indexOf(r.forecast), r.read, ref(r.note), r.eventHref, r.resultHref]),
  };
}

export function unpackGamesTable(t: PackedGamesTable): ShownRow[] {
  return t.rows.map((p) => ({
    date: p[0], startUtc: p[1], time: p[2], sport: p[3], sportLabel: SPORT_LABEL[p[3]] ?? p[3].toUpperCase(), matchup: p[4],
    status: t.strings[p[5]], forecast: FORECAST_STATES[p[6]], read: p[7], note: p[8] < 0 ? null : t.strings[p[8]], eventHref: p[9], resultHref: p[10],
  }));
}
