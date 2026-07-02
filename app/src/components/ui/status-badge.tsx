/**
 * StatusBadge — the shared PRODUCT-status pill (Active / Live / Awaiting refresh / Retired / …).
 *
 * One vocabulary (lib/product-status) + one tone→palette mapping, rendered identically everywhere so no
 * product looks active when it's stale and no retired product looks live. Styling mirrors the existing
 * StatusChip (font-mono uppercase pill) so the badge language stays consistent across the app. Server
 * component — pure, no client state.
 */
import { statusMeta, type ProductStatus, type StatusTone } from "@/lib/product-status";

const TONE: Record<StatusTone, { color: string; bg: string; border: string }> = {
  positive: { color: "var(--vault-success)", bg: "var(--vault-success-dim)", border: "color-mix(in srgb, var(--vault-success) 45%, transparent)" },
  live: { color: "var(--vault-gold-bright)", bg: "var(--vault-gold-dim)", border: "color-mix(in srgb, var(--vault-gold-bright) 45%, transparent)" },
  info: { color: "var(--gtp-neon-cyan, #6fd6e0)", bg: "rgba(111,214,224,0.10)", border: "rgba(111,214,224,0.4)" },
  warn: { color: "var(--vault-warn)", bg: "var(--vault-warn-dim)", border: "color-mix(in srgb, var(--vault-warn) 45%, transparent)" },
  neutral: { color: "var(--vault-text-mute)", bg: "rgba(255,255,255,0.04)", border: "var(--vault-rule)" },
  muted: { color: "var(--vault-text-faint)", bg: "transparent", border: "var(--vault-rule)" },
  danger: { color: "var(--vault-danger)", bg: "var(--vault-danger-dim)", border: "color-mix(in srgb, var(--vault-danger) 45%, transparent)" },
};

export default function StatusBadge({
  status,
  label,
  live,
  className,
}: {
  status: ProductStatus;
  /** Override the default label (e.g. a per-leg detail) while keeping the tone. */
  label?: string;
  /** Force the pulsing live dot on/off; defaults to on for live/in-progress tones. */
  live?: boolean;
  className?: string;
}) {
  const meta = statusMeta(status);
  const t = TONE[meta.tone];
  const showDot = live ?? meta.tone === "live";
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-[3px] shrink-0${className ? ` ${className}` : ""}`}
      style={{ color: t.color, background: t.bg, border: `1px solid ${t.border}`, fontSize: 10, whiteSpace: "nowrap" }}
    >
      {showDot ? (
        <span aria-hidden className="gtp-slate-dot gtp-slate-dot-live" style={{ margin: 0, width: 5, height: 5, background: t.color }} />
      ) : null}
      {label ?? meta.label}
    </span>
  );
}
