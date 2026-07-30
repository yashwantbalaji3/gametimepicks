/**
 * /nhl → /today. NHL is not covered: no ingest exists, no odds, and no projection path, so the hub
 * and its board / parlays / power / results children were retired rather than left standing as an
 * empty promise of future coverage. This stub client-redirects (static-export-safe; server
 * redirect() emits an error shell under output:export) so bookmarked links still land somewhere real.
 */
import ClientRedirect from "@/components/client-redirect";

export const metadata = {
  title: "NHL · GameTime Picks",
  robots: { index: false, follow: false },
};

export default function NhlRetiredRedirect() {
  return <ClientRedirect to="/today/" label="Today" />;
}
