/**
 * HitRateSparkline — chronological hit-rate trend rendered as a tiny
 * SVG line. Pure server component, no deps. Reads pre-aggregated
 * `byDate` rows from `model_audit.json` (see
 * `pipeline.model_audit`). Pushes are already excluded upstream;
 * we never recompute the hit rate here.
 *
 * Honest framing:
 *   - We display every settled slate as one dot, in date order.
 *   - We label "N settled slates" and add a "small sample" footnote
 *     when there are fewer than 10 — the model can't claim a trend
 *     on this data yet, only a record.
 *   - 50% is drawn as a dashed baseline reference so readers can
 *     immediately see which slates were above / below coin flip.
 *   - No projected / forecast points are drawn.
 */

interface DateRow {
  date: string;
  hitRate: number | null;
  wins: number;
  losses: number;
  decisive: number;
}

interface Props {
  rows: DateRow[];
  /** Display title (e.g. "Overall", "NBA", "MLB"). */
  label: string;
  /** Sparkline accent color. */
  color?: string;
  /** Pixel dimensions; readable at this size on mobile + desktop. */
  width?: number;
  height?: number;
}

const SMALL_SAMPLE_FLOOR = 10;

export default function HitRateSparkline({
  rows,
  label,
  color = "var(--vault-gold-bright)",
  width = 320,
  height = 96,
}: Props) {
  // Drop rows with no decisive grading (pure pushes) — they don't
  // contribute a meaningful hit-rate point. Sort ascending by date.
  const usable = rows
    .filter((r) => r.decisive > 0 && r.hitRate !== null)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  if (usable.length === 0) {
    return (
      <div
        className="gtp-sparkline-card rounded-[6px] px-4 py-4"
        style={{
          background: "rgba(11, 18, 14, 0.55)",
          border: "1px solid var(--vault-border)",
        }}
      >
        <div
          className="font-mono uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-gold)", fontSize: 10 }}
        >
          {label} trend
        </div>
        <div
          className="mt-1 text-[12px]"
          style={{ color: "var(--vault-text-faint)" }}
        >
          No settled slates yet — trend appears once games are graded.
        </div>
      </div>
    );
  }

  const padX = 6;
  const padY = 12;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  // Domain: clamp to [0.30, 0.75] when actuals are inside it, expand
  // only if a slate fell outside. Keeps the line readable on tiny
  // samples without spiking the curve.
  const minRaw = Math.min(...usable.map((r) => r.hitRate as number));
  const maxRaw = Math.max(...usable.map((r) => r.hitRate as number));
  const minV = Math.min(minRaw, 0.4);
  const maxV = Math.max(maxRaw, 0.65);
  const range = Math.max(maxV - minV, 0.01);

  const xFor = (i: number) =>
    padX + (usable.length === 1 ? innerW / 2 : (i / (usable.length - 1)) * innerW);
  const yFor = (v: number) =>
    padY + innerH - ((v - minV) / range) * innerH;

  const points = usable
    .map((r, i) => `${xFor(i).toFixed(1)},${yFor(r.hitRate as number).toFixed(1)}`)
    .join(" ");

  const last = usable[usable.length - 1];
  const lastHitRate = last.hitRate as number;
  const totalWins = usable.reduce((acc, r) => acc + r.wins, 0);
  const totalLosses = usable.reduce((acc, r) => acc + r.losses, 0);
  const totalDecisive = usable.reduce((acc, r) => acc + r.decisive, 0);
  const aggregateHitRate =
    totalDecisive > 0 ? totalWins / totalDecisive : null;

  const baselineY = yFor(0.5);
  const showBaseline = 0.5 >= minV && 0.5 <= maxV;

  // Area fill — visual softness, NOT a forecast.
  const areaPath = (() => {
    if (usable.length < 2) return "";
    const top = usable
      .map((r, i) => `L ${xFor(i).toFixed(1)},${yFor(r.hitRate as number).toFixed(1)}`)
      .join(" ");
    return (
      `M ${xFor(0).toFixed(1)},${(padY + innerH).toFixed(1)} ` +
      top +
      ` L ${xFor(usable.length - 1).toFixed(1)},${(padY + innerH).toFixed(1)} Z`
    );
  })();

  const isSmallSample = usable.length < SMALL_SAMPLE_FLOOR;
  const ariaLabel =
    `${label} hit-rate trend across ${usable.length} ` +
    `${usable.length === 1 ? "settled slate" : "settled slates"}; ` +
    `aggregate ${aggregateHitRate !== null ? (aggregateHitRate * 100).toFixed(1) + "%" : "—"}, ` +
    `latest ${(lastHitRate * 100).toFixed(1)}%.`;

  return (
    <div
      className="gtp-sparkline-card rounded-[6px] px-4 py-4"
      style={{
        background: "rgba(11, 18, 14, 0.55)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-gold)", fontSize: 10 }}
        >
          {label} trend · {usable.length} settled{" "}
          {usable.length === 1 ? "slate" : "slates"}
        </span>
        <span
          className="font-display font-semibold tabular tracking-tight"
          style={{ color, fontSize: 18 }}
        >
          {aggregateHitRate !== null
            ? (aggregateHitRate * 100).toFixed(1) + "%"
            : "—"}
        </span>
      </div>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        className="mt-2 block max-w-full"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        {/* 50% reference baseline */}
        {showBaseline && (
          <line
            x1={padX}
            y1={baselineY}
            x2={width - padX}
            y2={baselineY}
            stroke="var(--vault-text-faint)"
            strokeWidth={0.75}
            strokeDasharray="3 3"
          />
        )}
        {/* Soft area */}
        {areaPath && (
          <path d={areaPath} fill={color} fillOpacity={0.12} />
        )}
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dots — every slate */}
        {usable.map((r, i) => (
          <circle
            key={r.date}
            cx={xFor(i)}
            cy={yFor(r.hitRate as number)}
            r={2.5}
            fill={color}
          >
            <title>{`${r.date} · ${r.wins}–${r.losses} · ${((r.hitRate as number) * 100).toFixed(1)}%`}</title>
          </circle>
        ))}
      </svg>
      <div
        className="mt-2 font-mono"
        style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
      >
        {usable[0].date} → {last.date} · {totalWins}–{totalLosses} on{" "}
        {totalDecisive} decisive
      </div>
      {isSmallSample && (
        <div
          className="mt-1 font-mono text-[10px] leading-relaxed"
          style={{ color: "var(--vault-text-faint)" }}
        >
          Small sample ({usable.length} {usable.length === 1 ? "slate" : "slates"})
          — we show the record, not a trend. No "improving" claim until
          ≥ {SMALL_SAMPLE_FLOOR} settled slates.
        </div>
      )}
    </div>
  );
}
