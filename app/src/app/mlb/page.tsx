/**
 * MLB overview — PR #63.
 *
 * Mirrors the new NBA hero pattern via the shared `SportOverviewHero`
 * so the sport hubs feel like siblings. Keeps the existing slate strip
 * and upcoming-days strip; replaces the long paragraph hero + KPI grid.
 *
 * No fabricated projections. Lean / game counts come from the live
 * board summary (already populated by the MLB pipeline).
 */
import Link from "next/link";

import {
  activeMlbDate,
  getMlbAvailableScheduleDates,
  getMlbBoardForDate,
  getMlbScheduleForDate,
} from "@/lib/data-mlb";
import { getMlbLifetimeSummary } from "@/lib/data-mlb-results";
import { formatTipoffEt } from "@/lib/format-mlb";

import MlbSectionTabs from "@/components/mlb/mlb-section-tabs";
import MlbSummaryStrip from "@/components/mlb/mlb-summary-strip";
import OverviewFooterDisclosure from "@/components/overview-footer-disclosure";
import QuickActionRail from "@/components/quick-action-rail";
import SectionHeader from "@/components/section-header";
import SportOverviewHero from "@/components/sport-overview-hero";
import UpcomingSlateStrip, {
  type UpcomingSlateDay,
} from "@/components/upcoming-slate-strip";

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
  const games = schedule.games ?? [];
  const gameCount = summary.scheduledGames || games.length || 0;

  const statusKind: "live" | "linesPending" | "upcoming" =
    propsAvailable && summary.leans > 0
      ? "live"
      : gameCount > 0
        ? "linesPending"
        : "upcoming";
  const statusCaption =
    gameCount > 0 ? `${gameCount} game${gameCount === 1 ? "" : "s"}` : undefined;

  const heroStats = [
    {
      label: "Games today",
      value: String(gameCount),
      sub: date,
    },
    {
      label: "Projections",
      value: String(summary.leans),
      sub: propsAvailable ? "real prop lines" : "lines pending",
    },
    {
      label: "Stronger signals · high-variance",
      value: `${summary.highConfidence} · ${summary.anomalies}`,
      sub:
        mlbLifetime?.hitRate != null
          ? `track record ${(mlbLifetime.hitRate * 100).toFixed(1)}% on ${mlbLifetime.decisive}`
          : "results pending",
    },
  ];

  const primaryLabel = propsAvailable
    ? "View today's projections"
    : "Open model board";

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <MlbSectionTabs />
      </div>

      <SportOverviewHero
        eyebrow="MLB · today's slate"
        sport="MLB"
        tagline="projections · track record · power board"
        statusKind={statusKind}
        statusCaption={statusCaption}
        matchupLine={`Slate · ${date}`}
        stats={heroStats}
        accent="mlb"
        ctas={[
          { href: "/mlb/board", label: primaryLabel, primary: true },
          { href: "/results/mlb", label: "Latest results" },
        ]}
        framing="Pitcher strikeouts and batter hits / total bases projected from MLB Stats API game logs and compared to the bookmaker line. Home runs live on a separate Power Board because they're higher-variance."
      />

      <div className="mt-6">
        <MlbSummaryStrip board={board} />
      </div>

      {/* Slate strip — today's matchups + tipoff */}
      <section className="mt-10" aria-label="Today's slate">
        <SectionHeader
          eyebrow={`Slate · ${date}`}
          title={
            games.length === 0
              ? "Schedule warming up"
              : `${games.length} game${games.length === 1 ? "" : "s"} on the slate`
          }
          sub={
            games.length === 0
              ? "The MLB Stats API will return today's games shortly."
              : undefined
          }
          rightSlot={
            games.length > 0 ? (
              <Link
                href="/mlb/board"
                className="font-mono uppercase tracking-[0.14em]"
                style={{ color: "var(--vault-gold)", fontSize: 11 }}
              >
                Open board →
              </Link>
            ) : undefined
          }
        />
        {games.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {games.map((g) => {
              const anchor = `game-${g.gamePk ?? `${g.awayTeamAbbr}-${g.homeTeamAbbr}`}`;
              const tileKey = g.gamePk ?? `${g.awayTeamAbbr}-${g.homeTeamAbbr}`;
              return (
                <Link
                  key={tileKey}
                  href={`/mlb/board#${anchor}`}
                  className="vault-glow-hover flex items-center justify-between gap-3 rounded-[6px]"
                  style={{
                    padding: "12px 14px",
                    border: "1px solid var(--vault-border)",
                    background: "rgba(7, 11, 26, 0.55)",
                    color: "inherit",
                    textDecoration: "none",
                  }}
                  aria-label={`View props for ${g.awayTeamAbbr ?? "?"} at ${g.homeTeamAbbr ?? "?"}`}
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
                      {g.venue ?? "MLB"}
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
                      aria-hidden
                      className="font-mono"
                      style={{ color: "var(--vault-gold)", fontSize: 12 }}
                    >
                      →
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
        days={buildMlbUpcomingDays(date)}
        boardHrefBase="/mlb/board"
        emptyMessage="No upcoming MLB slates on disk yet. The next refresh will pull the rolling window."
      />

      <QuickActionRail
        heading="More on MLB"
        cards={[
          {
            href: "/mlb/board",
            eyebrow: "Tonight",
            title: "Model board",
            sub: propsAvailable
              ? `${summary.leans} projections across ${gameCount} game${gameCount === 1 ? "" : "s"}.`
              : "Lines arriving soon — schedule live.",
          },
          {
            href: "/results/mlb",
            eyebrow: "Results",
            title: "MLB results",
            sub:
              mlbLifetime?.hitRate != null
                ? `${(mlbLifetime.hitRate * 100).toFixed(1)}% on ${mlbLifetime.decisive} settled.`
                : "Pending first settlement.",
          },
          {
            href: "/results/model-audit",
            eyebrow: "Performance",
            title: "Model performance",
            sub: "Per-market, per-edge, per-game dispersion.",
          },
          {
            href: "/mlb/power",
            eyebrow: "Power",
            title: "Power Board",
            sub: "Home runs tracked separately. High-variance watch.",
          },
        ]}
      />

      <OverviewFooterDisclosure
        inputsLabel="MVP projection method"
        inputsBody={
          <>
            Pitcher strikeouts: 0.55 · last-3 mean + 0.45 · season mean,
            normal approximation. Batters: 0.5 · last-10 mean + 0.5 ·
            season mean, with floor on sigma. MLB R5 anomaly guardrail
            caps edges above 20pp to Low confidence.
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

function buildMlbUpcomingDays(_activeDate: string): UpcomingSlateDay[] {
  const allDates = getMlbAvailableScheduleDates();
  if (allDates.length === 0) return [];
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
