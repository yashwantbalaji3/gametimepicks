/**
 * Homepage — casino command center (PR #63).
 *
 * Compresses the previous 10-section paragraph-heavy layout into 6
 * scannable blocks. Every number on this page traces to an on-disk
 * settled JSONL or schedule file — no fabrication.
 *
 * Section order:
 *   1. HomepageCommandHero (status pill + 1-line headline + 2 CTAs +
 *      3 scoreboard tiles on the right)
 *   2. "Today on the floor" — SportsbookStatusBoard for the active slate
 *   3. Sport grid (HomepageSportsRail)
 *   4. QuickActionRail (Model Board / Results / Audit / Parlay Lab)
 *   5. "How it works" 3-tile compact explainer
 *   6. Newsletter signup
 *
 * Everything below the fold is optional and skippable; everything above
 * the fold answers "what is today's slate state" in three seconds.
 */
import Link from "next/link";

import {
  getBoard,
  getBoardForDate,
  getLifetimeSummary,
  getSlate,
  getAvailableBoardDates,
} from "@/lib/data";
import { getMlbLifetimeSummary } from "@/lib/data-mlb-results";
import { activeMlbDate, getMlbBoardForDate } from "@/lib/data-mlb";
import { formatPercent } from "@/lib/format";
import type { BoardData, DataMode, PropLean } from "@/lib/types";

import HomepageCommandHero, {
  type HeroTile,
} from "@/components/homepage-command-hero";
import HomepageSportsRail from "@/components/homepage-sports-rail";
import NewsletterSignup from "@/components/newsletter-signup";
import QuickActionRail from "@/components/quick-action-rail";
import SectionHeader from "@/components/section-header";
import SportsbookStatusBoard, {
  type StatusBoardGame,
  type StatusBoardStat,
} from "@/components/sportsbook-status-board";
import { type StatusPillKind } from "@/components/status-pill";

import { selectActiveSlate } from "@/lib/active-slate";
import { currentEtDate, dayLabelFor } from "@/lib/freshness";

export default function HomePage() {
  // ----- Data prep (mirrors prior helpers; unchanged math) ------------
  const board = getBoard();
  const lifetime = getLifetimeSummary();
  const mlbLifetime = getMlbLifetimeSummary();
  const combinedDecisive =
    (lifetime?.decisive ?? 0) + (mlbLifetime?.decisive ?? 0);
  const combinedWins = (lifetime?.wins ?? 0) + (mlbLifetime?.wins ?? 0);
  const combinedHitRate =
    combinedDecisive > 0 ? combinedWins / combinedDecisive : null;
  const slate = getSlate();

  const today = currentEtDate();
  const allBoardDates = slate.days.map((d) => d.date);
  const slateBoardsByDate: Record<string, BoardData> = {};
  for (const d of slate.days) {
    slateBoardsByDate[d.date] = getBoardForDate(d.date);
  }
  const activeHomeSlate = selectActiveSlate(
    allBoardDates,
    today,
    slateBoardsByDate,
  );
  const activeDate = activeHomeSlate.selectedDate;
  const todayDay = activeDate
    ? slate.days.find((d) => d.date === activeDate)
    : undefined;
  const todayMode: DataMode =
    (todayDay?.dataMode as DataMode) ||
    (board.dataMode as DataMode) ||
    "ScheduleUnavailable";
  const todayGames = todayDay?.gameCount ?? 0;
  const noCurrentSlate =
    activeHomeSlate.kind === "no_current" || activeHomeSlate.kind === "no_data";

  const activeBoard: BoardData | undefined = activeDate
    ? slateBoardsByDate[activeDate]
    : undefined;
  const activeLeans = activeBoard?.leans ?? [];
  const leansToday = activeLeans.filter((l) => l.lean !== "No Play").length;

  // Cross-sport "live model wall" count (NBA today + MLB today only).
  const mlbTodayDate = activeMlbDate();
  const mlbTodayBoard = mlbTodayDate ? getMlbBoardForDate(mlbTodayDate) : null;
  const mlbLeansLive =
    mlbTodayBoard?.propsAvailable && mlbTodayDate === today
      ? (mlbTodayBoard.leans ?? []).filter(
          (l) => l.lean === "Over" || l.lean === "Under",
        ).length
      : 0;
  const crossSportLeansLive = leansToday + mlbLeansLive;

  // Latest scored slate (powers the "Today on the floor" panel).
  const latestScoredHit =
    findLatestScoredBoard(slateBoardsByDate) ?? findLatestScoredBoardOnDisk();
  const latestScoredFinalDate = latestScoredHit?.date ?? null;
  const latestScoredFinalBoard = latestScoredHit?.board ?? null;
  const latestScoredLeans: PropLean[] = latestScoredFinalBoard?.leans ?? [];
  const latestScoredLeanCount = latestScoredLeans.length;
  const latestScoredHighCount = latestScoredLeans.filter(
    (l) => l.confidence === "High",
  ).length;
  const latestScoredMatchup = matchupForBoard(latestScoredFinalBoard);
  const latestScoredDayLabel = latestScoredFinalDate
    ? dayLabelFor(latestScoredFinalDate, today)
    : null;
  const latestScoredAnomalyCount = latestScoredLeans.filter((l) =>
    (l.riskFlags ?? []).includes("suspicious_edge"),
  ).length;

  // ----- Hero state machine -------------------------------------------
  const heroState = decideHeroState({
    noCurrentSlate,
    todayMode,
    todayGames,
    crossSportLeansLive,
    activeDate,
    latestScoredFinalDate,
  });

  // Right-column hero tiles. Audit hit-rate lead so honest sample-size
  // framing is the first number a visitor sees.
  const heroTiles: HeroTile[] = [
    combinedHitRate !== null
      ? {
          label: "Hit rate",
          value: formatPercent(combinedHitRate),
          sub: `${combinedWins}–${combinedDecisive - combinedWins} on ${combinedDecisive}`,
        }
      : { label: "Hit rate", value: "—", sub: "no settled data yet" },
    lifetime?.hitRate != null
      ? {
          label: "NBA",
          value: formatPercent(lifetime.hitRate),
          sub: `${lifetime.wins}–${lifetime.losses} on ${lifetime.decisive}`,
        }
      : { label: "NBA", value: "—", sub: "results pending" },
    mlbLifetime?.hitRate != null
      ? {
          label: "MLB",
          value: formatPercent(mlbLifetime.hitRate),
          sub: `${mlbLifetime.wins}–${mlbLifetime.losses} on ${mlbLifetime.decisive}`,
        }
      : { label: "MLB", value: "—", sub: "results pending" },
  ];

  // SportsbookStatusBoard payload (latest scored slate).
  const statusBoardGames: StatusBoardGame[] = latestScoredFinalBoard
    ? (latestScoredFinalBoard.games ?? []).slice(0, 4).map((g) => ({
        gameId: g.gameId,
        awayTeamAbbr: g.awayTeamAbbr,
        homeTeamAbbr: g.homeTeamAbbr,
        tipoff: g.tipoff,
      }))
    : [];
  const statusBoardStats: StatusBoardStat[] = latestScoredFinalDate
    ? [
        {
          label: "Projections",
          value: String(latestScoredLeanCount),
          accent: "gold",
        },
        {
          label: "High confidence",
          value: String(latestScoredHighCount),
          accent: "gold",
        },
        {
          label: "Model anomalies",
          value: String(latestScoredAnomalyCount),
          accent: latestScoredAnomalyCount > 0 ? "warn" : "mute",
        },
      ]
    : [];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-10 md:py-16 overflow-x-hidden">
      {/* 1 — Command hero */}
      <HomepageCommandHero
        statusKind={heroState.kind}
        statusLabel={heroState.statusLabel}
        statusCaption={heroState.statusCaption}
        headline={heroState.headline}
        subline={heroState.subline}
        primaryCta={heroState.primaryCta}
        secondaryCta={heroState.secondaryCta}
        tiles={heroTiles}
      />

      {/* 2 — Latest scored slate */}
      <section className="mt-10 reveal" aria-label="Today on the floor">
        <SectionHeader
          eyebrow={
            latestScoredFinalDate ? "Latest scored slate" : "Model lab"
          }
          title={
            latestScoredFinalDate
              ? `${latestScoredDayLabel ?? "Latest"} · graded against final box scores`
              : "Model lab idle"
          }
          sub={
            latestScoredFinalDate
              ? "The newest fully-scored slate. Every projection compared to the closing line; every result settled against final box scores."
              : "Projections land here once the next scheduled refresh completes."
          }
        />
        {latestScoredFinalDate ? (
          <SportsbookStatusBoard
            eyebrow={`${latestScoredDayLabel ?? "Latest"} slate · scored`}
            headline={
              latestScoredMatchup
                ? `${latestScoredMatchup}`
                : `${statusBoardGames.length} NBA game${statusBoardGames.length === 1 ? "" : "s"}`
            }
            sub={`${latestScoredLeanCount} projections · ${latestScoredHighCount} High confidence`}
            games={statusBoardGames}
            stats={statusBoardStats}
            footnote="Guardrails active · educational only"
            ctaHref={`/results/date/${latestScoredFinalDate}`}
            ctaLabel="View results for this date"
          />
        ) : (
          <SportsbookStatusBoard
            eyebrow="Model lab · idle"
            headline="No scored slate loaded"
            sub="Projections will land here once the next scheduled refresh completes."
            steady
            footnote="Educational analytics · not betting advice"
            ctaHref="/methodology"
            ctaLabel="How the model works"
          />
        )}
      </section>

      {/* 3 — Sport grid */}
      <section className="mt-12 reveal" aria-label="Sports">
        <SectionHeader
          eyebrow="Sports"
          title="Every sport at a glance"
          sub="NBA + MLB run live model boards. NHL + IPL are schedule-only until the projection pipelines ship — never faked."
        />
        <HomepageSportsRail />
      </section>

      {/* 4 — Quick actions */}
      <QuickActionRail
        heading="Jump in"
        cards={[
          {
            href:
              crossSportLeansLive > 0
                ? "/board"
                : latestScoredFinalDate
                  ? `/board?date=${latestScoredFinalDate}`
                  : "/board",
            eyebrow: "Tonight",
            title: "Model board",
            sub:
              crossSportLeansLive > 0
                ? `${crossSportLeansLive} live projections across NBA + MLB.`
                : "Latest scored projections + line edges.",
          },
          {
            href: "/results",
            eyebrow: "Results",
            title: "Latest results",
            sub:
              combinedHitRate !== null
                ? `${formatPercent(combinedHitRate)} on ${combinedDecisive} decisive — every settled pick.`
                : "Every settled pick, graded honestly.",
          },
          {
            href: "/results/model-audit",
            eyebrow: "Performance",
            title: "Model performance",
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

      {/* 5 — How it works */}
      <section className="mt-12 reveal" aria-label="How it works">
        <SectionHeader
          eyebrow="How it works"
          title="3 steps from data to audit"
          sub="The model never invents projections. Numbers come from real game logs; every settled pick is graded against the final box score."
          rightSlot={
            <Link
              href="/methodology"
              className="font-mono uppercase tracking-[0.14em]"
              style={{ color: "var(--vault-gold)", fontSize: 11 }}
            >
              Methodology →
            </Link>
          }
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {STEPS.map((s, i) => (
            <article
              key={s.title}
              className="gtp-premium-tile px-4 py-4 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className="font-display font-semibold gtp-text-gradient-gold"
                  style={{
                    fontSize: 26,
                    lineHeight: 1,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className="font-mono uppercase tracking-[0.18em]"
                  style={{ color: "var(--vault-gold)", fontSize: 10 }}
                >
                  {s.eyebrow}
                </span>
              </div>
              <h3
                className="font-display tracking-tight"
                style={{
                  color: "var(--vault-text)",
                  fontSize: 17,
                  lineHeight: 1.25,
                }}
              >
                {s.title}
              </h3>
              <p
                className="text-[12.5px] leading-snug"
                style={{ color: "var(--vault-text-mute)" }}
              >
                {s.sub}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* 6 — Newsletter */}
      <section className="mt-12 reveal">
        <NewsletterSignup variant="full" />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STEPS: Array<{ eyebrow: string; title: string; sub: string }> = [
  {
    eyebrow: "Inputs",
    title: "Real game logs + closing lines",
    sub: "Recent-form rolling windows, season averages, opponent context — never invented.",
  },
  {
    eyebrow: "Model",
    title: "Per-market projection",
    sub: "Compared to the sportsbook line; edge stamped + guardrails applied for anomalies.",
  },
  {
    eyebrow: "Audit",
    title: "Settled against final box scores",
    sub: "Pushes excluded, pending excluded. Every miss stays on the record.",
  },
];

function decideHeroState({
  noCurrentSlate,
  todayMode,
  todayGames,
  crossSportLeansLive,
  activeDate,
  latestScoredFinalDate,
}: {
  noCurrentSlate: boolean;
  todayMode: DataMode;
  todayGames: number;
  crossSportLeansLive: number;
  activeDate: string | null;
  latestScoredFinalDate: string | null;
}): {
  kind: StatusPillKind;
  statusLabel?: string;
  statusCaption?: string;
  headline: string;
  subline: string;
  primaryCta: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
} {
  if (crossSportLeansLive > 0) {
    return {
      kind: "live",
      statusLabel: "Live tonight",
      statusCaption: `${crossSportLeansLive} projections`,
      headline: "Tonight's projections, ranked by edge.",
      subline:
        "Every NBA + MLB lean stacked against the closing line. Open the model board to scan by sport, market, or confidence.",
      primaryCta: { href: "/board", label: "Open tonight's board" },
      secondaryCta: { href: "/results/model-audit", label: "Model performance" },
    };
  }

  if (
    !noCurrentSlate &&
    activeDate &&
    (todayMode === "ScheduleLiveOddsUnavailable" || todayGames > 0)
  ) {
    return {
      kind: "linesPending",
      statusCaption: `${todayGames || "—"} game${todayGames === 1 ? "" : "s"}`,
      headline: "Schedule is live — projections arriving soon.",
      subline:
        "The slate is confirmed; sportsbook lines + model leans land as soon as the next refresh completes.",
      primaryCta: {
        href: latestScoredFinalDate
          ? `/board?date=${latestScoredFinalDate}`
          : "/board",
        label: "View latest scored board",
      },
      secondaryCta: { href: "/results", label: "Latest results" },
    };
  }

  if (latestScoredFinalDate) {
    return {
      kind: "settled",
      statusCaption: `${latestScoredFinalDate}`,
      headline: "Latest settled slate is up.",
      subline:
        "No live slate right now. Browse the most recent scored projections, or open the model audit to see every cut of the settled record.",
      primaryCta: {
        href: `/results/date/${latestScoredFinalDate}`,
        label: "View settled slate",
      },
      secondaryCta: { href: "/results/model-audit", label: "Model performance" },
    };
  }

  return {
    kind: "upcoming",
    statusLabel: "Refresh pending",
    headline: "Model lab idle — next refresh pending.",
    subline:
      "Projections will land here as soon as the next scheduled run completes. Educational analytics only.",
    primaryCta: { href: "/methodology", label: "How the model works" },
    secondaryCta: { href: "/parlay-lab", label: "Parlay Lab" },
  };
}

function findLatestScoredBoard(
  boardsByDate: Record<string, BoardData>,
): { date: string; board: BoardData } | null {
  const dates = Object.keys(boardsByDate).sort().reverse();
  for (const date of dates) {
    const b = boardsByDate[date];
    if (!b) continue;
    if ((b.leans ?? []).some((l) => isScored(l))) {
      return { date, board: b };
    }
  }
  return null;
}

function findLatestScoredBoardOnDisk(): {
  date: string;
  board: BoardData;
} | null {
  const allDates = getAvailableBoardDates().slice().sort().reverse();
  for (const date of allDates) {
    const b = getBoardForDate(date);
    if ((b.leans ?? []).some((l) => isScored(l))) {
      return { date, board: b };
    }
  }
  return null;
}

function isScored(l: PropLean): boolean {
  return typeof l.projection === "number" && typeof l.edgePct === "number";
}

function matchupForBoard(board: BoardData | null): string | null {
  if (!board) return null;
  const games = board.games ?? [];
  if (games.length === 0) return null;
  const g = games[0];
  if (!g.awayTeamAbbr || !g.homeTeamAbbr) return null;
  return `${g.awayTeamAbbr} @ ${g.homeTeamAbbr}`;
}
