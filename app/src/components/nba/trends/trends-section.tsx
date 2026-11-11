/** /trends' mount: loads the trends stylesheet and renders the view (tests render TrendsView directly, without CSS). */
import TrendsView from "./trends-view";
import type { NbaTrends } from "@/lib/sports/nba/trends";
import "@/components/trends/trends.css";

export default function TrendsSection({ trends }: { trends: NbaTrends }) {
  return <TrendsView trends={trends} />;
}
