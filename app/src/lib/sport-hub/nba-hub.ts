/**
 * NBA hub adapter (Session 6 · NBA factual shell) — schedule and finals only, no forecast.
 *
 * NBA is `HISTORICAL_ONLY` in the capability registry and no NBA model has cleared its preregistered
 * bars (`docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md`), so this adapter publishes FACTS: who plays,
 * when, the season phase, and — once the finals record holds it — the official final. Every row's `read`
 * is null by construction; there is no code path here that could attach a probability.
 *
 * Owners, never re-derived:
 *   schedule   public/data/nba/schedule/latest.json     (ESPN scoreboard capture, sport-schedules.yml)
 *   finals     public/data/nba/results/finals-<season>.json (write-once finals record, finals-record.mjs)
 * A game that has started but is not in the finals record says "started or final" — never a score, never
 * "final" — because only the record may say a game is over.
 */
import fs from "node:fs";
import path from "node:path";

import { DEFAULT_LABELS, hubStatusWord, type HubGameRow, type SportHubModel } from "./contract";
import { finalFor, nbaSeasonLabel, etDateOf } from "@/lib/sports/nba/finals-record.mjs";
import { espnTeamById } from "@/lib/sports/nba/roster-contract.mjs";

const ET = "America/New_York";
const DAY = 86_400_000;
/** Days ahead the hub lists, and days back it keeps a started game on the page. */
export const NBA_HUB_AHEAD_DAYS = 7;
export const NBA_HUB_BEHIND_DAYS = 3;

/* NBA UI parity (2026-10-22): the official forecast (Elo side + player medians) publishes on each game day before
   tip-off, so a regular-season game without one in this build has none YET — "model in validation" read as "never". */
export const NBA_NO_FORECAST_NOTE = "Official Forecast publishes on game day, before tip-off";
export const NBA_PRESEASON_NOTE = "Preseason — no forecast published";
/** A game the NBA experimental public lane covers (preregistration §13): the row points at it, never claims validation. */
export const NBA_LANE_NOTE = "Official Forecast on today's card above";

type Side = { abbr?: string | null; name?: string | null; providerTeamId?: string | number | null };
type ScheduleRow = { providerEventId?: string; dateUtc?: string; statusRaw?: string | null; seasonType?: number | null; home?: Side | null; away?: Side | null };
type ScheduleCapture = { generatedAt?: string; rows?: ScheduleRow[] } | null;
type FinalsRecord = { finals?: Array<Record<string, any>>; conflicts?: unknown[]; updatedAt?: string } | null;

/** An NBA side we can name by ESPN team id. Placeholder ("TBD") and exhibition sides keep their text. */
function sideOf(s: Side | null | undefined): { label: string; team: ReturnType<typeof espnTeamById> } | null {
  if (!s) return null;
  const team = s.providerTeamId != null ? espnTeamById(String(s.providerTeamId)) : null;
  const label = team ? team.canonicalTricode : (s.abbr ?? "").trim();
  if (!label || /^tbd$/i.test(label)) return null;
  return { label, team };
}

const startLabel = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: ET })} · `
    + `${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: ET })} ET`;
};
const shortDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: ET });

const latestStamp = (...stamps: unknown[]): string | null => {
  const real = stamps.filter((x): x is string => typeof x === "string" && Number.isFinite(Date.parse(x)));
  return real.length ? real.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a)) : null;
};

/** Pure builder — every input passed in, so the page and the tests read the same function. */
export function nbaHubFrom({ nowIso, schedule, finals, laneIds = null }: { nowIso: string; schedule: ScheduleCapture; finals: FinalsRecord; laneIds?: ReadonlySet<string> | null }): SportHubModel {
  const now = Date.parse(nowIso);
  const lo = now - NBA_HUB_BEHIND_DAYS * DAY, hi = now + NBA_HUB_AHEAD_DAYS * DAY;
  let unidentified = 0;
  const rows: HubGameRow[] = [];
  for (const r of schedule?.rows ?? []) {
    const t = Date.parse(r.dateUtc ?? "");
    if (!r.providerEventId || !Number.isFinite(t) || t < lo || t > hi) continue;
    const home = sideOf(r.home), away = sideOf(r.away);
    if (!home || !away) { unidentified++; continue; }    // a "TBD @ TBD" placeholder is not a game yet
    const started = t <= now;
    const fin = finalFor(finals, r.providerEventId);
    const isFinal = fin.state === "FINAL" || fin.state === "FINAL_UNDER_REVIEW";
    const raw = String(r.statusRaw ?? "").toUpperCase();
    const status = isFinal ? "final"
      : /POSTPONED|CANCELED|CANCELLED/.test(raw) ? hubStatusWord("POSTPONED", started)
      : hubStatusWord(started ? "STARTED" : "SCHEDULED", started);
    const preseason = r.seasonType === 1;
    const reportNote = isFinal
      ? `${away.label} ${fin.ftAway} – ${home.label} ${fin.ftHome}${fin.state === "FINAL_UNDER_REVIEW" ? " (under review)" : ""}`
      : started ? "Final not recorded yet"
      : preseason ? NBA_PRESEASON_NOTE
      : laneIds?.has(String(r.providerEventId)) ? NBA_LANE_NOTE : NBA_NO_FORECAST_NOTE;
    rows.push({
      id: r.providerEventId,
      startUtc: r.dateUtc!,
      startLabel: startLabel(r.dateUtc!),
      matchup: `${away.label} @ ${home.label}${preseason ? " · preseason" : ""}`,
      status,
      started: started || isFinal,
      read: null,
      reportState: "NONE",
      reportHref: null,
      reportNote,
      participants: [away, home].map((s) => ({ name: s.label, logoTeam: s.team ? s.team.espnAbbr : null, logoSport: s.team ? ("nba" as const) : null })),
      separator: "@",
    });
  }
  /*
   * ⚠ A FINAL THE SCHEDULE NO LONGER CARRIES (2026-10-03 audit, G1). The schedule capture's window starts at
   * the capture instant, so a game leaves `schedule/latest.json` on the very run that folds its final into
   * the record — the hub, iterating the schedule alone, could never print a final. Games inside the hub's
   * look-back window are therefore also taken from the FINALS RECORD itself, the only owner allowed to say a
   * game is over. Nothing is inferred: a game neither artifact holds is simply absent.
   */
  const listed = new Set(rows.map((r) => r.id));
  for (const f of finals?.finals ?? []) {
    const t = Date.parse(f.dateUtc ?? "");
    if (!f.providerEventId || listed.has(String(f.providerEventId)) || !Number.isFinite(t) || t < lo || t > now) continue;
    const fin = finalFor(finals, f.providerEventId);
    if (fin.state !== "FINAL" && fin.state !== "FINAL_UNDER_REVIEW") continue;
    const sideLabel = (s: Record<string, any> | null | undefined) => (s?.tricode ?? s?.espnAbbr ?? s?.name ?? null) as string | null;
    const awayLabel = sideLabel(f.away), homeLabel = sideLabel(f.home);
    if (!awayLabel || !homeLabel) { unidentified++; continue; }
    const awayTeam = f.away?.providerTeamId != null ? espnTeamById(String(f.away.providerTeamId)) : null;
    const homeTeam = f.home?.providerTeamId != null ? espnTeamById(String(f.home.providerTeamId)) : null;
    const preseason = f.seasonType === 1;
    rows.push({
      id: String(f.providerEventId),
      startUtc: f.dateUtc,
      startLabel: startLabel(f.dateUtc),
      matchup: `${awayLabel} @ ${homeLabel}${preseason ? " · preseason" : ""}`,
      status: "final",
      started: true,
      read: null,
      reportState: "NONE",
      reportHref: null,
      reportNote: `${awayLabel} ${fin.ftAway} – ${homeLabel} ${fin.ftHome}${fin.state === "FINAL_UNDER_REVIEW" ? " (under review)" : ""}`,
      participants: [[awayLabel, awayTeam], [homeLabel, homeTeam]].map(([name, team]) => ({ name: name as string, logoTeam: team ? (team as any).espnAbbr : null, logoSport: team ? ("nba" as const) : null })),
      separator: "@",
    });
  }
  rows.sort((a, b) => Date.parse(a.startUtc!) - Date.parse(b.startUtc!));

  const upcoming = rows.filter((r) => !r.started).sort((a, b) => Date.parse(a.startUtc!) - Date.parse(b.startUtc!));
  const next = upcoming[0];
  const nextIsPreseason = next ? next.matchup.endsWith("· preseason") : false;
  const season = nbaSeasonLabel(etDateOf(nowIso)) ?? "";
  return {
    sport: "nba",
    sportLabel: "NBA",
    labels: { ...DEFAULT_LABELS },
    periodLabel: next ? (nextIsPreseason ? `${season} preseason` : `${season} regular season`) : `${season} season`,
    periodRange: `${shortDay(new Date(lo).toISOString())} – ${shortDay(new Date(hi).toISOString())}`,
    /* The rows come from two artifacts: the schedule capture and the finals record. Since Session 14 the finals record
       refreshes on its own clock (nba-results-refresh), so "updated" is the later of the two real stamps. */
    freshness: latestStamp(schedule?.generatedAt, finals?.updatedAt),
    rows,
    present: ["games", "results"],
    emptyReason: `No NBA games in the next ${NBA_HUB_AHEAD_DAYS} days on the published schedule.`,
    identityReconciliation: { unidentifiedScheduleRows: unidentified, laterPeriodRows: 0 },
  };
}

function readJson<T>(rel: string): T | null {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", rel), "utf8")) as T; } catch { return null; }
}

/** The page's loader: the committed schedule capture and this season's finals record. */
export function nbaHub(nowIso: string, laneIds: ReadonlySet<string> | null = null): SportHubModel {
  const season = nbaSeasonLabel(etDateOf(nowIso));
  return nbaHubFrom({
    nowIso,
    laneIds,
    schedule: readJson<ScheduleCapture>("nba/schedule/latest.json"),
    finals: season ? readJson<FinalsRecord>(`nba/results/finals-${season}.json`) : null,
  });
}

/* ── TODAY'S SLATE (NBA UI parity, founder directive 2026-10-22) ─────────────────────────────────────────────────────
   One view of the build's ET day, read by BOTH the /nba hub's matchup cards and the homepage NBA lane, so the two can
   never disagree. Facts come from the same owners as the hub above (schedule capture, finals record); the OFFICIAL
   side comes only from the current experimental-lane snapshot (Elo favoured side — the one official game call; team
   scores, chances, ranges and prices stay withheld and have no field here), and a Theater link only from the ids the
   /nba/simulation route builds (public-route publicTheaterRouteIds). Nothing is inferred: a game with no lane entry
   has no favoured side, a game with no built page has no href. */

/** The slice of the lane snapshot this view reads (components/nba/experimental-lane.tsx Snapshot). */
export type NbaLaneLike = {
  date: string | null;
  generatedAt?: string | null;
  games: Array<{
    providerEventId: string; tipUtc: string; frozenAt: string;
    away: { abbr: string | null; name: string | null }; home: { abbr: string | null; name: string | null };
    receipt: { modelVersion: string };
    elo: { favoured: string | null };
    players: { away: unknown[]; home: unknown[] };
  }>;
  excluded?: Array<{ providerEventId: string; reason: string }>;
} | null;

export type NbaTodayTeam = { abbr: string; name: string | null; logoTeam: string | null };
export type NbaTodayGame = {
  id: string;
  tipUtc: string;
  /** "7:00 PM ET" */
  tipLabel: string;
  away: NbaTodayTeam;
  home: NbaTodayTeam;
  /** Build-time lifecycle from the committed record only; "upcoming" is advanced to "started" on the reader's clock. */
  status: "upcoming" | "final" | "postponed";
  /** The recorded final ("CLE 101 – PHI 99"), only when the finals record holds it. */
  finalNote: string | null;
  /** The OFFICIAL favoured side (Elo) — only when the current lane snapshot carries this game. */
  favoured: { abbr: string; name: string | null } | null;
  /** The lane's freeze instant for this game, ISO. */
  frozenAt: string | null;
  /** Players on the official board for this game (both teams). */
  players: number | null;
  /** Why the lane has no forecast for a listed game (its own excluded reason), when it says so. */
  excludedReason: string | null;
  /** /nba/simulation/<id>/ — ONLY when that page is built. */
  theaterHref: string | null;
};
/**
 *   PUBLISHED  today has games and the current lane snapshot covers today's slate
 *   PENDING    today has games; today's official forecast is not in this build (it freezes before tip-off)
 *   NO_GAMES   nothing on the published schedule today
 *   DISABLED   the lane's rollback switch is off — schedule and finals only
 */
export type NbaForecastState = "PUBLISHED" | "PENDING" | "NO_GAMES" | "DISABLED";
export type NbaTodaySlate = {
  date: string;
  /** "Thu, Oct 22" */
  dateLabel: string;
  games: NbaTodayGame[];
  forecast: NbaForecastState;
  /** The latest freeze instant among today's official forecasts, ISO. */
  frozenAt: string | null;
  modelVersion: string | null;
  /** The first game after today on the published schedule (an off-day's pointer). */
  next: { tipUtc: string; label: string; matchup: string } | null;
  /** The schedule/finals/lane stamp the slate was built from (latest real one), ISO. */
  updatedAt: string | null;
};

const tipLabelOf = (iso: string) => `${new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: ET })} ET`;
const dayLabelOf = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export function nbaTodaySlateFrom({ nowIso, schedule, finals, lane, laneEnabled = true, theaterIds = [] }: {
  nowIso: string; schedule: ScheduleCapture; finals: FinalsRecord; lane: NbaLaneLike; laneEnabled?: boolean; theaterIds?: readonly string[];
}): NbaTodaySlate {
  const date = etDateOf(nowIso) as string;
  const laneToday = laneEnabled && lane && lane.date === date ? lane : null;
  const laneById = new Map((laneToday?.games ?? []).map((g) => [String(g.providerEventId), g]));
  const excluded = new Map((laneToday?.excluded ?? []).map((x) => [String(x.providerEventId), x.reason]));
  const built = new Set(theaterIds.map(String));
  const games: NbaTodayGame[] = [];
  const seen = new Set<string>();
  const teamOf = (s: Side | null | undefined, laneSide: { abbr: string | null; name: string | null } | undefined): NbaTodayTeam | null => {
    const id = sideOf(s);
    if (!id) return laneSide?.abbr ? { abbr: laneSide.abbr, name: laneSide.name ?? null, logoTeam: null } : null;
    return { abbr: id.label, name: s?.name ?? laneSide?.name ?? null, logoTeam: id.team ? id.team.espnAbbr : null };
  };
  const push = (id: string, tipUtc: string, away: NbaTodayTeam, home: NbaTodayTeam, statusRaw: string) => {
    const fin = finalFor(finals, id);
    const isFinal = fin.state === "FINAL" || fin.state === "FINAL_UNDER_REVIEW";
    const lg = laneById.get(id);
    const fav = lg?.elo.favoured ?? null;
    games.push({
      id, tipUtc, tipLabel: tipLabelOf(tipUtc), away, home,
      status: isFinal ? "final" : /POSTPONED|CANCELED|CANCELLED/.test(statusRaw.toUpperCase()) ? "postponed" : "upcoming",
      finalNote: isFinal ? `${away.abbr} ${fin.ftAway} – ${home.abbr} ${fin.ftHome}${fin.state === "FINAL_UNDER_REVIEW" ? " (under review)" : ""}` : null,
      favoured: fav ? { abbr: fav, name: fav === lg?.home.abbr ? lg.home.name : fav === lg?.away.abbr ? lg.away.name : null } : null,
      frozenAt: lg?.frozenAt ?? null,
      players: lg ? lg.players.away.length + lg.players.home.length : null,
      excludedReason: excluded.get(id) ?? null,
      theaterHref: built.has(id) ? `/nba/simulation/${id}/` : null,
    });
    seen.add(id);
  };
  for (const r of schedule?.rows ?? []) {
    if (!r.providerEventId || !r.dateUtc || etDateOf(r.dateUtc) !== date || seen.has(String(r.providerEventId))) continue;
    const lg = laneById.get(String(r.providerEventId));
    const away = teamOf(r.away, lg?.away), home = teamOf(r.home, lg?.home);
    if (!away || !home) continue;
    push(String(r.providerEventId), r.dateUtc, away, home, String(r.statusRaw ?? ""));
  }
  // A game already folded into the finals record can leave the schedule capture (see G1 above): take it from the record.
  for (const f of finals?.finals ?? []) {
    const id = String(f.providerEventId ?? "");
    if (!id || seen.has(id) || etDateOf(f.dateUtc) !== date) continue;
    const away = teamOf(f.away ? { ...f.away, abbr: f.away.tricode ?? f.away.espnAbbr ?? f.away.abbr } : null, undefined);
    const home = teamOf(f.home ? { ...f.home, abbr: f.home.tricode ?? f.home.espnAbbr ?? f.home.abbr } : null, undefined);
    if (away && home) push(id, f.dateUtc, away, home, "");
  }
  // A frozen official forecast is never dropped because the schedule capture missed its game.
  for (const g of laneToday?.games ?? []) {
    const id = String(g.providerEventId);
    if (seen.has(id) || !g.away.abbr || !g.home.abbr) continue;
    push(id, g.tipUtc, { abbr: g.away.abbr, name: g.away.name, logoTeam: null }, { abbr: g.home.abbr, name: g.home.name, logoTeam: null }, "");
  }
  games.sort((a, b) => Date.parse(a.tipUtc) - Date.parse(b.tipUtc) || a.id.localeCompare(b.id));

  const nextRow = (schedule?.rows ?? [])
    .filter((r) => r.dateUtc && (etDateOf(r.dateUtc) ?? "") > date && sideOf(r.home) && sideOf(r.away))
    .sort((a, b) => Date.parse(a.dateUtc!) - Date.parse(b.dateUtc!))[0];
  const covered = games.filter((g) => g.favoured);
  const frozen = covered.map((g) => g.frozenAt).filter((x): x is string => !!x).sort();
  return {
    date,
    dateLabel: dayLabelOf(date),
    games,
    forecast: !laneEnabled ? "DISABLED" : games.length === 0 ? "NO_GAMES" : laneToday && laneToday.games.length ? "PUBLISHED" : "PENDING",
    frozenAt: frozen.at(-1) ?? null,
    modelVersion: laneToday?.games[0]?.receipt.modelVersion ?? null,
    next: nextRow ? { tipUtc: nextRow.dateUtc!, label: startLabel(nextRow.dateUtc!), matchup: `${sideOf(nextRow.away)!.label} @ ${sideOf(nextRow.home)!.label}` } : null,
    updatedAt: latestStamp(schedule?.generatedAt, finals?.updatedAt, laneToday?.generatedAt),
  };
}

/** The page/homepage loader: the same committed files nbaHub reads, plus the caller's lane snapshot and built Theater ids. */
export function nbaTodaySlate(nowIso: string, lane: NbaLaneLike, { laneEnabled = true, theaterIds = [] as readonly string[] } = {}): NbaTodaySlate {
  const season = nbaSeasonLabel(etDateOf(nowIso));
  return nbaTodaySlateFrom({
    nowIso, lane, laneEnabled, theaterIds,
    schedule: readJson<ScheduleCapture>("nba/schedule/latest.json"),
    finals: season ? readJson<FinalsRecord>(`nba/results/finals-${season}.json`) : null,
  });
}
