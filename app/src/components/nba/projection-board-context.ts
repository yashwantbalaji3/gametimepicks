/**
 * /nba/projections — the board's build-time context (follow-up to PR 1163): which slate a page shows, each game's
 * status and the page it links to, and the committed slate dates. SERVER ONLY (reads committed files at build time).
 *
 * Sources, never re-derived:
 *   snapshots  public/data/nba/experimental-public/<date>.json + latest.json   (experimental-lane.tsx loaders)
 *   schedule   public/data/nba/schedule/latest.json                             (the /nba hub's schedule source)
 *   finals     public/data/nba/results/finals-<season>.json                     (the write-once finals record)
 *   hub        nbaHub() + loadCurrentLane() — the same calls /nba makes, so a link only names a card or row /nba renders
 *
 * Nothing here changes a frozen number: statuses and links are attached BESIDE the snapshot, which is passed through
 * untouched.
 */
import fs from "node:fs";
import path from "node:path";

import { committedLaneDates, loadCurrentLane, loadLaneForDate, type Snapshot } from "@/components/nba/experimental-lane";
import { nbaHub } from "@/lib/sport-hub/nba-hub";
import { finalFor, nbaSeasonLabel } from "@/lib/sports/nba/finals-record.mjs";
import { gameLink, gameStatusAtBuild } from "@/lib/sports/nba/projection-board-ops.mjs";

export type SlateRole = "current" | "past";
export type BoardGame = {
  id: string;
  /** The schedule's tip-off instant (the frozen one when the schedule no longer carries the game). */
  tipUtc: string;
  status: "upcoming" | "started" | "final" | "postponed";
  link: { href: string; label: string } | null;
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
};

type ScheduleRow = { providerEventId?: string; dateUtc?: string; statusRaw?: string | null };
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
  return { lane: live, date: slate, role, games: boardGames(live, nowIso, buildEtDate), dates, buildEtDate };
}
