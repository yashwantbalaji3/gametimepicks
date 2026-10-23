/**
 * /nba/projections — the board's build-time context (follow-up to PR 1163): which slate a page shows, each game's
 * status and the page it links to, and the committed slate dates. SERVER ONLY (reads committed files at build time).
 *
 * Sources, never re-derived:
 *   snapshots  public/data/nba/experimental-public/<date>.json + latest.json   (experimental-lane.tsx loaders)
 *   schedule   public/data/nba/schedule/latest.json                             (the /nba hub's schedule source)
 *   finals     public/data/nba/results/finals-<season>.json                     (the write-once finals record)
 *   hub        nbaHub() + loadCurrentLane() — the same calls /nba makes, so a link only names a card or row /nba renders
 *   actuals    lib/sports/nba/projection-board-actuals.ts — the graders' own box scores, for games with an official final
 *
 * Between slates (overnight sprint 2026-10-23, competitor gap 1): after the ET date rolls over and before the new
 * slate's snapshot is committed, the default view has no lane. It then carries TODAY — the build's ET date's games from
 * the committed schedule (matchup, tip-off, status) — and the newest committed slate date, so the page links the
 * latest frozen board instead of showing nothing. No forecast figure is shown or invented for today's games.
 *
 * Nothing here changes a frozen number: statuses and links are attached BESIDE the snapshot, which is passed through
 * untouched.
 */
import fs from "node:fs";
import path from "node:path";

import { committedLaneDates, loadCurrentLane, loadLaneForDate, type Snapshot } from "@/components/nba/experimental-lane";
import { nbaHub } from "@/lib/sport-hub/nba-hub";
import { etDateOf, finalFor, nbaSeasonLabel } from "@/lib/sports/nba/finals-record.mjs";
import { gameLink, gameStatusAtBuild } from "@/lib/sports/nba/projection-board-ops.mjs";
import { boardActuals, type BoardActuals } from "@/lib/sports/nba/projection-board-actuals";
import { PROJECTION_BOARD_STATS } from "@/lib/sports/nba/experimental-public-lane.mjs";

export type SlateRole = "current" | "past";
export type BoardGame = {
  id: string;
  /** The schedule's tip-off instant (the frozen one when the schedule no longer carries the game). */
  tipUtc: string;
  status: "upcoming" | "started" | "final" | "postponed";
  link: { href: string; label: string } | null;
};
/** One of today's scheduled games while no slate is published (between slates): schedule facts only. */
export type TodayGame = { id: string; tipUtc: string; away: string; home: string; status: BoardGame["status"] };
export type BoardToday = {
  /** The build's ET date. */
  date: string;
  games: TodayGame[];
  /** Does the committed schedule capture cover this date? (false: "no games" would be a guess, so the page says Unavailable) */
  scheduled: boolean;
  /** The newest committed slate date (its frozen board), or null. */
  latest: string | null;
};
export type BoardContext = {
  /** The slate this page shows: null when there is no snapshot to show (the honest empty state). */
  lane: Snapshot | null;
  /** The slate date the page is about (the route's date on a dated page; the snapshot's date on the default view). */
  date: string | null;
  role: SlateRole;
  games: BoardGame[];
  dates: string[];
  buildEtDate: string;
  /** Between slates only (no lane, and the page is the default view or the build's own date): today's schedule. */
  today: BoardToday | null;
  /** Postgame actuals for the shown slate's games (null when no lane). */
  actuals: BoardActuals | null;
};

type ScheduleDoc = { generatedAt?: string; windowDays?: number; rows?: ScheduleRow[] };
type ScheduleRow = { providerEventId?: string; dateUtc?: string; statusRaw?: string | null; away?: { name?: string; abbr?: string }; home?: { name?: string; abbr?: string } };
function readJson<T>(rel: string): T | null {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", rel), "utf8")) as T; } catch { return null; }
}

/** Status + link for every game of a snapshot, at the build instant. */
export function boardGames(lane: Snapshot | null, nowIso: string, buildEtDate: string): BoardGame[] {
  if (!lane || lane.games.length === 0) return [];
  const nowMs = Date.parse(nowIso);
  const season = nbaSeasonLabel(lane.date ?? "");
  const finals = season ? readJson<{ finals?: unknown[] }>(`nba/results/finals-${season}.json`) : null;
  const schedule = new Map((readJson<{ rows?: ScheduleRow[] }>("nba/schedule/latest.json")?.rows ?? []).map((r) => [String(r.providerEventId), r]));
  // The hub's own view of this build: which lane cards it renders and which games its schedule window lists.
  const hubLane = loadCurrentLane(buildEtDate);
  const hubLaneIds = new Set((hubLane?.games ?? []).map((g) => g.providerEventId));
  const hubListedIds = new Set(nbaHub(nowIso, hubLane ? hubLaneIds : null).rows.map((r) => String(r.id)));
  return lane.games.map((g) => {
    const sched = schedule.get(g.providerEventId);
    // The schedule's instant when it still carries the game (a reschedule moves it); otherwise the frozen tip-off.
    const tipUtc = sched?.dateUtc ?? g.tipUtc;
    const status = gameStatusAtBuild({ tipUtc, nowMs, fin: finalFor(finals, g.providerEventId), scheduleStatusRaw: sched?.statusRaw ?? null });
    return { id: g.providerEventId, tipUtc, status, link: gameLink(g.providerEventId, { hubLaneIds, hubListedIds }) };
  });
}

/**
 * Today's games from the committed schedule (the /nba hub's source), ordered by tip-off. Status as on the board: a
 * recorded final, a postponement, or the build's clock. Nothing else is attached — no figure exists for them yet.
 */
export function todayGames(etDate: string, nowIso: string): Pick<BoardToday, "games" | "scheduled"> {
  const nowMs = Date.parse(nowIso);
  const season = nbaSeasonLabel(etDate);
  const finals = season ? readJson<{ finals?: unknown[] }>(`nba/results/finals-${season}.json`) : null;
  const doc = readJson<ScheduleDoc>("nba/schedule/latest.json");
  // The capture covers [its own ET date, + windowDays): outside that window an empty list proves nothing.
  const from = etDateOf(doc?.generatedAt ?? "");
  const until = from && Number.isFinite(doc?.windowDays) ? etDateOf(new Date(Date.parse(`${from}T12:00:00Z`) + Number(doc!.windowDays) * 86_400_000).toISOString()) : null;
  const scheduled = from != null && until != null && etDate >= from && etDate < until;
  const games = (doc?.rows ?? [])
    .filter((r) => r.providerEventId && r.dateUtc && etDateOf(r.dateUtc) === etDate)
    .sort((a, b) => Date.parse(a.dateUtc!) - Date.parse(b.dateUtc!) || String(a.providerEventId).localeCompare(String(b.providerEventId)))
    .map((r) => ({
      id: String(r.providerEventId),
      tipUtc: r.dateUtc!,
      away: r.away?.name ?? r.away?.abbr ?? "",
      home: r.home?.name ?? r.home?.abbr ?? "",
      status: gameStatusAtBuild({ tipUtc: r.dateUtc, nowMs, fin: finalFor(finals, r.providerEventId), scheduleStatusRaw: r.statusRaw ?? null }),
    }));
  return { games, scheduled: scheduled || games.length > 0 };
}

/**
 * The context for one page. `date` null = the default view (/nba/projections/): the current slate only, through the
 * same loadCurrentLane gate as /nba. A date = that slate's committed snapshot, labelled past when its date is before
 * the build's ET date (laneIsCurrent's rule) — never presented as current.
 */
export function boardContext({ date, nowIso, buildEtDate, enabled }: { date: string | null; nowIso: string; buildEtDate: string; enabled: boolean }): BoardContext {
  const dates = enabled ? committedLaneDates() : [];
  const lane = !enabled ? null : date == null ? loadCurrentLane(buildEtDate) : loadLaneForDate(date);
  const live = lane && lane.games.length > 0 ? lane : null;
  const slate = date ?? live?.date ?? null;
  const role: SlateRole = slate != null && slate < buildEtDate ? "past" : "current";
  const today = enabled && !live && (date == null || date === buildEtDate)
    ? { date: buildEtDate, ...todayGames(buildEtDate, nowIso), latest: [...dates].reverse().find((d) => d <= buildEtDate) ?? null }
    : null;
  return { lane: live, date: slate, role, games: boardGames(live, nowIso, buildEtDate), dates, buildEtDate, today, actuals: boardActuals(live, PROJECTION_BOARD_STATS) };
}
