/**
 * /mlb/parlays → /build#suggested-cards. This route was a placeholder that existed only so MLB matched the old
 * five-tab sport layout; it published nothing and promised parlay candidates "pending snapshots".
 * The real, current suggested-card lobby is /picks. Client-redirect stub (static-export-safe; server
 * redirect() emits an error shell under output:export).
 */
import ClientRedirect from "@/components/client-redirect";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/mlb/parlays/", {
  title: "MLB Parlays · GameTime Picks",
  robots: { index: false, follow: false },
});

export default function MlbParlaysRedirect() {
  return <ClientRedirect to="/build#suggested-cards" label="Suggested cards" />;
}
