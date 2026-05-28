/**
 * RecentFormSparkline — pure SVG mini bar chart for the recent-form
 * drawer. No external chart dep; renders directly from
 * `scaleSparklinePoints` so all math is unit-tested.
 *
 *   - Each bar is the player's stat value in one game.
 *   - A dashed horizontal line marks the prop line (threshold).
 *   - Bars above the line are tinted with the success token; bars
 *     below use the warn token. Bars exactly at the line stay muted.
 *   - Renders nothing when the values array is empty — caller is
 *     responsible for showing a fallback note.
 */
import { scaleSparklinePoints } from "@/lib/sparkline-scale";

interface Props {
  /** Stat values in display order (newest-first to match the drawer's
   *  recent-form list above the chart). */
  values: number[];
  /** Prop line — the threshold to compare each value against. */
  threshold?: number | null;
  /** SVG inner width in viewBox units. Defaults to 220. */
  width?: number;
  /** SVG inner height in viewBox units. Defaults to 56. */
  height?: number;
  /** Optional aria-label override. */
  ariaLabel?: string;
}

export default function RecentFormSparkline({
  values,
  threshold = null,
  width = 220,
  height = 56,
  ariaLabel,
}: Props) {
  const { points, thresholdY } = scaleSparklinePoints(values, {
    width,
    height,
    threshold,
    padding: 4,
  });
  if (points.length === 0) return null;

  const n = points.length;
  // Bar width: leave a small gap between bars. step distance is the
  // x-distance between consecutive bar centers. We make bars ~70% of
  // that step.
  const innerW = width - 8;
  const step = n > 1 ? innerW / (n - 1) : innerW;
  const barW = Math.max(Math.min(step * 0.55, 28), 4);

  const summary = thresholdY != null
    ? `Recent ${n} games vs threshold ${threshold ?? "—"}`
    : `Recent ${n} games`;

  return (
    <svg
      role="img"
      aria-label={ariaLabel ?? summary}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ display: "block", overflow: "visible" }}
    >
      {/* Bars */}
      {points.map((p, i) => {
        const color =
          p.cleared === true
            ? "var(--vault-success)"
            : p.cleared === false
              ? "var(--vault-warn)"
              : "var(--vault-text-mute)";
        const fillOpacity = p.cleared === null ? 0.45 : 0.75;
        return (
          <rect
            key={i}
            x={p.x - barW / 2}
            y={p.y}
            width={barW}
            height={p.barHeight}
            rx={2}
            ry={2}
            fill={color}
            fillOpacity={fillOpacity}
            stroke={color}
            strokeOpacity={0.9}
            strokeWidth={1}
          />
        );
      })}

      {/* Threshold line (rendered last so it sits on top of bars) */}
      {thresholdY != null && (
        <line
          x1={0}
          x2={width}
          y1={thresholdY}
          y2={thresholdY}
          stroke="var(--vault-gold-bright)"
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.85}
        />
      )}
    </svg>
  );
}
