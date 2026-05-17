/**
 * /nba/board — NBA Model Board, sport-namespaced URL.
 *
 * Renders the exact same content as the legacy `/board` route so we
 * don't duplicate the active-slate logic, the BoardWithTabs client, or
 * any data loaders. NbaSectionTabs (mounted inside BoardPage) detects
 * the current pathname and highlights "Model Board" whether the user
 * arrived via `/board` or `/nba/board`.
 */
import BoardPage from "@/app/board/page";

export const metadata = {
  title: "NBA Model Board · GameTime Picks",
  description:
    "NBA player-prop projections — points, rebounds and assists graded transparently per game.",
};

export default BoardPage;
