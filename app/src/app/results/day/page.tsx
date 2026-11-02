/**
 * /results/day — RESULTS DAY (Results V2 pilot): official prediction vs actual, one sport and one ET date at a time.
 *
 * A static shell. The sport, the date and the filters are URL query state composed in the browser, and the one day a
 * reader selects is fetched on demand from /data/results/v2 (emit-results-v2-assets.mjs, from the sealed files under
 * data/results-projection/v1). Nothing here reads a data file at build time, nothing reaches /results' payload (it holds
 * one link to this page), and no prop goes through the layout or not-found.
 */
import ResultsDayExplorer from "@/components/results/results-day-explorer";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/results/day/", {
  title: "Results by Day — Official Prediction vs Actual · GameTime Picks",
  description: "Pick a sport and a date to compare each official prediction with what happened, game by game and player by player, with win, loss, push, pending and void counted per market and a CSV of every row.",
});

export default function ResultsDayPage() {
  return <ResultsDayExplorer />;
}
