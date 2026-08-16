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
  {
    fg: string;
    bg: string;
    border: string;
    dot: string;
    pulse: boolean;
    /** Optional glow class to layer on the pill wrapper. */
    extraClass?: string;
  }
> = {
  // live = energetic. Brighter dot, surrounding ring glow.
  live: {
    fg: "var(--vault-success)",
    bg: "rgba(74, 222, 128, 0.14)",
    border: "rgba(74, 222, 128, 0.42)",
    dot: "var(--vault-success)",
    pulse: true,
    extraClass: "gtp-status-live-glow",
  },
  // settled = authoritative. Crisp gold treatment, no animation.
  settled: {
    fg: "var(--vault-gold-bright)",
    bg: "rgba(52, 211, 153, 0.12)",
    border: "rgba(52, 211, 153, 0.42)",
    dot: "var(--vault-gold-bright)",
    pulse: false,
  },
  // lines pending = warm amber. Dim, calm.
  linesPending: {
    fg: "var(--vault-warn-amber)",
    bg: "rgba(245, 195, 95, 0.10)",
    border: "rgba(245, 195, 95, 0.32)",
    dot: "var(--vault-warn-amber)",
    pulse: false,
  },
  // upcoming = cool blue. Subtle.
  upcoming: {
    fg: "rgba(170, 205, 255, 1)",
    bg: "rgba(120, 175, 255, 0.10)",
    border: "rgba(120, 175, 255, 0.30)",
    dot: "rgba(170, 205, 255, 1)",
    pulse: false,
  },
  // provider pending = neutral / muted. Reads "intentionally empty".
  providerPending: {
    fg: "var(--vault-text-mute)",
    bg: "rgba(255, 255, 255, 0.05)",
    border: "rgba(255, 255, 255, 0.12)",
    dot: "var(--vault-text-mute)",
    pulse: false,
  },
  neutral: {
    fg: "var(--vault-text)",
    bg: "rgba(255, 255, 255, 0.05)",
    border: "var(--vault-border)",
    dot: "var(--vault-text)",
    pulse: false,
  },
  warn: {
    fg: "var(--vault-warn-amber)",
    bg: "rgba(245, 195, 95, 0.12)",
    border: "rgba(245, 195, 95, 0.34)",
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
        c.extraClass ?? ""
      } ${className ?? ""}`}
      style={{
        color: c.fg,
        background: c.bg,
        border: `1px solid ${c.border}`,
        padding: "4px 9px",
        borderRadius: 999,
        fontSize: 10,
        letterSpacing: "0.16em",
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
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: c.dot,
            boxShadow: c.pulse
              ? `0 0 10px ${c.dot}, 0 0 4px ${c.dot}`
              : `0 0 4px ${c.dot}`,
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
