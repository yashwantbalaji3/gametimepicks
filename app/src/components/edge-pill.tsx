/**
 * Pill displaying an edge percentage with directional color.
 *
 * Positive edges → lime (model thinks the side is mispriced in our favor).
 * Negative edges → muted (we'd take the OTHER side, which is what the
 * board's lean field already reflects, so we render small).
 *
 * The component is opinion-free about whether positive is good — it just
 * renders the magnitude and applies sign-based color. The board uses
 * absolute value for sorting; this just shows what's on the lean.
 */
import { formatSignedPct } from "@/lib/format";

interface Props {
  edgePct: number;
  size?: "sm" | "md" | "lg";
}

export default function EdgePill({ edgePct, size = "md" }: Props) {
  const positive = edgePct >= 0;
  const color = positive ? "var(--lime)" : "var(--rose)";
  const bg = positive ? "var(--lime-dim)" : "var(--rose-dim)";

  const sizeClass = {
    sm: "px-1.5 py-0.5 text-[10px]",
    md: "px-2 py-0.5 text-[11px]",
    lg: "px-3 py-1 text-[13px]",
  }[size];

  return (
    <span
      className={`font-mono font-semibold tabular tracking-wider uppercase rounded-[2px] shrink-0 ${sizeClass}`}
      style={{ color, background: bg }}
    >
      {formatSignedPct(edgePct)}
    </span>
  );
}
