/**
 * StatusBar — Concept A (Command Center) PREVIEW ONLY.
 *
 * A persistent state strip across the top of the content canvas: active
 * slate, latest settled slate, and the paper bankroll base. Server
 * component; reads the SAME loaders the rest of the app uses, so every
 * figure is honest (no fabrication).
 */
import { getLatestOptimizerSnapshot } from "@/lib/data-parlays";
import { getOptimizerGradedDates } from "@/lib/parlay-results";
import { currentEtDate } from "@/lib/freshness";

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-2 whitespace-nowrap">
      <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
        {label}
      </span>
      <span className="font-mono" style={{ color: tone ?? "var(--vault-text)", fontSize: 12 }}>
        {value}
      </span>
    </div>
  );
}

export default function StatusBar() {
  const today = currentEtDate();
  const activeDate = getLatestOptimizerSnapshot()?.date ?? null;
  // Max date string (YYYY-MM-DD sorts chronologically) — robust to whatever
  // order the loader returns, so "latest settled" is always honest.
  const gradedDates = getOptimizerGradedDates();
  const latestSettled = gradedDates.length ? [...gradedDates].sort().slice(-1)[0] : null;
  const activeIsSettled = !!activeDate && !!latestSettled && activeDate <= latestSettled;

  return (
    <div
      className="ca-statusbar flex flex-wrap items-center gap-x-6 gap-y-2 px-4 sm:px-6 py-2.5"
      style={{
        background: "rgba(8, 12, 22, 0.7)",
        borderBottom: "1px solid var(--vault-border)",
      }}
    >
      <Cell label="today" value={today} />
      <Cell
        label="active slate"
        value={activeDate ? `${activeDate}${activeIsSettled ? " · settled" : " · pregame"}` : "—"}
        tone="var(--vault-gold-bright)"
      />
      <Cell label="latest settled" value={latestSettled ?? "—"} tone="var(--vault-success)" />
      <Cell label="bank" value="$100 paper" />
      <span className="ml-auto font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
        ● live
      </span>
    </div>
  );
}
