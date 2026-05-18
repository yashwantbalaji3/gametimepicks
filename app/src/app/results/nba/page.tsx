/**
 * /results/nba — NBA audit under the centralized Results hub.
 *
 * Re-exports the existing `/nba/results` page body so both URLs render
 * the same audit content (same pattern PR #49 used for /nba/board
 * mirroring /board). The legacy `/nba/results` URL stays alive for
 * bookmarks. The new canonical path is /results/nba.
 */
import NbaResultsPage from "@/app/nba/results/page";

export const metadata = {
  title: "NBA Model Audit · GameTime Picks",
  description:
    "Centralized NBA model audit — every settled projection graded against the verified final box score.",
};

export default NbaResultsPage;
