/**
 * Homepage — parlay-first experience.
 *
 * The product centers on suggested parlays. Above the fold, a reader
 * sees:
 *   1. Compact hero with a one-line value prop + CTAs.
 *   2. SuggestedParlayCarousel — the main attraction. Horizontally
 *      swipeable cards filtered by sport (All / NBA / MLB / Mixed),
 *      sorted by a transparent ranking score. Aggressive slips render
 *      with a "High variance" badge so users see the lifetime track
 *      record's warning, not just a marketing label.
 *   3. "What's underneath" — small honest stats strip (decisive
 *      record + tonight's slate at a glance). Pulled from real
 *      settled rows. We do NOT show fake ROI / lock claims.
 *   4. Pointers to Projections (individual research) and Parlay Lab
 *      (interactive builder) — those pages exist for users who want
 *      to go deeper.
 *
 * Honest behavior preserved from PR #94:
 *   - We only render slips from real snapshots/graded files.
 *   - Empty buckets render an inline empty-state card (never a fake).
 *   - The "X dates of decisive results" strip cites N, not a ROI.
 */
import Link from "next/link";

import {
  getBoard,
  getBoardForDate,
  getLifetimeSummary,
  getSlate,
} from "@/lib/data";
import { getMlbLifetimeSummary } from "@/lib/data-mlb-results";
import { activeMlbDate, getMlbBoardForDate } from "@/lib/data-mlb";
import {
  getSuggestedParlaysForDate,
  getLatestParlayDate,
  getOptimizerSnapshotForDate,
  getLatestOptimizerSnapshot,
} from "@/lib/data-parlays";
import { optimizerSlipToParlaySlip } from "@/lib/parlay-optimizer";
import { flattenOptimizerSlips } from "@/lib/data-parlays";
import { loadCalibrationTable } from "@/lib/confidence-calibration";
import { formatPercent } from "@/lib/format";
import type { BoardData, DataMode } from "@/lib/types";
import type { ParlaySlip as ParlaySlipForCarousel } from "@/lib/parlay-suggested";

import SuggestedParlayCarousel from "@/components/suggested-parlay-carousel";
import NewsletterSignup from "@/components/newsletter-signup";
import SectionHeader from "@/components/section-header";

import { selectActiveSlate } from "@/lib/active-slate";
import { currentEtDate } from "@/lib/freshness";

export default function HomePage() {
  // ----- Tonight's slate context (kept honest, no fabrication) -------
  const board = getBoard();
  const slate = getSlate();
  const lifetime = getLifetimeSummary();
  const mlbLifetime = getMlbLifetimeSummary();

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

  // Cross-sport live lean count (used in the stats strip below).
  const activeBoard: BoardData | undefined = activeDate
    ? slateBoardsByDate[activeDate]
    : undefined;
  const activeLeans = activeBoard?.leans ?? [];
  const nbaLeansLive = activeLeans.filter((l) => l.lean !== "No Play").length;
  const mlbTodayDate = activeMlbDate();
  const mlbTodayBoard = mlbTodayDate ? getMlbBoardForDate(mlbTodayDate) : null;
  const mlbLeansLive =
    mlbTodayBoard?.propsAvailable && mlbTodayDate === today
      ? (mlbTodayBoard.leans ?? []).filter(
          (l) => l.lean === "Over" || l.lean === "Under",
        ).length
      : 0;
  const crossSportLeansLive = nbaLeansLive + mlbLeansLive;

  // ----- Suggested parlays for the carousel --------------------------
  // The optimizer is the primary source of truth — it scores slips
  // with calibration / market stability / correlation penalties. We
  // walk:
  //   1. Optimizer snapshot for today.
  //   2. Optimizer snapshot for the active slate date.
  //   3. Latest optimizer snapshot on disk.
  //   4. Legacy parlay snapshot fallback (preserves history before
  //      the optimizer existed).
  const requestedDate =
    activeDate ??
    getLatestParlayDate()?.date ??
    null;
  const calibrationTable = loadCalibrationTable();

  // Resolve the best available parlay payload for the carousel.
  const optimizerToday = getOptimizerSnapshotForDate(today);
  const optimizerActive = requestedDate
    ? getOptimizerSnapshotForDate(requestedDate)
    : null;
  const optimizerLatest = getLatestOptimizerSnapshot();
  const optimizerPayload =
    (optimizerToday && optimizerToday.totalSlips > 0 && optimizerToday) ||
    (optimizerActive && optimizerActive.totalSlips > 0 && optimizerActive) ||
    (optimizerLatest && optimizerLatest.payload.totalSlips > 0
      ? optimizerLatest.payload
      : null);

  let carouselSlips: ParlaySlipForCarousel[] = [];
  let carouselDate = requestedDate ?? "";
  let carouselSource: "snapshot" | "graded" = "snapshot";
  let carouselIsFallback = false;
  let carouselSourceLabel: "optimizer" | "snapshot" = "snapshot";

  if (optimizerPayload && optimizerPayload.totalSlips > 0) {
    const flat = flattenOptimizerSlips(optimizerPayload);
    carouselSlips = flat.map((s) =>
      optimizerSlipToParlaySlip(s, optimizerPayload.date),
    );
    carouselDate = optimizerPayload.date;
    carouselIsFallback = optimizerPayload.date !== requestedDate;
    carouselSourceLabel = "optimizer";
  } else {
    const suggested = getSuggestedParlaysForDate(requestedDate);
    if (suggested) {
      carouselSlips = suggested.slips;
      carouselDate = suggested.date;
      carouselSource = suggested.source;
      carouselIsFallback = suggested.isFallback;
    }
  }

  // ----- Lifetime stats strip (honest, decisive-only) ----------------
  const combinedDecisive =
    (lifetime?.decisive ?? 0) + (mlbLifetime?.decisive ?? 0);
  const combinedWins = (lifetime?.wins ?? 0) + (mlbLifetime?.wins ?? 0);
  const combinedHitRate =
    combinedDecisive > 0 ? combinedWins / combinedDecisive : null;

  // ----- Hero copy ---------------------------------------------------
  const heroState = decideHeroState({
    crossSportLeansLive,
    todayMode,
    todayGames,
    activeDate,
  });

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-10 md:py-14 overflow-x-hidden">
      {/* 1 — Compact parlay-first hero */}
      <section className="reveal" aria-label="Parlay-first hero">
        <div className="flex flex-col gap-3 max-w-3xl">
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-gold)", fontSize: 11 }}
          >
            {heroState.eyebrow}
          </span>
          <h1
            className="font-display tracking-tight gtp-text-gradient-gold"
            style={{
              fontSize: "clamp(28px, 6vw, 48px)",
              lineHeight: 1.05,
              letterSpacing: "-0.01em",
            }}
          >
            {heroState.headline}
          </h1>
          <p
            className="text-[14px] sm:text-[15px] leading-relaxed"
            style={{ color: "var(--vault-text-mute)", maxWidth: 600 }}
          >
            {heroState.subline}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href="/parlay-lab"
              className="font-mono uppercase tracking-[0.14em] px-4 py-2 rounded-full"
              style={{
                color: "var(--vault-bg)",
                background: "var(--vault-gold-bright)",
                fontSize: 11,
              }}
            >
              Open Parlay Lab →
            </Link>
            <Link
              href="/projections"
              className="font-mono uppercase tracking-[0.14em] px-4 py-2 rounded-full"
              style={{
                color: "var(--vault-text)",
                border: "1px solid var(--vault-border)",
                background: "rgba(7,11,26,0.55)",
                fontSize: 11,
              }}
            >
              Browse projections
            </Link>
          </div>
        </div>
      </section>

      {/* 2 — Suggested parlay carousel: the main act */}
      <div className="mt-8">
        {carouselSlips.length > 0 ? (
          <SuggestedParlayCarousel
            slips={carouselSlips}
            date={carouselDate}
            source={carouselSource}
            isFallback={carouselIsFallback}
            calibrationTable={calibrationTable}
            sourceLabel={carouselSourceLabel}
          />
        ) : (
          <NoParlaysEmptyState />
        )}
      </div>

      {/* 3 — Honest stats strip */}
      <section className="mt-10 reveal" aria-label="Honest stats strip">
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-[8px]"
          style={{
            background: "rgba(7,11,26,0.55)",
            border: "1px solid var(--vault-border)",
          }}
        >
          <StatTile
            label="Tonight"
            value={
              crossSportLeansLive > 0
                ? `${crossSportLeansLive} leans`
                : todayGames > 0
                  ? `${todayGames} game${todayGames === 1 ? "" : "s"}`
                  : "—"
            }
            sub="across NBA + MLB"
          />
          <StatTile
            label="Cross-sport hit rate"
            value={
              combinedHitRate != null
                ? formatPercent(combinedHitRate)
                : "—"
            }
            sub={
              combinedDecisive > 0
                ? `${combinedWins}–${combinedDecisive - combinedWins} on ${combinedDecisive}`
                : "no settled data"
            }
          />
          <StatTile
            label="NBA"
            value={
              lifetime?.hitRate != null
                ? formatPercent(lifetime.hitRate)
                : "—"
            }
            sub={
              lifetime
                ? `${lifetime.wins}–${lifetime.losses} on ${lifetime.decisive}`
                : "results pending"
            }
          />
          <StatTile
            label="MLB"
            value={
              mlbLifetime?.hitRate != null
                ? formatPercent(mlbLifetime.hitRate)
                : "—"
            }
            sub={
              mlbLifetime
                ? `${mlbLifetime.wins}–${mlbLifetime.losses} on ${mlbLifetime.decisive}`
                : "results pending"
            }
          />
        </div>
        <p
          className="mt-2 text-[11px] leading-relaxed"
          style={{ color: "var(--vault-text-faint)" }}
        >
          Decisive single-leg projections only. Pushes excluded. No ROI,
          no guarantees — these are calibrated hit rates from real
          graded settlements. See <Link href="/about" style={{ color: "var(--vault-gold)" }}>About</Link> for methodology.
        </p>
      </section>

      {/* 4 — Pointers to deeper surfaces */}
      <section className="mt-10 reveal" aria-label="Deeper surfaces">
        <SectionHeader
          eyebrow="Go deeper"
          title="Research individual props or build your own"
          sub="Suggested parlays are the headline — these are the tools underneath."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DeeperTile
            href="/projections"
            eyebrow="Projections"
            title="Every individual projection, by game"
            body="Game cards, player accordions, per-prop edges. The same data the suggested parlays are built on."
            cta="Open projections"
          />
          <DeeperTile
            href="/parlay-lab"
            eyebrow="Parlay Lab"
            title="Filter by sport + players, then see the best slip per risk level"
            body="Conservative · Balanced · High Variance. Sourced from saved snapshots — never invented."
            cta="Open Parlay Lab"
          />
        </div>
      </section>

      {/* 5 — Newsletter */}
      <section className="mt-12 reveal">
        <NewsletterSignup variant="full" />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span
        className="font-mono uppercase tracking-[0.16em] truncate"
        style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
      >
        {label}
      </span>
      <span
        className="font-display tabular truncate"
        style={{
          color: "var(--vault-text)",
          fontSize: 18,
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span
        className="font-mono truncate"
        style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
      >
        {sub}
      </span>
    </div>
  );
}

function DeeperTile({
  href,
  eyebrow,
  title,
  body,
  cta,
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="gtp-premium-tile px-4 py-4 flex flex-col gap-2 vault-glow-hover"
      style={{ textDecoration: "none" }}
    >
      <span
        className="font-mono uppercase tracking-[0.18em]"
        style={{ color: "var(--vault-gold)", fontSize: 10 }}
      >
        {eyebrow}
      </span>
      <h3
        className="font-display tracking-tight"
        style={{ color: "var(--vault-text)", fontSize: 17, lineHeight: 1.25 }}
      >
        {title}
      </h3>
      <p
        className="text-[12.5px] leading-snug"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {body}
      </p>
      <span
        className="mt-2 font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
      >
        {cta} →
      </span>
    </Link>
  );
}

function NoParlaysEmptyState() {
  return (
    <section
      className="rounded-[8px] p-6 flex flex-col gap-3"
      style={{
        background: "rgba(7,11,26,0.55)",
        border: "1px dashed var(--vault-border)",
      }}
      aria-label="No suggested parlays available"
    >
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-gold)", fontSize: 11 }}
      >
        No suggested parlays yet
      </span>
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)", maxWidth: 560 }}
      >
        We only show slips that were saved before games started. The
        next pregame snapshot lands when tonight&apos;s lines and projections
        are ready. In the meantime, jump into{" "}
        <Link href="/projections" style={{ color: "var(--vault-gold)" }}>
          projections
        </Link>{" "}
        for individual prop research.
      </p>
    </section>
  );
}

function decideHeroState({
  crossSportLeansLive,
  todayMode,
  todayGames,
  activeDate,
}: {
  crossSportLeansLive: number;
  todayMode: DataMode;
  todayGames: number;
  activeDate: string | null;
}): {
  eyebrow: string;
  headline: string;
  subline: string;
} {
  if (crossSportLeansLive > 0) {
    return {
      eyebrow: "Tonight · live model",
      headline: "Suggested parlays, built from calibrated projections.",
      subline:
        "Swipe through model-built slips by sport and risk level. Every slip is saved before tipoff and graded after final stats — no locks, no guarantees.",
    };
  }
  if (
    activeDate &&
    (todayMode === "ScheduleLiveOddsUnavailable" || todayGames > 0)
  ) {
    return {
      eyebrow: "Lines pending",
      headline: "Suggested parlays, built from calibrated projections.",
      subline:
        "Tonight&apos;s schedule is live — slips drop as soon as bookmaker lines and projections refresh. Browse the latest available rail below.",
    };
  }
  return {
    eyebrow: "Latest available",
    headline: "Suggested parlays, built from calibrated projections.",
    subline:
      "Browse model-built slips by sport and risk level — saved before games and graded after final stats. No locks, no fake records.",
  };
}
