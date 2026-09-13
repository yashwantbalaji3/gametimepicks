import Link from "next/link";

import { activeMlbDate, getMlbBoardForDate } from "@/lib/data-mlb";
import { currentEtDate } from "@/lib/freshness";
import MlbBoardBody from "@/components/mlb/mlb-board-body";
import NewsletterSignup from "@/components/newsletter-signup";
import SlateLivenessBanner from "@/components/slate-liveness-banner";
import { publicationDeadlineUtc } from "@/lib/ops/read-publication-slo";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/mlb/board/", {
  title: "MLB board · GameTime Picks",
  description:
    "Daily MLB player-prop board: pitcher strikeouts, batter hits, batter total bases. Educational analytics, not betting advice.",
});

/*
 * P294: there was a `const DEFAULT_DATE = "2026-05-16"` here, used as `activeMlbDate() ?? DEFAULT_DATE`.
 *
 * It is unreachable today — `activeMlbDate()` returns null only when NO board exists on disk, and 101
 * are committed — but "a fallback value is a claim" has been the defect three times in this project
 * (og:url in P251, the NFL page saying MLB in P250-W2, the archived capture under a current heading in
 * P246). If the boards directory were ever empty this page would have answered the question "which
 * slate is this?" with a specific day in May, in a full-looking board layout, and nothing would have
 * said otherwise.
 *
 * There is no honest default for "which slate", so there is none. A page with no board says so.
 */

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
  const date = activeMlbDate();
  if (!date) {
    return (
      <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14">
        <h1 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(22px,4.5vw,30px)", fontWeight: 800, margin: 0 }}>
          No MLB board has been published
        </h1>
        <p className="mt-3 max-w-[58ch]" style={{ color: "var(--vault-text-mute)", fontSize: 14, lineHeight: 1.65 }}>
          There is no slate on file to show — not an empty one, none at all. Rather than name a date we
          cannot stand behind, this page says so.{" "}
          <Link href="/mlb/" style={{ color: "var(--gtp-bank-heat)" }}>The MLB hub</Link> carries the
          schedule and coverage status.
        </p>
      </div>
    );
  }
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
