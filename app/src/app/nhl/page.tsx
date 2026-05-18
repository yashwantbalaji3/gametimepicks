import Link from "next/link";
import {
  activeNhlDate,
  getAvailableNhlScheduleDates,
  getNhlScheduleForDate,
} from "@/lib/data-nhl";
import NeonStatPanel from "@/components/neon-stat-panel";
import NhlSectionTabs from "@/components/nhl/nhl-section-tabs";
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

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <NhlSectionTabs />
      </div>

      <section className="reveal vault-data-orbit relative overflow-hidden -mx-4 sm:-mx-8 px-4 sm:px-8 py-8">
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
        >
          NHL · educational analytics · early days
        </div>
        <h1
          className="mt-3 vault-display-h1"
          style={{ color: "var(--vault-text)" }}
        >
          NHL is joining the lineup.
        </h1>
        <p
          className="mt-4 max-w-2xl text-[14px] sm:text-[15px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          Schedule loads from the free NHL public API. The model board,
          parlays, and results stay honestly pending until paid odds
          wiring and per-player game-log ingestion are wired. We refuse
          to surface NHL projections before the data supports them.
        </p>
      </section>

      <section className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
        <NeonStatPanel
          label="Games on slate"
          value={String(games.length)}
          sub={date}
          valueAccent={games.length > 0 ? "gold" : "mute"}
          delay={1}
        />
        <NeonStatPanel
          label="Model leans"
          value="0"
          sub="awaiting projection wiring"
          valueAccent="mute"
          delay={2}
        />
        <NeonStatPanel
          label="Power Board"
          value="—"
          sub="Goals + shot-volume watch"
          valueAccent="mute"
          delay={3}
        />
        <NeonStatPanel
          label="Settled audit"
          value="—"
          sub="no settled NHL slates yet"
          valueAccent="mute"
          delay={4}
        />
      </section>

      <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/nhl/board"
          className="gtp-aurora-halo block reveal vault-glow-hover"
        >
          <div className="gtp-status-board p-5 sm:p-6 h-full">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block w-2 h-2 rounded-full"
                style={{
                  background: "var(--vault-warn)",
                  boxShadow: "0 0 10px rgba(212, 175, 55, 0.5)",
                }}
              />
              <span
                className="font-mono uppercase tracking-[0.16em]"
                style={{ color: "var(--vault-warn)", fontSize: 10 }}
              >
                main projection board · pending
              </span>
            </div>
            <h2
              className="mt-3 font-display font-semibold tracking-tight"
              style={{ color: "var(--vault-text)", fontSize: 22, lineHeight: 1.15 }}
            >
              NHL Model Board
            </h2>
            <p
              className="mt-2 text-[13px] leading-snug"
              style={{ color: "var(--vault-text-mute)" }}
            >
              Shots on goal, points, and goalie saves are the planned
              MVP markets once odds + per-player logs are wired. No
              projections until the data supports them.
            </p>
            <div
              className="mt-4 font-mono"
              style={{ color: "var(--vault-gold-bright)", fontSize: 12 }}
            >
              See the pending shell →
            </div>
          </div>
        </Link>

        <Link
          href="/nhl/power"
          className="gtp-aurora-halo block reveal vault-glow-hover"
        >
          <div className="gtp-status-board p-5 sm:p-6 h-full">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block w-2 h-2 rounded-full"
                style={{
                  background: "var(--vault-warn)",
                  boxShadow: "0 0 10px rgba(212, 175, 55, 0.5)",
                }}
              />
              <span
                className="font-mono uppercase tracking-[0.16em]"
                style={{ color: "var(--vault-warn)", fontSize: 10 }}
              >
                Power Board · pending
              </span>
            </div>
            <h2
              className="mt-3 font-display font-semibold tracking-tight"
              style={{ color: "var(--vault-text)", fontSize: 22, lineHeight: 1.15 }}
            >
              Goals + shot-volume watch
            </h2>
            <p
              className="mt-2 text-[13px] leading-snug"
              style={{ color: "var(--vault-text-mute)" }}
            >
              High-variance NHL signals — goals, shot bursts, goalie
              pressure — will live here on a power-profile rating, not
              standard confidence tiers.
            </p>
            <div
              className="mt-4 font-mono"
              style={{ color: "var(--vault-gold-bright)", fontSize: 12 }}
            >
              See the pending shell →
            </div>
          </div>
        </Link>
      </section>

      <section className="mt-10">
        <h2
          className="font-mono uppercase tracking-[0.16em] mb-3"
          style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
        >
          NHL slate · {date}
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
            No NHL games on the active date. The free NHL public API
            will surface the next scheduled matchups as the playoff
            bracket advances.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {games.map((g) => {
              const isPlayoff = g.gameType === 3;
              return (
                <div
                  key={String(g.gameId)}
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
                      {g.awayTeamAbbr ?? "?"} @ {g.homeTeamAbbr ?? "?"}
                    </span>
                    <span
                      style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
                    >
                      {isPlayoff ? "Playoffs" : "Regular season"}
                      {g.venue ? ` · ${g.venue}` : ""}
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

      <section className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          className="rounded-[6px] px-4 py-4 text-[12px] leading-relaxed"
          style={{
            background: "rgba(7, 11, 26, 0.45)",
            border: "1px solid var(--vault-border)",
            color: "var(--vault-text-mute)",
          }}
        >
          <div
            className="font-mono uppercase tracking-[0.14em] mb-2"
            style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
          >
            What is wired today
          </div>
          Free NHL public API schedule for the active date. No paid
          odds. No projections. No fabricated picks. Every other surface
          on /nhl/* clearly reads as pending until the data is real.
        </div>
        <div
          className="rounded-[6px] px-4 py-4 text-[12px] leading-relaxed"
          style={{
            background: "rgba(7, 11, 26, 0.45)",
            border: "1px solid var(--vault-border)",
            color: "var(--vault-text-mute)",
          }}
        >
          <div
            className="font-mono uppercase tracking-[0.14em] mb-2"
            style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
          >
            Honest framing
          </div>
          Same educational-analytics framing as NBA and MLB. The
          Results page is where hit-rate calibration will live once
          settled NHL leans exist. See{" "}
          <Link
            href="/responsible-use"
            style={{ color: "var(--vault-gold-bright)" }}
          >
            Responsible Use
          </Link>{" "}
          for helplines.
        </div>
      </section>
    </div>
  );
}

function buildNhlUpcomingDays(_activeDate: string): UpcomingSlateDay[] {
  const allDates = getAvailableNhlScheduleDates();
  if (allDates.length === 0) return [];
  // Window starts from today (ET) so the strip leads with the
  // current date even when activeNhlDate() picks an off-day or jumps
  // forward to the next game date.
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
