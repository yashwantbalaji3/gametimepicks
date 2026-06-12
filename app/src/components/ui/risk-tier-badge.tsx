/** RiskTierBadge — consistent risk-tier pill (variance-aware tone). */
const TIER_TONE: Record<string, string> = {
  Low: "var(--vault-success)",
  Medium: "var(--vault-gold-bright)",
  High: "var(--vault-warn)",
  Longshot: "var(--vault-text-mute)",
};
export default function RiskTierBadge({ tier, prefix }: { tier: string; prefix?: string }) {
  const tone = TIER_TONE[tier] ?? "var(--vault-text)";
  return (
    <span
      className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-full shrink-0"
      style={{ color: tone, border: `1px solid ${tone}`, fontSize: 10 }}
    >
      {prefix ? `${prefix} · ` : ""}{tier}
    </span>
  );
}
