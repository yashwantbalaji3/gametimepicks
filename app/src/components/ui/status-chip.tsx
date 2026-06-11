/**
 * StatusChip — shared status pill with a consistent vocabulary + tone across all sports.
 */
import { friendlyStatusLabel } from "@/lib/public-visibility";

const TONE: Record<string, string> = {
  "Card eligible": "var(--vault-success)",
  "Projection view": "var(--vault-gold-bright)",
  "Pre-lineup": "var(--vault-gold)",
  "Confirmed starter": "var(--vault-success)",
  "Substitute": "var(--vault-text-mute)",
  "Not in lineup": "var(--vault-text-faint)",
  "Waiting on lineups": "var(--vault-gold)",
  "Research only": "var(--vault-text-faint)",
  "Market unavailable from current provider": "var(--vault-text-faint)",
};

export default function StatusChip({ status, label }: { status?: string; label?: string }) {
  const text = label ?? friendlyStatusLabel(status);
  if (!text) return null;
  const tone = TONE[text] ?? "var(--vault-text-mute)";
  return (
    <span
      className="font-mono uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-[3px] shrink-0"
      style={{ color: tone, border: `1px solid ${tone}`, fontSize: 8.5, whiteSpace: "nowrap" }}
    >
      {text}
    </span>
  );
}
