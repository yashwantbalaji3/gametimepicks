"use client";

/**
 * VaultSparkline — viewer-ready rebuild.
 *
 * Compact SVG sparkline for a player's last-N stat values, vault gold
 * themed, with optional reference line (the prop line). Pure SVG, no
 * external library, ~150 lines. Works on desktop and mobile.
 *
 * VIEWER-READY CHANGE:
 *   The previous version computed `gradId` with Math.random() at every
 *   render. Server SSR and client hydration produced different IDs,
 *   causing React hydration mismatch and a red runtime error on
 *   localhost. Replaced with React's useId() hook, which produces
 *   stable, unique IDs across the SSR/hydration boundary.
 *
 * Honest fallback: when `values` is empty/null, renders a muted
 * placeholder bar with "no trend" — never invents data. This is the
 * default state when recent10 is not yet attached on the lean. When
 * the pipeline starts emitting recent10 (via attach_recent10), the
 * sparkline lights up automatically.
 */
import { useId } from "react";

interface Props {
  values?: number[];
  /** The current line, drawn as a dashed reference */
  refLine?: number;
  width?: number;
  height?: number;
  ariaLabel?: string;
}

export default function VaultSparkline({
  values,
  refLine,
  width = 96,
  height = 28,
  ariaLabel = "last 10 trend",
}: Props) {
  // Stable ID across SSR + client (no hydration mismatch).
  const reactId = useId();
  // useId returns colon-prefixed strings on some runtimes; sanitize for SVG attr.
  const gradId = `vault-spark-${reactId.replace(/[:]/g, "-")}`;

  // No data → muted placeholder, never fake values.
  if (!values || values.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 align-middle">
        <svg
          width={width}
          height={height}
          aria-label={`${ariaLabel} unavailable`}
          role="img"
        >
          <line
            x1="2"
            y1={height / 2}
            x2={width - 2}
            y2={height / 2}
            stroke="var(--vault-rule)"
            strokeWidth="1.5"
            strokeDasharray="2 4"
          />
        </svg>
        <span
          className="font-mono text-[9px] tracking-wider uppercase whitespace-nowrap"
          style={{ color: "var(--vault-text-faint)" }}
        >
          no trend
        </span>
      </span>
    );
  }

  if (values.length === 1) {
    // Single point — just show a muted dot
    return (
      <svg width={width} height={height} aria-label={ariaLabel} role="img">
        <circle
          cx={width / 2}
          cy={height / 2}
          r={2.5}
          fill="var(--vault-gold)"
        />
      </svg>
    );
  }

  // Compute viewBox-friendly coordinates
  const padding = 2;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  // Scale across all values + refLine to keep ref visible
  const allPoints = refLine !== undefined ? [...values, refLine] : values;
  const minV = Math.min(...allPoints);
  const maxV = Math.max(...allPoints);
  const range = maxV - minV || 1;

  const xStep = innerW / (values.length - 1);
  const xy = values.map((v, i) => {
    const x = padding + i * xStep;
    const y = padding + innerH * (1 - (v - minV) / range);
    return [x, y] as const;
  });

  const path = xy
    .map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
    .join(" ");

  // Subtle area fill below the line
  const areaPath =
    path +
    ` L ${xy[xy.length - 1][0]} ${height - padding}` +
    ` L ${xy[0][0]} ${height - padding} Z`;

  // Trend direction for color hint (last vs first)
  const lastVal = values[values.length - 1];
  const firstVal = values[0];
  const trendUp = lastVal >= firstVal;
  const strokeColor = trendUp
    ? "var(--vault-gold-bright)"
    : "var(--vault-text-mute)";

  return (
    <svg
      width={width}
      height={height}
      aria-label={`${ariaLabel}: ${values.length} games, ${trendUp ? "trending up" : "trending down"}, latest ${lastVal}${refLine !== undefined ? `, line ${refLine}` : ""}`}
      role="img"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.18" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
      </defs>

      {refLine !== undefined && (
        <line
          x1={padding}
          y1={padding + innerH * (1 - (refLine - minV) / range)}
          x2={width - padding}
          y2={padding + innerH * (1 - (refLine - minV) / range)}
          stroke="var(--vault-text-faint)"
          strokeWidth="1"
          strokeDasharray="2 3"
          opacity="0.6"
        />
      )}

      <path d={areaPath} fill={`url(#${gradId})`} />

      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Final-point dot */}
      <circle
        cx={xy[xy.length - 1][0]}
        cy={xy[xy.length - 1][1]}
        r={2}
        fill={strokeColor}
      />
    </svg>
  );
}
