/**
 * SectionHeader — small shared header used between content blocks on the
 * homepage and sport pages. Gives the new layout a consistent visual
 * rhythm without each section reinventing the eyebrow + headline combo.
 */
interface Props {
  eyebrow: string;
  title: string;
  sub?: string;
  rightSlot?: React.ReactNode;
  /** Tighten vertical spacing when used inside a card. */
  compact?: boolean;
}

export default function SectionHeader({
  eyebrow,
  title,
  sub,
  rightSlot,
  compact,
}: Props) {
  return (
    <div className={compact ? "mb-3" : "mb-5"}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
              style={{
                background: "var(--vault-gold-bright)",
                boxShadow: "0 0 8px rgba(240, 199, 94, 0.6)",
              }}
            />
            <span
              className="font-mono uppercase tracking-[0.18em]"
              style={{ color: "var(--vault-gold)", fontSize: 10 }}
            >
              {eyebrow}
            </span>
          </div>
          <h2
            className="font-display tracking-tight"
            style={{
              color: "var(--vault-text)",
              fontSize: compact
                ? "clamp(18px, 2.6vw, 22px)"
                : "clamp(20px, 3vw, 26px)",
              lineHeight: 1.2,
              maxWidth: 760,
            }}
          >
            {title}
          </h2>
          {sub && (
            <p
              className="mt-1.5 text-[12px] leading-relaxed max-w-2xl"
              style={{ color: "var(--vault-text-mute)" }}
            >
              {sub}
            </p>
          )}
        </div>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>
    </div>
  );
}
