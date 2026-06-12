/** SportCard — shared sport-summary tile for /today and /sports. Carries the
 *  central sport identity (orb glyph + accent) so every sport reads the same
 *  visual language across the site. */
import Link from "next/link";
import type { SportSummary } from "@/lib/normalize";
import { getSportIdentity } from "@/lib/sport-identity";

export default function SportCard({ summary }: { summary: SportSummary }) {
  const id = getSportIdentity(summary.sport);
  const accent = id.accentVar;
  return (
    <Link
      href={summary.href}
      className="gtp-card-hover gtp-pressable rounded-[10px] px-4 py-4 flex flex-col gap-3"
      style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)", borderTop: `2px solid ${accent}`, textDecoration: "none" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <span
            className="gtp-sport-orb shrink-0"
            style={{ width: 28, height: 28, fontSize: 15, ["--orb-grad" as string]: id.gradient }}
            role="img"
            aria-label={`${id.label} ${id.ballLabel}`}
          >
            {id.icon}
          </span>
          <span className="font-display tracking-tight truncate" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 700 }}>{summary.label}</span>
        </span>
        <span className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-full shrink-0"
              style={{ color: summary.live ? "var(--vault-success)" : "var(--vault-text-faint)", border: `1px solid ${summary.live ? "var(--vault-success)" : "var(--vault-rule)"}`, fontSize: 9 }}>
          {summary.live ? "Live today" : "Off today"}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {summary.stats.map((s) => (
          <div key={s.label} className="flex flex-col">
            <span className="font-display tabular" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 700 }}>{s.value}</span>
            <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{s.label}</span>
          </div>
        ))}
      </div>
      <span className="font-mono uppercase tracking-[0.16em]" style={{ color: accent, fontSize: 10 }}>View {summary.label} &rarr;</span>
    </Link>
  );
}
