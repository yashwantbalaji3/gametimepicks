/** /nfl/trends' mount: loads the shared trends stylesheet and renders the NFL spec over the shared board. */
import NflTrendsView from "./nfl-trends-view";
import type { TrendsModel } from "@/lib/trends/contract";
import "@/components/trends/trends.css";

export default function NflTrendsSection({ trends }: { trends: TrendsModel }) {
  return <NflTrendsView trends={trends} />;
}
