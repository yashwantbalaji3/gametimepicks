/**
 * /nba/projections — projection-only player board (preregistration §13 amendment A, founder decision 2026-10-20 —
 * conditional approval; activation via the release-owner gate).
 *
 * The default view is the CURRENT slate only: the canonical lane snapshot (public/data/nba/experimental-public/
 * latest.json) through the same loader and the same laneIsCurrent rule as /nba, so a past slate is never shown here as
 * current. Past slates live on their own static pages, /nba/projections/<date>/ (follow-up to PR 1163) — this page never
 * embeds another date's board, it only links the committed dates. The view (components/nba/projections-view.tsx) copies
 * every number from the snapshot; the client island only filters and re-sorts.
 *
 * Top Boards (§13 amendment B, founder 2026-10-29/30): the current view also carries the gated daily Top Boards
 * (lane-top-boards.mjs gateLaneTopBoards → components/nba/lane-top-boards.tsx); dated pages never do.
 *
 * Between slates (overnight sprint 2026-10-23): with no current snapshot, the view lists today's scheduled games and
 * links the newest frozen board (boardContext's `today`) instead of an empty page.
 */
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { currentEtDate } from "@/lib/freshness";
import { boardContext } from "@/components/nba/projection-board-context";
import NbaProjectionsView from "@/components/nba/projections-view";
import { AMENDMENT_A } from "@/lib/sports/nba/experimental-public-lane.mjs";
import { loadEloWinProbabilityContext } from "@/lib/sports/nba/elo-win-probability-context.mjs";
import { nbaLineSummaryGameLinks } from "@/components/nba/prop-line-game-links";
import { loadLaneForDate } from "@/components/nba/experimental-lane";
import { gateLaneTopBoards } from "@/lib/sports/nba/lane-top-boards.mjs";
import type { LaneTopBoardsGate } from "@/components/nba/lane-top-boards";

export const metadata = withRouteMetadata("/nba/projections/", {
  title: "NBA Predicted Player Statistics · GameTime Picks",
  description:
    "Official Forecast NBA player medians (PTS, REB, AST, 3PM, PRA, P+R, P+A), frozen before tip-off, with matchup, team, player and stat filters; between slates, today's schedule and the latest frozen board. Not betting recommendations.",
});

export default async function NbaProjectionsPage() {
  // Amendment A's rollback switch, then the lane's own switch and slate-date gate (inside loadCurrentLane).
  const now = new Date();
  const ctx = boardContext({ date: null, nowIso: now.toISOString(), buildEtDate: currentEtDate(now), enabled: AMENDMENT_A.enabled });
  // §13 amendment B (founder 2026-10-29/30): the daily Top Boards, CURRENT slate only, behind the provenance + cross-page
  // gate. The committed <date>.json must equal the latest.json this view reads; a game the schedule or finals record says
  // has started (or was postponed) is out of the pregame scope.
  const topBoards = ctx.lane && ctx.role === "current"
    ? (gateLaneTopBoards(ctx.lane, { dated: loadLaneForDate(ctx.lane.date ?? ""), nowIso: now.toISOString(), startedIds: ctx.games.filter((g) => g.status !== "upcoming").map((g) => g.id) }) as LaneTopBoardsGate | null)
    : null;
  return <NbaProjectionsView topBoards={topBoards} lane={ctx.lane} role={ctx.role} date={ctx.date} games={ctx.games} dates={ctx.dates} today={ctx.today} actuals={ctx.actuals} eloCtx={loadEloWinProbabilityContext()} asOf={now.toISOString()} gameLinks={await nbaLineSummaryGameLinks(currentEtDate(now))} />;
}
