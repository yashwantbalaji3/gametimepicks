/**
 * Compact pill showing a confidence tier (High / Medium / Low) with the
 * canonical broadcast color treatment.
 *
 * High   = lime  (positive, signal-clear)
 * Medium = amber (caution)
 * Low    = neutral grey
 */
import type { ConfidenceTier } from "@/lib/types";

interface Props {
  confidence: ConfidenceTier;
  size?: "sm" | "md";
  className?: string;
}

const STYLES: Record<ConfidenceTier, { color: string; bg: string }> = {
  High:   { color: "var(--lime)", bg: "var(--lime-dim)" },
  Medium: { color: "var(--amber)", bg: "var(--amber-dim)" },
  Low:    { color: "var(--text-faint)", bg: "rgba(255,255,255,0.04)" },
};

export default function ConfidenceBadge({
  confidence,
  size = "md",
  className = "",
}: Props) {
  const s = STYLES[confidence];
  const sizeClass =
    size === "sm"
      ? "px-1.5 py-0.5 text-[9px]"
      : "px-2 py-1 text-[10px]";
  return (
    <span
      className={`font-mono tracking-wider uppercase rounded-[2px] shrink-0 ${sizeClass} ${className}`}
      style={{ color: s.color, background: s.bg }}
    >
      {confidence}
    </span>
  );
}
