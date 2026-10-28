/**
 * Rows for the cross-sport games table on /today (gap 3, 2026-10-23). SERVER ONLY.
 *
 * The schedule and each event's state come from the ONE cross-sport day selector, lib/simulate/day-view (the rows
 * /simulate renders, read per sport from each sport's own owner). This adds, per event, whether an Official Forecast
 * is published and — only where the sport already shows one publicly for that exact event — its probability:
 *
 *   NFL  nfl/index.json winProbability (the number the NFL hub and the game page print), by provider event id
 *   EPL  the published forecast row's home/draw/away probabilities (the match page's own numbers), by event id
 *   NBA  the frozen Official Forecast snapshot for the date (the Elo winner side; it publishes no probability)
 *   MLB / UFC  forecast status only: MLB publishes its game-day board in the late morning; a UFC card is many bouts
 *
 * Nothing is computed from a model here, and an event with no published number shows none.
 */
import path from "node:path";
import fs from "node:fs";

import { buildSimulateDay, type SimDayEvent, type SimEventState } from "@/lib/simulate/day-view";
import { loadEplForecasts, reportableRows } from "@/lib/sports/epl/forecast-view";
import { archivedEventIds } from "@/lib/sports/nfl/archived-forecast";
import { unionFrozenForecasts } from "@/lib/sports/nfl/public-forecast-union.mjs";
import { nflPublicRecordResolver } from "@/lib/sports/nfl/public-record.mjs";
import { committedLaneDates, loadLaneForDate } from "@/components/nba/experimental-lane";
import { nbaExclusionText } from "@/lib/sport-hub/nba-hub";
import { getMlbBoardForDate } from "@/lib/data-mlb";
import { forecastTableCell, mlbForecastStateForGame } from "@/lib/mlb/full-game/forecast-state.mjs";

import { SPORT_LABEL, type ForecastState, type GamesTableRow } from "./games-experience-table-wire";

export type { ForecastState, GamesTableRow };

/* Where each sport's graded results live. NBA official forecasts are not graded on a results page yet, so no link. */
const RESULT_HREF: Record<string, string> = { nfl: "/results/nfl/", mlb: "/results/mlb/", epl: "/results/picks/epl/", ufc: "/results/picks/ufc/" };

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const STARTED: ReadonlySet<SimEventState> = new Set(["STARTED", "AWAITING_SETTLEMENT", "SETTLED"]);
const statusOf = (s: SimEventState) => (s === "SETTLED" ? "Final · graded" : s === "AWAITING_SETTLEMENT" ? "Final · grading pending" : s === "STARTED" ? "Started" : "Scheduled");
const pct1 = (p: number) => `${(p * 100).toFixed(1)}%`;
const pct0 = (p: number) => `${Math.round(p * 100)}%`;
const etTime = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)) + " ET";
const tail = (id: string) => /(\d+)$/.exec(id)?.[1] ?? null;

function readPublic<T>(rel: string): T | null {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", rel), "utf8")) as T; } catch { return null; }
}

/** The dates the table offers: yesterday (for results), today, and the next three days. */
export function gamesTableDates(today: string): string[] {
  return [-1, 0, 1, 2, 3].map((n) => addDays(today, n));
}

export function buildGamesTableRows(today: string): GamesTableRow[] {
  const dataRoot = path.join(process.cwd(), "public", "data");
  type NflIdx = { events?: Array<{ providerEventId: string; home: { abbr: string }; away: { abbr: string }; winProbability?: { home: number; away: number } | null }> };
  const nflIdx = new Map((readPublic<NflIdx>("nfl/index.json")?.events ?? []).map((e) => [String(e.providerEventId), e]));
  /* The NFL game pages this export serves: the same union /nfl/game/[eventId] generates its params from. */
  const nflPages = new Set<string>([
    ...((unionFrozenForecasts(readPublic<{ forecasts?: unknown[] }>("nfl/forecasts/latest.json"), readPublic<{ forecasts?: unknown[] }>("nfl/forecasts/frozen-latest.json"), { resolve: nflPublicRecordResolver() })?.forecasts ?? []) as Array<{ providerEventId: string }>).map((f) => String(f.providerEventId)),
    ...archivedEventIds(dataRoot),
  ]);
  const epl = loadEplForecasts();
  const eplById = new Map((epl ? reportableRows(epl) : []).map((r) => [r.eventId, r]));
  const laneDates = new Set(committedLaneDates());
  const nbaFinals = new Set((readPublic<{ finals?: Array<{ providerEventId?: string }> }>("nba/results/finals-2026-27.json")?.finals ?? []).map((f) => String(f.providerEventId ?? "")).filter(Boolean));
  const nowMs = Date.now();

  const rows: GamesTableRow[] = [];
  for (const date of gamesTableDates(today)) {
    const day = buildSimulateDay(date, { today });
    const lane = loadLaneForDate(date);
    for (const section of day.sections) {
      for (const e of section.events) rows.push(rowFor(e, date, { nflIdx, nflPages, eplById, lane, laneDates, nbaFinals, nowMs, today }));
    }
  }
  return rows.sort((a, b) => String(a.startUtc ?? a.date).localeCompare(String(b.startUtc ?? b.date)) || a.matchup.localeCompare(b.matchup));
}

type Ctx = {
  nflIdx: Map<string, { home: { abbr: string }; away: { abbr: string }; winProbability?: { home: number; away: number } | null }>;
  nflPages: Set<string>;
  eplById: Map<string, { probs: { home: number; draw: number; away: number } | null; unavailableReason: string | null; homeClub: string | null; awayClub: string | null }>;
  lane: ReturnType<typeof loadLaneForDate>;
  laneDates: Set<string>;
  nbaFinals: Set<string>;
  nowMs: number;
  /** The build's ET day: each of today's NBA games has a card on /nba. */
  today?: string;
};

function rowFor(e: SimDayEvent, date: string, ctx: Ctx): GamesTableRow {
  /* NBA rows are schedule rows in the day selector (no post-start state); its official finals file says which are final.
     Any other row whose start has passed at build time reads "Started" rather than "Scheduled". */
  const startMs = e.startUtc ? Date.parse(e.startUtc) : NaN;
  const nbaFinal = e.sport === "nba" && ctx.nbaFinals.has(tail(e.id) ?? "");
  const started = STARTED.has(e.state) || nbaFinal || (Number.isFinite(startMs) && startMs <= ctx.nowMs);
  const status = nbaFinal ? "Final" : STARTED.has(e.state) ? statusOf(e.state) : started ? "Started" : "Scheduled";
  const base = {
    id: e.id, date, startUtc: e.startUtc, time: Number.isFinite(startMs) ? etTime(e.startUtc!) : e.startLabel, sport: e.sport, sportLabel: SPORT_LABEL[e.sport] ?? e.sport.toUpperCase(),
    matchup: e.matchup, status,
    resultHref: e.state === "SETTLED" || e.state === "AWAITING_SETTLEMENT" || nbaFinal ? RESULT_HREF[e.sport] ?? null : null,
  };
  const published = (read: string | null, note: string | null = null) => ({ forecast: (started ? "Frozen" : "Published") as ForecastState, read, note: note ?? (started ? null : "Can update until the start; frozen at the start.") });

  if (e.sport === "nfl") {
    const id = e.id.replace(/^nfl:/, "");
    const ix = ctx.nflIdx.get(id);
    const wp = ix?.winProbability;
    const page = ctx.nflPages.has(id) ? `/nfl/game/${id}/` : "/nfl/";
    if (wp && Number.isFinite(wp.home) && Number.isFinite(wp.away)) {
      const fav = wp.home >= wp.away ? `${ix!.home.abbr} ${pct1(wp.home)}` : `${ix!.away.abbr} ${pct1(wp.away)}`;
      return { ...base, ...published(`${fav} to win`), eventHref: page, resultHref: base.resultHref ? (ctx.nflPages.has(id) ? `${page}#what-happened` : base.resultHref) : null };
    }
    return { ...base, forecast: e.state === "SCHEDULE_ONLY" ? "Pending" : "Unavailable", read: null, note: e.stateReason, eventHref: page };
  }
  if (e.sport === "epl") {
    const r = ctx.eplById.get(e.id.replace(/^epl:/, ""));
    if (r?.probs) return { ...base, ...published(`${r.homeClub ?? "Home"} ${pct0(r.probs.home)} · Draw ${pct0(r.probs.draw)} · ${r.awayClub ?? "Away"} ${pct0(r.probs.away)}`), eventHref: e.href };
    return { ...base, forecast: e.state === "SCHEDULE_ONLY" ? "Pending" : "Unavailable", read: null, note: r?.unavailableReason ?? e.stateReason, eventHref: e.href };
  }
  if (e.sport === "nba") {
    const pid = tail(e.id);
    const g = ctx.lane?.games.find((x) => x.providerEventId === pid);
    /* founder mandate 2026-10-24: a game today opens its /nba card (its Official Forecast and Game Simulation links); an
       earlier date's opens that date's board. */
    const page = date === ctx.today && pid ? `/nba/#nba-exp-${pid}` : ctx.laneDates.has(date) ? `/nba/projections/${date}/` : "/nba/";
    if (g) {
      const side = g.elo?.favoured ? `${g.elo.favoured} favoured · no win chance published` : null;
      return { ...base, forecast: "Frozen", read: side, note: null, eventHref: page };
    }
    const excluded = ctx.lane?.excluded.find((x) => x.providerEventId === pid);
    if (excluded || ctx.lane || started) return { ...base, forecast: "Unavailable", read: null, note: excluded ? `No Official Forecast: ${nbaExclusionText(excluded.reason)}` : "No Official Forecast was frozen for this game before tip-off.", eventHref: page };
    return { ...base, forecast: "Pending", read: null, note: "The NBA Official Forecast is frozen on game day, before tip-off.", eventHref: page };
  }
  /* MLB: the official snapshot's own state leads (lib/mlb/full-game/forecast-state.mjs) — a degraded or unavailable
     snapshot is never "Published"/"Frozen", before or after the start. A ready snapshot falls through unchanged. */
  if (e.sport === "mlb") {
    const cell = forecastTableCell(mlbForecastStateForGame(readPublic<{ predictions?: Array<Record<string, unknown>> }>(`mlb/predictions/${date}.json`), tail(e.id)));
    if (cell) return { ...base, forecast: cell.forecast, read: null, note: cell.note, eventHref: e.href };
  }
  /* MLB and UFC: forecast status from the day selector's own state; no single probability per row. */
  const has = e.state === "SIMULATION_READY" || e.state === "ARTIFACT_READY" || e.state === "BASELINE_ONLY" || e.state === "MODEL_ONLY_NO_MARKET";
  if (has) return { ...base, ...published(null, e.sport === "ufc" ? `${e.actionLabel.replace(/^View /, "")} published.` : null), eventHref: e.href };
  if (started) {
    /* After the start the day selector's state no longer says whether a forecast existed; the sport's own pregame
       record does — MLB's board for the date (the game's own row, not refused at generation), UFC's modelled card. */
    const had = e.sport === "mlb" ? mlbHadForecast(date, tail(e.id)) : e.sport === "ufc" ? ufcHadForecast(date) : false;
    return had
      ? { ...base, forecast: "Frozen", read: null, note: null, eventHref: e.href }
      : { ...base, forecast: "Unavailable", read: null, note: e.stateReason, eventHref: e.href };
  }
  return { ...base, forecast: e.state === "SCHEDULE_ONLY" && e.sport === "mlb" ? "Pending" : "Unavailable", read: null, note: e.stateReason, eventHref: e.href };
}

function mlbHadForecast(date: string, gamePk: string | null): boolean {
  if (!gamePk) return false;
  const board = getMlbBoardForDate(date);
  if (!((board.summary?.leans ?? 0) > 0)) return false;
  const g = (board.games ?? []).find((x) => String(x.gamePk ?? "") === gamePk) as { startedBeforeGeneration?: boolean } | undefined;
  return !!g && g.startedBeforeGeneration !== true;
}

function ufcHadForecast(date: string): boolean {
  const card = readPublic<{ event?: { startUtc?: string; date?: string }; bouts?: Array<{ startUtc?: string | null; prediction?: { winner?: { probability?: number } | null } | null }> }>("ufc/card-latest.json");
  const iso = card?.event?.startUtc ?? card?.event?.date ?? card?.bouts?.[0]?.startUtc ?? null;
  const day = iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)) : null;
  return day === date && (card?.bouts ?? []).some((b) => b.prediction?.winner?.probability != null);
}

