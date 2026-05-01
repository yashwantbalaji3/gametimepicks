/**
 * Status pill for tracked-result lifecycle: Pending → Won / Lost / Push / Void.
 */
import type { ResultStatus } from "@/lib/types";

interface Props {
  status: ResultStatus;
  size?: "sm" | "md";
}

const STYLES: Record<ResultStatus, { color: string; bg: string }> = {
  Pending: { color: "var(--text-faint)", bg: "rgba(255,255,255,0.04)" },
  Won:     { color: "var(--lime)", bg: "var(--lime-dim)" },
  Lost:    { color: "var(--rose)", bg: "var(--rose-dim)" },
  Push:    { color: "var(--amber)", bg: "var(--amber-dim)" },
  Void:    { color: "var(--text-faint)", bg: "rgba(255,255,255,0.04)" },
};

export default function StatusBadge({ status, size = "md" }: Props) {
  const s = STYLES[status];
  const sizeClass =
    size === "sm" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      className={`font-mono tracking-wider uppercase rounded-[2px] ${sizeClass}`}
      style={{ color: s.color, background: s.bg }}
    >
      {status}
    </span>
  );
}
