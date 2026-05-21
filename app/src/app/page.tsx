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
import { getAvailableSettlementDates } from "@/lib/settlement-data";
import { activeMlbDate, getMlbBoardForDate } from "@/lib/data-mlb";
import { formatPercent } from "@/lib/format";
import type { BoardData, DataMode, PropLean } from "@/lib/types";

import HomepageCommandHero, {
  type HeroTile,
} from "@/components/homepage-command-hero";
import HomepageSportsRail from "@/components/homepage-sports-rail";
import NewsletterSignup from "@/components/newsletter-signup";
import SectionHeader from "@/components/section-header";
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

  // Latest SETTLED slate. After the fix in findLatestScoredBoardOnDisk
  // (filters to dates in the real settlement manifest), this can never
  // pick a future date even if the future board has scored projections.
  const latestScoredHit =
    findLatestScoredBoard(slateBoardsByDate) ?? findLatestScoredBoardOnDisk();
  const latestScoredFinalDate = latestScoredHit?.date ?? null;
  const latestScoredFinalBoard = latestScoredHit?.board ?? null;
  const latestScoredLeans: PropLean[] = latestScoredFinalBoard?.leans ?? [];
  const latestScoredLeanCount = latestScoredLeans.length;
  const latestScoredMatchup = matchupForBoard(latestScoredFinalBoard);
  const latestScoredDayLabel = latestScoredFinalDate
    ? dayLabelFor(latestScoredFinalDate, today)
    : null;

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

      {/* 2 — Latest results pill (only when a real settled slate exists) */}
      {latestScoredFinalDate && (
        <section
          className="mt-6 reveal"
          aria-label="Latest results pill"
        >
          <Link
            href={`/results/date/${latestScoredFinalDate}`}
            className="inline-flex items-baseline gap-3 vault-glow-hover rounded-full px-4 py-2 font-mono"
            style={{
              background: "rgba(7,11,26,0.55)",
              border: "1px solid var(--vault-border)",
              textDecoration: "none",
              fontSize: 11,
              color: "var(--vault-text-mute)",
            }}
          >
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background: "var(--vault-gold-bright)",
                boxShadow: "0 0 6px rgba(240, 199, 94, 0.55)",
              }}
            />
            <span style={{ color: "var(--vault-gold)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
              {latestScoredDayLabel ?? latestScoredFinalDate} · graded
            </span>
            <span style={{ color: "var(--vault-text)" }}>
              {latestScoredMatchup ?? "Latest slate"}
            </span>
            <span style={{ color: "var(--vault-text-faint)" }}>
              · {latestScoredLeanCount} projections settled
            </span>
            <span style={{ color: "var(--vault-gold-bright)" }}>
              View →
            </span>
          </Link>
        </section>
      )}

      {/* 3 — Sport grid */}
      <section className="mt-12 reveal" aria-label="Sports">
        <SectionHeader
          eyebrow="Sports"
          title="Pick a sport"
          sub="NBA and MLB run live projections. World Cup, NHL and IPL show what's on the schedule."
        />
        <HomepageSportsRail />
      </section>

      {/* 5 — How it works */}
      <section className="mt-12 reveal" aria-label="How it works">
        <SectionHeader
          eyebrow="How it works"
          title="3 simple steps"
          sub="Real data in, real projections out, every result graded after the game."
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
    eyebrow: "Pick a game",
    title: "Today's slate, top of the page",
    sub: "Choose any NBA or MLB game on the schedule. Each one has a sportsbook line.",
  },
  {
    eyebrow: "See the projection",
    title: "The model's number, side by side",
    sub: "We project every market — points, rebounds, assists — and show the gap vs. the line in plain English.",
  },
  {
    eyebrow: "Track every result",
    title: "Graded after final stats",
    sub: "Wins, losses and pushes are all kept on the record. No hiding misses.",
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
      statusLabel: "Tonight",
      statusCaption: `${crossSportLeansLive} projections`,
      headline: "Sports projections made simple.",
      subline:
        "Pick a game, compare the line, track every result.",
      primaryCta: { href: "/projections", label: "View projections" },
      secondaryCta: { href: "/results", label: "See results" },
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
      headline: "Sports projections made simple.",
      subline:
        "Schedule is live — projections land as soon as bookmaker lines refresh.",
      primaryCta: {
        href: "/projections",
        label: "View projections",
      },
      secondaryCta: { href: "/results", label: "See results" },
    };
  }

  if (latestScoredFinalDate) {
    return {
      kind: "settled",
      statusCaption: `${latestScoredFinalDate}`,
      headline: "Sports projections made simple.",
      subline:
        "No live slate right now — open the latest graded slate or browse the full track record.",
      primaryCta: {
        href: `/results/date/${latestScoredFinalDate}`,
        label: "Latest results",
      },
      secondaryCta: { href: "/projections", label: "View projections" },
    };
  }

  return {
    kind: "upcoming",
    statusLabel: "Refresh pending",
    headline: "Sports projections made simple.",
    subline:
      "New projections will land here as soon as the next refresh completes.",
    primaryCta: { href: "/projections", label: "View projections" },
    secondaryCta: { href: "/about", label: "How it works" },
  };
}

/**
 * Find the most recent SETTLED (graded against final box scores) NBA
 * slate. Critical: "scored" here means the slate has been graded post-
 * game — not that the board has projections. A future board with
 * projections is NOT a settled slate. Previously this function looked
 * at every board with scored leans, which incorrectly picked May 21
 * ("Tomorrow") as the latest "graded" slate before the games had even
 * played. Now we filter against `getAvailableSettlementDates()`, which
 * lists only dates with real settled rows on disk.
 */
function findLatestScoredBoard(
  boardsByDate: Record<string, BoardData>,
): { date: string; board: BoardData } | null {
  const settledSet = new Set(getAvailableSettlementDates());
  const dates = Object.keys(boardsByDate).sort().reverse();
  for (const date of dates) {
    if (!settledSet.has(date)) continue;
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
  const settledSet = new Set(getAvailableSettlementDates());
  const allDates = getAvailableBoardDates()
    .filter((d) => settledSet.has(d))
    .slice()
    .sort()
    .reverse();
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
