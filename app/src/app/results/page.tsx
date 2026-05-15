/**
 * Phase 8 — Results page.
 *
 * Reads the real settlement data from pipeline/validation/ written by
 * `python -m pipeline.settle_results --date <date>`.
 *
 * Three states:
 *
 *   1. NO settled data on disk yet         → polished empty state
 *      (the default for a fresh deploy)
 *
 *   2. Settled data exists                 → lifetime summary tile +
 *                                             per-date selector + the
 *                                             newest date's full
 *                                             comparison report rendered
 *
 *   3. Pre-7C demo path                    → still supported via the
 *                                             old hit_rates.json loader
 *                                             but only as a fallback
 *                                             when no real settled data
 *                                             exists. (Current state on
 *                                             your machine: no settled
 *                                             data yet → shows empty
 *                                             state, NOT the demo.)
 *
 * Honest framing throughout: "early validation", "small sample", no
 * profitability language, no ROI, hit rate excludes pushes from the
 * denominator (standard convention) and clearly states so.
 */
import {
  getLifetimeSummary,
  getLatestSettlement,
  getAvailableSettlementDates,
  type ComparisonReport,
} from "@/lib/settlement-data";
import {
  getBoardForDate,
  getAvailableBoardDates,
} from "@/lib/data";
import { formatPercent } from "@/lib/format";
import Link from "next/link";
import EmptyResultsCard from "@/components/empty-results-card";
import NewsletterSignup from "@/components/newsletter-signup";
import ResultsBreakdown from "@/components/results-breakdown";
import NeonCornerBracket from "@/components/neon-corner-bracket";

/**
 * Walk available board dates newest-first and return the first one
 * that already has scored leans. Used to point the empty-state CTA at
 * the most useful live slate the user can actually look at.
 */
function findLatestScoredBoardDate(): string | null {
  const dates = getAvailableBoardDates().slice().sort().reverse();
  for (const d of dates) {
    const b = getBoardForDate(d);
    const hasScored = (b.leans ?? []).some(
      (l) =>
        typeof l.projection === "number" &&
        typeof l.edgePct === "number" &&
        Number.isFinite(l.edgePct),
    );
    if (hasScored) return d;
  }
  return null;
}

export default function ResultsPage() {
  const lifetime = getLifetimeSummary();
  const latest = getLatestSettlement();
  const allDates = getAvailableSettlementDates();
  const latestScoredDate = findLatestScoredBoardDate();

  // No settled data anywhere → polished empty state.
  if (lifetime.totalSettled === 0 || latest === null) {
    return <ResultsEmptyShell latestScoredDate={latestScoredDate} />;
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-8 sm:py-12">
      {/* Hero */}
      <div className="reveal vault-hero-eyebrow">
        <div
          className="font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-gold)" }}
        >
          early validation · educational results tracking
        </div>
        <h1 className="mt-2 font-display text-[28px] sm:text-[36px] md:text-[48px] tracking-tightest font-semibold leading-[1]">
          {lifetime.hitRate !== null
            ? formatPercent(lifetime.hitRate)
            : "—"}{" "}
          <span className="text-[var(--vault-text-mute)]">hit rate</span>
        </h1>
        <p className="mt-3 text-[var(--vault-text-mute)] text-[13px] sm:text-[14px] font-mono">
          {lifetime.decisive} decisive {lifetime.decisive === 1 ? "pick" : "picks"} ·{" "}
          {lifetime.totalDates} {lifetime.totalDates === 1 ? "settled date" : "settled dates"}
          {lifetime.oldestDate && lifetime.newestDate && lifetime.oldestDate !== lifetime.newestDate
            ? ` · ${lifetime.oldestDate} → ${lifetime.newestDate}`
            : lifetime.newestDate
              ? ` · ${lifetime.newestDate}`
              : ""}
        </p>
      </div>

      {/* Honesty banner */}
      {lifetime.smallSample && (
        <aside
          className="mt-6 px-4 py-3 rounded-[3px] flex items-start gap-3"
          style={{
            background: "var(--vault-warn-dim)",
            border: "1px solid rgba(240, 199, 94, 0.30)",
          }}
        >
          <span
            className="font-mono text-[10px] uppercase tracking-wider shrink-0 mt-0.5"
            style={{ color: "var(--vault-warn)" }}
          >
            small sample
          </span>
          <p
            className="font-mono text-[12px] leading-relaxed"
            style={{ color: "var(--vault-text-mute)" }}
          >
            {lifetime.decisive} decisive picks is below the ~25-pick floor where
            hit rates start to be statistically meaningful. Treat these numbers
            as descriptive, not predictive. Real validation requires many more
            settled slates.
          </p>
        </aside>
      )}

      {/* Lifetime KPI strip */}
      <section className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiTile label="settled" value={String(lifetime.totalSettled)} />
        <KpiTile
          label="wins"
          value={String(lifetime.wins)}
          accent="success"
        />
        <KpiTile
          label="losses"
          value={String(lifetime.losses)}
          accent="danger"
        />
        <KpiTile label="pushes" value={String(lifetime.pushes)} />
      </section>

      {/* Available dates */}
      {allDates.length > 1 && (
        <section className="mt-8">
          <SectionHeading>settled dates</SectionHeading>
          <div className="mt-3 flex flex-wrap gap-2">
            {allDates.map((d) => (
              <span
                key={d}
                className="px-2.5 py-1 rounded-[2px] font-mono text-[11px] tracking-wider uppercase"
                style={{
                  color: d === latest.date ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
                  background:
                    d === latest.date ? "var(--vault-gold-dim)" : "var(--vault-panel-elevated)",
                  border: `1px solid ${
                    d === latest.date ? "var(--vault-border-strong)" : "var(--vault-border)"
                  }`,
                }}
              >
                {d}
              </span>
            ))}
          </div>
          <p
            className="mt-2 font-mono text-[10px] uppercase tracking-wider"
            style={{ color: "var(--vault-text-faint)" }}
          >
            showing {latest.date} below — most recent
          </p>
        </section>
      )}

      {/* Newest date's full comparison report */}
      {latest.report && (
        <section className="mt-10">
          <SectionHeading>{latest.date} · breakdown</SectionHeading>
          <ResultsBreakdown report={latest.report} />
        </section>
      )}

      {/* Footer disclosure */}
      <footer
        className="mt-12 pt-6 text-center font-mono text-[10px] tracking-[0.18em] uppercase"
        style={{
          color: "var(--vault-text-faint)",
          borderTop: "1px solid var(--vault-rule)",
        }}
      >
        hit rate excludes pushes · educational use only · not betting advice
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function ResultsEmptyShell({
  latestScoredDate,
}: {
  latestScoredDate: string | null;
}) {
  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-8 sm:py-12">
      <div className="reveal vault-hero-eyebrow vault-data-orbit neon-corner-bracket gtp-line-scan relative overflow-hidden -mx-4 sm:-mx-6 px-4 sm:px-6 pt-6 pb-2">
        <NeonCornerBracket />
        <div
          className="font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-gold)" }}
        >
          Calibration room · early validation
        </div>
        <h1
          className="mt-2 vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          The grading lab
        </h1>
        <p
          className="mt-3 text-[14px] sm:text-[15px] leading-relaxed max-w-2xl"
          style={{ color: "var(--vault-text-mute)" }}
        >
          Once a slate&apos;s games complete and the box scores are verified,
          every model lean is graded against the actual outcome. Hit rate,
          projection error, and confidence calibration live here — broken
          down by market, confidence tier, game, and bookmaker.
        </p>
      </div>

      <div className="mt-8">
        <EmptyResultsCard latestScoredDate={latestScoredDate} />
      </div>

      {/* Calibration sigil — small ambient pulsing graphic that visually
          separates the explainer block above from the live slate-await
          panel below. Pure texture, no fabrication. */}
      {latestScoredDate && (
        <div aria-hidden className="gtp-calib-sigil">
          <span className="gtp-calib-rule-left" />
          <span className="gtp-calib-ring" />
          <span className="gtp-calib-rule-right" />
        </div>
      )}

      {/* Slate-awaiting-settlement panel. Points the user at the live
          model board with the loaded projection count so the Results
          page never reads as a dead end while the slate is still in
          flight. Only renders when a scored slate actually exists. */}
      <SlateAwaitingSettlementPanel latestScoredDate={latestScoredDate} />

      {/* Phase 13: compact newsletter signup so users can be notified
          when results actually populate. */}
      <div className="mt-10 max-w-2xl">
        <NewsletterSignup variant="compact" />
      </div>

      <footer
        className="mt-12 pt-6 text-center font-mono text-[10px] tracking-[0.18em] uppercase"
        style={{
          color: "var(--vault-text-faint)",
          borderTop: "1px solid var(--vault-rule)",
        }}
      >
        educational use only · not betting advice
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slate-awaiting-settlement panel — used on the empty Results page to
// keep the surface useful. Points the user at the latest scored model
// board with the loaded projection count. Honest about the fact that
// nothing is settled yet.
// ---------------------------------------------------------------------------
function SlateAwaitingSettlementPanel({
  latestScoredDate,
}: {
  latestScoredDate: string | null;
}) {
  if (!latestScoredDate) return null;
  const board = getBoardForDate(latestScoredDate);
  const scoredLeans = (board.leans ?? []).filter(
    (l) =>
      typeof l.projection === "number" &&
      typeof l.edgePct === "number" &&
      Number.isFinite(l.edgePct),
  );
  const projectionCount = scoredLeans.length;
  const highCount = scoredLeans.filter((l) => l.confidence === "High").length;
  const games = board.games ?? [];
  const matchup =
    games.length > 0 && games[0].awayTeamAbbr && games[0].homeTeamAbbr
      ? `${games[0].awayTeamAbbr} @ ${games[0].homeTeamAbbr}${
          games.length > 1 ? ` · +${games.length - 1} more` : ""
        }`
      : null;
  return (
    <div className="mt-8 gtp-slate-await">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
            style={{
              background: "var(--vault-gold-bright)",
              boxShadow: "0 0 8px rgba(240, 199, 94, 0.6)",
            }}
          />
          <span
            className="font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-gold)" }}
          >
            slate in flight · awaiting settlement
          </span>
        </div>
        <Link
          href={`/board?date=${latestScoredDate}`}
          className="font-mono tracking-tight transition-colors"
          style={{ color: "var(--vault-gold)", fontSize: 12 }}
        >
          view the live board →
        </Link>
      </div>
      <h2
        className="mt-3 font-display font-semibold tracking-tight"
        style={{ color: "var(--vault-text)", fontSize: 20, lineHeight: 1.2 }}
      >
        {latestScoredDate}
        {matchup && (
          <span
            style={{
              color: "var(--vault-text-mute)",
              fontSize: 14,
              fontWeight: 500,
              marginLeft: 8,
            }}
          >
            · {matchup}
          </span>
        )}
      </h2>
      <p
        className="mt-2 text-[13px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)" }}
      >
        The model has{" "}
        <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>
          {projectionCount}
        </span>{" "}
        projection{projectionCount === 1 ? "" : "s"} loaded on this slate (
        <span style={{ color: "var(--vault-gold)" }}>{highCount} High</span>{" "}
        confidence). Once the games complete and box scores verify, every
        lean will land here graded against the actual outcome.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline UI atoms (vault-themed, no external dep)
// ---------------------------------------------------------------------------
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="font-mono text-[10px] uppercase tracking-[0.18em] shrink-0"
        style={{ color: "var(--vault-gold)" }}
      >
        {children}
      </span>
      <div
        className="flex-1 h-px"
        style={{ background: "var(--vault-rule)" }}
      />
    </div>
  );
}

function KpiTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "success" | "danger" | "warn";
}) {
  const accentColor =
    accent === "success"
      ? "var(--vault-success)"
      : accent === "danger"
        ? "var(--vault-danger)"
        : accent === "warn"
          ? "var(--vault-warn)"
          : "var(--vault-text)";

  return (
    <div
      className="rounded-[3px] p-4 sm:p-5"
      style={{
        background: "var(--vault-panel)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div
        className="font-mono text-[10px] tracking-[0.18em] uppercase"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 font-display font-semibold tabular tracking-tight text-[24px] sm:text-[28px]"
        style={{ color: accentColor }}
      >
        {value}
      </div>
    </div>
  );
}
