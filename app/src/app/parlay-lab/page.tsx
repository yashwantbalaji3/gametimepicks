/**
 * /parlay-lab → /picks. The suggested-card lobby is now /picks and the custom builder is /build; this
 * legacy alias client-redirects (static-export-safe; server redirect() emits an error shell under
 * output:export) so old links never break.
 */
import ClientRedirect from "@/components/client-redirect";

export const metadata = {
  title: "Parlay Lab · GameTime Picks",
  robots: { index: false, follow: false },
};

export default function ParlayLabRedirect() {
  return <ClientRedirect to="/picks/" label="Picks Lab" />;
}
