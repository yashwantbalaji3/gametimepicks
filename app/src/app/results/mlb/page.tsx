/**
 * /results/mlb — MLB audit under the centralized Results hub.
 * Re-exports the existing `/mlb/results` page body so both URLs render
 * the same audit content. The legacy `/mlb/results` URL stays alive.
 */
import MlbResultsPage from "@/app/mlb/results/page";

export const metadata = {
  title: "MLB Model Audit · GameTime Picks",
  description:
    "Centralized MLB model audit — every settled projection graded against the verified final box score.",
};

export default MlbResultsPage;
