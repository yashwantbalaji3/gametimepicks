/**
 * OddsPill — the prominent American-odds price chip shared across every ticket surface.
 * The combined odds are the headline of a sportsbook-style slip, so this renders them bold + accented.
 * No fabrication: pass the real odds; null renders an em-dash.
 */
import { formatAmerican } from "@/lib/odds-math";

export type OddsTone = "gold" | "lava" | "violet" | "mute";
export type OddsSize = "sm" | "md" | "lg";

const TONE: Record<OddsTone, { color: string; bg: string }> = {
  gold: { color: "var(--vault-gold-bright)", bg: "var(--vault-gold-dim)" },
  lava: { color: "var(--gtp-bank-heat)", bg: "var(--gtp-bank-heat-dim)" },
  violet: { color: "var(--vault-moonshot-bright)", bg: "color-mix(in srgb, var(--vault-moonshot) 14%, transparent)" },
  mute: { color: "var(--vault-text)", bg: "var(--vault-wash)" },
};
const SIZE: Record<OddsSize, number> = { sm: 12.5, md: 15, lg: 18 };

export default function OddsPill({
  odds, tone = "gold", size = "md", className = "",
}: { odds: number | null | undefined; tone?: OddsTone; size?: OddsSize; className?: string }) {
  const t = TONE[tone];
  return (
    <span
      className={`inline-block rounded-[8px] px-2.5 py-1 font-mono font-bold tabular ${className}`}
      style={{ fontSize: SIZE[size], color: t.color, background: t.bg, border: `1px solid color-mix(in srgb, ${t.color} 45%, transparent)` }}
    >
      {formatAmerican(odds ?? null)}
    </span>
  );
}
