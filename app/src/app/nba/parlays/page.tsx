/**
 * /nba/parlays → /build#suggested-cards. Sport-namespaced legacy alias for the cross-sport Parlay Lab (now /picks).
 * Client-redirects (static-export-safe; server redirect() emits an error shell under output:export).
 */
import ClientRedirect from "@/components/client-redirect";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/nba/parlays/", {
  title: "NBA Parlays · GameTime Picks",
  robots: { index: false, follow: false },
});

export default function NbaParlaysRedirect() {
  return <ClientRedirect to="/build#suggested-cards" label="Suggested cards" />;
}
