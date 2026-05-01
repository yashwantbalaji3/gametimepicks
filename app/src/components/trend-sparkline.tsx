/**
 * TrendSparkline — tiny SVG line chart of recent values.
 *
 * No external library. Pure SVG, tabular-friendly, scales to width prop.
 * Shows the trend with a minimum baseline (line) overlaid as a dashed horizontal.
 *
 * Used inline on player trend cards.
 */
interface Props {
  values: number[];
  /** Optional reference line (e.g. tonight's prop line) */
  refLine?: number;
  width?: number;
  height?: number;
  /** Override stroke color (default: lime) */
  color?: string;
  ariaLabel?: string;
}

export default function TrendSparkline({
  values,
  refLine,
  width = 120,
  height = 32,
  color = "var(--lime)",
  ariaLabel = "trend",
}: Props) {
  if (!values || values.length === 0) {
    return (
      <svg width={width} height={height} aria-label={ariaLabel}>
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--border-strong)"
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  // Domain: include refLine in y-range so it doesn't clip
  const minV = Math.min(...values, ...(refLine !== undefined ? [refLine] : []));
  const maxV = Math.max(...values, ...(refLine !== undefined ? [refLine] : []));
  const range = Math.max(maxV - minV, 1);   // avoid divide-by-zero

  const padX = 2;
  const padY = 4;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const xFor = (i: number) =>
    padX + (values.length === 1 ? innerW / 2 : (i / (values.length - 1)) * innerW);
  const yFor = (v: number) =>
    padY + innerH - ((v - minV) / range) * innerH;

  const points = values.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(" ");

  // Area fill path (close the polyline back to baseline for a soft fill)
  const baselineY = padY + innerH;
  const areaPath =
    `M ${xFor(0).toFixed(1)},${baselineY} ` +
    values.map((v, i) => `L ${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(" ") +
    ` L ${xFor(values.length - 1).toFixed(1)},${baselineY} Z`;

  return (
    <svg
      width={width}
      height={height}
      aria-label={ariaLabel}
      role="img"
    >
      {/* Reference line (dashed) */}
      {refLine !== undefined && (
        <line
          x1={padX}
          y1={yFor(refLine)}
          x2={width - padX}
          y2={yFor(refLine)}
          stroke="var(--text-faint)"
          strokeWidth={0.75}
          strokeDasharray="2 3"
        />
      )}

      {/* Area fill */}
      <path d={areaPath} fill={color} fillOpacity={0.10} />

      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Last-value dot */}
      <circle
        cx={xFor(values.length - 1)}
        cy={yFor(values[values.length - 1])}
        r={2.25}
        fill={color}
      />
    </svg>
  );
}
