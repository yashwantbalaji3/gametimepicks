/**
 * CrossLaneCorrelationBadge — surfaces the formal cross-lane correlation check on /bank-builder: a
 * score (0 = independent), a clear verdict, and any overlap warnings. Reassures (or warns) that a leg
 * on Lane A never influences Lane B. Pure presentational; scoring lives in lib/daily-portfolio.
 */
import { scoreCrossLaneCorrelation, type LaneLegLite } from "@/lib/daily-portfolio/cross-lane-correlation";

const GRADE_COLOR: Record<string, string> = {
  A: "var(--vault-success)", B: "#8fd4a0", C: "#e7b15a", D: "#e58a5a", F: "var(--gtp-bank-heat)",
};

export default function CrossLaneCorrelationBadge({ laneA, laneB }: { laneA: LaneLegLite[]; laneB: LaneLegLite[] }) {
  if (laneA.length === 0 || laneB.length === 0) return null;
  const c = scoreCrossLaneCorrelation(laneA, laneB);
  const ok = c.independent;
  const gradeColor = GRADE_COLOR[c.grade] ?? "var(--vault-text)";
  const color = ok ? "var(--vault-success)" : "#e7b15a";
  const bg = ok ? "rgba(110,231,168,0.08)" : "rgba(231,177,90,0.10)";
  const notes = [...c.warnings, ...c.dependencies, ...c.diversification.notes];
  return (
    <div className="rounded-[12px] px-4 py-3 flex flex-col gap-1.5" style={{ background: bg, border: `1px solid color-mix(in srgb, ${color} 35%, transparent)` }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="flex items-center gap-2 min-w-0">
          <span aria-hidden style={{ fontSize: 13 }}>{ok ? "✓" : "⚠"}</span>
          <span className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>
            Cross-lane correlation: <span style={{ color }}>{ok ? "Independent" : "Overlap detected"}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="inline-flex items-center justify-center rounded-[7px] font-display tabular" style={{ width: 24, height: 24, fontSize: 14, fontWeight: 800, color: "#120A07", background: gradeColor }} aria-label={`Correlation grade ${c.grade}`}>{c.grade}</span>
          <span className="font-mono tabular rounded-full px-2 py-0.5" style={{ fontSize: 10, color, background: "rgba(255,255,255,0.05)", border: `1px solid color-mix(in srgb, ${color} 35%, transparent)` }}>score {c.score.toFixed(2)}</span>
        </span>
      </div>
      <p className="text-[11px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>{c.summary}</p>
      {notes.length ? (
        <ul className="flex flex-col gap-0.5 text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
          {notes.map((w, i) => <li key={i}>• {w}</li>)}
        </ul>
      ) : (
        <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>
          checked: same game · same player · same team · same market · game-script
        </span>
      )}
    </div>
  );
}
