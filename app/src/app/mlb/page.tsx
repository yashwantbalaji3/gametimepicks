import Link from "next/link";
import {
  activeMlbDate,
  getMlbAvailableScheduleDates,
  getMlbBoardForDate,
  getMlbScheduleForDate,
} from "@/lib/data-mlb";
import { getMlbLifetimeSummary } from "@/lib/data-mlb-results";
import { formatTipoffEt } from "@/lib/format-mlb";
import NeonStatPanel from "@/components/neon-stat-panel";
import MlbSummaryStrip from "@/components/mlb/mlb-summary-strip";
import MlbSectionTabs from "@/components/mlb/mlb-section-tabs";
import UpcomingSlateStrip, {
  type UpcomingSlateDay,
} from "@/components/upcoming-slate-strip";
import OverviewFooterDisclosure from "@/components/overview-footer-disclosure";
import SportLobbyActions from "@/components/sport-lobby-actions";

export const metadata = {
  title: "MLB · GameTime Picks",
  description:
    "Educational MLB player-prop analytics — transparent model leans on pitcher strikeouts and batter markets, with a separate Power Board for home-run analysis.",
};

const DEFAULT_DATE = "2026-05-16";

export default function MlbLandingPage() {
  const date = activeMlbDate() ?? DEFAULT_DATE;
  const board = getMlbBoardForDate(date);
  const schedule = getMlbScheduleForDate(date);
  const mlbLifetime = getMlbLifetimeSummary();

  const summary = board.summary;
  const propsAvailable = board.propsAvailable;

  // Build the upcoming-slate strip from every available schedule date in
  // the future (or today if no future dates). Pure derivation from disk
  // contents — no fabrication.
  const upcomingDays: UpcomingSlateDay[] = buildMlbUpcomingDays(date);

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <MlbSectionTabs />
      </div>

      {/* Hero — sport-eyebrow + headline */}
      <section className="reveal vault-data-orbit relative overflow-hidden -mx-4 sm:-mx-8 px-4 sm:px-8 py-8">
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
        >
          MLB · educational analytics
        </div>
        <h1
          className="mt-3 vault-display-h1"
          style={{ color: "var(--vault-text)" }}
        >
          MLB player props with a transparent model.
        </h1>
        <p
          className="mt-4 max-w-2xl text-[14px] sm:text-[15px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          We project pitcher strikeouts and batter markets from free MLB Stats
          API game logs, compare against posted prop lines, and surface the gap.
          Home-run picks live on a separate Power Board because the variance
          profile is different.
        </p>
        <div className="mt-5">
          <MlbSummaryStrip board={board} />
        </div>
      </section>

      {/* KPI tiles — today's MLB at a glance */}
      <section className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
        <NeonStatPanel
          label="Games today"
          value={String(summary.scheduledGames || schedule.games.length || 0)}
          sub={date}
          valueAccent="gold"
          delay={1}
        />
        <NeonStatPanel
          label="Model leans"
          value={String(summary.leans)}
          sub={propsAvailable ? "real prop lines" : "lines pending"}
          valueAccent={propsAvailable ? "default" : "mute"}
          delay={2}
        />
        <NeonStatPanel
          label="High confidence"
          value={String(summary.highConfidence)}
          sub={`anomalies flagged ${summary.anomalies}`}
          valueAccent="success"
          delay={3}
        />
        <NeonStatPanel
          label="Sample too small"
          value={String(summary.insufficientData)}
          sub="no projection emitted"
          valueAccent="mute"
          delay={4}
        />
      </section>

      {/* Unified sport-lobby action grid — Model Board / Parlays /
          Power Board / Results. Replaces the previous 2-card CTA
          strip + audit-pointer chip. */}
      <div className="mt-8">
        <SportLobbyActions
          sport="mlb"
          status={{
            board: propsAvailable
              ? { text: `live · ${summary.leans} leans`, tone: "success" }
              : { text: "lines pending", tone: "warn" },
            parlays: {
              text: "candidate slips · pending snapshots",
              tone: "mute",
            },
            power: { text: "HR + boundary watch", tone: "warn" },
            results: mlbLifetime
              ? {
                  text: `audit · ${mlbLifetime.wins}–${mlbLifetime.losses} on ${mlbLifetime.decisive}${mlbLifetime.partial ? " · partial" : ""}`,
                  tone: "success",
                }
              : { text: "pending first settlement", tone: "mute" },
          }}
        />
      </div>

      {/* Slate strip — today's matchups + tipoff */}
      <section className="mt-10">
        <h2
          className="font-mono uppercase tracking-[0.16em] mb-3"
          style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
        >
          Today's slate · {date}
        </h2>
        {schedule.games.length === 0 ? (
          <div
            className="rounded-[6px] px-4 py-5 text-[13px]"
            style={{
              background: "rgba(7, 11, 26, 0.55)",
              border: "1px solid var(--vault-border)",
              color: "var(--vault-text-mute)",
            }}
          >
            Schedule warming up. The MLB Stats API will return today's games
            shortly.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {schedule.games.map((g) => {
              const anchor = `game-${g.gamePk ?? `${g.awayTeamAbbr}-${g.homeTeamAbbr}`}`;
              const tileKey = g.gamePk ?? `${g.awayTeamAbbr}-${g.homeTeamAbbr}`;
              return (
                <Link
                  key={tileKey}
                  href={`/mlb/board#${anchor}`}
                  className="vault-glow-hover flex items-center justify-between gap-3 rounded-[3px] focus:outline-none focus-visible:outline focus-visible:outline-2"
                  style={{
                    paddingTop: 10,
                    paddingBottom: 10,
                    paddingLeft: 14,
                    paddingRight: 14,
                    border: "1px solid var(--vault-border)",
                    background: "rgba(7, 11, 26, 0.45)",
                    minWidth: 0,
                    overflow: "hidden",
                    color: "inherit",
                    textDecoration: "none",
                  }}
                  aria-label={`View props for ${g.awayTeamAbbr ?? "?"} at ${g.homeTeamAbbr ?? "?"}`}
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
                      {g.venue ?? "MLB"}
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
                      View props →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <UpcomingSlateStrip
        title="Upcoming · next 7 days"
        days={upcomingDays}
        boardHrefBase="/mlb/board"
        emptyMessage="No upcoming MLB slates on disk yet. The next refresh will pull the rolling window."
      />

      <OverviewFooterDisclosure
        inputsLabel="MVP projection method"
        inputsBody={
          <>
            Pitcher strikeouts: 0.55 · last-3 mean + 0.45 · season
            mean, normal approximation. Batters: 0.5 · last-10 mean +
            0.5 · season mean, with floor on sigma. MLB R5 anomaly
            guardrail caps edges above 20 pp to Low confidence.
          </>
        }
        framingBody={
          <>
            Educational analytics project. Not betting advice. Same
            responsible-use commitments as NBA.
          </>
        }
      />
    </div>
  );
}

/**
 * Build a 7-day forward-looking slate for /mlb. Reads schedule files
 * already on disk (written nightly by the schedule refresher). The
 * window starts from today (ET) so the strip stays useful even when
 * the activeMlbDate() walks ahead. Each entry is honest about
 * whether projections live for that date or whether lines are
 * still pending — derived from the matching board's propsAvailable
 * + leans count.
 */
function buildMlbUpcomingDays(_activeDate: string): UpcomingSlateDay[] {
  const allDates = getMlbAvailableScheduleDates();
  if (allDates.length === 0) return [];
  // Forward-looking window starting from today (ET). The active
  // date is intentionally NOT the lower bound — we want the strip
  // to lead with "today" even when the active date jumps ahead.
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  const forward = allDates.filter((d) => d >= today).slice(0, 8);
  return forward.map((d) => {
    const sched = getMlbScheduleForDate(d);
    const board = getMlbBoardForDate(d);
    const games = sched.games ?? [];
    const propsLive = board.propsAvailable && (board.leans?.length ?? 0) > 0;
    const status: UpcomingSlateDay["status"] =
      games.length === 0 ? "off-day" : propsLive ? "live" : "pending";
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
      label: shortDateLabel(d),
      teaser,
      status,
    };
  });
}

function shortDateLabel(date: string): string {
  // YYYY-MM-DD → "Sun · May 17"
  try {
    const dt = new Date(`${date}T17:00:00Z`);
    return dt.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "America/New_York",
    }).replace(",", " ·");
  } catch {
    return date;
  }
}
