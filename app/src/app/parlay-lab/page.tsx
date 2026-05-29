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
  const activeDateGraded = getOptimizerGradedForDate(activeDate);
  const isActiveSettled =
    !!activeDateGraded && (activeDateGraded.uniqueSlips ?? []).length > 0;

  return (
    // PR `feature/parlay-lab-compact-hero` (2026-05-28) — collapsed
    // the 120px DateStatusHeader card into a 32px inline slate strip.
    // Pulls 2-3 additional slip cards above the fold without losing
    // any of the date / status / count info. Big DateStatusHeader
    // is still available for other surfaces (results, projections).
    <div className="vault-page-shell px-4 sm:px-8 py-4 sm:py-6 overflow-x-hidden">
      <MarketTicker items={tickerItems} className="-mx-4 sm:-mx-8 -mt-4 sm:-mt-6 mb-3" />
      <SlateStrip
        date={activeDate}
        isFallback={isFallback}
        totalSlips={totalSlips}
        nbaSlips={nbaSlips}
        mlbSlips={mlbSlips}
        mixedSlips={mixedSlips}
      />
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

      <FooterPointer />
    </div>
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
        {totalSlips} slip{totalSlips === 1 ? "" : "s"}
      </span>
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
        No saved slips yet
      </span>
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)", maxWidth: 560 }}
      >
        We only render slips that were saved before games started. The
        next pregame snapshot lands when bookmaker lines and projections
        refresh. In the meantime, jump into{" "}
        <Link href="/projections" style={{ color: "var(--vault-gold)" }}>
          projections
        </Link>{" "}
        to inspect individual props.
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
