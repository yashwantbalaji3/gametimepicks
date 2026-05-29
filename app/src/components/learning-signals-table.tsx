/**
 * LearningSignalsTable — read-only table that surfaces every audit
 * signal the model is watching, the size of the sample, the
 * observed direction, and whether the signal has cleared the
 * confirming-days threshold the audit policy requires before the
 * optimizer can act on it.
 *
 * Honesty:
 *   - Rows come from `buildLearningSignalRows`. We never invent a
 *     row, never fabricate a sample size, never invent confirmation.
 *   - We do NOT say "the model learned", "AI is choosing", or
 *     "deep learning". Statuses are mechanical:
 *       Tracking, Too small to act on, Shadow-test candidate,
 *       Confirmed — not consumed.
 *   - Empty rows array → render nothing. Section never appears when
 *     there's no honest data to show.
 *
 * Pure presentation. No data fetches; no fabricated content.
 */
import {
  getStatusDisplay,
  type LearningSignalRow,
} from "@/lib/learning-signals";

export interface LearningSignalsTableProps {
  rows: ReadonlyArray<LearningSignalRow>;
}

export default function LearningSignalsTable({
  rows,
}: LearningSignalsTableProps) {
  if (!rows || rows.length === 0) return null;
  return (
    <section
      aria-label="Learning signals"
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
          Learning signals
        </span>
        <span
          className="font-mono ml-auto"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          informational · no optimizer change
        </span>
      </header>
      <ul className="p-3 sm:p-4 flex flex-col gap-2 list-none">
        {rows.map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </ul>
      <p
        className="px-4 sm:px-5 pb-3 text-[11px] leading-snug"
        style={{ color: "var(--vault-text-faint)" }}
      >
        Every signal here is tracked first, shadow-tested second, and
        only then considered for the optimizer. We never say the
        model &quot;learned&quot; from a single slate, and we do not
        consume an audit signal until the confirming-days threshold
        in the policy clears.
      </p>
    </section>
  );
}

function Row({ row }: { row: LearningSignalRow }) {
  const display = getStatusDisplay(row.status);
  const sampleLabel =
    row.sample >= row.minSample
      ? `${row.sample} (n ≥ ${row.minSample})`
      : `${row.sample} (n < ${row.minSample})`;
  return (
    <li
      className="grid grid-cols-[1fr_auto] sm:grid-cols-[1.4fr_1fr_1fr_auto] gap-2 sm:gap-3 items-baseline px-3 py-2 rounded-[6px]"
      style={{
        background: "var(--gtp-card-sunken)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-text)", fontSize: 11 }}
        >
          {row.signal}
        </span>
        <span
          className="text-[11.5px] leading-snug"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {row.explanation}
        </span>
      </div>
      <Stat label="Sample" value={sampleLabel} />
      <Stat label="Direction" value={row.direction} />
      <span
        className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-full shrink-0 text-center"
        style={{
          color: display.toneVar,
          border: `1px solid ${display.toneVar}`,
          fontSize: 10,
          lineHeight: 1.4,
          minWidth: 132,
        }}
      >
        {display.label}
      </span>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="hidden sm:flex flex-col gap-0.5 items-start min-w-0">
      <span
        className="font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
      >
        {label}
      </span>
      <span
        className="font-mono"
        style={{
          color: "var(--vault-text-mute)",
          fontSize: 11,
          lineHeight: 1.3,
        }}
      >
        {value}
      </span>
    </div>
  );
}
