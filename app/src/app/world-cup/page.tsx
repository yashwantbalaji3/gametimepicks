/**
 * /world-cup → /results. The 2026 FIFA World Cup finished on 2026-07-19 and was closed out as a
 * destination the same week. What remained here was an eight-tab command center — Games, Projections,
 * Player Props, Suggested Cards, Markets — whose every input is frozen. A page shaped like a live
 * competition hub reads as one no matter how carefully each panel is date-gated, and the browsing
 * tree beneath it (schedule, groups, 48 team pages, the knockout board) was a fixture browser for a
 * tournament that is over.
 *
 * The World Cup record itself is NOT hidden: those settled days are part of the published track
 * record, which is where this lands. Soccer is SCAFFOLD_ONLY in the capability registry — no stats
 * provider, so no player market is settleable — so nothing forward-looking could publish here even if
 * the competition returned tomorrow.
 *
 * Client-redirect stub (static-export-safe; server redirect() emits an error shell under
 * output:export), kept because a tournament URL is exactly the kind of inbound link we do not control.
 */
import ClientRedirect from "@/components/client-redirect";

export const metadata = {
  title: "World Cup 2026 (complete) · GameTime Picks",
  robots: { index: false, follow: false },
};

export default function WorldCupArchiveRedirect() {
  return <ClientRedirect to="/results/" label="Results" />;
}
