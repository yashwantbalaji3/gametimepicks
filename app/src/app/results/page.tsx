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
import { formatPercent } from "@/lib/format";
import EmptyResultsCard from "@/components/empty-results-card";
import NewsletterSignup from "@/components/newsletter-signup";
import ResultsBreakdown from "@/components/results-breakdown";

export default function ResultsPage() {
  const lifetime = getLifetimeSummary();
  const latest = getLatestSettlement();
  const allDates = getAvailableSettlementDates();

  // No settled data anywhere → polished empty state.
  if (lifetime.totalSettled === 0 || latest === null) {
    return <ResultsEmptyShell />;
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
function ResultsEmptyShell() {
  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-8 sm:py-12">
      <div className="reveal vault-hero-eyebrow">
        <div
          className="font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-gold)" }}
        >
          early validation · educational results tracking
        </div>
        <h1 className="mt-2 font-display text-[28px] sm:text-[36px] md:text-[48px] tracking-tightest font-semibold leading-[1]">
          Results coming online
        </h1>
        <p className="mt-3 text-[var(--vault-text-mute)] text-[13px] sm:text-[14px] font-mono max-w-2xl">
          When completed slates are settled with verified final stats, this page
          shows the model's hit rate, projection error, and biggest hits/misses —
          broken down by market, confidence tier, game, and bookmaker.
        </p>
      </div>

      <div className="mt-8">
        <EmptyResultsCard />
      </div>

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
