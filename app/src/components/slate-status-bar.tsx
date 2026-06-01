/**
 * SlateStatusBar — production persistent state strip.
 *
 * Sits across the top of the content canvas (right of the command rail on
 * desktop) and makes the app's state legible everywhere: today, the active
 * slate (and whether it's settled or still pregame), the latest settled
 * slate, and the paper-bankroll base. Server component reading the SAME
 * loaders the rest of the app uses — every value is honest; nothing is
 * fabricated. Public-era / settlement semantics are unchanged.
 */
import { getLatestOptimizerSnapshot } from "@/lib/data-parlays";
import { getOptimizerGradedDates } from "@/lib/parlay-results";
import { currentEtDate } from "@/lib/freshness";

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-2 whitespace-nowrap">
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}
      >
        {label}
      </span>
      <span className="font-mono" style={{ color: tone ?? "var(--vault-text)", fontSize: 12 }}>
        {value}
      </span>
    </div>
  );
}

export default function SlateStatusBar() {
  const today = currentEtDate();
  const activeDate = getLatestOptimizerSnapshot()?.date ?? null;
  // Max graded date (YYYY-MM-DD sorts chronologically) — robust to loader order.
  const gradedDates = getOptimizerGradedDates();
  const latestSettled = gradedDates.length ? [...gradedDates].sort().slice(-1)[0] : null;
  const activeIsSettled =
    !!activeDate && !!latestSettled && activeDate <= latestSettled;

  return (
    <div
      className="gtp-slate-status flex flex-wrap items-center gap-x-6 gap-y-2 px-4 sm:px-6 py-2.5"
      style={{
        background: "rgba(7, 11, 26, 0.6)",
        borderBottom: "1px solid var(--vault-border)",
      }}
    >
      <Cell label="today" value={today} />
      <Cell
        label="active slate"
        value={
          activeDate
            ? `${activeDate}${activeIsSettled ? " · settled" : " · pregame"}`
            : "—"
        }
        tone="var(--vault-gold-bright)"
      />
      <Cell label="latest settled" value={latestSettled ?? "—"} tone="var(--vault-success)" />
      <Cell label="bank" value="$100 paper" />
      <span
        className="ml-auto font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}
      >
        educational · paper only
      </span>
    </div>
  );
}
