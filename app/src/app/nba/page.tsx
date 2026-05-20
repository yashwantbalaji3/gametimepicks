/**
 * NBA overview — PR #63.
 *
 * Replaces the previous paragraph hero with the shared `SportOverviewHero`
 * so the four sport pages (`/nba`, `/mlb`, `/nhl`, `/ipl`) read like
 * siblings. Same scoreboard stats, same status pill, same CTA pattern.
 * The active-slate game strip stays below as a compact game selector.
 *
 * Honesty preserved: no fabricated projections; lean / game counts are
 * computed from the same active-slate selector the model board uses.
 */
import Link from "next/link";

import {
  getSlate,
  getBoardForDate,
  getAvailableBoardDates,
  getLifetimeSummary,
} from "@/lib/data";
import type { BoardData } from "@/lib/types";
import { selectActiveSlate } from "@/lib/active-slate";
import { currentEtDate, dayLabelFor } from "@/lib/freshness";
import { formatDateLong } from "@/lib/format";

import NbaSectionTabs from "@/components/nba/nba-section-tabs";
import OverviewFooterDisclosure from "@/components/overview-footer-disclosure";
import QuickActionRail from "@/components/quick-action-rail";
import SectionHeader from "@/components/section-header";
import SportOverviewHero from "@/components/sport-overview-hero";
import { getPlayoffContext } from "@/components/playoff-context";

export const metadata = {
  title: "NBA · GameTime Picks",
  description:
    "Educational NBA player-prop analytics — transparent model leans on points, rebounds and assists with a separate audit page for hit-rate calibration.",
};

export default function NbaLandingPage() {
  const slate = getSlate();
  const lifetime = getLifetimeSummary();
  const today = currentEtDate();
  const allDates = getAvailableBoardDates();

  const boardsByDate: Record<string, BoardData> = {};
  for (const d of allDates) {
    boardsByDate[d] = getBoardForDate(d);
  }
  const rawActiveSlate = selectActiveSlate(allDates, today, boardsByDate);
  const activeSlate = (() => {
    if (rawActiveSlate.kind !== "today") return rawActiveSlate;
    const todayDate = rawActiveSlate.selectedDate;
    if (!todayDate) return rawActiveSlate;
    const todayBoard = boardsByDate[todayDate];
    if ((todayBoard?.games?.length ?? 0) > 0) return rawActiveSlate;
    const futureWithLeans = rawActiveSlate.upcomingAndTodayDates
      .filter((d) => d > todayDate)
      .find((d) => (boardsByDate[d]?.leans?.length ?? 0) > 0);
    if (!futureWithLeans) return rawActiveSlate;
    return { ...rawActiveSlate, selectedDate: futureWithLeans };
  })();

  const activeDate = activeSlate.selectedDate ?? slate.primaryDate;
  const board = activeDate ? boardsByDate[activeDate] : undefined;
  const leans = board?.leans ?? [];
  const games = board?.games ?? [];
  const usableLeans = leans.filter(
    (l) => l.lean === "Over" || l.lean === "Under",
  ).length;
  const highCount = leans.filter((l) => l.confidence === "High").length;
  const anomalyCount = leans.filter((l) =>
    (l.riskFlags ?? []).includes("suspicious_edge"),
  ).length;
  const propsLoaded = leans.some(
    (l) =>
      typeof l.projection === "number" &&
      typeof l.edgePct === "number" &&
      Number.isFinite(l.edgePct),
  );

  const statusKind: "live" | "linesPending" | "upcoming" =
    usableLeans > 0
      ? "live"
      : games.length > 0
        ? "linesPending"
        : "upcoming";
  const statusCaption =
    games.length > 0
      ? `${games.length} game${games.length === 1 ? "" : "s"}`
      : undefined;

  const matchupLine = activeDate
    ? `${dayLabelFor(activeDate, today)} · ${formatDateLong(activeDate)}`
    : undefined;

  const heroStats = [
    {
      label: "Games on slate",
      value: String(games.length),
      sub: activeDate || "—",
    },
    {
      label: "Model leans",
      value: String(leans.length),
      sub: propsLoaded ? "real prop lines" : "lines pending",
    },
    {
      label: "High conf · anomalies",
      value: `${highCount} · ${anomalyCount}`,
      sub:
        lifetime?.hitRate != null
          ? `audit ${(lifetime.hitRate * 100).toFixed(1)}% on ${lifetime.decisive}`
          : "audit pending",
    },
  ];

  const primaryLabel = propsLoaded
    ? "View today's projections"
    : "Open model board";

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <NbaSectionTabs />
      </div>

      <SportOverviewHero
        eyebrow="NBA · educational analytics"
        sport="NBA"
        tagline="model board · audit · parlay lab"
        statusKind={statusKind}
        statusCaption={statusCaption}
        matchupLine={matchupLine}
        stats={heroStats}
        accent="nba"
        ctas={[
          { href: "/nba/board", label: primaryLabel, primary: true },
          { href: "/results/nba", label: "Latest audit" },
        ]}
        framing="Points, rebounds, assists projected from each player's last 10 games and compared to the closing line. Edges above ~25pp are capped at Low confidence and tagged as anomalies — never sold as confident leans."
      />

      {/* Active slate strip */}
      <section className="mt-10" aria-label="Active slate">
        <SectionHeader
          eyebrow={
            activeDate
              ? `${dayLabelFor(activeDate, today)} slate`
              : "Active slate"
          }
          title={
            activeDate
              ? `${formatDateLong(activeDate)}`
              : "No NBA games on the active slate"
          }
          sub={
            games.length === 0
              ? "The next refresh will surface tomorrow's matchups as soon as the schedule posts."
              : undefined
          }
          rightSlot={
            activeDate ? (
              <Link
                href="/nba/board"
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
              const ctx = getPlayoffContext(
                g.gameId,
                g.awayTeamAbbr,
                g.homeTeamAbbr,
              );
              return (
                <Link
                  key={g.gameId}
                  href="/nba/board"
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
                      {ctx.isPlayoffs
                        ? `${ctx.roundLabel} · ${ctx.gameLabel}`
                        : "regular season"}
                    </span>
                  </div>
                  <span
                    aria-hidden
                    className="font-mono"
                    style={{ color: "var(--vault-gold)", fontSize: 12 }}
                  >
                    →
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <QuickActionRail
        heading="More on NBA"
        cards={[
          {
            href: "/nba/board",
            eyebrow: "Tonight",
            title: "Model board",
            sub: propsLoaded
              ? `${leans.length} projections across ${games.length} game${games.length === 1 ? "" : "s"}.`
              : "Lines arriving soon — schedule live.",
          },
          {
            href: "/results/nba",
            eyebrow: "Audit",
            title: "NBA results",
            sub:
              lifetime?.hitRate != null
                ? `${(lifetime.hitRate * 100).toFixed(1)}% on ${lifetime.decisive} settled.`
                : "Pending first settlement.",
          },
          {
            href: "/results/model-audit",
            eyebrow: "Model",
            title: "Audit deep-dive",
            sub: "Per-market, per-edge, per-game dispersion.",
          },
          {
            href: "/parlay-lab",
            eyebrow: "Build",
            title: "Parlay Lab",
            sub: "Educational candidate slips. No hit-rate claims.",
          },
        ]}
      />

      <OverviewFooterDisclosure
        inputsLabel="Projection method"
        inputsBody={
          <>
            Last-10 weighted means with matchup adjustments,
            normal-approximation edges, and an R5 anomaly guardrail
            that caps confidence on edges above 25pp. See{" "}
            <Link
              href="/methodology"
              style={{ color: "var(--vault-gold-bright)" }}
            >
              Methodology
            </Link>{" "}
            for the full formula.
          </>
        }
        framingBody={
          <>
            Educational analytics, not betting advice. The Results page
            is where hit-rate calibration lives — every model lean is
            logged at generation time and graded against the final box
            score.
          </>
        }
      />
    </div>
  );
}
