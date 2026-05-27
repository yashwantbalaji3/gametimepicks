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
import DateStatusHeader from "@/components/date-status-header";
import { buildMarketTickerItems } from "@/lib/market-ticker";
import { loadCalibrationTable } from "@/lib/confidence-calibration";
import {
  getSuggestedParlaysForDate,
  getOptimizerSnapshotForDate,
  getLatestOptimizerSnapshot,
} from "@/lib/data-parlays";
import { getBoardForDate } from "@/lib/data";
import { getMlbBoardForDate } from "@/lib/data-mlb";
import { getOptimizerSummary } from "@/lib/parlay-results";
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

  // Prefer the optimizer snapshot for the date we surfaced. When the
  // snapshot fallback walked to an older date, also try the optimizer
  // for the same older date. As a last resort, use whatever the latest
  // optimizer file we have on disk is.
  const optimizerForDate =
    (suggested && getOptimizerSnapshotForDate(suggested.date)) ||
    getOptimizerSnapshotForDate(today) ||
    getLatestOptimizerSnapshot()?.payload ||
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
  const activeDate = suggested?.date ?? optimizerForDate?.date ?? today;
  const isFallback = !!suggested?.isFallback || activeDate !== today;
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

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden">
      <MarketTicker items={tickerItems} className="-mx-4 sm:-mx-8 -mt-4 sm:-mt-6 mb-4 sm:mb-6" />
      <div className="mb-4 sm:mb-6">
        <DateStatusHeader
          date={activeDate}
          label={isFallback ? "latest-available" : "today"}
          context="Suggested parlays · official slate"
          counts={{ slips: totalSlips }}
          note={
            totalSlips === 0
              ? "No official suggested parlays for this slate. The safety filters did not find a clean slip."
              : `NBA-only ${nbaSlips} · MLB-only ${mlbSlips} · Mixed ${mixedSlips}`
          }
        />
      </div>
      <Suspense fallback={<div className="min-h-[60vh]" aria-hidden />}>
        {suggested ? (
          <ParlayLabBuilder
            slips={suggested.slips}
            date={suggested.date}
            source={suggested.source}
            isFallback={suggested.isFallback}
            calibrationTable={calibrationTable}
            optimizerPayload={optimizerForDate}
          />
        ) : optimizerForDate && optimizerForDate.totalSlips > 0 ? (
          // No legacy snapshot but we DO have an optimizer file — still
          // useful. Synthesize an empty legacy-shape payload so the
          // builder can render with the optimizer as the source.
          <ParlayLabBuilder
            slips={[]}
            date={optimizerForDate.date}
            source="snapshot"
            isFallback={true}
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

function EmptyLabState() {
  return (
    <section
      className="rounded-[8px] p-6 flex flex-col gap-3"
      style={{
        background: "rgba(7,11,26,0.55)",
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
        background: "rgba(7,11,26,0.4)",
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
