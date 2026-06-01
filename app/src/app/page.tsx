/**
 * Homepage — CONCEPT B "Social Story / Daily Feed" PREVIEW ONLY.
 *
 * Structural change vs. production: the home is a single-column vertical
 * STORY FEED of big, full-width, screenshot-friendly blocks (slate hero →
 * featured slip → browse-all → track-record recap → bank ladder → game
 * teasers), instead of the hero → builder → strip stack. Same data + the
 * same ParlayLabBuilder / ParlayTicketCard; only composition differs.
 *
 * Do not merge. No data/pipeline/optimizer/logic changes.
 */
import Link from "next/link";

import { getLifetimeSummary, getBoardForDate } from "@/lib/data";
import { getMlbLifetimeSummary } from "@/lib/data-mlb-results";
import { getMlbBoardForDate } from "@/lib/data-mlb";
import { getOptimizerSummary } from "@/lib/parlay-results";
import {
  getSuggestedParlaysForDate,
  getOptimizerSnapshotForDate,
  getLatestOptimizerSnapshot,
} from "@/lib/data-parlays";
import { selectPlus100BuilderSlip } from "@/lib/parlay-suggested";
import { loadCalibrationTable } from "@/lib/confidence-calibration";
import { formatPercent } from "@/lib/format";

import ParlayLabBuilder from "@/components/parlay-lab-builder";
import ParlayTicketCard from "@/components/parlay-ticket-card";
import MarketTicker from "@/components/market-ticker";
import { buildMarketTickerItems } from "@/lib/market-ticker";
import { currentEtDate } from "@/lib/freshness";

function Story({
  kicker,
  children,
  className,
}: {
  kicker?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`cb-story w-full ${className ?? ""}`}
      style={{ background: "var(--gtp-card)", border: "1px solid var(--vault-border)", overflow: "hidden" }}
    >
      {kicker && (
        <div
          className="px-5 sm:px-6 pt-4 font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
        >
          {kicker}
        </div>
      )}
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

export default function HomePage() {
  const today = currentEtDate();
  const lifetime = getLifetimeSummary();
  const mlbLifetime = getMlbLifetimeSummary();
  const calibrationTable = loadCalibrationTable();

  const suggested = getSuggestedParlaysForDate(today);
  const optimizerForDate =
    getOptimizerSnapshotForDate(today) ||
    (suggested ? getOptimizerSnapshotForDate(suggested.date) : null) ||
    getLatestOptimizerSnapshot()?.payload ||
    null;

  const combinedDecisive = (lifetime?.decisive ?? 0) + (mlbLifetime?.decisive ?? 0);
  const combinedWins = (lifetime?.wins ?? 0) + (mlbLifetime?.wins ?? 0);
  const combinedHitRate = combinedDecisive > 0 ? combinedWins / combinedDecisive : null;

  const nbaBoard = getBoardForDate(today);
  const mlbBoard = getMlbBoardForDate(today);
  const tickerItems = buildMarketTickerItems({
    surface: "home",
    optimizerSummary: getOptimizerSummary(),
    nba: nbaBoard,
    mlb: mlbBoard,
  });

  // Featured slip: prefer a pending ~+100 builder pick; else the top slip of
  // the latest published slate (the card shows its own settled/pending state).
  const featured =
    selectPlus100BuilderSlip(suggested?.slips ?? [])?.slip ??
    suggested?.slips?.[0] ??
    null;
  const slateLabel = suggested
    ? `${suggested.date}${suggested.isFallback ? " · latest slate" : " · tonight"}`
    : "—";

  return (
    <div className="vault-page-shell overflow-x-hidden">
      <MarketTicker items={tickerItems} className="" />
      {/* Single-column story feed */}
      <div className="mx-auto max-w-2xl px-3 sm:px-4 py-5 sm:py-8 flex flex-col gap-5">
        {/* 1 — Slate hero */}
        <Story kicker={suggested?.isFallback ? "Latest slate" : "Tonight"}>
          <h1
            className="font-display tracking-tight gtp-text-gradient-gold"
            style={{ fontSize: "clamp(28px, 8vw, 46px)", lineHeight: 1.02, letterSpacing: "-0.02em" }}
          >
            The model&apos;s best slips, ranked.
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
            {slateLabel} — saved before games, graded after. High-variance slips are labeled.
            Scroll the feed, tap any card to build your own.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/parlay-lab/" className="px-4 py-2 rounded-full font-mono uppercase tracking-[0.12em]"
              style={{ fontSize: 11, color: "var(--vault-bg)", background: "var(--vault-gold-bright)" }}>
              Browse all slips →
            </Link>
            <Link href="/results/" className="px-4 py-2 rounded-full font-mono uppercase tracking-[0.12em]"
              style={{ fontSize: 11, color: "var(--vault-text)", border: "1px solid var(--vault-border-strong)" }}>
              See the record
            </Link>
          </div>
        </Story>

        {/* 2 — Featured slip card */}
        {featured && (
          <Story kicker="Featured slip">
            <ParlayTicketCard
              slip={featured}
              emphasis="featured"
              savedPregame={suggested?.source === "snapshot"}
              calibrationTable={calibrationTable}
            />
          </Story>
        )}

        {/* 3 — Track-record recap (shareable) */}
        <Story kicker="The honest record">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div className="flex flex-col">
              <span className="font-display tabular" style={{ fontSize: 44, fontWeight: 700, lineHeight: 1, color: "var(--vault-text)" }}>
                {combinedHitRate != null ? formatPercent(combinedHitRate) : "—"}
              </span>
              <span className="mt-1 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
                tracked single-leg hit rate · {combinedDecisive > 0 ? `${combinedWins}–${combinedDecisive - combinedWins} of ${combinedDecisive}` : "no settled data"} · pushes excluded
              </span>
            </div>
            <div className="flex gap-5">
              <div className="flex flex-col"><span className="font-mono uppercase tracking-[0.16em]" style={{ fontSize: 9, color: "var(--vault-text-faint)" }}>NBA</span><span className="font-display tabular" style={{ fontSize: 20, fontWeight: 600, color: "var(--vault-text)" }}>{lifetime?.hitRate != null ? formatPercent(lifetime.hitRate) : "—"}</span></div>
              <div className="flex flex-col"><span className="font-mono uppercase tracking-[0.16em]" style={{ fontSize: 9, color: "var(--vault-text-faint)" }}>MLB</span><span className="font-display tabular" style={{ fontSize: 20, fontWeight: 600, color: "var(--vault-text)" }}>{mlbLifetime?.hitRate != null ? formatPercent(mlbLifetime.hitRate) : "—"}</span></div>
            </div>
          </div>
          <Link href="/results/" className="mt-3 inline-block font-mono uppercase tracking-[0.12em]" style={{ fontSize: 11, color: "var(--vault-gold-bright)" }}>
            Full parlay results →
          </Link>
        </Story>

        {/* 4 — Bank Builder ladder teaser */}
        <Story kicker="Bank Builder · paper only">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex flex-col">
              <span className="font-display" style={{ fontSize: 24, fontWeight: 700, color: "var(--vault-text)" }}>$100 → $3,000</span>
              <span className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>five-rung paper ladder · one daily pick per rung · resets to $100 on a loss (always shown)</span>
            </div>
            <Link href="/bank-builder/" className="px-4 py-2 rounded-full font-mono uppercase tracking-[0.12em] whitespace-nowrap"
              style={{ fontSize: 11, color: "var(--vault-bg)", background: "var(--vault-gold-bright)" }}>
              Open ladder →
            </Link>
          </div>
        </Story>

        {/* 5 — Browse-all module (full builder, in-feed) */}
        <Story kicker="Browse every slip">
          {suggested ? (
            <ParlayLabBuilder
              slips={suggested.slips}
              date={suggested.date}
              source={suggested.source}
              isFallback={suggested.isFallback}
              calibrationTable={calibrationTable}
              optimizerPayload={optimizerForDate}
              embedded
            />
          ) : (
            <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>
              No suggested slips posted yet — the next pregame snapshot lands once tonight&apos;s lines and projections are ready.
            </p>
          )}
        </Story>

        {/* 6 — Game / events teasers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Story kicker="Projections">
            <p className="text-[13px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
              Every game, every prop the picks are built on — game cards + player accordions.
            </p>
            <Link href="/projections/" className="mt-3 inline-block font-mono uppercase tracking-[0.12em]" style={{ fontSize: 11, color: "var(--vault-gold-bright)" }}>Open projections →</Link>
          </Story>
          <Story kicker="Events">
            <p className="text-[13px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
              WNBA · UFC · FIFA — schedule only. No odds, no projections.
            </p>
            <Link href="/events/" className="mt-3 inline-block font-mono uppercase tracking-[0.12em]" style={{ fontSize: 11, color: "var(--vault-gold-bright)" }}>See schedules →</Link>
          </Story>
        </div>
      </div>
    </div>
  );
}
