/**
 * /homer-nukes → /results. Homer Nukes was retired on 2026-06-30 (no graded history; the MLB home-run
 * props it needed were data-gated). Its history stays in the record on /results; the standalone
 * retired-landing page is no longer a destination of its own. Client-redirect stub
 * (static-export-safe; server redirect() emits an error shell under output:export), kept noindex.
 */
import ClientRedirect from "@/components/client-redirect";

export const metadata = {
  title: "Homer Nukes (retired) · GameTime Picks",
  robots: { index: false, follow: false },
};

export default function HomerNukesRetiredRedirect() {
  return <ClientRedirect to="/results/" label="Results" />;
}
