/**
 * /parlay-lab — sport + player picker that surfaces the best slip at
 * every risk level (Conservative · Balanced · High variance).
 *
 * Server component: loads the latest pregame snapshot (or graded
 * fallback) and hands its slips to a single client builder. The old
 * game-by-game experience now lives behind /projections — that page
 * is the right home for individual game research.
 *
 * Honesty:
 *   - Only renders slips from real snapshots on disk.
 *   - The builder never invents legs; matching is filter-only against
 *     existing pregame slips.
 *   - When nothing matches, the per-risk card shows an honest empty
 *     state explaining why.
 */
import { Suspense } from "react";
import Link from "next/link";

import ParlayLabBuilder from "@/components/parlay-lab-builder";
import ParlayCoverageGrid from "@/components/parlay-coverage-grid";
import NbaFinalsCardsSection from "@/components/nba-finals-cards-section";
import { buildFinalsCards, type FinalsLeg } from "@/lib/nba-finals-cards";
import MarketTicker from "@/components/market-ticker";
// DateStatusHeader import removed in PR `feature/parlay-lab-compact-hero`.
// The new <SlateStrip> below replaces it on /parlay-lab. Other surfaces
// (/results, /projections) continue to use DateStatusHeader.
import { buildMarketTickerItems } from "@/lib/market-ticker";
import { loadCalibrationTable } from "@/lib/confidence-calibration";
import {
  getSuggestedParlaysForDate,
  getOptimizerSnapshotForDate,
  getLatestOptimizerSnapshot,
} from "@/lib/data-parlays";
import { getBoardForDate } from "@/lib/data";
import { getMlbBoardForDate } from "@/lib/data-mlb";
import {
  getOptimizerSummary,
  getOptimizerGradedForDate,
} from "@/lib/parlay-results";
import { currentEtDate } from "@/lib/freshness";
import { loadWorldCupParlays } from "@/lib/world-cup/projections";
import WcParlayCard from "@/components/world-cup/wc-parlay-card";
import SectionHeader from "@/components/section-header";

export const metadata = {
  title: "Parlay Lab · GameTime Picks",
  description:
    "Pick a sport and players. See the best suggested parlay at every risk level. Saved before games, graded after — never fabricated.",
};

export default function ParlayLabPage() {
  const today = currentEtDate();
  const suggested = getSuggestedParlaysForDate(today);
  const calibrationTable = loadCalibrationTable();

  // PR `fix/results-parlay-final-polish` (2026-05-29) — reordered
  // the fallback chain so the LATEST optimizer snapshot wins over
  // the legacy `suggested.date`, which often points to an older
  // settled date. The chain is now:
  //   1. TODAY's snapshot, if it exists
  //   2. LATEST snapshot on disk (newest forward-looking date)
  //   3. `suggested.date` snapshot (legacy fallback)
  //
  // Without step 2 coming before step 3 the page was rendering May
  // 27 (older legacy `suggested.date`) even after a fresh May 28
  // optimizer snapshot landed on disk. PR `fix/parlay-lab-prefer-
  // optimizer-date` introduced step 1; this PR adds the reorder.
  const optimizerForDate =
    getOptimizerSnapshotForDate(today) ||
    getLatestOptimizerSnapshot()?.payload ||
    (suggested && getOptimizerSnapshotForDate(suggested.date)) ||
    null;

  // ---- Market ticker (PR #112) ------------------------------------------
  // Parlay Lab surface: lead with the safety-filter context so users
  // understand what's promoted vs hidden, then surface live data.
  const nbaBoard = getBoardForDate(today);
  const mlbBoard = getMlbBoardForDate(today);
  const optimizerSummary = getOptimizerSummary();
  const tickerItems = buildMarketTickerItems({
    surface: "parlay_lab",
    optimizerSummary,
    nba: nbaBoard,
    mlb: mlbBoard,
  });

  // PR #124 — derive the active data date + a tiny per-sport slip count
  // for the header. We pull `nba`/`mlb`/`multi` totals straight from the
  // optimizer payload's bucket structure when present. Everything stays
  // server-side so the header lands above the client builder.
  // Prefer the optimizer date (now reordered to favor today) so the
  // slate strip + suggested slips reflect today's slate even when the
  // legacy snapshot loader fell back to yesterday.
  const activeDate = optimizerForDate?.date ?? suggested?.date ?? today;
  const isFallback = activeDate !== today;
  const optBuckets = (optimizerForDate?.buckets ?? null) as
    | Record<string, Record<string, unknown[]>>
    | null;
  const sportSlipCount = optBuckets
    ? (sport: "nba" | "mlb" | "multi") =>
        ["conservative", "balanced", "aggressive", "star_power"].reduce(
          (acc, p) => acc + (optBuckets[p]?.[sport]?.length ?? 0),
          0,
        )
    : null;
  const nbaSlips = sportSlipCount ? sportSlipCount("nba") : 0;
  const mlbSlips = sportSlipCount ? sportSlipCount("mlb") : 0;
  const mixedSlips = sportSlipCount ? sportSlipCount("multi") : 0;
  const totalSlips = optimizerForDate?.totalSlips ?? suggested?.slips?.length ?? 0;

  // PR `fix/results-parlay-final-polish` — when the active date has
  // already been settled, surface a tiny "Settled · view on Results"
  // chip so users understand they're looking at historical
  // recommendations (still useful — same model, same picks the
  // graded record is built on) AND know where the W/L numbers live.
  // NBA Finals Same-Game Cards — derived live from the optimizer leg pool (real
  // model leans + real book odds). Single-game cards, tiered by combined odds,
  // shown as a separate clearly-labeled surface (does not touch the global
  // multi-game optimizer). Only renders when there's a one-game NBA slate.
  const nbaLegs = (optimizerForDate?.legPool?.legs ?? []).filter(
    (l) => (l as { sport?: string }).sport === "nba",
  ) as unknown as FinalsLeg[];
  const nbaGameIds = new Set(nbaLegs.map((l) => (l as { gameId?: string }).gameId).filter(Boolean));
  // Only render the NBA Finals same-game cards for a FRESH same-day slate — never a
  // stale fallback. Once the slate has been graded/settled (game over), drop the
  // section so the page doesn't imply tonight's game is still pre-tip.
  const isFreshSlate = optimizerForDate?.date === today;
  const finalsCards =
    isFreshSlate && nbaLegs.length > 0 && nbaGameIds.size === 1
      ? buildFinalsCards(nbaLegs, { perTier: 5 })
      : null;

  const activeDateGraded = getOptimizerGradedForDate(activeDate);
  const isActiveSettled =
    !!activeDateGraded && (activeDateGraded.uniqueSlips ?? []).length > 0;
  // PR `fix/today-results-flow-clarity` (2026-05-29) — the inverse:
  // when we have a pregame snapshot for the active date but no
  // graded file yet, render a tiny Pregame chip that tells the user
  // results land after games finish, and link them to /results to
  // see the most recent settled slate while they wait.
  const isActivePregame =
    !!optimizerForDate && (optimizerForDate.totalSlips ?? 0) > 0 && !activeDateGraded;

  return (
    // PR `feature/parlay-lab-compact-hero` (2026-05-28) — collapsed
    // the 120px DateStatusHeader card into a 32px inline slate strip.
    // Pulls 2-3 additional slip cards above the fold without losing
    // any of the date / status / count info. Big DateStatusHeader
    // is still available for other surfaces (results, projections).
    // `pb-28` reserves clearance for the fixed Selected-slips tray
    // (docked ~68px above the bottom) so it never covers the footer
    // pointer when scrolled to the end of the page.
    <div className="vault-page-shell px-4 sm:px-8 pt-4 sm:pt-6 pb-28 overflow-x-hidden">
      <MarketTicker items={tickerItems} className="-mx-4 sm:-mx-8 -mt-4 sm:-mt-6 mb-3" />
      <SlateStrip
        date={activeDate}
        isFallback={isFallback}
        totalSlips={totalSlips}
        nbaSlips={nbaSlips}
        mlbSlips={mlbSlips}
        mixedSlips={mixedSlips}
      />
      <NbaFinalsCardsSection cards={finalsCards} />
      <ParlayCoverageGrid payload={optimizerForDate} excludeNba={finalsCards != null} />
      {isActiveSettled && (
        <section
          aria-label="Active slate already settled"
          className="mt-2 mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2 rounded-[6px]"
          style={{
            background: "var(--gtp-card)",
            border: "1px solid var(--vault-rule)",
          }}
        >
          <span
            className="font-mono uppercase tracking-[0.14em]"
            style={{ color: "var(--vault-success)", fontSize: 11 }}
          >
            Settled
          </span>
          <span
            className="text-[12px] leading-snug"
            style={{ color: "var(--vault-text-mute)" }}
          >
            This slate has finished and been graded. The cards below
            are kept for transparency.
          </span>
          <Link
            href="/results/"
            className="font-mono uppercase tracking-[0.12em] px-2.5 py-1 rounded-full ml-auto"
            style={{
              color: "var(--vault-gold-bright)",
              border: "1px solid var(--vault-gold-bright)",
              fontSize: 11,
              lineHeight: 1.1,
            }}
          >
            View on Results →
          </Link>
        </section>
      )}
      {/* PR `fix/today-results-flow-clarity` (2026-05-29) — Pregame
         counterpart to the Settled chip above. Renders only when the
         active date has a pregame snapshot but hasn't been graded
         yet (e.g. today's MLB games haven't started). Tells users
         exactly when results show up and links to the most recent
         settled slate while they wait. */}
      {isActivePregame && (
        <section
          aria-label="Pregame slate"
          className="mt-2 mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2 rounded-[6px]"
          style={{
            background: "var(--gtp-card)",
            border: "1px solid var(--vault-rule)",
          }}
        >
          <span
            className="font-mono uppercase tracking-[0.14em]"
            style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
          >
            Pregame
          </span>
          <span
            className="text-[12px] leading-snug"
            style={{ color: "var(--vault-text-mute)" }}
          >
            Results update after games finish.
          </span>
          <Link
            href="/results/"
            className="font-mono uppercase tracking-[0.12em] px-2.5 py-1 rounded-full ml-auto"
            style={{
              color: "var(--vault-gold-bright)",
              border: "1px solid var(--vault-gold-bright)",
              fontSize: 11,
              lineHeight: 1.1,
            }}
          >
            View latest settled →
          </Link>
        </section>
      )}
      <Suspense fallback={<div className="min-h-[60vh]" aria-hidden />}>
        {suggested ? (
          // PR `feature/lane-spread-slip-cards` (2026-05-28) — pass
          // the active optimizer date (when present) instead of the
          // legacy snapshot date. Previously the slate strip used
          // `optimizerForDate.date` (today's slate) while the section
          // eyebrow + per-card slate chip received `suggested.date`
          // (yesterday's legacy snapshot), so on the same page the
          // header said "Thu · May 28" and the cards said "MAY 27".
          // Single source of truth: `activeDate` derived above.
          <ParlayLabBuilder
            slips={suggested.slips}
            date={activeDate}
            source={suggested.source}
            isFallback={isFallback}
            calibrationTable={calibrationTable}
            optimizerPayload={optimizerForDate}
          />
        ) : optimizerForDate && optimizerForDate.totalSlips > 0 ? (
          // No legacy snapshot but we DO have an optimizer file — still
          // useful. Synthesize an empty legacy-shape payload so the
          // builder can render with the optimizer as the source.
          <ParlayLabBuilder
            slips={[]}
            date={activeDate}
            source="snapshot"
            isFallback={isFallback}
            calibrationTable={calibrationTable}
            optimizerPayload={optimizerForDate}
          />
        ) : (
          <EmptyLabState />
        )}
      </Suspense>

      <WorldCupSuggestedCards />

      <FooterPointer />
      <OtherSportsPointer />
    </div>
  );
}

/**
 * World Cup suggested parlays — built only from real World Cup model projections
 * (separate engine from the NBA/MLB optimizer above). Renders nothing when the
 * projection gates haven't passed, so we never show empty/fabricated soccer cards.
 */
function WorldCupSuggestedCards() {
  const parlays = loadWorldCupParlays();
  if (!parlays || parlays.cards.length === 0) {
    // Gated state — projection views may be live, but no parlay-eligible legs today.
    return (
      <section id="world-cup" aria-label="World Cup suggested parlays" className="mt-10">
        <SectionHeader
          eyebrow="World Cup · 0 cards today"
          title="World Cup suggested parlays"
          sub="World Cup cards are built only from parlay-eligible projections (a model edge that clears the suggested-card threshold). None qualified today — see the live model probability views on the World Cup hub. Cards publish automatically when an edge qualifies."
        />
        <div className="mt-3">
          <Link href="/world-cup" className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
            World Cup model views →
          </Link>
        </div>
      </section>
    );
  }
  return (
    <section id="world-cup" aria-label="World Cup suggested parlays" className="mt-10">
      <SectionHeader
        eyebrow={`World Cup · ${parlays.cardCount} suggested card${parlays.cardCount === 1 ? "" : "s"}`}
        title="World Cup suggested parlays"
        sub="Built only from positive-edge World Cup model projections (one leg per match — no in-card correlation). 90-minute regulation only. Educational / paper, not betting advice."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {parlays.cards.map((c) => (
          <WcParlayCard key={c.id} card={c} />
        ))}
      </div>
      <div className="mt-3">
        <Link href="/world-cup" className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
          Full World Cup board →
        </Link>
      </div>
    </section>
  );
}

/**
 * Small honest pointer: Parlay Lab only carries NBA/MLB model parlays, so
 * link curious visitors to the schedule-only coverage for other leagues
 * instead of leaving them hunting for tabs that (correctly) don't exist.
 */
function OtherSportsPointer() {
  return (
    <p
      className="mt-3 text-[12px] leading-snug"
      style={{ color: "var(--vault-text-faint)" }}
    >
      Parlay Lab covers NBA and MLB. Looking for UFC, MLS, EPL or other
      leagues? They&apos;re schedule-only in{" "}
      <Link href="/events/" style={{ color: "var(--vault-gold-bright)" }}>
        Sports &amp; Events
      </Link>
      .
    </p>
  );
}

/**
 * Compact one-line slate strip — replaces the large DateStatusHeader
 * card on /parlay-lab.  Shows date · status · slip counts in a single
 * 32px-tall row so the actual slip cards sit much closer to the fold.
 *
 * Format (desktop):
 *   ● Wed · May 27   ·   64 slips   ·   NBA 0 · MLB 32 · Mixed 0
 *                                                           [Latest available]
 *
 * On mobile the right-hand "Latest available" chip wraps to a second
 * line if needed.  Date format uses the `formatDateForHeader` helper
 * already used by other date surfaces, so it stays consistent.
 */
function SlateStrip({
  date,
  isFallback,
  totalSlips,
  nbaSlips,
  mlbSlips,
  mixedSlips,
}: {
  date: string;
  isFallback: boolean;
  totalSlips: number;
  nbaSlips: number;
  mlbSlips: number;
  mixedSlips: number;
}) {
  // Format date as "Wed · May 27" for the strip.  Local helper to
  // avoid pulling formatDateForHeader for one-line use.
  let pretty = date;
  try {
    const d = new Date(`${date}T12:00:00`);
    const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
    const month = d.toLocaleDateString("en-US", { month: "short" });
    const day = d.getDate();
    pretty = `${weekday} · ${month} ${day}`;
  } catch {
    /* fallback to raw ISO if parse fails */
  }
  const isToday = date === currentEtDate() && !isFallback;
  const statusLabel = isToday ? "Today" : "Latest available";
  const statusColor = isToday
    ? "var(--vault-gold-bright)"
    : "var(--vault-text-mute)";
  return (
    <section
      aria-label="Slate overview"
      className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[8px] px-3 sm:px-4 py-2.5"
      style={{
        background: "var(--gtp-card)",
        border: "1px solid var(--gtp-card-border)",
      }}
    >
      <span
        className="inline-flex items-center gap-2"
        style={{ color: "var(--vault-text)" }}
      >
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: statusColor }}
        />
        <span className="font-display text-[15px] font-semibold tracking-tight">
          {pretty}
        </span>
      </span>
      <span
        className="text-[13px]"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {totalSlips} generated combination{totalSlips === 1 ? "" : "s"}
      </span>
      {/* PR `feature/parlay-lab-active-slate-polish` (2026-05-29) —
         when the slate is mono-sport (one sport has 0 slips), the
         per-sport breakdown read as noise ("NBA 0 · MLB 32 · Mixed
         0"). Replaced with a compact "MLB-only" or "NBA-only" chip
         in that case. Multi-sport slates keep the full breakdown so
         the user can compare NBA / MLB / Mixed counts at a glance. */}
      {(() => {
        const nonZero =
          (nbaSlips > 0 ? 1 : 0) +
          (mlbSlips > 0 ? 1 : 0) +
          (mixedSlips > 0 ? 1 : 0);
        const monoSport = nonZero === 1;
        const monoLabel =
          monoSport && nbaSlips > 0
            ? "NBA-only"
            : monoSport && mlbSlips > 0
              ? "MLB-only"
              : monoSport && mixedSlips > 0
                ? "Mixed-only"
                : null;
        if (monoLabel) {
          return (
            <span
              className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-[4px]"
              style={{
                color: "var(--vault-text)",
                border: "1px solid var(--vault-rule)",
                fontSize: 10,
                lineHeight: 1.2,
              }}
            >
              {monoLabel} slate
            </span>
          );
        }
        return (
          <span
            className="text-[13px] font-mono"
            style={{ color: "var(--vault-text-faint)" }}
          >
            NBA <span style={{ color: "var(--vault-text-mute)" }}>{nbaSlips}</span>
            {"  "}·{"  "}MLB{" "}
            <span style={{ color: "var(--vault-text-mute)" }}>{mlbSlips}</span>
            {"  "}·{"  "}Mixed{" "}
            <span style={{ color: "var(--vault-text-mute)" }}>{mixedSlips}</span>
          </span>
        );
      })()}
      <span
        className="ml-auto font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-[4px]"
        style={{
          color: statusColor,
          background: "transparent",
          border: `1px solid ${statusColor}`,
          fontSize: 10,
          lineHeight: 1.2,
        }}
      >
        {statusLabel}
      </span>
    </section>
  );
}

function EmptyLabState() {
  return (
    <section
      className="rounded-[8px] p-6 flex flex-col gap-3"
      style={{
        background: "var(--gtp-card)",
        border: "1px dashed var(--vault-border)",
      }}
      aria-label="No slips available"
    >
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-gold)", fontSize: 11 }}
      >
        No Suggested Parlays for this slate yet
      </span>
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)", maxWidth: 560 }}
      >
        This is normal — we never force a card. A slate can be empty when:
      </p>
      <ul
        className="text-[12.5px] leading-relaxed m-0 pl-4 flex flex-col gap-1"
        style={{ color: "var(--vault-text-mute)", maxWidth: 560, listStyle: "disc" }}
      >
        <li>today&apos;s slate hasn&apos;t generated yet (waiting for bookmaker lines + projections), or</li>
        <li>no combination cleared the safety gates, or</li>
        <li>it&apos;s a single-game slate, where same-game stacking is limited on purpose.</li>
      </ul>
      <p
        className="text-[12.5px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)", maxWidth: 560 }}
      >
        In the meantime, jump into{" "}
        <Link href="/projections" style={{ color: "var(--vault-gold)" }}>
          projections
        </Link>{" "}
        to inspect individual props, or check{" "}
        <Link href="/bank-builder" style={{ color: "var(--vault-gold)" }}>
          Bank Builder
        </Link>{" "}
        for today&apos;s single qualifying slip.
      </p>
    </section>
  );
}

function FooterPointer() {
  return (
    <section
      className="mt-10 rounded-[8px] p-4"
      style={{
        background: "var(--gtp-card)",
        border: "1px solid var(--vault-rule)",
      }}
      aria-label="Game-by-game research pointer"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span
            className="font-mono uppercase tracking-[0.16em]"
            style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
          >
            Want game-by-game research?
          </span>
          <span
            className="font-display"
            style={{ color: "var(--vault-text)", fontSize: 14 }}
          >
            Open Projections to inspect each game and its individual
            prop projections.
          </span>
        </div>
        <Link
          href="/projections"
          className="font-mono uppercase tracking-[0.14em] px-3 py-1.5 rounded-full shrink-0"
          style={{
            color: "var(--vault-gold-bright)",
            border: "1px solid var(--vault-gold-bright)",
            fontSize: 10,
          }}
        >
          Open projections →
        </Link>
      </div>
    </section>
  );
}
