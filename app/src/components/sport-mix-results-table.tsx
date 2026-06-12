/**
 * SportMixResultsTable — read-only breakdown of how NBA-only,
 * MLB-only, and Mixed slips performed on the active /results slate.
 *
 * Pure presentation. Sources `summarizeBySportBucket` so the math
 * lives in `results-breakdown.ts`. Slips with no usable sport are
 * counted in "Other" but only surfaced when non-zero so the table
 * stays clean on typical days.
 */
import type { SportBucketBreakdown } from "@/lib/results-breakdown";

export interface SportMixResultsTableProps {
  breakdown: SportBucketBreakdown;
  contextLabel?: string;
}

const _SPORT_DISPLAY: Array<{
  key: "nba" | "mlb" | "multi";
  label: string;
  emoji: string;
}> = [
  { key: "nba", label: "NBA-only", emoji: "🏀" },
  { key: "mlb", label: "MLB-only", emoji: "⚾" },
  { key: "multi", label: "Mixed", emoji: "🔀" },
];

export default function SportMixResultsTable({
  breakdown,
  contextLabel,
}: SportMixResultsTableProps) {
  return (
    <section
      aria-label="Sport-mix breakdown"
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
          Published cards by sport mix
        </span>
        {contextLabel && (
          <span
            className="font-mono"
            style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
          >
            · {contextLabel}
          </span>
        )}
      </header>
      <div className="p-3 sm:p-4 flex flex-col gap-2">
        {_SPORT_DISPLAY.map(({ key, label, emoji }) => (
          <Row
            key={key}
            label={`${emoji} ${label}`}
            row={breakdown[key]}
          />
        ))}
        {breakdown.other.total > 0 && (
          <Row label="Other" row={breakdown.other} />
        )}
      </div>
    </section>
  );
}

function Row({
  label,
  row,
}: {
  label: string;
  row: SportBucketBreakdown["nba"];
}) {
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
      <span
        className="font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-text)", fontSize: 11 }}
      >
        {label}
      </span>
      {isEmpty ? (
        <span
          className="font-mono col-span-1 sm:col-span-4 text-right"
          style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
        >
          No settled slips on this slate.
        </span>
      ) : (
        <>
          <Stat label="Slips" value={`${row.total}`} />
          <Stat
            label="W · L"
            value={`${row.wins} · ${row.losses}`}
          />
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

/** Compact pending column — mirrors the one in
 *  `risk-section-results-table.tsx`. Em-dash when nothing's pending so
 *  the row visually flattens for fully-settled buckets. */
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
