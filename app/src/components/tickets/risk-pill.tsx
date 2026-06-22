/**
 * RiskPill — canonical risk-tier chip using the --risk-* design tokens, shared across surfaces.
 */
export type RiskTier = "low" | "medium" | "high" | "longshot";

const META: Record<RiskTier, { label: string; color: string }> = {
  low: { label: "Low Risk", color: "var(--risk-low)" },
  medium: { label: "Medium Risk", color: "var(--risk-medium)" },
  high: { label: "High Risk", color: "var(--risk-high)" },
  longshot: { label: "Longshot", color: "var(--risk-longshot)" },
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
