/**
 * /results/day: RESULTS DAY (Results V2 pilot): official prediction vs actual, one sport and one ET date at a time.
 *
 * A static shell. The sport, the date and the filters are URL query state composed in the browser, and the one day a
 * reader selects is fetched on demand from /data/results/v2 (emit-results-v2-assets.mjs, from the sealed files under
 * data/results-projection/v1). Nothing here reads a data file at build time, nothing reaches /results' payload (it does not
 * link here while no day is published), and no prop goes through the layout or not-found.
 */
import ResultsDayExplorer from "@/components/results/results-day-explorer";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/results/day/", {
  title: "Results by Day: Official Prediction vs Actual · GameTime Picks",
  description: "Official predictions beside what happened, one sport and one date at a time, for days whose predictions are verified as served before the start. Accuracy, pending and void are counted per market.",
  /* Pilot: non-indexable until release review, and `indexable: false` in the route table keeps it out of the sitemap. */
  robots: { index: false, follow: false },
});

export default function ResultsDayPage() {
  return <ResultsDayExplorer />;
}
