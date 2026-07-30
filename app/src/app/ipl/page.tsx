/**
 * /ipl → /today. IPL is schedule-only: there is no per-batsman / per-bowler source and nothing can
 * refresh the snapshot on disk, so the hub and its board / parlays / power / results children were
 * retired rather than left standing as an empty promise of future coverage. Client-redirect stub
 * (static-export-safe; server redirect() emits an error shell under output:export).
 */
import ClientRedirect from "@/components/client-redirect";

export const metadata = {
  title: "IPL · GameTime Picks",
  robots: { index: false, follow: false },
};

export default function IplRetiredRedirect() {
  return <ClientRedirect to="/today/" label="Today" />;
}
