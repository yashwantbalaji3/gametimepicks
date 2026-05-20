/**
 * StatusPill — consolidated slate / route state chip.
 *
 * Every surface that wants to communicate "is this slate LIVE, SETTLED,
 * LINES PENDING, UPCOMING, or PROVIDER PENDING" should use this so the
 * vocabulary stays consistent. Replaces ad-hoc pill spans that have
 * appeared on the homepage, sport pages, board banners, and the
 * `BoardDateStatusBanner`.
 *
 * Visual rules:
 *   - one accent color per kind
 *   - small (10px), uppercase, tabular-mono
 *   - optional left dot that pulses for `live` only (animation gated by
 *     `prefers-reduced-motion`)
 */
import type { CSSProperties } from "react";

export type StatusPillKind =
  | "live"
  | "settled"
  | "linesPending"
  | "upcoming"
  | "providerPending"
  | "neutral"
  | "warn";

interface Props {
  kind: StatusPillKind;
  label?: string;
  /** Optional small caption rendered after the label, e.g. "·  3 games". */
  caption?: string;
  /** When true, no dot is drawn (useful inside dense rails). */
  hideDot?: boolean;
  className?: string;
  style?: CSSProperties;
}

const KIND_LABEL: Record<StatusPillKind, string> = {
  live: "Live",
  settled: "Settled",
  linesPending: "Lines pending",
  upcoming: "Upcoming",
  providerPending: "Provider pending",
  neutral: "Neutral",
  warn: "Watch",
};

const KIND_COLOR: Record<
  StatusPillKind,
  { fg: string; bg: string; border: string; dot: string; pulse: boolean }
> = {
  live: {
    fg: "var(--vault-success)",
    bg: "rgba(74, 222, 128, 0.10)",
    border: "rgba(74, 222, 128, 0.30)",
    dot: "var(--vault-success)",
    pulse: true,
  },
  settled: {
    fg: "var(--vault-gold)",
    bg: "rgba(240, 199, 94, 0.08)",
    border: "rgba(240, 199, 94, 0.30)",
    dot: "var(--vault-gold-bright)",
    pulse: false,
  },
  linesPending: {
    fg: "var(--vault-warn-amber)",
    bg: "rgba(245, 195, 95, 0.08)",
    border: "rgba(245, 195, 95, 0.28)",
    dot: "var(--vault-warn-amber)",
    pulse: false,
  },
  upcoming: {
    fg: "rgba(150, 195, 255, 1)",
    bg: "rgba(120, 175, 255, 0.08)",
    border: "rgba(120, 175, 255, 0.28)",
    dot: "rgba(150, 195, 255, 1)",
    pulse: false,
  },
  providerPending: {
    fg: "var(--vault-text-mute)",
    bg: "rgba(255, 255, 255, 0.04)",
    border: "rgba(255, 255, 255, 0.10)",
    dot: "var(--vault-text-mute)",
    pulse: false,
  },
  neutral: {
    fg: "var(--vault-text)",
    bg: "rgba(255, 255, 255, 0.04)",
    border: "var(--vault-border)",
    dot: "var(--vault-text)",
    pulse: false,
  },
  warn: {
    fg: "var(--vault-warn-amber)",
    bg: "rgba(245, 195, 95, 0.10)",
    border: "rgba(245, 195, 95, 0.30)",
    dot: "var(--vault-warn-amber)",
    pulse: false,
  },
};

export default function StatusPill({
  kind,
  label,
  caption,
  hideDot,
  className,
  style,
}: Props) {
  const c = KIND_COLOR[kind];
  const text = label ?? KIND_LABEL[kind];
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.14em] ${
        className ?? ""
      }`}
      style={{
        color: c.fg,
        background: c.bg,
        border: `1px solid ${c.border}`,
        padding: "3px 8px",
        borderRadius: 3,
        fontSize: 10,
        letterSpacing: "0.14em",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {!hideDot && (
        <span
          aria-hidden
          className={c.pulse ? "gtp-neon-pulse" : undefined}
          style={{
            display: "inline-block",
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: c.dot,
            boxShadow: c.pulse ? `0 0 6px ${c.dot}` : "none",
          }}
        />
      )}
      <span>{text}</span>
      {caption && (
        <span style={{ opacity: 0.7, marginLeft: 2 }}>· {caption}</span>
      )}
    </span>
  );
}
