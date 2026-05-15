/**
 * NeonStatPanel — premium KPI tile.
 *
 * Replaces the flat <KpiTile> on the homepage. Renders a gold-rule-top
 * panel with a small caption, a large display number, and an optional
 * sub-label. Pure presentation; no logic.
 *
 * The component intentionally exposes a `valueAccent` prop with discrete
 * options so callers don't pass ad-hoc colors.
 */
import type { CSSProperties } from "react";

interface Props {
  label: string;
  value: string;
  sub?: string;
  /** Tints the headline number. */
  valueAccent?: "default" | "gold" | "warn" | "success" | "mute";
  /** Reveal animation stagger (1..6). */
  delay?: number;
}

const ACCENT_COLOR: Record<NonNullable<Props["valueAccent"]>, string> = {
  default: "var(--vault-text)",
  gold: "var(--vault-gold-bright)",
  warn: "var(--vault-warn)",
  success: "var(--vault-success)",
  mute: "var(--vault-text-mute)",
};

export default function NeonStatPanel({
  label,
  value,
  sub,
  valueAccent = "default",
  delay,
}: Props) {
  const delayClass = delay ? ` reveal-d${Math.min(delay, 6)}` : "";
  const valueStyle: CSSProperties = {
    color: ACCENT_COLOR[valueAccent],
  };
  return (
    <div className={`gtp-stat-panel reveal${delayClass}`}>
      <div className="gtp-stat-panel-label">{label}</div>
      <div className="gtp-stat-panel-value" style={valueStyle}>
        {value}
      </div>
      {sub && <div className="gtp-stat-panel-sub">{sub}</div>}
    </div>
  );
}
