/**
 * Homepage — CONCEPT C "Guided Beginner Flow" PREVIEW ONLY.
 *
 * Structural change vs. production: instead of dropping the full builder on
 * the user immediately, the home is an explicit 3-step WIZARD (pick sport →
 * pick comfort → review the matching cards), one decision at a time, with
 * plain-English copy and strong next-step actions. Same data + the same
 * ParlayTicketCard; only the flow/IA differs.
 *
 * Do not merge. No data/pipeline/optimizer/logic changes.
 */
import { getSuggestedParlaysForDate, getLatestOptimizerSnapshot } from "@/lib/data-parlays";
import { loadCalibrationTable } from "@/lib/confidence-calibration";
import { currentEtDate } from "@/lib/freshness";
import GuidedHome from "@/components/concept-c/guided-home";

export default function HomePage() {
  const today = currentEtDate();
  const suggested =
    getSuggestedParlaysForDate(today) ??
    (() => {
      const latest = getLatestOptimizerSnapshot();
      return latest ? { date: latest.date, slips: [], source: "snapshot" as const, isFallback: true } : null;
    })();

  return (
    <div className="vault-page-shell overflow-x-hidden">
      <GuidedHome
        slips={suggested?.slips ?? []}
        slateDate={suggested?.date ?? today}
        isFallback={suggested?.isFallback ?? true}
        calibrationTable={loadCalibrationTable()}
      />
    </div>
  );
}
