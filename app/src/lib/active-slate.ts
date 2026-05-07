/**
 * Phase 15 — active-slate selection.
 *
 * The bug Phase 14 partially addressed: pages were showing May 5 as
 * "the board" because `slate.primaryDate` froze at pipeline-run time.
 * Phase 14 made the labels honest ("latest available slate"), but the
 * underlying default was still a past date.
 *
 * Phase 15 fixes the underlying default. The board now:
 *   - Defaults to TODAY when today has games or even when today is
 *     empty-but-current (better than showing yesterday's data).
 *   - Defaults to the NEAREST UPCOMING DATE when today doesn't exist.
 *   - Falls back to a "no current slate" state when only past data
 *     exists. Past slates move to an archive view, not the main board.
 *
 * Pure logic. Both server (build-time SSR) and client (post-hydration
 * with real today) call the same function. Python port lives at
 * `pipeline/active_slate.py` (in tests only — pipeline doesn't need it).
 */

import type { SlateDay, BoardData } from "./types";

export type ActiveSlateKind =
  | "today" // today's board exists (with or without games)
  | "upcoming" // today doesn't exist; showing nearest future date
  | "no_current" // only past data; show empty state with archive link
  | "no_data"; // nothing on disk at all

export interface ActiveSlate {
  kind: ActiveSlateKind;
  /** Date to render. Null when kind=no_current with archived dates. */
  selectedDate: string | null;
  /** All upcoming + today dates, sorted asc. Used for tab strip. */
  upcomingAndTodayDates: string[];
  /** All past dates, sorted desc (newest first). Used for archive link. */
  pastDates: string[];
  /** Most recent past date with leans, if any. Used for archive teaser. */
  latestArchivedDate: string | null;
}

/**
 * Given the available board dates and today, decide what the board page
 * should render as primary.
 *
 * `boardsByDate` is consulted to know which dates have games / leans —
 * we don't blindly pick a date that has no real content if a better
 * option exists.
 */
export function selectActiveSlate(
  availableDates: string[],
  today: string,
  boardsByDate: Record<string, BoardData> = {},
): ActiveSlate {
  // Bucket dates relative to today
  const past: string[] = [];
  const todayMatch: string[] = [];
  const future: string[] = [];

  for (const d of availableDates) {
    if (d < today) past.push(d);
    else if (d === today) todayMatch.push(d);
    else future.push(d);
  }

  const upcomingAndTodayDates = [...todayMatch, ...future].sort();
  const pastDates = past.sort().reverse(); // newest past first

  const latestArchivedDate =
    pastDates.find((d) => (boardsByDate[d]?.leans?.length ?? 0) > 0) ??
    pastDates[0] ??
    null;

  // No data at all
  if (availableDates.length === 0) {
    return {
      kind: "no_data",
      selectedDate: null,
      upcomingAndTodayDates: [],
      pastDates: [],
      latestArchivedDate: null,
    };
  }

  // Today's board exists — use it regardless of leans count. An empty
  // today is still "the current state" and is more honest than reverting
  // to yesterday's data.
  if (todayMatch.length > 0) {
    return {
      kind: "today",
      selectedDate: today,
      upcomingAndTodayDates,
      pastDates,
      latestArchivedDate,
    };
  }

  // No today, but future dates exist — pick the nearest one with content,
  // preferring dates that have leans. If none have leans, just take the
  // nearest future date (the upcoming-slate state still says something
  // meaningful: "this date is coming up but doesn't have lines yet").
  if (future.length > 0) {
    const futureWithLeans = future.find(
      (d) => (boardsByDate[d]?.leans?.length ?? 0) > 0,
    );
    return {
      kind: "upcoming",
      selectedDate: futureWithLeans ?? future[0],
      upcomingAndTodayDates,
      pastDates,
      latestArchivedDate,
    };
  }

  // Only past data — surface an honest "no current slate" state.
  // The board page will render NoCurrentSlateState rather than picking
  // an arbitrary past date as primary.
  return {
    kind: "no_current",
    selectedDate: null,
    upcomingAndTodayDates: [],
    pastDates,
    latestArchivedDate,
  };
}

/**
 * Phase 15 helper: produce a heading-friendly title for the board hero
 * based on the active-slate kind. Honest and user-friendly.
 */
export function activeSlateHeading(active: ActiveSlate): string {
  switch (active.kind) {
    case "today":
      return "Today's board";
    case "upcoming":
      return "Upcoming slate";
    case "no_current":
      return "No current slate available";
    case "no_data":
      return "No slate data available";
  }
}

/**
 * Phase 15 helper: a one-line subtitle for the board hero.
 */
export function activeSlateSubtitle(active: ActiveSlate): string {
  switch (active.kind) {
    case "today":
      return "Live model leans for tonight's NBA games.";
    case "upcoming":
      return "Today's board hasn't been generated yet — showing the nearest upcoming slate.";
    case "no_current":
      return active.latestArchivedDate
        ? `The next slate hasn't been generated yet. The most recent archived slate is ${active.latestArchivedDate}.`
        : "The next slate hasn't been generated yet.";
    case "no_data":
      return "We don't have any slates to show right now.";
  }
}
