/**
 * ANSWER-FIRST REPORT — the reusable primitive for the FreeSim-inspired "answer first, details later"
 * game report: a closed-by-default disclosure that moves heavy content (full pick tables, distributions,
 * model-vs-market diagnostics, unavailable modules, copy recap) out of the main reading path while
 * keeping it one tap away.
 *
 * Pure presentational (no hooks, no fetch, no money). It renders inside the post-Generate reveal only,
 * so it never leaks anything before the gate — it just re-frames already-revealed content as collapsed.
 * Native <details>/<summary> so it works without client JS and is mobile-tappable.
 */
import type { ReactNode } from "react";

export function ExpandableReportSection({
  title,
  count,
  hint,
  children,
  defaultOpen = false,
}: {
  title: string;
  /** Optional badge count appended to the title (e.g. number of rows). */
  count?: number | null;
  /** Optional one-line hint shown under the summary when collapsed. */
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="gtp-report-disclosure rounded-[10px] overflow-hidden"
      style={{ background: "color-mix(in srgb, var(--vault-wash-base) 1.5%, transparent)", border: "1px solid var(--vault-border)" }}
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary
        className="cursor-pointer select-none px-4 py-3 flex items-center gap-2 font-mono uppercase tracking-[0.12em]"
        style={{ color: "var(--vault-gold-bright)", fontSize: 11, listStyle: "none", minHeight: 44 }}
      >
        <span className="flex-1 min-w-0">
          {title}
          {typeof count === "number" ? <span style={{ color: "var(--vault-text-faint)" }}> · {count}</span> : null}
          {hint ? <span className="block normal-case tracking-normal mt-0.5" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>{hint}</span> : null}
        </span>
        <span aria-hidden className="gtp-report-chevron shrink-0" style={{ color: "var(--vault-text-faint)", transition: "transform 160ms" }}>▾</span>
      </summary>
      <div className="px-3 sm:px-4 pb-4 pt-1 overflow-x-auto">{children}</div>
    </details>
  );
}
