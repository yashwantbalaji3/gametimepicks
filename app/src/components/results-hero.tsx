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
  /** Lifetime breakdown from the optimizer summary (the GENERATED POOL —
   *  the full deduped optimizer-graded universe). Null when missing. */
  lifetime: OptimizerSummaryBucket | null | undefined;
  /** Lifetime record of the PUBLISHED CARDS users actually saw on Suggested
   *  Parlays (summed from `byPublicSection.lifetime`). Null when missing. */
  publishedLifetime?: OptimizerSummaryBucket | null | undefined;
}

export default function ResultsHero({
  settledDate,
  lifetime,
  publishedLifetime,
}: ResultsHeroProps) {
  const settledLabel = settledDate ? formatDateLabel(settledDate) : null;
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
             one we've enforced since launch; we just say it once.
             PR `feat/results-framing` (2026-06-01) — make the
             save-before / grade-after track-record contract explicit. */}
          Public tracking from {PUBLIC_PARLAY_RESULTS_START_DATE}. Slips
          are saved before games and graded after — hit rate counts only
          finished slips; pending and pushes are shown separately.
        </p>
      </div>

      {/* PR `feature/results-ux-published-vs-generated` (2026-06-05) — two
         clearly separated lifetime records so users don't read the broad
         generated-pool number as the cards they saw. Published-cards record is
         the curated cards shown on Suggested Parlays; the generated pool is the
         full model output tracked separately. Neutral copy; no edge claim. */}
      <div
        aria-label="Lifetime records"
        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
      >
        <RecordCard
          label="Published cards (shown to users) · lifetime"
          record={publishedLifetime}
          emphasis
        />
        <RecordCard label="All generated cards (internal tracking) · lifetime" record={lifetime} />
      </div>
      <p
        className="font-mono leading-snug m-0"
        style={{ color: "var(--vault-text-faint)", fontSize: 11, maxWidth: 620 }}
      >
        Published cards are the ones shown to users on Suggested Parlays before
        games. The second number is every card the model generated, tracked
        internally for transparency. Only settled outcomes count toward hit rate —
        pending games are not counted yet, and pushes are listed separately.
      </p>
    </header>
  );
}

/** One lifetime record chip (W·L · hit rate · decisive · pending). Renders a
 *  stable shape; "—" when there is no decisive record yet. Never fabricates. */
function RecordCard({
  label,
  record,
  emphasis = false,
}: {
  label: string;
  record: OptimizerSummaryBucket | null | undefined;
  emphasis?: boolean;
}) {
  const hitRateLabel =
    record && record.decisive > 0 && record.hitRate != null
      ? `${(record.hitRate * 100).toFixed(1)}%`
      : "—";
  const wl =
    record && (record.wins > 0 || record.losses > 0)
      ? `${record.wins} W · ${record.losses} L`
      : null;
  const pending =
    record && record.pending > 0 ? `${record.pending} pending` : null;
  return (
    <div
      aria-label={label}
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[8px] px-3 py-2"
      style={{
        background: "var(--gtp-card)",
        border: emphasis
          ? "1px solid var(--vault-gold-bright)"
          : "1px solid var(--vault-rule)",
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.14em] w-full"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        {label}
      </span>
      <span
        className="font-display tabular"
        style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 600 }}
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
      {record && record.decisive > 0 && (
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
        >
          · {record.decisive} decisive
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
