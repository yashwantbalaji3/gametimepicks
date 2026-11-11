/** The game page's mount for the settled QB record: loads the shared trends stylesheet (tests render the section directly). */
import NflQbResultsSection from "./nfl-qb-results-section";
import type { TrendsGameResult } from "@/lib/trends/contract";
import "@/components/trends/trends.css";

export default function NflQbResultsMount({ result }: { result: TrendsGameResult | null }) {
  return <NflQbResultsSection result={result} />;
}
