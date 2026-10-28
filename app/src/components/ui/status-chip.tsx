/**
 * StatusChip — shared status pill with a consistent vocabulary + tone across all sports.
 *
 * W6 (2026-10-28): the calm chip (globals.css `.gtp-calm-chip`, the same one the Model status chips use): sentence
 * case at 12px in muted text, the tone on a dot. Was 10px uppercase in the tone colour. Same labels, same tones.
 */
import { friendlyStatusLabel } from "@/lib/public-visibility";

const TONE: Record<string, string> = {
  "Card eligible": "var(--vault-success)",
  "Projection view": "var(--vault-gold-bright)",
  "Pre-lineup": "var(--vault-gold)",
  "Lineup pending": "var(--vault-gold)",
  "Projected starter": "var(--vault-success)",
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
    <span className="gtp-calm-chip shrink-0" style={{ ["--chip-tone" as string]: tone }}>
      {text}
    </span>
  );
}
