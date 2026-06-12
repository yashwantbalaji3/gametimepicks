/**
 * NHL overview — PR #63.
 *
 * Same shared `SportOverviewHero` as `/nba` and `/mlb` so the four
 * sport hubs read as siblings. NHL ships in `providerPending` state:
 * the schedule loads from the free NHL public API but there is no
 * paid odds + per-player game-log loader yet, so the model board,
 * parlays, and audit are honestly empty. We do **not** fabricate
 * projections.
 */
import {
  activeNhlDate,
  getAvailableNhlScheduleDates,
  getNhlScheduleForDate,
} from "@/lib/data-nhl";

import NhlSectionTabs from "@/components/nhl/nhl-section-tabs";
import OverviewFooterDisclosure from "@/components/overview-footer-disclosure";
import QuickActionRail from "@/components/quick-action-rail";
import SectionHeader from "@/components/section-header";
import SportOverviewHero from "@/components/sport-overview-hero";
import UpcomingSlateStrip, {
  type UpcomingSlateDay,
} from "@/components/upcoming-slate-strip";

export const metadata = {
  title: "NHL · GameTime Picks",
  description:
    "NHL educational analytics — schedule loaded from the free NHL API. Projection board pending paid odds + per-player log wiring.",
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

export default function NhlLandingPage() {
  const date = activeNhlDate() ?? DEFAULT_DATE;
  const schedule = getNhlScheduleForDate(date);
  const games = schedule.games ?? [];
  const scheduleLoaded = schedule.scheduleSource !== "unavailable";

  const heroStats = [
    {
      label: "Games on slate",
      value: String(games.length),
      sub: date,
    },
    {
      label: "Model leans",
      value: "—",
      sub: "projection model pending",
    },
    {
      label: "Settled audit",
      value: "—",
      sub: "no settled NHL slates yet",
    },
  ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <NhlSectionTabs />
      </div>

      <SportOverviewHero
        eyebrow="NHL · educational analytics · early days"
        sport="NHL"
        tagline="schedule live · model pending"
        statusKind="providerPending"
        statusLabel="Provider pending"
        matchupLine={`Slate · ${date}`}
        stats={heroStats}
        accent="nhl"
        ctas={[
          { href: "/results", label: "Cross-sport audit", primary: true },
          { href: "/methodology", label: "Why pending" },
        ]}
        framing="Schedule loads from the free NHL public API. Model board, parlays, and audit stay honestly empty until paid odds wiring + per-player game-log ingestion ship. We refuse to surface NHL projections before the data supports them."
      />

      <section className="mt-10" aria-label="NHL slate">
        <SectionHeader
          eyebrow={`Slate · ${date}`}
          title={
            !scheduleLoaded || games.length === 0
              ? "No NHL games on the active date"
              : `${games.length} game${games.length === 1 ? "" : "s"} on the slate`
          }
          sub={
            !scheduleLoaded || games.length === 0
              ? "The free NHL public API will surface the next scheduled matchups as the playoff bracket advances."
              : "Schedule loads from the free NHL public API. Model wiring is pending."
          }
        />
        {scheduleLoaded && games.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {games.map((g) => {
              const isPlayoff = g.gameType === 3;
              return (
                <div
                  key={String(g.gameId)}
                  className="flex items-center justify-between gap-3 rounded-[6px]"
                  style={{
                    padding: "12px 14px",
                    border: "1px solid var(--vault-border)",
                    background: "rgba(26, 16, 11, 0.55)",
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
                      {g.awayTeamAbbr ?? "?"} @ {g.homeTeamAbbr ?? "?"}
                    </span>
                    <span
                      style={{
                        color: "var(--vault-text-faint)",
                        fontSize: 11,
                      }}
                    >
                      {isPlayoff ? "Playoffs" : "Regular season"}
                      {g.venue ? ` · ${g.venue}` : ""}
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
                        fontSize: 10,
                      }}
                    >
                      schedule only
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <UpcomingSlateStrip
        title="Upcoming · next 7 days"
        days={buildNhlUpcomingDays(date)}
        boardHrefBase="/nhl/board"
        emptyMessage="No upcoming NHL playoff games on disk yet. The next refresh will pull the bracket."
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
            Free NHL public API schedule for the active date. No paid
            odds. No projections. No fabricated picks. Every other
            surface on /nhl/* clearly reads as pending until the data
            is real.
          </>
        }
        framingBody={
          <>
            Same educational-analytics framing as NBA and MLB. The
            Results page is where hit-rate calibration will live once
            settled NHL leans exist.
          </>
        }
      />
    </div>
  );
}

function buildNhlUpcomingDays(_activeDate: string): UpcomingSlateDay[] {
  const allDates = getAvailableNhlScheduleDates();
  if (allDates.length === 0) return [];
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  const forward = allDates.filter((d) => d >= today).slice(0, 8);
  return forward.map((d) => {
    const sched = getNhlScheduleForDate(d);
    const games = sched.games ?? [];
    const status: UpcomingSlateDay["status"] =
      games.length === 0 ? "off-day" : "pending";
    let teaser: string;
    if (games.length === 0) {
      teaser = "No games scheduled";
    } else if (games.length === 1 && games[0]) {
      const g = games[0];
      teaser = `${g.awayTeamAbbr ?? "?"} @ ${g.homeTeamAbbr ?? "?"}`;
    } else {
      const first = games[0];
      teaser = `${games.length} games · ${
        first?.awayTeamAbbr ?? "?"} @ ${first?.homeTeamAbbr ?? "?"} +${games.length - 1} more`;
    }
    return {
      date: d,
      gameCount: games.length,
      label: shortDateLabelNhl(d),
      teaser,
      status,
    };
  });
}

function shortDateLabelNhl(date: string): string {
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
