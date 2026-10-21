/**
 * /nba/projections — projection-only player board (preregistration §13 amendment A, founder decision 2026-10-20 —
 * conditional approval; activation via the release-owner gate).
 *
 * The default view is the CURRENT slate only: the canonical lane snapshot (public/data/nba/experimental-public/
 * latest.json) through the same loader and the same laneIsCurrent rule as /nba, so a past slate is never shown here as
 * current. Past slates live on their own static pages, /nba/projections/<date>/ (follow-up to PR 1163) — this page never
 * embeds another date's board, it only links the committed dates. The view (components/nba/projections-view.tsx) copies
 * every number from the snapshot; the client island only filters and re-sorts.
 */
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { currentEtDate } from "@/lib/freshness";
import { boardContext } from "@/components/nba/projection-board-context";
import NbaProjectionsView from "@/components/nba/projections-view";
import { AMENDMENT_A } from "@/lib/sports/nba/experimental-public-lane.mjs";

export const metadata = withRouteMetadata("/nba/projections/", {
  title: "NBA player projections — experimental, not validated · GameTime Picks",
  description:
    "Frozen pregame NBA player medians (PTS, REB, AST, 3PM, PRA, P+R, P+A) from an unvalidated experimental simulation, with matchup, team, player and stat filters. Not betting recommendations.",
});

export default function NbaProjectionsPage() {
  // Amendment A's rollback switch, then the lane's own switch and slate-date gate (inside loadCurrentLane).
  const now = new Date();
  const ctx = boardContext({ date: null, nowIso: now.toISOString(), buildEtDate: currentEtDate(now), enabled: AMENDMENT_A.enabled });
  return <NbaProjectionsView lane={ctx.lane} role={ctx.role} date={ctx.date} games={ctx.games} dates={ctx.dates} />;
}
