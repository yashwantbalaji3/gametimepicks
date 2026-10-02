/**
 * RiskPill — canonical risk-tier chip using the --risk-* design tokens, shared across surfaces.
 */
import { PUBLIC_RISK_LABELS } from "@/lib/parlays/risk-odds-bands.mjs";

export type RiskTier = "low" | "medium" | "high" | "longshot";

const META: Record<RiskTier, { label: string; color: string }> = {
  low: { label: PUBLIC_RISK_LABELS.low, color: "var(--risk-low)" },
  medium: { label: PUBLIC_RISK_LABELS.medium, color: "var(--risk-medium)" },
  high: { label: PUBLIC_RISK_LABELS.high, color: "var(--risk-high)" },
  longshot: { label: PUBLIC_RISK_LABELS.longshot, color: "var(--risk-longshot)" },
};

/** Accepts a tier key ("low") or a human label ("Low Risk"/"Longshot") and normalizes it. */
function normalize(input: string): RiskTier {
  const s = input.toLowerCase();
  if (s.includes("longshot")) return "longshot";
  if (s.includes("high")) return "high";
  if (s.includes("medium")) return "medium";
  return "low";
}

export default function RiskPill({ risk, className = "" }: { risk: string; className?: string }) {
  const m = META[normalize(risk)];
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.08em] ${className}`}
      style={{ color: m.color, background: `color-mix(in srgb, ${m.color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${m.color} 35%, transparent)`, fontSize: 9.5 }}
    >
      {m.label}
    </span>
  );
}
