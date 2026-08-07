/**
 * /parlays → /build#suggested-cards. One canonical suggested-parlay surface — the Parlay Lab at /picks. This legacy
 * alias client-redirects (static-export-safe; server redirect() emits an error shell under output:export)
 * so old links never break and there is a single source of truth.
 */
import ClientRedirect from "@/components/client-redirect";

export const metadata = {
  title: "Parlays · GameTime Picks",
  robots: { index: false, follow: false },
};

export default function ParlaysRedirect() {
  return <ClientRedirect to="/build#suggested-cards" label="Suggested cards" />;
}
