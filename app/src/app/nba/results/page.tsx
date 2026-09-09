/**
 * /nba/results → /results/nba. Two URLs rendered the same NBA audit; the canonical one lives under
 * the Results hub alongside MLB and the cross-sport record, and is the only one anything links to.
 * This sport-namespaced twin is kept as a redirect so old bookmarks still reach the archive.
 *
 * Client-redirect stub (static-export-safe; server redirect() emits an error shell under
 * output:export).
 */
import ClientRedirect from "@/components/client-redirect";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/nba/results/", {
  title: "NBA Results · GameTime Picks",
  robots: { index: false, follow: false },
});

export default function NbaResultsRedirect() {
  return <ClientRedirect to="/results/nba/" label="the NBA settled archive" />;
}
