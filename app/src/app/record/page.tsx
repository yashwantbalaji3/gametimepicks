/**
 * /record → /results. "Record" is a natural guess at the track-record URL and was a 404 (Batch 1 · #10). The track
 * record lives at /results, so this stub lands the reader there. Client-redirect (static-export-safe; server
 * redirect() emits an error shell under output:export), same pattern as /world-cup, /nhl and /ipl.
 */
import ClientRedirect from "@/components/client-redirect";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/record/", {
  title: "Track record · GameTime Picks",
  robots: { index: false, follow: false },
});

export default function RecordRedirect() {
  return <ClientRedirect to="/results/" label="Results" />;
}
