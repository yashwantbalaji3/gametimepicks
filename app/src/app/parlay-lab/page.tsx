/**
 * /parlay-lab → /build#suggested-cards. The suggested-card lobby is now /picks and the custom builder is /build; this
 * legacy alias client-redirects (static-export-safe; server redirect() emits an error shell under
 * output:export) so old links never break.
 */
import ClientRedirect from "@/components/client-redirect";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/parlay-lab/", {
  title: "Parlay Center · GameTime Picks",
  robots: { index: false, follow: false },
});

export default function ParlayLabRedirect() {
  return <ClientRedirect to="/build#suggested-cards" label="Suggested cards" />;
}
