/** SportCard — shared sport-summary tile for /today and /sports. */
import Link from "next/link";
import type { SportSummary } from "@/lib/normalize";

export default function SportCard({ summary }: { summary: SportSummary }) {
  return (
    <Link
      href={summary.href}
      className="rounded-[10px] px-4 py-4 flex flex-col gap-3 vault-glow-hover"
      style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)", borderTop: `2px solid ${summary.accent}`, textDecoration: "none" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 700 }}>{summary.label}</span>
        <span className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
              style={{ color: summary.live ? "var(--vault-success)" : "var(--vault-text-faint)", border: `1px solid ${summary.live ? "var(--vault-success)" : "var(--vault-rule)"}`, fontSize: 9 }}>
          {summary.live ? "Live today" : "Off today"}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {summary.stats.map((s) => (
          <div key={s.label} className="flex flex-col">
            <span className="font-display tabular" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 700 }}>{s.value}</span>
            <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{s.label}</span>
          </div>
        ))}
      </div>
      <span className="font-mono uppercase tracking-[0.16em]" style={{ color: summary.accent, fontSize: 10 }}>View {summary.label} &rarr;</span>
    </Link>
  );
}
