/**
 * GameTimePicks brand lockup.
 *
 * Presentation-only component. Three variants:
 *
 *   - "lockup"   — monogram tile + two-tone wordmark. Used in the nav.
 *   - "compact"  — same lockup, slightly smaller. Used in the footer.
 *   - "monogram" — just the gold tile. Reserved for tight contexts.
 *
 * No new dependencies, no external image assets. Pure CSS rendering via
 * the .gtp-monogram + .gtp-neon-wordmark utility classes defined in
 * globals.css. Accessible: the wordmark is real text, screen readers
 * always read "GameTimePicks".
 */
import type { CSSProperties } from "react";

interface Props {
  variant?: "lockup" | "compact" | "monogram";
  /** Adds a single-line ALL-CAPS marker after the wordmark — e.g. "PORTFOLIO". */
  marker?: string;
  /** When true, the monogram tile slowly breathes its gold glow.
   *  Reserved for ambient surfaces like the footer; the nav stays steady. */
  ambient?: boolean;
}

export default function BrandMark({
  variant = "lockup",
  marker,
  ambient,
}: Props) {
  const isMonogramOnly = variant === "monogram";
  const isCompact = variant === "compact";

  const tileStyle: CSSProperties = isCompact
    ? { width: 30, height: 30, fontSize: 11 }
    : {};

  const wordSize = isCompact ? 14 : 16;

  return (
    <span className="gtp-brand-lockup inline-flex items-center gap-2.5 align-middle">
      <span
        className="gtp-monogram"
        style={tileStyle}
        aria-hidden={!isMonogramOnly}
        data-ambient={ambient ? "true" : undefined}
      >
        GTP
      </span>
      {!isMonogramOnly && (
        <span
          className="gtp-neon-wordmark inline-flex items-baseline gap-1"
          style={{ fontSize: wordSize, lineHeight: 1 }}
        >
          <span className="gtp-word-strong">GameTime</span>
          <span className="gtp-word-soft">Picks</span>
          {marker && (
            <span
              className="ml-2 font-mono tracking-[0.18em] uppercase"
              style={{
                fontSize: 9,
                color: "var(--vault-text-faint)",
                letterSpacing: "0.18em",
              }}
            >
              {marker}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
