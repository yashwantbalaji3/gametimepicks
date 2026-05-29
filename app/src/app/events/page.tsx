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
import { listLeagueSchedules } from "@/lib/event-schedules";

const META_TITLE = "Sports Event Hub · GameTime Picks";
const META_DESCRIPTION =
  "Upcoming WNBA, UFC, and FIFA World Cup schedules — dates, matchups, and venues only. We do not publish odds, projections, or picks for these leagues.";

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
      <header className="flex flex-col gap-3">
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
        >
          Schedule hub · no odds · no projections
        </span>
        <h1
          className="font-semibold tracking-tight"
          style={{
            color: "var(--vault-gold-bright)",
            fontSize: 30,
            lineHeight: 1.05,
          }}
        >
          Sports Event Hub
        </h1>
        <p
          className="text-[14px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)", maxWidth: 640 }}
        >
          Upcoming schedules for the WNBA, UFC, and FIFA World Cup — dates,
          matchups, and venues only. We do not model these leagues, so you
          won&apos;t find odds, projections, or picks here. Each tab shows a
          point-in-time snapshot from a public feed, attributed inline.
        </p>
      </header>

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
