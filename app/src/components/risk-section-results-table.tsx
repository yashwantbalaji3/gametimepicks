/**
 * RiskSectionResultsTable — read-only breakdown of how the Low /
 * Medium / High / Longshot sections performed on the active /results
 * slate.
 *
 * Honesty:
 *   - Source: `summarizeByRiskSection` over the already-graded
 *     official `uniqueSlips`. The strict odds + leg-count gate
 *     matches the public Suggested mode's rule (PR #152).
 *   - Empty section → "Not enough settled slips yet." Never invented.
 *   - Pending / push count tracked but excluded from hit rate.
 *
 * Pure presentation.
 */
import {
  RISK_SECTION_ORDER,
  getRiskSectionDisplay,
  type RiskSectionKey,
} from "@/lib/parlay-risk-sections";
import type { RiskSectionBreakdown } from "@/lib/results-breakdown";

export interface RiskSectionResultsTableProps {
  breakdown: RiskSectionBreakdown;
  /** Optional small subhead — e.g. "May 28" — surfaced on the
   *  caption. Pure presentation. */
  contextLabel?: string;
}

export default function RiskSectionResultsTable({
  breakdown,
  contextLabel,
}: RiskSectionResultsTableProps) {
  return (
    <section
      aria-label="Risk-section breakdown"
      className="rounded-[10px] overflow-hidden"
      style={{
        background: "var(--gtp-card)",
        border: "1px solid var(--gtp-card-border)",
      }}
    >
      <header
        className="px-4 sm:px-5 py-3.5 flex flex-wrap items-baseline gap-x-3 gap-y-1"
        style={{
          background: "var(--gtp-card-sunken)",
          borderBottom: "1px solid var(--vault-rule)",
        }}
      >
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
        >
          Published cards by risk
        </span>
        {contextLabel && (
          <span
            className="font-mono"
            style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
          >
            · {contextLabel}
          </span>
        )}
        <span
          className="font-mono ml-auto"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          decisive = wins + losses
        </span>
      </header>
      <div className="p-3 sm:p-4 flex flex-col gap-2">
        {RISK_SECTION_ORDER.map((key) => (
          <Row
            key={key}
            sectionKey={key}
            row={breakdown.sections[key]}
          />
        ))}
      </div>
      <p
        className="px-4 sm:px-5 pb-3 text-[11px] leading-snug"
        style={{ color: "var(--vault-text-faint)" }}
      >
        Sections are derived from each settled official slip&apos;s
        combined odds and leg count using the same strict gate the
        Suggested mode applies pregame. Slips that don&apos;t fall in
        any section&apos;s window are tracked but not shown.
      </p>
    </section>
  );
}

function Row({
  sectionKey,
  row,
}: {
  sectionKey: RiskSectionKey;
  row: RiskSectionBreakdown["sections"][RiskSectionKey];
}) {
  const display = getRiskSectionDisplay(sectionKey);
  const isEmpty = row.total === 0;
  const isPending = row.total > 0 && row.decisive === 0;
  const rate =
    row.hitRate != null ? `${(row.hitRate * 100).toFixed(1)}%` : "—";
  return (
    <div
      className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto_auto_auto] gap-2 sm:gap-4 items-baseline px-3 py-2 rounded-[6px]"
      style={{
        background: "var(--gtp-card-sunken)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{ color: display.accentVar, fontSize: 11 }}
        >
          {display.label}
        </span>
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          {display.legRange} · {display.oddsRange}
        </span>
      </div>
      {isEmpty ? (
        <span
          className="font-mono col-span-1 sm:col-span-4 text-right"
          style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
        >
          Not enough settled slips yet.
        </span>
      ) : (
        <>
          <Stat label="Slips" value={`${row.total}`} />
          <Stat
            label="W · L"
            value={`${row.wins} · ${row.losses}`}
          />
          {/* PR `fix/may28-results-detail-polish` — only render the
              pending column when there's something to show, otherwise
              the row reads cleaner. Pushes get a `P` suffix inline so
              we don't add another column. */}
          <PendingStat pending={row.pending} pushes={row.pushes} />
          <Stat
            label="Hit rate"
            value={isPending ? "All pending" : rate}
            tone={
              isPending
                ? "neutral"
                : row.hitRate != null && row.hitRate >= 0.5
                  ? "win"
                  : row.hitRate != null && row.hitRate < 0.2
                    ? "loss"
                    : "neutral"
            }
          />
        </>
      )}
    </div>
  );
}

/** Compact pending column. Renders an em-dash when nothing's pending
 *  (and no pushes) so the row visually flattens for fully-settled
 *  sections. Pushes get a `P` suffix when present. */
function PendingStat({
  pending,
  pushes,
}: {
  pending: number;
  pushes: number;
}) {
  if (pending === 0 && pushes === 0) {
    return (
      <div className="flex flex-col gap-0.5 items-end shrink-0">
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          Pending
        </span>
        <span
          className="font-mono tabular"
          style={{
            color: "var(--vault-text-faint)",
            fontSize: 13,
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          —
        </span>
      </div>
    );
  }
  const value =
    pushes > 0 ? `${pending} · ${pushes}P` : `${pending}`;
  return (
    <div className="flex flex-col gap-0.5 items-end shrink-0">
      <span
        className="font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        Pending
      </span>
      <span
        className="font-mono tabular"
        style={{
          color: "var(--vault-text)",
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1.2,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "win" | "loss" | "neutral";
}) {
  const color =
    tone === "win"
      ? "var(--vault-success)"
      : tone === "loss"
        ? "var(--vault-warn)"
        : "var(--vault-text)";
  return (
    <div className="flex flex-col gap-0.5 items-end shrink-0">
      <span
        className="font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        {label}
      </span>
      <span
        className="font-mono tabular"
        style={{ color, fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}
      >
        {value}
      </span>
    </div>
  );
}
