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
import SportsCoverageBoard, {
  type CoverageExtra,
} from "@/components/sports-coverage-board";
import PageHero from "@/components/page-hero";
import {
  listLeagueSchedules,
  getLeagueSchedule,
  EVENT_LEAGUE_ORDER,
  formatEventDateLabel,
  formatEventTimeLabel,
} from "@/lib/event-schedules";
import { SPORTS_COVERAGE } from "@/lib/sports-coverage";

const META_TITLE = "Sports & Events · GameTime Picks";
const META_DESCRIPTION =
  "What GameTime Picks covers: MLB simulations and projections, plus schedule-only coverage for NBA (off-season), NHL, WNBA, UFC and IPL. No odds, projections, or picks for leagues we do not model.";

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

  // Server-computed "next event + source" for the leagues whose schedule we
  // surface directly (keys match the sports-coverage keys). Read from the
  // same baked, attributed snapshots — never fabricated.
  const coverageExtras: Record<string, CoverageExtra> = {};
  for (const lk of EVENT_LEAGUE_ORDER) {
    const sched = getLeagueSchedule(lk);
    const next = sched.events[0];
    coverageExtras[lk] = {
      nextEvent: next
        ? {
            dateLabel: formatEventDateLabel(next.startUtc),
            timeLabel: formatEventTimeLabel(next.startUtc),
            name: next.name,
          }
        : undefined,
      source: { name: sched.source.name, retrievedAt: sched.source.retrievedAt },
    };
  }

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-8 overflow-x-hidden">
      {/* ---- Hero --------------------------------------------------- */}
      <PageHero
        eyebrow="Sports coverage · schedules"
        title="Sports & Events"
        subMaxWidth={680}
        sub={
          <>
            Everything GameTime Picks covers, in one place. MLB is the only
            league with live simulations and player-prop projections today. NBA
            is off-season — its settled record stays published, but there are no
            live NBA projections. Every other league below is schedule-only or
            not yet modelled. Nothing here implies picks for a league we
            don&apos;t model.
          </>
        }
      />

      {/* ---- Sports coverage board (mobile-first) ------------------- */}
      <div className="mt-6 flex flex-col gap-3">
        <h2
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
        >
          Sports coverage
        </h2>
        <SportsCoverageBoard sports={SPORTS_COVERAGE} extras={coverageExtras} />
      </div>

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
