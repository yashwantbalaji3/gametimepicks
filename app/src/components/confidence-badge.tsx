/**
 * Compact pill showing a confidence tier with the canonical color treatment.
 *
 * Phase 7B-3.1 — extended from the original High/Medium/Low to also display
 * the pipeline's two non-graded states honestly:
 *
 *   High               = lime  (positive, signal-clear)
 *   Medium             = amber (caution)
 *   Low                = neutral grey
 *   insufficient_data  = neutral grey, label "no data"
 *   no_play            = neutral grey, label "pass"
 *
 * Both insufficient_data and no_play are explicit declines to recommend a
 * side, and the card surfaces them as gray rather than as a graded tier so
 * users don't conflate them with a normal Low-confidence lean.
 */
import type { ConfidenceTier } from "@/lib/types";

interface Props {
  confidence: ConfidenceTier;
  size?: "sm" | "md";
  className?: string;
}

const STYLES: Record<ConfidenceTier, { color: string; bg: string; label: string }> = {
  High:              { color: "var(--lime)",       bg: "var(--lime-dim)",            label: "High" },
  Medium:            { color: "var(--amber)",      bg: "var(--amber-dim)",           label: "Medium" },
  Low:               { color: "var(--text-faint)", bg: "rgba(255,255,255,0.04)",     label: "Low" },
  insufficient_data: { color: "var(--text-faint)", bg: "rgba(255,255,255,0.04)",     label: "no data" },
  no_play:           { color: "var(--text-faint)", bg: "rgba(255,255,255,0.04)",     label: "pass" },
};

export default function ConfidenceBadge({
  confidence,
  size = "md",
  className = "",
}: Props) {
  const s = STYLES[confidence] ?? STYLES.Low;
  const sizeClass =
    size === "sm"
      ? "px-1.5 py-0.5 text-[9px]"
      : "px-2 py-1 text-[10px]";
  return (
    <span
      className={`font-mono tracking-wider uppercase rounded-[2px] shrink-0 ${sizeClass} ${className}`}
      style={{ color: s.color, background: s.bg }}
    >
      {s.label}
    </span>
  );
}
