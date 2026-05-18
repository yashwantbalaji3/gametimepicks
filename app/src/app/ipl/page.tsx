import Link from "next/link";
import {
  activeIplDate,
  getAvailableIplScheduleDates,
  getIplScheduleForDate,
} from "@/lib/data-ipl";
import NeonStatPanel from "@/components/neon-stat-panel";
import IplSectionTabs from "@/components/ipl/ipl-section-tabs";
import UpcomingSlateStrip, {
  type UpcomingSlateDay,
} from "@/components/upcoming-slate-strip";
import OverviewFooterDisclosure from "@/components/overview-footer-disclosure";
import SportLobbyActions from "@/components/sport-lobby-actions";

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

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <IplSectionTabs />
      </div>

      <section className="reveal vault-data-orbit relative overflow-hidden -mx-4 sm:-mx-8 px-4 sm:px-8 py-8">
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
        >
          IPL · educational analytics · early days
        </div>
        <h1
          className="mt-3 vault-display-h1"
          style={{ color: "var(--vault-text)" }}
        >
          IPL is joining the lineup.
        </h1>
        <p
          className="mt-4 max-w-2xl text-[14px] sm:text-[15px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          Schedule loads from ESPN&apos;s free public cricket
          scoreboard. The model board, parlays, and results stay
          honestly pending until we wire a stable per-batsman and
          per-bowler stats source. We will not surface IPL projections
          before the data supports them.
        </p>
      </section>

      <section className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
        <NeonStatPanel
          label="Matches on slate"
          value={String(games.length)}
          sub={date}
          valueAccent={games.length > 0 ? "gold" : "mute"}
          delay={1}
        />
        <NeonStatPanel
          label="Model leans"
          value="0"
          sub="awaiting per-player stats"
          valueAccent="mute"
          delay={2}
        />
        <NeonStatPanel
          label="Power Board"
          value="—"
          sub="Sixes + boundary watch"
          valueAccent="mute"
          delay={3}
        />
        <NeonStatPanel
          label="Settled audit"
          value="—"
          sub="no settled IPL slates yet"
          valueAccent="mute"
          delay={4}
        />
      </section>

      {/* Unified sport-lobby action grid. */}
      <div className="mt-8">
        <SportLobbyActions
          sport="ipl"
          status={{
            board: { text: "stats provider pending", tone: "warn" },
            parlays: { text: "pending model board", tone: "mute" },
            power: { text: "high-variance watch", tone: "warn" },
            results: {
              text: "pending first settlement",
              tone: "mute",
            },
          }}
        />
      </div>

      <section className="mt-10">
        <h2
          className="font-mono uppercase tracking-[0.16em] mb-3"
          style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
        >
          IPL slate · {date}
        </h2>
        {!scheduleLoaded || games.length === 0 ? (
          <div
            className="rounded-[6px] px-4 py-5 text-[13px]"
            style={{
              background: "rgba(7, 11, 26, 0.55)",
              border: "1px solid var(--vault-border)",
              color: "var(--vault-text-mute)",
            }}
          >
            No IPL matches on the active date. The next match will
            appear here as soon as ESPN&apos;s cricket scoreboard
            publishes it.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {games.map((g) => (
              <div
                key={String(g.matchId)}
                className="flex items-center justify-between gap-3 rounded-[3px]"
                style={{
                  paddingTop: 10,
                  paddingBottom: 10,
                  paddingLeft: 14,
                  paddingRight: 14,
                  border: "1px solid var(--vault-border)",
                  background: "rgba(7, 11, 26, 0.45)",
                  minWidth: 0,
                  overflow: "hidden",
                }}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span
                    style={{
                      color: "var(--vault-text)",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {g.shortName ??
                      `${g.awayTeamAbbr ?? "?"} v ${g.homeTeamAbbr ?? "?"}`}
                  </span>
                  <span
                    style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
                  >
                    {g.venue ?? "IPL"}
                    {g.status ? ` · ${g.status}` : ""}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span
                    className="font-mono"
                    style={{ color: "var(--vault-gold-bright)", fontSize: 12 }}
                  >
                    {formatTipoffEt(g.gameDate)}
                  </span>
                  <span
                    className="font-mono uppercase tracking-[0.14em]"
                    style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
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
        emptyMessage="No upcoming IPL matches on disk yet. The next refresh will pull the rolling window."
      />

      <OverviewFooterDisclosure
        inputsLabel="What is wired today"
        inputsBody={
          <>
            ESPN free cricket scoreboard for the active date. No paid
            odds. No per-player projections. No fabricated picks.
            Every other surface on /ipl/* clearly reads as pending
            until the data is real.
          </>
        }
        framingBody={
          <>
            Same educational-analytics framing as NBA, MLB and NHL.
            The Results page is where hit-rate calibration will live
            once settled IPL leans exist.
          </>
        }
      />
    </div>
  );
}

function buildIplUpcomingDays(_activeDate: string): UpcomingSlateDay[] {
  const allDates = getAvailableIplScheduleDates();
  if (allDates.length === 0) return [];
  // Window starts from today (ET).
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
      teaser = g.shortName ?? `${g.awayTeamAbbr ?? "?"} v ${g.homeTeamAbbr ?? "?"}`;
    } else {
      const first = games[0];
      teaser = `${games.length} matches · ${
        first?.shortName ??
        `${first?.awayTeamAbbr ?? "?"} v ${first?.homeTeamAbbr ?? "?"}`
      } +${games.length - 1} more`;
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
