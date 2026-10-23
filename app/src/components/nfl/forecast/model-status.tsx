/**
 * What an NFL Official Forecast is and how it is graded — said once for the hub instead of a hedge on every block.
 *
 * Founder directive 2026-10-23 public readiness: this used to read "Model status: Under forward evaluation … every
 * number here is an estimate, not a validated pick". The measured record now lives in ONE place, the hub's Model
 * Performance lead (the model's own honestLimit + the paper-product fact + a link to /models/), so this disclosure
 * says what the published forecast IS in the public vocabulary (lib/public-registry.ts) and which results grade it.
 * It claims no skill: the forecast is frozen and graded, and nothing here says it has been shown to work.
 */
import { PUBLIC_TERMS, PUBLIC_TERM_MEANING } from "@/lib/public-registry";
import { NFL_RESULTS_COVERAGE_NOTE } from "@/lib/sports/nfl/results-coverage.mjs";

export const MODEL_STATUS_LABEL = `${PUBLIC_TERMS.OFFICIAL_FORECAST} · frozen before kickoff · graded after`;

export default function ModelStatus({ note }: { note?: string }) {
  return (
    <details className="nf-details" data-model-status="official-forecast">
      <summary>
        <span className="nf-pill"><span className="nf-dot" aria-hidden /> {MODEL_STATUS_LABEL}</span>
      </summary>
      <p className="nf-sub">
        {PUBLIC_TERM_MEANING[PUBLIC_TERMS.OFFICIAL_FORECAST]} Each one is graded against the official result once the
        game is final, and results are published as games are graded.{" "}
        {NFL_RESULTS_COVERAGE_NOTE}
        {note ? ` ${note}` : ""}
      </p>
    </details>
  );
}
