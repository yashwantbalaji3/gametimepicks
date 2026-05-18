/**
 * /results/ipl — IPL audit under the centralized Results hub.
 * Re-exports the existing pending-state page from `/ipl/results`.
 */
import IplResultsPage from "@/app/ipl/results/page";

export const metadata = {
  title: "IPL Model Audit · GameTime Picks",
  description:
    "IPL model audit · pending first settlement. Educational analytics — not betting advice.",
};

export default IplResultsPage;
