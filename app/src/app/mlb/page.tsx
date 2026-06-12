/**
 * /mlb — MLB hub as a uniform tabbed SportShell (matches /world-cup).
 *
 * Tabs: Overview · Games · Projections · Player Props · Suggested Cards · Results · Methodology.
 * Built on the shared kit (SportShell / SuggestedCard / ProjectionCard / StatusChip /
 * StakePayoutInput) + the normalized optimizer-slip + MLB-lean adapters. The full model board
 * (every lean) stays at /mlb/board — this hub surfaces the top projections + a CTA. No fabricated
 * data; lean/game counts come from the live board summary.
 */
import Link from "next/link";
import CompetitionBadge from "@/components/ui/competition-badge";
import { getSportIdentity } from "@/lib/sport-identity";

import {
  activeMlbDate,
  getMlbAvailableScheduleDates,
  getMlbBoardForDate,
  getMlbScheduleForDate,
} from "@/lib/data-mlb";
import { getMlbLifetimeSummary } from "@/lib/data-mlb-results";
import { getSuggestedParlaysForDate } from "@/lib/data-parlays";
import { getGameOutlook } from "@/lib/data-game-outlook";
import { formatTipoffEt } from "@/lib/format-mlb";
import {
  normalizeMlbLeans,
  normalizeOptimizerSlips,
  type PublicProjection,
} from "@/lib/normalize";
import { detailHrefForTeams } from "@/lib/game-detail";

import MlbSectionTabs from "@/components/mlb/mlb-section-tabs";
import MlbSummaryStrip from "@/components/mlb/mlb-summary-strip";
import GameOutlookSection from "@/components/game-outlook-card";
import OverviewFooterDisclosure from "@/components/overview-footer-disclosure";
import QuickActionRail from "@/components/quick-action-rail";
import SectionHeader from "@/components/section-header";
import SportOverviewHero from "@/components/sport-overview-hero";
import UpcomingSlateStrip, { type UpcomingSlateDay } from "@/components/upcoming-slate-strip";
import SportShell, { type ShellTab } from "@/components/ui/sport-shell";
import SuggestedCard from "@/components/ui/suggested-card";
import ProjectionCard from "@/components/ui/projection-card";
import PlayerPropsExplorer from "@/components/ui/player-props-explorer";
import StatusChip from "@/components/ui/status-chip";

export const metadata = {
  title: "MLB · GameTime Picks",
  description:
    "Educational MLB player-prop analytics — transparent model leans on pitcher strikeouts and batter markets, plus suggested paper cards. Educational, paper-only.",
};

const DEFAULT_DATE = "2026-05-16";
const PROPS_PER_MARKET = 9;

function byEdge(a: PublicProjection, b: PublicProjection) {
  return Math.abs(b.edgePct ?? 0) - Math.abs(a.edgePct ?? 0);
}

export default function MlbLandingPage() {
  const date = activeMlbDate() ?? DEFAULT_DATE;
  const board = getMlbBoardForDate(date);
  const schedule = getMlbScheduleForDate(date);
  const mlbLifetime = getMlbLifetimeSummary();

  const summary = board.summary;
  const propsAvailable = board.propsAvailable;
  const games = schedule.games ?? [];
  const gameCount = summary.scheduledGames || games.length || 0;
  const gameOutlook = getGameOutlook("mlb");

  // Normalized model output.
  const leans = normalizeMlbLeans(board as Parameters<typeof normalizeMlbLeans>[0]);
  const pitcherLeans = leans.filter((l) => l.player?.position === "pitcher").sort(byEdge);
  const batterLeans = leans.filter((l) => l.player?.position !== "pitcher");
  const batterByMarket = new Map<string, PublicProjection[]>();
  for (const l of batterLeans) {
    const arr = batterByMarket.get(l.marketLabel) ?? [];
    arr.push(l);
    batterByMarket.set(l.marketLabel, arr);
  }
  const mlbCards = normalizeOptimizerSlips(getSuggestedParlaysForDate(date)?.slips ?? null, {
    sportFilter: "mlb",
    date,
  });

  const statusKind: "live" | "linesPending" | "upcoming" =
    propsAvailable && summary.leans > 0 ? "live" : gameCount > 0 ? "linesPending" : "upcoming";
  const statusCaption = gameCount > 0 ? `${gameCount} game${gameCount === 1 ? "" : "s"}` : undefined;

  const heroStats = [
    { label: "Games today", value: String(gameCount), sub: date },
    { label: "Projections", value: String(summary.leans), sub: propsAvailable ? "real prop lines" : "lines pending" },
    {
      label: "Stronger signals · high-variance",
      value: `${summary.highConfidence} · ${summary.anomalies}`,
      sub: mlbLifetime?.hitRate != null ? `track record ${(mlbLifetime.hitRate * 100).toFixed(1)}% on ${mlbLifetime.decisive}` : "results pending",
    },
  ];

  const slateTiles =
    games.length > 0 ? (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {games.map((g) => {
          const anchor = `game-${g.gamePk ?? `${g.awayTeamAbbr}-${g.homeTeamAbbr}`}`;
          const tileKey = g.gamePk ?? `${g.awayTeamAbbr}-${g.homeTeamAbbr}`;
          const detailHref = detailHrefForTeams("mlb", g.awayTeamAbbr ?? "", g.homeTeamAbbr ?? "") ?? `/mlb/board#${anchor}`;
          return (
            <Link
              key={tileKey}
              href={detailHref}
              className="vault-glow-hover flex items-center justify-between gap-3 rounded-[6px]"
              style={{ padding: "12px 14px", border: "1px solid var(--vault-border)", background: "rgba(26, 16, 11, 0.55)", color: "inherit", textDecoration: "none" }}
              aria-label={`View props for ${g.awayTeamAbbr ?? "?"} at ${g.homeTeamAbbr ?? "?"}`}
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>{g.awayTeamAbbr ?? "?"} @ {g.homeTeamAbbr ?? "?"}</span>
                <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{g.venue ?? "MLB"}</span>
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                <span className="font-mono" style={{ color: "var(--vault-gold-bright)", fontSize: 12 }}>{formatTipoffEt(g.gameDate)}</span>
                <span aria-hidden className="font-mono" style={{ color: "var(--vault-gold)", fontSize: 12 }}>→</span>
              </div>
            </Link>
          );
        })}
      </div>
    ) : (
      <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>The MLB Stats API will return today&apos;s games shortly.</p>
    );

  const boardCta = (
    <div className="mt-3">
      <Link href="/mlb/board" className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
        Open full model board →
      </Link>
    </div>
  );

  // ─────────────────────────── Tabs ───────────────────────────
  const overviewTab = (
    <div className="flex flex-col gap-8">
      <MlbSummaryStrip board={board} />
      {mlbCards.length > 0 && (
        <section>
          <SectionHeader eyebrow={`Top cards · ${mlbCards.length} live`} title="Suggested paper cards" sub="Enter any stake to see the projected paper return. Paper only — not betting advice." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {mlbCards.slice(0, 3).map((c) => <SuggestedCard key={c.id} card={c} />)}
          </div>
        </section>
      )}
      <section aria-label="Today's slate">
        <SectionHeader eyebrow={`Slate · ${date}`} title={games.length === 0 ? "Schedule warming up" : `${games.length} game${games.length === 1 ? "" : "s"} on the slate`} />
        {slateTiles}
      </section>
    </div>
  );

  const gamesTab = (
    <div className="flex flex-col gap-8">
      <section aria-label="Today's slate">
        <SectionHeader eyebrow={`Slate · ${date}`} title={`${games.length} game${games.length === 1 ? "" : "s"} today`} rightSlot={games.length > 0 ? <Link href="/mlb/board" className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold)", fontSize: 11 }}>Open board →</Link> : undefined} />
        {slateTiles}
      </section>
      <GameOutlookSection outlook={gameOutlook} />
      <UpcomingSlateStrip title="Upcoming · next 7 days" days={buildMlbUpcomingDays(date)} boardHrefBase="/mlb/board" emptyMessage="No upcoming MLB slates on disk yet. The next refresh will pull the rolling window." />
    </div>
  );

  const projectionsTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow={`Projections · ${summary.leans} model views`} title="Pitcher projections" sub="Strikeout projections from MLB Stats API game logs vs the bookmaker line. Model probability, market probability, and edge on each. A bigger sample is weighted toward the season; the R5 anomaly guardrail caps extreme edges to Low." />
      {pitcherLeans.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pitcherLeans.slice(0, 12).map((p) => <ProjectionCard key={p.id} p={p} />)}
          </div>
          {boardCta}
        </>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>Pitcher projections appear once strikeout prop lines post for the slate.</p>
      )}
    </div>
  );

  const playerPropsTab = (
    <div className="flex flex-col gap-6">
      <SectionHeader eyebrow={`Player props · ${batterLeans.length} batter views`} title="Batter player props" sub={`Hits, total bases, and hits+runs+RBIs projected from recent + season game logs vs the line. Showing the top ${PROPS_PER_MARKET} by edge per market — open the full board for all ${summary.leans} projections.`} />
      {batterLeans.length > 0 ? (
        <>
          {/* Same guided explorer as fixture pages: top picks default, market tabs,
              team filter, player search, expandable last-5 drawer per row. */}
          <PlayerPropsExplorer props={batterLeans} />
          {boardCta}
        </>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>Batter player props appear once prop lines post for the slate.</p>
      )}
    </div>
  );

  const cardsTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow={`Suggested cards · ${mlbCards.length} live`} title="MLB suggested parlays" sub="Built by the parlay optimizer from positive-edge projections. Default paper stakes; enter any amount for the projected paper payout. Educational / paper, not betting advice." />
      {mlbCards.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {mlbCards.map((c) => <SuggestedCard key={c.id} card={c} />)}
        </div>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No suggested cards cleared the optimizer for this slate. The probability views (Projections / Player Props) are still shown.</p>
      )}
    </div>
  );

  const resultsTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow="Results" title="MLB track record" sub="Settled model projections and their outcomes. Full cross-sport history lives on the Results page." />
      <div className="flex items-center gap-3 flex-wrap rounded-[8px] px-4 py-3" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
        <StatusChip label={mlbLifetime?.hitRate != null ? "Settled" : "Pending settlement"} />
        <span style={{ color: "var(--vault-text)", fontSize: 13 }}>
          {mlbLifetime?.hitRate != null ? `${(mlbLifetime.hitRate * 100).toFixed(1)}% on ${mlbLifetime.decisive} settled decisions` : "Pending first settlement."}
        </span>
      </div>
      <QuickActionRail
        heading="More on MLB"
        cards={[
          { href: "/mlb/board", eyebrow: "Tonight", title: "Model board", sub: propsAvailable ? `${summary.leans} projections across ${gameCount} game${gameCount === 1 ? "" : "s"}.` : "Lines arriving soon — schedule live." },
          { href: "/results/mlb", eyebrow: "Results", title: "MLB results", sub: mlbLifetime?.hitRate != null ? `${(mlbLifetime.hitRate * 100).toFixed(1)}% on ${mlbLifetime.decisive} settled.` : "Pending first settlement." },
          { href: "/results/model-audit", eyebrow: "Performance", title: "Model performance", sub: "Per-market, per-edge, per-game dispersion." },
          { href: "/mlb/power", eyebrow: "Power", title: "Power Board", sub: "Home runs tracked separately. High-variance watch." },
        ]}
      />
    </div>
  );

  const methodologyTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow="Methodology" title="How MLB projections work" sub="Educational analytics — not betting advice." />
      <OverviewFooterDisclosure
        inputsLabel="MVP projection method"
        inputsBody={<>Pitcher strikeouts: 0.55 · last-3 mean + 0.45 · season mean, normal approximation. Batters: 0.5 · last-10 mean + 0.5 · season mean, with a floor on sigma. The MLB R5 anomaly guardrail caps edges above 20pp to Low confidence.</>}
        framingBody={<>Home runs live on a separate Power Board because they are higher-variance. Same responsible-use commitments across every sport.</>}
      />
      <p className="text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
        Full framework: <Link href="/methodology" style={{ color: "var(--vault-gold-bright)" }}>methodology</Link>.
      </p>
    </div>
  );

  const tabs: ShellTab[] = [
    // Games-first (June-12 sprint): users land on today's games, then drill in.
    { key: "games", label: "Games", badge: gameCount || null, content: gamesTab },
    { key: "overview", label: "Overview", content: overviewTab },
    { key: "projections", label: "Projections", badge: pitcherLeans.length || null, content: projectionsTab },
    { key: "player-props", label: "Player Props", badge: batterLeans.length || null, content: playerPropsTab },
    { key: "cards", label: "Suggested Cards", badge: mlbCards.length || null, content: cardsTab },
    { key: "results", label: "Results", badge: null, content: resultsTab },
    { key: "methodology", label: "Methodology", badge: null, content: methodologyTab },
  ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <MlbSectionTabs />
      </div>

      <SportOverviewHero
        badge={<CompetitionBadge sport="mlb" size="sm" />}
        icon={getSportIdentity("mlb").icon}
        iconGradient={getSportIdentity("mlb").gradient}
        iconLabel={getSportIdentity("mlb").ballLabel}
        eyebrow="MLB · today's slate"
        sport="MLB"
        tagline="projections · track record · power board"
        statusKind={statusKind}
        statusCaption={statusCaption}
        matchupLine={`Slate · ${date}`}
        stats={heroStats}
        accent="mlb"
        ctas={[
          { href: "/mlb/board", label: propsAvailable ? "View today's projections" : "Open model board", primary: true },
          { href: "/results/mlb", label: "Latest results" },
        ]}
        framing="Pitcher strikeouts and batter hits / total bases projected from MLB Stats API game logs and compared to the bookmaker line. Home runs live on a separate Power Board because they're higher-variance."
      />

      <div className="mt-6">
        <SportShell tabs={tabs} />
      </div>
    </div>
  );
}

function buildMlbUpcomingDays(_activeDate: string): UpcomingSlateDay[] {
  const allDates = getMlbAvailableScheduleDates();
  if (allDates.length === 0) return [];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const forward = allDates.filter((d) => d >= today).slice(0, 8);
  return forward.map((d) => {
    const sched = getMlbScheduleForDate(d);
    const board = getMlbBoardForDate(d);
    const games = sched.games ?? [];
    const propsLive = board.propsAvailable && (board.leans?.length ?? 0) > 0;
    const status: UpcomingSlateDay["status"] = games.length === 0 ? "off-day" : propsLive ? "live" : "pending";
    let teaser: string;
    if (games.length === 0) {
      teaser = "No games scheduled";
    } else if (games.length === 1 && games[0]) {
      const g = games[0];
      teaser = `${g.awayTeamAbbr ?? "?"} @ ${g.homeTeamAbbr ?? "?"}`;
    } else {
      const first = games[0];
      teaser = `${games.length} games · ${first?.awayTeamAbbr ?? "?"} @ ${first?.homeTeamAbbr ?? "?"} +${games.length - 1} more`;
    }
    return { date: d, gameCount: games.length, label: shortDateLabel(d), teaser, status };
  });
}

function shortDateLabel(date: string): string {
  try {
    const dt = new Date(`${date}T17:00:00Z`);
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" }).replace(",", " ·");
  } catch {
    return date;
  }
}
