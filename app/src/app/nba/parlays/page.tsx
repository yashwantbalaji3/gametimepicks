/**
 * /nba/parlays → /picks. Sport-namespaced legacy alias for the cross-sport Parlay Lab (now /picks).
 * Client-redirects (static-export-safe; server redirect() emits an error shell under output:export).
 */
import ClientRedirect from "@/components/client-redirect";

export const metadata = {
  title: "NBA Parlays · GameTime Picks",
  robots: { index: false, follow: false },
};

export default function NbaParlaysRedirect() {
  return <ClientRedirect to="/picks/" label="Picks Lab" />;
}
