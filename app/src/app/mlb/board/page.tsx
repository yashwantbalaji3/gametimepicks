import { activeMlbDate, getMlbBoardForDate } from "@/lib/data-mlb";
import { currentEtDate } from "@/lib/freshness";
import MlbBoardBody from "@/components/mlb/mlb-board-body";
import NewsletterSignup from "@/components/newsletter-signup";
import SlateLivenessBanner from "@/components/slate-liveness-banner";
import { publicationDeadlineUtc } from "@/lib/ops/read-publication-slo";

export const metadata = {
  title: "MLB board · GameTime Picks",
  description:
    "Daily MLB player-prop board: pitcher strikeouts, batter hits, batter total bases. Educational analytics, not betting advice.",
};

const DEFAULT_DATE = "2026-05-16";

/**
 * /mlb/board — active/latest slate. Date-specific views live under
 * /mlb/board/<YYYY-MM-DD>. The shared body in mlb-board-body.tsx
 * handles all data states (projections / lines pending / off-day).
 * The liveness banner (real ET clock) is passed only here — the dated
 * archive route intentionally omits it.
 *
 * The daily-refresh signup moved here from the retired /board route
 * (2026-07-30 route audit). It advertises "an email when the model
 * board refreshes", so it belongs on the board that actually
 * refreshes; the dated archive route omits it for the same reason it
 * omits the liveness banner.
 */
export default function MlbBoardPage() {
  const date = activeMlbDate() ?? DEFAULT_DATE;
  const games = getMlbBoardForDate(date).summary.scheduledGames ?? 0;
  return (
    <>
      <MlbBoardBody
        date={date}
        liveness={
          <SlateLivenessBanner
            publishDeadlineUtc={publicationDeadlineUtc()}
            buildTimeToday={currentEtDate()}
            latestSlate={date}
            latestSlateHasGames={games > 0}
            archiveHref="/mlb"
            archiveLabel="Back to the MLB hub"
            includeMlbNote
            includeWcFocus={false}
          />
        }
      />
      <div className="px-4 sm:px-8 pb-10">
        <NewsletterSignup />
      </div>
    </>
  );
}
