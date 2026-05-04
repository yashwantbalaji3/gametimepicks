/**
 * HitRateChart — horizontal bar chart for HitRateBreakdown[].
 *
 * Each row: label · count · bar · hit rate.
 * Bar fills proportional to hit rate (0-100%). Color is lime if at/above
 * the break-even threshold, amber otherwise.
 *
 * Pure SVG + Tailwind, no chart library.
 */
import type { HitRateBreakdown } from "@/lib/types";
import { formatPercent } from "@/lib/format";

interface Props {
  breakdowns: HitRateBreakdown[];
  /** The break-even threshold for color cuing. -110 props break even at ~52.4%. */
  breakEven?: number;
}

export default function HitRateChart({
  breakdowns,
  breakEven = 0.524,
}: Props) {
  if (!breakdowns || breakdowns.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[13px] text-[var(--text-faint)] font-mono">
        No data yet.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {breakdowns.map((b) => {
        const pct = b.hitRate;
        const barColor = pct >= breakEven ? "var(--lime)" : "var(--amber)";
        const barBg = pct >= breakEven ? "var(--lime-dim)" : "var(--amber-dim)";
        // Bar fills 0-100% of the available width, but we want the visual
        // axis to be 0%-70% so values stay readable.
        const widthPct = Math.max(0, Math.min(100, (pct / 0.7) * 100));

        return (
          <div key={b.label} className="font-mono text-[12px]">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[var(--text)]">{b.label}</span>
              <span className="text-[var(--text-faint)]">
                {b.won}-{b.lost}{b.push > 0 ? `-${b.push}` : ""} · n={b.total}
              </span>
            </div>
            <div className="relative h-5 rounded-[2px] overflow-hidden" style={{ background: barBg }}>
              <div
                className="absolute inset-y-0 left-0 transition-all duration-500"
                style={{ width: `${widthPct}%`, background: barColor }}
                aria-hidden
              />
              {/* Break-even tick */}
              <div
                className="absolute inset-y-0 border-l border-dashed border-[var(--text-faint)]"
                style={{ left: `${(breakEven / 0.7) * 100}%` }}
                aria-hidden
                title={`Break-even ~${(breakEven * 100).toFixed(1)}%`}
              />
              <span
                className="absolute inset-0 flex items-center justify-end pr-2 font-semibold text-[var(--bg)] tabular text-[11px]"
                style={{
                  textShadow: pct >= breakEven ? "none" : "0 0 4px rgba(0,0,0,0.5)",
                  color: pct >= breakEven ? "var(--bg)" : "var(--text)",
                }}
              >
                {formatPercent(pct)}
              </span>
            </div>
          </div>
        );
      })}

      <div className="pt-2 mt-3 border-t border-[var(--border)] flex items-center gap-4 font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-[1px]" style={{ background: "var(--lime)" }} />
          at or above break-even
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-[1px]" style={{ background: "var(--amber)" }} />
          below break-even
        </span>
        <span className="hidden md:inline">break-even ≈ {(breakEven * 100).toFixed(1)}% on -110</span>
      </div>
    </div>
  );
}
