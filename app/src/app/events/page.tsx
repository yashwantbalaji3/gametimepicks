/**
 * /events — the Sports Event Hub (schedule only).
 *
 * A lightweight, honest schedule surface for three leagues we do NOT
 * model: WNBA, UFC, and FIFA World Cup. It exists so visitors can see
 * what's coming up without any pretense that we publish picks, odds, or
 * projections for these sports.
 *
 * What this ships:
 *   - Three tabs (WNBA · UFC · FIFA World Cup), each rendering a
 *     point-in-time schedule snapshot drawn from the public ESPN
 *     scoreboard feed and attributed inline (source name, snapshot date,
 *     covered range, honest note + a link to the feed).
 *   - Schedule-only content: dates, matchups, venues. No odds, no
 *     projections, no parlays, no picks — and the page says so.
 *   - FIFA World Cup cross-links to the existing World Cup command
 *     center, which carries the complete official Final Draw schedule.
 *
 * Server component: reads baked, serializable data and hands it to the
 * client `EventScheduleHub` (which only needs state for tab selection),
 * so the whole thing renders cleanly into the static export.
 */
import EventScheduleHub from "@/components/event-schedule-hub";
import SportsCoverageGrid from "@/components/sports-coverage-grid";
import PageHero from "@/components/page-hero";
import { listLeagueSchedules } from "@/lib/event-schedules";
import { SPORTS_COVERAGE } from "@/lib/sports-coverage";

const META_TITLE = "Sports & Events · GameTime Picks";
const META_DESCRIPTION =
  "What GameTime Picks covers: NBA and MLB projections + parlays, plus schedule-only coverage for NHL, WNBA, UFC, FIFA World Cup and IPL. No odds, projections, or picks for schedule-only leagues.";

export const metadata = {
  title: META_TITLE,
  description: META_DESCRIPTION,
  openGraph: {
    title: META_TITLE,
    description: META_DESCRIPTION,
    type: "website",
    url: "/events/",
  },
  twitter: {
    card: "summary_large_image",
    title: META_TITLE,
    description: META_DESCRIPTION,
  },
};

export default function EventsPage() {
  const leagues = listLeagueSchedules();

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-8 overflow-x-hidden">
      {/* ---- Hero --------------------------------------------------- */}
      <PageHero
        eyebrow="Sports coverage · schedules"
        title="Sports & Events"
        subMaxWidth={680}
        sub={
          <>
            Everything GameTime Picks covers, in one place. NBA and MLB have
            real player-prop projections and model parlays; the other leagues
            below are schedule-only or not yet modelled. Nothing here implies
            picks for a league we don&apos;t model.
          </>
        }
      />

      {/* ---- Sports coverage grid ----------------------------------- */}
      <section aria-label="Sports coverage" className="mt-6 flex flex-col gap-2.5">
        <h2
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
        >
          Sports coverage
        </h2>
        <SportsCoverageGrid sports={SPORTS_COVERAGE} columns={3} />
      </section>

      {/* ---- Schedules heading ------------------------------------- */}
      <h2
        className="mt-8 font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
      >
        Schedules
      </h2>

      {/* ---- Honesty note ------------------------------------------- */}
      <p
        className="mt-4 rounded-[8px] px-3.5 py-2.5 text-[12.5px] leading-relaxed"
        style={{
          background: "var(--gtp-card-sunken)",
          border: "1px solid var(--vault-rule)",
          color: "var(--vault-text-mute)",
        }}
      >
        <span
          className="font-mono uppercase tracking-[0.14em] mr-2"
          style={{ color: "var(--vault-warn)", fontSize: 10.5 }}
        >
          Schedule only
        </span>
        Times are snapshots, not live, and can change. This page is
        informational — it is not betting advice.
      </p>

      {/* ---- The hub ------------------------------------------------ */}
      <div className="mt-6">
        <EventScheduleHub leagues={leagues} />
      </div>
    </div>
  );
}
