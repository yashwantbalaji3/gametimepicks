/**
 * /nba → /results/nba. NBA is HISTORICAL_ONLY in the capability registry: the settled record is real
 * and stays published, but the source has been failing since 2026-06-13 and there is no live
 * projection capability. A hub with Projections / Player Props / Suggested Cards tabs read as live
 * coverage, so it was retired along with /nba/board and /nba/power; the honest destination is the
 * settled archive. Client-redirect stub (static-export-safe under output:export).
 */
import ClientRedirect from "@/components/client-redirect";

export const metadata = {
  title: "NBA · GameTime Picks",
  robots: { index: false, follow: false },
};

export default function NbaHubRedirect() {
  return <ClientRedirect to="/results/nba/" label="the NBA settled archive" />;
}
