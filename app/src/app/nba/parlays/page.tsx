/**
 * /nba/parlays — NBA Parlays, sport-namespaced URL.
 *
 * Renders the same Parlay Lab content as the legacy `/parlay-lab`
 * route. NbaSectionTabs (mounted inside ParlayLabPage) reads the
 * current pathname so "Parlays" lights up whether the user arrived
 * via `/parlay-lab` or `/nba/parlays`.
 */
import ParlayLabPage from "@/app/parlay-lab/page";

export const metadata = {
  title: "NBA Parlays · GameTime Picks",
  description:
    "NBA candidate parlay slips built from clean model leans. Educational analytics — not betting advice.",
};

export default ParlayLabPage;
