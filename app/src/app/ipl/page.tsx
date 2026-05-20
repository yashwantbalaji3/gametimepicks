/**
 * IPL overview — PR #63.
 *
 * Same shared `SportOverviewHero` as `/nba`, `/mlb`, `/nhl` so the
 * four sport hubs read as siblings. IPL ships in `providerPending`
 * state: the schedule loads from ESPN's free cricket scoreboard but
 * there is no per-batsman / per-bowler stats source wired yet, so the
 * model board, parlays, and audit are honestly empty. We do **not**
 * fabricate projections.
 */
import {
  activeIplDate,
  getAvailableIplScheduleDates,
  getIplScheduleForDate,
} from "@/lib/data-ipl";

import IplSectionTabs from "@/components/ipl/ipl-section-tabs";
import OverviewFooterDisclosure from "@/components/overview-footer-disclosure";
import QuickActionRail from "@/components/quick-action-rail";
import SectionHeader from "@/components/section-header";
import SportOverviewHero from "@/components/sport-overview-hero";
import UpcomingSlateStrip, {
  type UpcomingSlateDay,
} from "@/components/upcoming-slate-strip";

export const metadata = {
  title: "IPL · GameTime Picks",
  description:
    "IPL educational analytics — schedule loaded from ESPN's free cricket scoreboard. Model board pending a stable per-player stats source.",
};

const DEFAULT_DATE = "2026-05-18";

function formatTipoffEt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    });
  } catch {
    return "—";
  }
}

export default function IplLandingPage() {
  const date = activeIplDate() ?? DEFAULT_DATE;
  const schedule = getIplScheduleForDate(date);
  const games = schedule.games ?? [];
  const scheduleLoaded = schedule.scheduleSource !== "unavailable";

  const heroStats = [
    {
      label: "Matches on slate",
      value: String(games.length),
      sub: date,
    },
    {
      label: "Model leans",
      value: "—",
      sub: "stats provider pending",
    },
    {
      label: "Settled audit",
      value: "—",
      sub: "no settled IPL slates yet",
    },
  ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <IplSectionTabs />
      </div>

      <SportOverviewHero
        eyebrow="IPL · educational analytics · early days"
        sport="IPL"
        tagline="schedule live · stats provider pending"
        statusKind="providerPending"
        statusLabel="Provider pending"
        matchupLine={`Slate · ${date}`}
        stats={heroStats}
        accent="ipl"
        ctas={[
          { href: "/results", label: "Cross-sport audit", primary: true },
          { href: "/methodology", label: "Why pending" },
        ]}
        framing="Schedule loads from ESPN's free public cricket scoreboard. Model board, parlays, and audit stay honestly empty until we wire a stable per-batsman / per-bowler stats source. We refuse to surface IPL projections before the data supports them."
      />

      <section className="mt-10" aria-label="IPL slate">
        <SectionHeader
          eyebrow={`Slate · ${date}`}
          title={
            !scheduleLoaded || games.length === 0
              ? "No IPL matches on the active date"
              : `${games.length} match${games.length === 1 ? "" : "es"} on the slate`
          }
          sub={
            !scheduleLoaded || games.length === 0
              ? "ESPN's free cricket scoreboard will surface the next scheduled matches as the season advances."
              : "Schedule loads from ESPN's free cricket scoreboard. Model wiring is pending."
          }
        />
        {scheduleLoaded && games.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {games.map((g) => (
              <div
                key={String(g.matchId)}
                className="flex items-center justify-between gap-3 rounded-[6px]"
                style={{
                  padding: "12px 14px",
                  border: "1px solid var(--vault-border)",
                  background: "rgba(7, 11, 26, 0.55)",
                }}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span
                    style={{
                      color: "var(--vault-text)",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    {g.awayTeamAbbr ?? "?"} vs {g.homeTeamAbbr ?? "?"}
                  </span>
                  <span
                    style={{
                      color: "var(--vault-text-faint)",
                      fontSize: 11,
                    }}
                  >
                    {g.venue ?? "IPL"}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span
                    className="font-mono"
                    style={{
                      color: "var(--vault-gold-bright)",
                      fontSize: 12,
                    }}
                  >
                    {formatTipoffEt(g.gameDate)}
                  </span>
                  <span
                    className="font-mono uppercase tracking-[0.14em]"
                    style={{
                      color: "var(--vault-text-faint)",
                      fontSize: 9,
                    }}
                  >
                    schedule only
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <UpcomingSlateStrip
        title="Upcoming · next 7 days"
        days={buildIplUpcomingDays(date)}
        boardHrefBase="/ipl/board"
        emptyMessage="No upcoming IPL matches on disk yet. The next refresh will pull the schedule window."
      />

      <QuickActionRail
        heading="In the meantime"
        cards={[
          {
            href: "/nba",
            eyebrow: "NBA",
            title: "NBA hub",
            sub: "Live model board + per-game projection cards.",
          },
          {
            href: "/mlb",
            eyebrow: "MLB",
            title: "MLB hub",
            sub: "Pitcher strikeouts + batter markets.",
          },
          {
            href: "/results",
            eyebrow: "Audit",
            title: "Cross-sport audit",
            sub: "Every settled NBA + MLB pick, graded honestly.",
          },
          {
            href: "/methodology",
            eyebrow: "About",
            title: "Methodology",
            sub: "What the model uses and what's coming next.",
          },
        ]}
      />

      <OverviewFooterDisclosure
        inputsLabel="What is wired today"
        inputsBody={
          <>
            ESPN's free public cricket scoreboard for the active date.
            No paid odds. No projections. No fabricated picks. Every
            other surface on /ipl/* clearly reads as pending until the
            data is real.
          </>
        }
        framingBody={
          <>
            Same educational-analytics framing as NBA and MLB. The
            Results page is where hit-rate calibration will live once
            settled IPL leans exist.
          </>
        }
      />
    </div>
  );
}

function buildIplUpcomingDays(_activeDate: string): UpcomingSlateDay[] {
  const allDates = getAvailableIplScheduleDates();
  if (allDates.length === 0) return [];
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  const forward = allDates.filter((d) => d >= today).slice(0, 8);
  return forward.map((d) => {
    const sched = getIplScheduleForDate(d);
    const games = sched.games ?? [];
    const status: UpcomingSlateDay["status"] =
      games.length === 0 ? "off-day" : "pending";
    let teaser: string;
    if (games.length === 0) {
      teaser = "No matches scheduled";
    } else if (games.length === 1 && games[0]) {
      const g = games[0];
      teaser = `${g.awayTeamAbbr ?? "?"} vs ${g.homeTeamAbbr ?? "?"}`;
    } else {
      const first = games[0];
      teaser = `${games.length} matches · ${
        first?.awayTeamAbbr ?? "?"} vs ${first?.homeTeamAbbr ?? "?"} +${games.length - 1} more`;
    }
    return {
      date: d,
      gameCount: games.length,
      label: shortDateLabelIpl(d),
      teaser,
      status,
    };
  });
}

function shortDateLabelIpl(date: string): string {
  try {
    const dt = new Date(`${date}T17:00:00Z`);
    return dt
      .toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "America/New_York",
      })
      .replace(",", " ·");
  } catch {
    return date;
  }
}
