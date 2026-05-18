/**
 * /results/nhl — NHL audit under the centralized Results hub.
 * Re-exports the existing pending-state page from `/nhl/results`.
 */
import NhlResultsPage from "@/app/nhl/results/page";

export const metadata = {
  title: "NHL Model Audit · GameTime Picks",
  description:
    "NHL model audit · pending first settlement. Educational analytics — not betting advice.",
};

export default NhlResultsPage;
