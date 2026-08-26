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
  /**
   * Heading level. Defaults to h2 because this component is usually a SECTION header inside a
   * page that already has an h1. When it carries the page's primary title (e.g. /learn), pass
   * "h1" — otherwise the document outline starts at level 2 and a screen-reader user pressing
   * "1" finds nothing to jump to.
   */
  as?: "h1" | "h2";
}

export default function SectionHeader({
  eyebrow,
  title,
  sub,
  rightSlot,
  compact,
  as: Heading = "h2",
}: Props) {
  return (
    <div className={compact ? "mb-3" : "mb-6"}>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
              style={{
                background: "var(--vault-gold-bright)",
                boxShadow: "0 0 10px color-mix(in srgb, var(--vault-accent) 65%, transparent)",
              }}
            />
            <span
              className="font-mono uppercase tracking-[0.20em]"
              style={{ color: "var(--vault-gold)", fontSize: 10 }}
            >
              {eyebrow}
            </span>
          </div>
          <Heading
            className="font-display tracking-tight"
            style={{
              color: "var(--vault-text)",
              fontSize: compact
                ? "clamp(19px, 2.7vw, 23px)"
                : "clamp(22px, 3.2vw, 28px)",
              lineHeight: 1.18,
              letterSpacing: "-0.015em",
              maxWidth: 760,
            }}
          >
            {title}
          </Heading>
          {sub && (
            <p
              className="mt-2 text-[12.5px] leading-relaxed max-w-2xl"
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
