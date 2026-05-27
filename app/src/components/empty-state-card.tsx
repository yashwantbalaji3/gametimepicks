/**
 * EmptyStateCard — renders one of the 6 documented empty-state
 * variants from `app/src/lib/empty-state-taxonomy.ts`. Pages pass a
 * variant; the card looks up the canonical copy + tone.
 *
 * Honest by construction: callers cannot inject prose. Optional
 * `sport` and `dateLabel` props let the card append a small context
 * line (e.g. "MLB · Today") without ever overriding the eyebrow / body.
 *
 * Layout: dashed border (so it never visually competes with official
 * solid-border cards), centered content, mobile-friendly.
 */
import type {
  EmptyStateTone,
  EmptyStateVariant,
} from "@/lib/empty-state-taxonomy";
import { getEmptyStateCopy } from "@/lib/empty-state-taxonomy";

interface Props {
  variant: EmptyStateVariant;
  sport?: "nba" | "mlb" | "multi" | "all" | null;
  dateLabel?: string;
  /** Optional secondary action prompt (no link — caller renders any
   *  link separately to keep this component dumb). */
  hint?: string;
}

const TONE_COLOR: Record<EmptyStateTone, string> = {
  neutral: "var(--vault-text-faint)",
  info: "var(--vault-gold)",
  warn: "var(--vault-warn)",
};

export default function EmptyStateCard({ variant, sport, dateLabel, hint }: Props) {
  const copy = getEmptyStateCopy(variant);
  const eyebrowColor = TONE_COLOR[copy.tone];
  const contextBits: string[] = [];
  if (sport) contextBits.push(sport.toUpperCase());
  if (dateLabel) contextBits.push(dateLabel);
  const context = contextBits.join(" · ");
  return (
    <div
      aria-label={`Empty state: ${copy.eyebrow}`}
      className="rounded-[8px] p-5 flex flex-col gap-2 items-start"
      style={{
        background: "rgba(7,11,26,0.4)",
        border: `1px dashed ${eyebrowColor}`,
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: eyebrowColor, fontSize: 10 }}
      >
        {copy.eyebrow}
      </span>
      <p
        className="text-[13px] sm:text-[14px] leading-relaxed"
        style={{ color: "var(--vault-text)" }}
      >
        {copy.body}
      </p>
      {(context || hint) && (
        <p
          className="text-[11px] leading-snug font-mono"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {context}
          {context && hint ? " · " : ""}
          {hint}
        </p>
      )}
    </div>
  );
}
