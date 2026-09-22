/**
 * ProbabilityBasisChip — WHAT A PROBABILITY IS, printed next to it (v1.7 · F1 Option A, founder
 * decision 2026-09-22).
 *
 * Bank Builder and Moonshot place legs whose only probability is one bookmaker's de-vigged price.
 * Such a card is a MARKET CONSTRUCTION: its chance of landing is what the prices imply, not a
 * prediction, and no surface may present it as a GameTimePicks model selection. This chip is the
 * one place that wording lives, so every Play surface says the same thing.
 *
 * Server component, no client JS. An unknown basis renders NOTHING — it is never labelled "model".
 */
import type { JointProbabilityBasis, ProbabilityBasis } from "@/lib/daily-portfolio/accounting";

export const MARKET_IMPLIED_CHIP = "Market-implied";
export const MODEL_CHIP = "Model";
export const MARKET_CONSTRUCTION_LABEL = "Market construction";
export const MARKET_CONSTRUCTION_NOTE = "priced by the sportsbook market · what the prices imply, not a prediction";

/** Per-leg chip. */
export default function ProbabilityBasisChip({ basis, tone = "var(--vault-text-faint)" }: { basis: ProbabilityBasis | null | undefined; tone?: string }) {
  if (basis !== "market-implied" && basis !== "model") return null;
  return (
    <span
      className="rounded-full px-1.5 py-px font-mono uppercase tracking-[0.08em] whitespace-nowrap"
      style={{ fontSize: 8, color: tone, border: "1px solid var(--vault-rule)", background: "color-mix(in srgb, var(--vault-wash-base) 3%, transparent)" }}
      title={basis === "market-implied" ? "The de-vigged sportsbook price — not a forecast" : "A validated model owner's probability"}
    >
      {basis === "market-implied" ? MARKET_IMPLIED_CHIP : MODEL_CHIP}
    </span>
  );
}

/** Card-level label: only a card whose every leg is market-implied is a market construction. */
export function MarketConstructionLabel({ basis }: { basis: JointProbabilityBasis | null | undefined }) {
  if (basis !== "market-implied") return null;
  return (
    <span className="font-mono uppercase tracking-[0.08em] leading-snug" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>
      <span style={{ color: "var(--vault-text-mute)" }}>{MARKET_CONSTRUCTION_LABEL}</span> · {MARKET_CONSTRUCTION_NOTE}
    </span>
  );
}
