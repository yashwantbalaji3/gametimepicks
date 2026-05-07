/**
 * Reusable KPI tile. Big number, small label above, optional sub-label below.
 * Used on Home and Results pages.
 */
interface Props {
  label: string;
  value: string;
  sub?: string;
  accent?: "default" | "lime" | "amber" | "rose";
  delay?: number;
}

const ACCENT_COLOR: Record<NonNullable<Props["accent"]>, string> = {
  default: "var(--text)",
  lime: "var(--vault-gold-bright)",
  amber: "var(--vault-warn)",
  rose: "var(--rose)",
};

export default function KpiTile({
  label,
  value,
  sub,
  accent = "default",
  delay,
}: Props) {
  const delayClass = delay ? ` reveal-d${Math.min(delay, 6)}` : "";
  return (
    <div className={`surface px-4 py-5 reveal${delayClass}`}>
      <div className="eyebrow">{label}</div>
      <div
        className="mt-2 font-mono text-[26px] md:text-[32px] font-semibold tracking-tight tabular"
        style={{ color: ACCENT_COLOR[accent] }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[11px] text-[var(--text-faint)] font-mono uppercase tracking-wider">
          {sub}
        </div>
      )}
    </div>
  );
}
