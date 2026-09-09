/**
 * /projections → /mlb/board. The cross-sport projections experience drew on every sport's leans,
 * including sports that have no live capability, so a single page implied coverage the registry does
 * not support. MLB is the only FULL_MODEL sport; its board is the live equivalent. Client-redirect
 * stub (static-export-safe; server redirect() emits an error shell under output:export).
 */
import ClientRedirect from "@/components/client-redirect";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/projections/", {
  title: "Projections · GameTime Picks",
  robots: { index: false, follow: false },
});

export default function ProjectionsRedirect() {
  return <ClientRedirect to="/mlb/board/" label="the MLB model board" />;
}
