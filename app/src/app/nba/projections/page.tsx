/**
 * /nba/projections — projection-only player board (preregistration §13 amendment A, founder decision 2026-10-20 —
 * conditional approval; activation via the release-owner gate).
 *
 * Reads ONLY the canonical lane snapshot (public/data/nba/experimental-public/latest.json) through the same loader and
 * the same laneIsCurrent rule as /nba: a past slate is never shown. The view (components/nba/projections-view.tsx)
 * copies every number from that snapshot; the client island only filters and re-sorts.
 */
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { currentEtDate } from "@/lib/freshness";
import { loadCurrentLane } from "@/components/nba/experimental-lane";
import NbaProjectionsView from "@/components/nba/projections-view";
import { AMENDMENT_A } from "@/lib/sports/nba/experimental-public-lane.mjs";

export const metadata = withRouteMetadata("/nba/projections/", {
  title: "NBA player projections — experimental, not validated · GameTime Picks",
  description:
    "Frozen pregame NBA player medians (PTS, REB, AST, 3PM, PRA, P+R, P+A) from an unvalidated experimental simulation, with matchup, team, player and stat filters. Not betting recommendations.",
});

export default function NbaProjectionsPage() {
  // Amendment A's rollback switch, then the lane's own switch and slate-date gate (inside loadCurrentLane).
  const lane = AMENDMENT_A.enabled ? loadCurrentLane(currentEtDate()) : null;
  return <NbaProjectionsView lane={lane} />;
}
