/**
 * SPRINT 054 — the homepage research panel.
 *
 * A first-time visitor should be able to answer, without scrolling twice: what is this, is the data
 * current, how has it actually done, and has it beaten the market. The last one is the reason this
 * panel is worth building — the honest answer is "no", and a homepage that omits it while showing a
 * hit rate is technically silent and practically misleading.
 *
 * Everything renders from the canonical contract. No arithmetic happens here.
 */
import Link from "next/link";

import {
  STATE_LABEL,
  type TerminalView,
  formatRate,
} from "@/lib/research/public-contract-adapter";

const STATUS_TONE: Record<string, string> = {
  READY: "var(--vault-gold)",
  QUARANTINED: "var(--vault-danger)",
  FAILED: "var(--vault-danger)",
  STALE: "var(--text-mute)",
  UNAVAILABLE: "var(--text-mute)",
  DUE: "var(--text-mute)",
  DELAYED_WITHIN_GRACE: "var(--text-mute)",
};

export default function TerminalSummaryPanel({ terminal }: { terminal: TerminalView }) {
  if (!terminal.available) return null;

  const mu = terminal.modelUniverse;
  const cal = terminal.calibration;
  const reg = terminal.registry;
  const status = terminal.systemStatus;

  return (
    <section
      aria-labelledby="terminal-summary-heading"
      className="mt-8 rounded-[8px] border border-[var(--vault-border)] p-5"
      style={{ background: "var(--vault-panel)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="terminal-summary-heading" className="text-[15px] font-semibold text-[var(--text)]">
          What this site compares
        </h2>
        <Link
          href="/system-status"
          className="text-[13px] underline underline-offset-2 text-[var(--text-mute)] hover:text-[var(--text)]"
        >
          System status:{" "}
          <span style={{ color: STATUS_TONE[status.overall] ?? "var(--text-mute)" }}>
            {STATE_LABEL[status.overall]}
          </span>
        </Link>
      </div>

      <ul className="mt-3 grid gap-1 sm:grid-cols-2">
        {(terminal.positioning?.whatWeCompare ?? []).map((line) => (
          <li key={line} className="text-[14px] leading-relaxed text-[var(--text-mute)]">
            · {line}
          </li>
        ))}
      </ul>

      <dl className="mt-5 grid gap-4 sm:grid-cols-3">
        {mu ? (
          <div>
            <dt className="text-[12px] uppercase tracking-wide text-[var(--text-mute)]">
              Model history
            </dt>
            <dd className="mt-1 text-[20px] font-bold tabular-nums text-[var(--text)]">
              {formatRate(mu.hitRate)}
            </dd>
            <dd className="text-[12px] leading-snug text-[var(--text-mute)]">
              {mu.decisiveRows.toLocaleString()} settled results
              {mu.dateRange ? `, ${mu.dateRange[0]} → ${mu.dateRange[1]}` : ""}
            </dd>
          </div>
        ) : null}

        {cal ? (
          <div>
            <dt className="text-[12px] uppercase tracking-wide text-[var(--text-mute)]">
              vs the sportsbook
            </dt>
            {/* The number a homepage most wants to omit. Stated plainly, in the same size as the rest. */}
            <dd className="mt-1 text-[20px] font-bold text-[var(--text)]">
              {cal.stillBehindMarket ? "Behind" : "Even or better"}
            </dd>
            <dd className="text-[12px] leading-snug text-[var(--text-mute)]">
              Their no-vig price scored {cal.marketBrier.toFixed(4)}; ours {cal.calibratedBrier.toFixed(4)}
              {" "}on the same {cal.heldOutWindow.rows.toLocaleString()} held-out results. Lower is better.
            </dd>
          </div>
        ) : null}

        {reg ? (
          <div>
            <dt className="text-[12px] uppercase tracking-wide text-[var(--text-mute)]">
              Markets approved
            </dt>
            <dd className="mt-1 text-[20px] font-bold tabular-nums text-[var(--text)]">
              {reg.counts.APPROVED ?? 0}
            </dd>
            <dd className="text-[12px] leading-snug text-[var(--text-mute)]">
              {reg.counts.RECALIBRATE ?? 0} need recalibration · {reg.counts.DISABLED ?? 0} disabled on
              their own record
            </dd>
          </div>
        ) : null}
      </dl>

      {terminal.quarantines.length > 0 ? (
        <p className="mt-4 text-[13px] leading-relaxed text-[var(--text-mute)]">
          <strong className="text-[var(--text)]">
            {terminal.quarantines.map((q) => q.date).join(", ")} withheld.
          </strong>{" "}
          Settlement was stopped by an integrity check, so no outcomes were published and no rate exists
          for it.
        </p>
      ) : null}

      <p className="mt-4 text-[13px] leading-relaxed text-[var(--text-mute)]">
        Paper-only and educational, in public beta. Nothing here is betting advice.{" "}
        <Link href="/methodology" className="underline underline-offset-2 text-[var(--text)]">
          How to read this site
        </Link>
        .
      </p>
    </section>
  );
}
