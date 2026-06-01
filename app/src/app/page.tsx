/**
 * Homepage — CONCEPT A "Command Center / Analytics OS" PREVIEW ONLY.
 *
 * Structural change vs. production: the home is a modular DASHBOARD GRID
 * (a main work-panel + stacked sidebar modules), not a vertical hero →
 * builder → strip stack. Same data loaders, same ParlayLabBuilder, same
 * honesty — only the information architecture/composition differs.
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
import { loadCalibrationTable } from "@/lib/confidence-calibration";
import { formatPercent } from "@/lib/format";

import ParlayLabBuilder from "@/components/parlay-lab-builder";
import MarketTicker from "@/components/market-ticker";
import { buildMarketTickerItems } from "@/lib/market-ticker";
import { currentEtDate } from "@/lib/freshness";

function ModuleCard({
  title,
  meta,
  href,
  children,
  className,
}: {
  title: string;
  meta?: string;
  href?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`ca-module flex flex-col rounded-[8px] overflow-hidden ${className ?? ""}`}
      style={{ background: "var(--gtp-card)", border: "1px solid var(--vault-border)" }}
    >
      <header
        className="flex items-center justify-between px-3.5 py-2.5"
        style={{ borderBottom: "1px solid var(--vault-rule)", background: "rgba(8,12,22,0.5)" }}
      >
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10.5 }}>
          {title}
        </span>
        {meta && (
          <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
            {meta}
          </span>
        )}
        {href && (
          <Link href={href} className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-mute)", fontSize: 10 }}>
            open →
          </Link>
        )}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1 px-3.5 py-3">
      <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
        {label}
      </span>
      <span className="font-display tabular" style={{ color: "var(--vault-text)", fontSize: 22, fontWeight: 600, lineHeight: 1 }}>
        {value}
      </span>
      <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10 }}>
        {sub}
      </span>
    </div>
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

  const slateLabel = suggested
    ? `${suggested.date}${suggested.isFallback ? " · latest" : " · today"}`
    : "—";

  return (
    <div className="vault-page-shell px-3 sm:px-5 lg:px-6 py-4 lg:py-6 overflow-x-hidden flex flex-col gap-4">
      {/* Data tape */}
      <MarketTicker items={tickerItems} className="-mx-3 sm:-mx-5 lg:-mx-6" />

      {/* Dashboard grid: main work panel + sidebar modules */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Main panel — suggested slips work surface */}
        <div className="xl:col-span-8 flex flex-col gap-4">
          <ModuleCard title="Suggested slips" meta={slateLabel}>
            <div className="p-2 sm:p-3">
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
              ) : optimizerForDate && optimizerForDate.totalSlips > 0 ? (
                <ParlayLabBuilder
                  slips={[]}
                  date={optimizerForDate.date}
                  source="snapshot"
                  isFallback={true}
                  calibrationTable={calibrationTable}
                  optimizerPayload={optimizerForDate}
                  embedded
                />
              ) : (
                <p className="px-3 py-6 text-[13px]" style={{ color: "var(--vault-text-mute)" }}>
                  No suggested slips posted yet — the next pregame snapshot lands once tonight&apos;s
                  lines and projections are ready. Meanwhile, open{" "}
                  <Link href="/projections" style={{ color: "var(--vault-gold-bright)" }}>projections</Link>.
                </p>
              )}
            </div>
          </ModuleCard>
        </div>

        {/* Sidebar modules */}
        <div className="xl:col-span-4 flex flex-col gap-4">
          <ModuleCard title="Track record" href="/results">
            <div className="grid grid-cols-3">
              <Metric
                label="Tracked"
                value={combinedHitRate != null ? formatPercent(combinedHitRate) : "—"}
                sub={combinedDecisive > 0 ? `${combinedWins}/${combinedDecisive}` : "pending"}
              />
              <Metric
                label="NBA"
                value={lifetime?.hitRate != null ? formatPercent(lifetime.hitRate) : "—"}
                sub={lifetime ? `${lifetime.wins}/${lifetime.decisive}` : "—"}
              />
              <Metric
                label="MLB"
                value={mlbLifetime?.hitRate != null ? formatPercent(mlbLifetime.hitRate) : "—"}
                sub={mlbLifetime ? `${mlbLifetime.wins}/${mlbLifetime.decisive}` : "—"}
              />
            </div>
            <p className="px-3.5 pb-3 text-[10.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
              Decisive single-leg projections; pushes excluded. Parlay-slip results on Results.
            </p>
          </ModuleCard>

          <ModuleCard title="Bank Builder" href="/bank-builder">
            <div className="px-3.5 py-3 flex flex-col gap-1.5">
              <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 600 }}>
                $100 → $3,000 paper ladder
              </span>
              <span className="text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
                Five rungs, one daily pick per rung, target ~+100. Paper-trading / educational only —
                resets to $100 on a loss, always shown.
              </span>
            </div>
          </ModuleCard>

          <ModuleCard title="Projections" href="/projections">
            <div className="px-3.5 py-3 flex flex-col gap-1.5">
              <span className="text-[12.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
                Every game, every player prop the suggestions are built on — game cards, player
                accordions, per-prop edges. Today&apos;s board posts each morning.
              </span>
            </div>
          </ModuleCard>

          <ModuleCard title="Events" href="/events">
            <div className="px-3.5 py-3">
              <span className="text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
                WNBA · UFC · FIFA — schedule only. No odds, no projections.
              </span>
            </div>
          </ModuleCard>
        </div>
      </div>
    </div>
  );
}
