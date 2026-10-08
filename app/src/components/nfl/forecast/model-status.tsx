/**
 * The ONE place a reader learns the evaluation status of NFL forecasts, instead of "experimental" on every block.
 * Every NFL output is PUBLIC_EXPERIMENTAL (product-eligibility.json: 0 qualifying events); this says what that means.
 */
import { NFL_RESULTS_COVERAGE_NOTE } from "@/lib/sports/nfl/results-coverage.mjs";

export const MODEL_STATUS_LABEL = "Model status: Under forward evaluation";

export default function ModelStatus({ note }: { note?: string }) {
  return (
    <details className="nf-details" data-model-status="under-forward-evaluation">
      <summary>
        <span className="nf-pill"><span className="nf-dot" aria-hidden /> {MODEL_STATUS_LABEL}</span>
      </summary>
      <p className="nf-sub">
        These forecasts come from models that passed development tests on past seasons and are now being scored on
        games played after each forecast was frozen. Until enough of those games are graded, every number here is an
        estimate, not a validated pick, and none of it is a guarantee. Results are published as games are graded.{" "}
        {NFL_RESULTS_COVERAGE_NOTE}
        {note ? ` ${note}` : ""}
      </p>
    </details>
  );
}
