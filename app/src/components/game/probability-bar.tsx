/**
 * ProbabilityBar — a stacked win-probability bar for a report's win/draw/loss (soccer 3-way) or
 * two-fighter (UFC) split. Pure CSS/SVG, no external assets. Neutral styling — a market-implied central
 * read, never a guaranteed outcome. Server-renderable (no hooks).
 */
const SEG_COLORS = ["var(--vault-gold-bright)", "var(--vault-text-faint)", "#6ea3e0", "#9b8cff"];

export default function ProbabilityBar({ segments }: { segments: Array<{ label: string; probability: number }> }) {
  const clean = segments.filter((s) => typeof s.probability === "number" && Number.isFinite(s.probability) && s.probability >= 0);
  const total = clean.reduce((s, x) => s + x.probability, 0) || 1;
  if (clean.length === 0) return null;
  const aria = clean.map((s) => `${s.label} ${Math.round((s.probability / total) * 100)}%`).join(", ");
  return (
    <div className="flex flex-col gap-1.5" role="img" aria-label={`Market-implied win probability: ${aria}`}>
      <div className="flex w-full overflow-hidden rounded-full" style={{ height: 12, border: "1px solid var(--vault-rule)", background: "color-mix(in srgb, var(--vault-ink-black) 25%, transparent)" }}>
        {clean.map((s, i) => (
          <div key={`${s.label}-${i}`} title={`${s.label} ${Math.round((s.probability / total) * 100)}%`}
               style={{ width: `${(s.probability / total) * 100}%`, background: SEG_COLORS[i % SEG_COLORS.length] }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {clean.map((s, i) => (
          <span key={`${s.label}-lbl-${i}`} className="inline-flex items-center gap-1 font-mono" style={{ fontSize: 10.5, color: "var(--vault-text-mute)" }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: SEG_COLORS[i % SEG_COLORS.length], display: "inline-block" }} />
            {s.label} {Math.round((s.probability / total) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}
