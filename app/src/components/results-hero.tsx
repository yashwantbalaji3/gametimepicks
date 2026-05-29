/**
 * ResultsHero — compact page header for the rebuilt `/results`
 * dashboard.
 *
 * Replaces (PR `feature/results-ux-restructure`):
 *   - The 737px-tall `<FreshEraStatusBlock>` card
 *   - The legacy 5-tile profile lifetime row from
 *     `<ParlayResultsSummary>` (Conservative / Balanced / Star Power
 *     / High Variance chips), which leaked internal lane names into
 *     the public Results page.
 *
 * What it shows (and only this):
 *   - Eyebrow: "Results"
 *   - Title: "Settled slate: <date>"
 *   - Compact lifetime row: lifetime W-L-Hit rate, decisive count,
 *     pending count.
 *   - One muted line: the public-tracking era start date.
 *
 * Honesty contract preserved:
 *   - Pushes excluded from hit-rate denominator (delegated to the
 *     loader; we only render the number).
 *   - Pending excluded from decisive (same).
 *   - Empty / pre-era → renders "Tracking starts <date>" instead of
 *     a fake number.
 */
import {
  PUBLIC_PARLAY_RESULTS_START_DATE,
} from "@/lib/public-parlay-era";
import type {
  OptimizerSummary,
  OptimizerSummaryBucket,
} from "@/lib/parlay-results";

export interface ResultsHeroProps {
  /** The newest settled slate date (`YYYY-MM-DD`). Null when no slate
   *  has settled in the public era yet. */
  settledDate: string | null;
  /** Lifetime breakdown from the optimizer summary. Null when the
   *  summary file is missing. */
  lifetime: OptimizerSummaryBucket | null | undefined;
}

export default function ResultsHero({
  settledDate,
  lifetime,
}: ResultsHeroProps) {
  const settledLabel = settledDate ? formatDateLabel(settledDate) : null;
  const hitRateLabel =
    lifetime && lifetime.decisive > 0 && lifetime.hitRate != null
      ? `${(lifetime.hitRate * 100).toFixed(1)}%`
      : "—";
  const wl =
    lifetime && (lifetime.wins > 0 || lifetime.losses > 0)
      ? `${lifetime.wins} W · ${lifetime.losses} L`
      : null;
  const pending =
    lifetime && lifetime.pending > 0 ? `${lifetime.pending} pending` : null;
  return (
    <header
      aria-label="Results header"
      className="flex flex-col gap-3 max-w-5xl"
    >
      <div className="flex flex-col gap-1">
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
        >
          Results
        </span>
        <h1
          className="font-display tracking-tight"
          style={{
            color: "var(--vault-text)",
            fontSize: "clamp(22px, 3.5vw, 30px)",
            lineHeight: 1.1,
            fontWeight: 600,
          }}
        >
          {settledLabel
            ? `Settled slate: ${settledLabel}`
            : "Tracking the next settled slate"}
        </h1>
        <p
          className="text-[12px] leading-snug"
          style={{ color: "var(--vault-text-faint)", maxWidth: 560 }}
        >
          {/* PR `fix/results-overview-copy` (2026-05-29) — collapsed
             the legacy three-sentence preamble into one plain-English
             line. The hit-rate / pending / pushes rule is the same
             one we've enforced since launch; we just say it once. */}
          Public tracking from {PUBLIC_PARLAY_RESULTS_START_DATE}. Hit
          rate only counts finished slips — pending and pushes are
          shown separately.
        </p>
      </div>

      <div
        aria-label="Lifetime public parlay record"
        className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-[8px] px-3 py-2"
        style={{
          background: "var(--gtp-card)",
          border: "1px solid var(--vault-rule)",
        }}
      >
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          Lifetime · public era
        </span>
        <span
          className="font-display tabular"
          style={{
            color: "var(--vault-text)",
            fontSize: 18,
            fontWeight: 600,
          }}
        >
          {hitRateLabel}
        </span>
        {wl && (
          <span
            className="font-mono"
            style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
          >
            · {wl}
          </span>
        )}
        {lifetime && lifetime.decisive > 0 && (
          <span
            className="font-mono"
            style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
          >
            · {lifetime.decisive} decisive
          </span>
        )}
        {pending && (
          <span
            className="font-mono"
            style={{ color: "var(--vault-text-faint)", fontSize: 12 }}
          >
            · {pending}
          </span>
        )}
      </div>
    </header>
  );
}

/** Pure: `2026-05-28` → `May 28`. Returns the raw string on bad
 *  input so the hero never throws. */
function formatDateLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const mi = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  if (mi < 0 || mi > 11 || Number.isNaN(day)) return date;
  return `${months[mi]} ${day}`;
}
