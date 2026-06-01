/**
 * Homepage — Command Center dashboard.
 *
 * A modular dashboard (brand gold/vault theme): a prominent Featured-slip
 * card up top, the full ParlayLabBuilder kept intact as the main work
 * surface, and a sidebar of modules (track record, Bank Builder,
 * projections, events). Same loaders, same builder, same honesty — only
 * the home composition changed. No data/pipeline/optimizer/settlement
 * changes.
 *
 * Honesty preserved:
 *   - Only real snapshots/graded files render here; the slate is labelled
 *     "today / latest / settled" honestly (never fabricated).
 *   - Empty states explain why; high-variance slips stay labelled.
 *   - Decisive single-leg stats only on the track-record module.
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
import GuidedStart from "@/components/guided-start/guided-start";
import NewsletterSignup from "@/components/newsletter-signup";
import MarketTicker from "@/components/market-ticker";
import { buildMarketTickerItems } from "@/lib/market-ticker";
import { currentEtDate } from "@/lib/freshness";

/* ----------------------------------------------------------------------- */
/* Module shell                                                            */
/* ----------------------------------------------------------------------- */
function ModuleCard({
  title,
  meta,
  href,
  children,
}: {
  title: string;
  meta?: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="flex flex-col rounded-[8px] overflow-hidden"
      style={{ background: "var(--gtp-card)", border: "1px solid var(--vault-border)" }}
    >
      <header
        className="flex items-center justify-between gap-3 px-3.5 py-2.5"
        style={{ borderBottom: "1px solid var(--vault-rule)", background: "rgba(7,11,26,0.5)" }}
      >
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 10.5 }}
        >
          {title}
        </span>
        <div className="flex items-center gap-3">
          {meta && (
            <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
              {meta}
            </span>
          )}
          {href && (
            <Link
              href={href}
              className="font-mono uppercase tracking-[0.12em]"
              style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
            >
              open →
            </Link>
          )}
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1 px-3.5 py-3 min-w-0">
      <span className="font-mono uppercase tracking-[0.16em] truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
        {label}
      </span>
      <span className="font-display tabular truncate" style={{ color: "var(--vault-text)", fontSize: 20, fontWeight: 600, lineHeight: 1 }}>
        {value}
      </span>
      <span className="font-mono truncate" style={{ color: "var(--vault-text-mute)", fontSize: 10 }}>
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
  const showingTodayPregame =
    !!suggested && !suggested.isFallback && suggested.source === "snapshot";

  // Featured slip: prefer a pending ~+100 builder pick; otherwise the top
  // slip of the latest published slate. The card shows its own honest
  // settled/pending state — never fabricated.
  const featured =
    selectPlus100BuilderSlip(suggested?.slips ?? [])?.slip ??
    suggested?.slips?.[0] ??
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
    ? `${suggested.date} · ${showingTodayPregame ? "today" : suggested.isFallback ? "latest slate" : "today"}`
    : "—";

  return (
    <div className="vault-page-shell px-3 sm:px-5 lg:px-6 py-4 lg:py-6 overflow-x-hidden flex flex-col gap-4">
      <MarketTicker items={tickerItems} className="-mx-3 sm:-mx-5 lg:-mx-6" />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Main column — guided start + featured card + full builder */}
        <div className="xl:col-span-8 flex flex-col gap-4">
          {/* Additive "New here?" beginner finder — does not replace the
              builder or the featured slip; reuses the same slips/helpers. */}
          <GuidedStart
            slips={suggested?.slips ?? []}
            slateDate={suggested?.date ?? today}
            isFallback={suggested?.isFallback ?? true}
            calibrationTable={calibrationTable}
          />

          {featured && (
            <ModuleCard title="Featured slip" meta={slateLabel}>
              <div className="p-2 sm:p-3">
                <ParlayTicketCard
                  slip={featured}
                  emphasis="featured"
                  savedPregame={suggested?.source === "snapshot"}
                  calibrationTable={calibrationTable}
                />
                <p className="px-1 pt-2 text-[11px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
                  The model&apos;s headline slip from the {slateLabel} slate — saved before games,
                  graded after. High-variance slips are labelled.
                </p>
              </div>
            </ModuleCard>
          )}

          <ModuleCard title="Suggested slips" meta={suggested ? slateLabel : undefined}>
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
                <p className="px-3 py-6 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
                  No suggested slips posted yet — we only show slips saved before games started. The
                  next pregame snapshot lands once tonight&apos;s lines and projections are ready. In
                  the meantime, open{" "}
                  <Link href="/projections/" style={{ color: "var(--vault-gold-bright)" }}>projections</Link>.
                </p>
              )}
            </div>
          </ModuleCard>
        </div>

        {/* Sidebar — modules */}
        <div className="xl:col-span-4 flex flex-col gap-4">
          <ModuleCard title="Track record" href="/results">
            <div className="grid grid-cols-3">
              <Metric
                label="Tracked"
                value={combinedHitRate != null ? formatPercent(combinedHitRate) : "—"}
                sub={combinedDecisive > 0 ? `${combinedWins}/${combinedDecisive}` : "no settled data"}
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
              Decisive single-leg projections only; pushes excluded. Parlay-slip results live on{" "}
              <Link href="/results/" style={{ color: "var(--vault-gold)" }}>Results</Link>.
            </p>
          </ModuleCard>

          <ModuleCard title="Bank Builder" href="/bank-builder">
            <div className="px-3.5 py-3 flex flex-col gap-1.5">
              <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 600 }}>
                $100 → $3,000 paper ladder
              </span>
              <span className="text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
                Five rungs, one daily pick per rung, target ~+100. Paper-trading / educational only —
                resets to the $100 base on a loss, always shown.
              </span>
            </div>
          </ModuleCard>

          <ModuleCard title="Projections" href="/projections">
            <div className="px-3.5 py-3">
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

      <section className="mt-2">
        <NewsletterSignup variant="full" />
      </section>
    </div>
  );
}
