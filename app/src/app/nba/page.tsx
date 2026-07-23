/**
 * /nba — NBA hub as a uniform tabbed SportShell (matches /world-cup + /mlb).
 *
 * Tabs: Overview · Games · Projections · Player Props · Suggested Cards · Results · Methodology.
 * Built on the shared kit (SportShell / SuggestedCard / ProjectionCard / StatusChip /
 * StakePayoutInput) + the normalized NBA-lean + optimizer-slip adapters. The full model board
 * (every lean) stays at /nba/board; Finals/playoff context + the active-slate selector are
 * preserved. No fabricated projections; counts come from the active-slate board.
 */
import Link from "next/link";
import CompetitionBadge from "@/components/ui/competition-badge";
import { getSportIdentity } from "@/lib/sport-identity";

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
import { getSuggestedParlaysForDate } from "@/lib/data-parlays";
import { getGameOutlook } from "@/lib/data-game-outlook";
import {
  normalizeNbaLeans,
  normalizeOptimizerSlips,
  type PublicProjection,
} from "@/lib/normalize";

import NbaSectionTabs from "@/components/nba/nba-section-tabs";
import GameOutlookSection from "@/components/game-outlook-card";
import OverviewFooterDisclosure from "@/components/overview-footer-disclosure";
import QuickActionRail from "@/components/quick-action-rail";
import SectionHeader from "@/components/section-header";
import SportOverviewHero from "@/components/sport-overview-hero";
import { getPlayoffContext } from "@/components/playoff-context";
import { gameHrefByMatchId } from "@/lib/game-detail";
import SportShell, { type ShellTab } from "@/components/ui/sport-shell";
import SuggestedCard from "@/components/ui/suggested-card";
import ProjectionCard from "@/components/ui/projection-card";
import StatusChip from "@/components/ui/status-chip";

export const metadata = {
  title: "NBA · GameTime Picks",
  description:
    "Educational NBA player-prop analytics — transparent model leans on points, rebounds and assists, plus suggested paper cards. Educational, paper-only.",
};

const PROPS_PER_MARKET = 9;

function byEdge(a: PublicProjection, b: PublicProjection) {
  return Math.abs(b.edgePct ?? 0) - Math.abs(a.edgePct ?? 0);
}

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
  const usableLeans = leans.filter((l) => l.lean === "Over" || l.lean === "Under").length;
  const highCount = leans.filter((l) => l.confidence === "High").length;
  const anomalyCount = leans.filter((l) => (l.riskFlags ?? []).includes("suspicious_edge")).length;
  const propsLoaded = leans.some((l) => typeof l.projection === "number" && typeof l.edgePct === "number" && Number.isFinite(l.edgePct));

  // Normalized model output + optimizer cards.
  const nbaLeans = normalizeNbaLeans(board as Parameters<typeof normalizeNbaLeans>[0]);
  const topLeans = [...nbaLeans].sort(byEdge);
  const leansByMarket = new Map<string, PublicProjection[]>();
  for (const l of nbaLeans) {
    const arr = leansByMarket.get(l.marketLabel) ?? [];
    arr.push(l);
    leansByMarket.set(l.marketLabel, arr);
  }
  const nbaCards = normalizeOptimizerSlips(getSuggestedParlaysForDate(activeDate ?? today)?.slips ?? null, {
    sportFilter: "nba",
    date: activeDate ?? today,
  });

  const statusKind: "live" | "linesPending" | "upcoming" =
    usableLeans > 0 ? "live" : games.length > 0 ? "linesPending" : "upcoming";
  const statusCaption = games.length > 0 ? `${games.length} game${games.length === 1 ? "" : "s"}` : undefined;
  const matchupLine = activeDate ? `${dayLabelFor(activeDate, today)} · ${formatDateLong(activeDate)}` : undefined;

  const heroStats = [
    { label: "Games on slate", value: String(games.length), sub: activeDate || "—" },
    { label: "Projections", value: String(leans.length), sub: propsLoaded ? "real prop lines" : "lines pending" },
    {
      label: "Stronger signals · high-variance",
      value: `${highCount} · ${anomalyCount}`,
      sub: lifetime?.hitRate != null ? `track record ${(lifetime.hitRate * 100).toFixed(1)}% on ${lifetime.decisive}` : "track record pending",
    },
  ];

  const slateTiles =
    games.length > 0 ? (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {games.map((g) => {
          const ctx = getPlayoffContext(g.gameId, g.awayTeamAbbr, g.homeTeamAbbr);
          const detailHref = gameHrefByMatchId("nba", g.gameId) ?? "/nba/board";
          return (
            <Link
              key={g.gameId}
              href={detailHref}
              className="vault-glow-hover flex items-center justify-between gap-3 rounded-[6px]"
              style={{ padding: "12px 14px", border: "1px solid var(--vault-border)", background: "rgba(26, 16, 11, 0.55)", color: "inherit", textDecoration: "none" }}
              aria-label={`View props for ${g.awayTeamAbbr ?? "?"} at ${g.homeTeamAbbr ?? "?"}`}
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>{g.awayTeamAbbr ?? "?"} @ {g.homeTeamAbbr ?? "?"}</span>
                <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{ctx.isPlayoffs ? `${ctx.roundLabel} · ${ctx.gameLabel}` : "regular season"}</span>
              </div>
              <span aria-hidden className="font-mono" style={{ color: "var(--vault-gold)", fontSize: 12 }}>→</span>
            </Link>
          );
        })}
      </div>
    ) : (
      <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>The next refresh will surface the upcoming matchups as soon as the schedule posts.</p>
    );

  const boardCta = (
    <div className="mt-3">
      <Link href="/nba/board" className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
        Open full model board →
      </Link>
    </div>
  );

  // ─────────────────────────── Tabs ───────────────────────────
  const overviewTab = (
    <div className="flex flex-col gap-8">
      {nbaCards.length > 0 && (
        <section>
          <SectionHeader eyebrow={`Top cards · ${nbaCards.length} live`} title="Suggested paper cards" sub="Enter any stake to see the projected paper return. Paper only — not betting advice." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {nbaCards.slice(0, 3).map((c) => <SuggestedCard key={c.id} card={c} />)}
          </div>
        </section>
      )}
      <section aria-label="Active slate">
        <SectionHeader eyebrow={activeDate ? `${dayLabelFor(activeDate, today)} slate` : "Active slate"} title={activeDate ? formatDateLong(activeDate) : "No NBA games on the active slate"} rightSlot={activeDate ? <Link href="/nba/board" className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold)", fontSize: 11 }}>Open board →</Link> : undefined} />
        {slateTiles}
      </section>
    </div>
  );

  const gamesTab = (
    <div className="flex flex-col gap-8">
      <section aria-label="Active slate">
        <SectionHeader eyebrow={activeDate ? `${dayLabelFor(activeDate, today)} slate` : "Active slate"} title={activeDate ? formatDateLong(activeDate) : "No NBA games"} />
        {slateTiles}
      </section>
      {/* Market outlook only when the slate actually has games — otherwise an empty offseason slate
          would render a stale prior-date game as if it were today's. Honest empty state instead. */}
      {games.length > 0 ? <GameOutlookSection outlook={getGameOutlook("nba")} /> : null}
    </div>
  );

  const projectionsTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow={`Projections · ${usableLeans} model plays`} title="Top model projections" sub="Points, rebounds and assists projected from each player's last 10 games with matchup adjustments vs the bookmaker line. Model probability, market probability, and edge on each. The R5 guardrail caps confidence on edges above ~25pp." />
      {topLeans.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {topLeans.slice(0, 12).map((p) => <ProjectionCard key={p.id} p={p} />)}
          </div>
          {boardCta}
        </>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>{leans.length > 0 ? `${leans.length} leans are tracked for the upcoming slate but lines haven't firmed into plays yet. Open the board to follow them.` : "Projections appear once prop lines post for the active slate."}</p>
      )}
    </div>
  );

  const playerPropsTab = (
    <div className="flex flex-col gap-6">
      <SectionHeader eyebrow={`Player props · ${usableLeans} model views`} title="NBA player props" sub={`Browse by market — showing the top ${PROPS_PER_MARKET} by edge each. Open the full board for all ${leans.length} tracked leans.`} />
      {nbaLeans.length > 0 ? (
        <>
          {[...leansByMarket.entries()].map(([market, list]) => (
            <section key={market} aria-label={market}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>{market}</span>
                <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{list.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {[...list].sort(byEdge).slice(0, PROPS_PER_MARKET).map((p) => <ProjectionCard key={p.id} p={p} />)}
              </div>
            </section>
          ))}
          {boardCta}
        </>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>Player props appear once prop lines post for the active slate.</p>
      )}
    </div>
  );

  const cardsTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow={`Suggested cards · ${nbaCards.length} live`} title="NBA suggested parlays" sub="Built by the parlay optimizer from positive-edge projections. Default paper stakes; enter any amount for the projected paper payout. Educational / paper, not betting advice." />
      {nbaCards.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {nbaCards.map((c) => <SuggestedCard key={c.id} card={c} />)}
        </div>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No NBA suggested cards cleared the optimizer for this slate. The probability views (Projections / Player Props) are still shown — we don&apos;t pad cards.</p>
      )}
    </div>
  );

  const resultsTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow="Results" title="NBA track record" sub="Settled model leans graded against the final box score. Full history on the Results page." />
      <div className="flex items-center gap-3 flex-wrap rounded-[8px] px-4 py-3" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
        <StatusChip label={lifetime?.hitRate != null ? "Settled" : "Pending settlement"} />
        <span style={{ color: "var(--vault-text)", fontSize: 13 }}>
          {lifetime?.hitRate != null ? `${(lifetime.hitRate * 100).toFixed(1)}% on ${lifetime.decisive} settled decisions` : "Pending first settlement."}
        </span>
      </div>
      <QuickActionRail
        heading="More on NBA"
        cards={[
          { href: "/nba/board", eyebrow: "Latest slate", title: "Model board", sub: propsLoaded ? `${leans.length} projections across ${games.length} game${games.length === 1 ? "" : "s"}.` : "Lines arriving soon — schedule live." },
          { href: "/results/nba", eyebrow: "Results", title: "NBA results", sub: lifetime?.hitRate != null ? `${(lifetime.hitRate * 100).toFixed(1)}% on ${lifetime.decisive} settled.` : "Pending first settlement." },
          { href: "/results/model-audit", eyebrow: "Performance", title: "Model performance", sub: "Per-market, per-edge, per-game dispersion." },
          { href: "/parlay-lab", eyebrow: "Build", title: "Parlay Lab", sub: "Educational candidate slips. No hit-rate claims." },
        ]}
      />
    </div>
  );

  const methodologyTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow="Methodology" title="How NBA projections work" sub="Educational analytics — not betting advice." />
      <OverviewFooterDisclosure
        inputsLabel="Projection method"
        inputsBody={<>Last-10 weighted means with matchup adjustments, normal-approximation edges, and an R5 anomaly guardrail that caps confidence on edges above 25pp.</>}
        framingBody={<>The Results page is where hit-rate calibration lives — every model lean is logged at generation time and graded against the final box score.</>}
      />
      <p className="text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
        Full framework: <Link href="/methodology" style={{ color: "var(--vault-gold-bright)" }}>methodology</Link>.
      </p>
    </div>
  );

  const tabs: ShellTab[] = [
    // Games-first (June-12 sprint).
    { key: "games", label: "Games", badge: games.length || null, content: gamesTab },
    { key: "overview", label: "Overview", content: overviewTab },
    { key: "projections", label: "Projections", badge: usableLeans || null, content: projectionsTab },
    { key: "player-props", label: "Player Props", badge: usableLeans || null, content: playerPropsTab },
    { key: "cards", label: "Suggested Cards", badge: nbaCards.length || null, content: cardsTab },
    { key: "results", label: "Results", badge: null, content: resultsTab },
    { key: "methodology", label: "Methodology", badge: null, content: methodologyTab },
  ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <NbaSectionTabs />
      </div>

      <SportOverviewHero
        badge={<CompetitionBadge sport="nba" size="sm" />}
        icon={getSportIdentity("nba").icon}
        iconGradient={getSportIdentity("nba").gradient}
        iconLabel={getSportIdentity("nba").ballLabel}
        eyebrow="NBA · today's slate"
        sport="NBA"
        tagline="projections · track record · parlay lab"
        statusKind={statusKind}
        statusCaption={statusCaption}
        matchupLine={matchupLine}
        stats={heroStats}
        accent="nba"
        ctas={[
          { href: "/nba/board", label: propsLoaded ? "View today's projections" : "Open model board", primary: true },
          { href: "/results/nba", label: "Latest results" },
        ]}
        framing="Points, rebounds and assists projected from each player's last 10 games and compared to the bookmaker line. Very large gaps (>~25 pp) are labeled high-variance — never sold as a strong play."
      />

      <div className="mt-6">
        <SportShell tabs={tabs} />
      </div>
    </div>
  );
}
