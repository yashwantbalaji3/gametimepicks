"use client";

/**
 * GameTimePicks brand lockup.
 *
 * Renders the real GameTime Picks logo image when present in
 * `/brand/gametime-picks-logo.png`, with a graceful fallback to the
 * original CSS lockup (gold monogram tile + two-tone wordmark) if the
 * image fails to load. The CSS lockup remains the canonical fallback —
 * never deleted.
 *
 * Three variants:
 *   - "lockup"   — full logo lockup. Used in the nav.
 *   - "compact"  — slightly smaller. Used in the footer.
 *   - "monogram" — vault-tile only. Reserved for tight contexts;
 *                  always renders the CSS monogram (no image).
 *
 * Accessibility: real `alt="GameTime Picks"` on the image; the CSS
 * fallback uses real text so screen readers always read the name.
 */
import { useState } from "react";
import type { CSSProperties } from "react";

interface Props {
  /**
   * Visual size variant.
   *   - "lockup"   — full logo lockup at the standard nav size (42px tall).
   *   - "compact"  — slightly smaller (30px). Footer / inline contexts.
   *   - "monogram" — vault-tile only. Always renders the CSS monogram.
   *   - "hero"     — large centered header logo (72px tall). Used in the
   *                  primary site header where the brand sits center stage.
   *   - "rail"     — big sidebar brand header (88px tall). The prominent
   *                  top-of-site lockup in the desktop command rail.
   */
  variant?: "lockup" | "compact" | "monogram" | "hero" | "rail";
  /** Adds a single-line ALL-CAPS marker after the wordmark — e.g. "PORTFOLIO". */
  marker?: string;
  /** When true, the monogram tile slowly breathes its gold glow.
   *  Reserved for ambient surfaces like the footer; the nav stays steady. */
  ambient?: boolean;
  /** Force the CSS-only fallback even when the image exists. Used for
   *  preview snapshots and the monogram variant. */
  useFallback?: boolean;
}

const LOGO_SRC = "/brand/gametime-picks-logo.png";

export default function BrandMark({
  variant = "lockup",
  marker,
  ambient,
  useFallback,
}: Props) {
  const isMonogramOnly = variant === "monogram";
  const isCompact = variant === "compact";
  const isHero = variant === "hero";
  const isRail = variant === "rail";

  // Image branch is only attempted for lockup / compact / hero / rail.
  // Monogram always uses the CSS tile.
  const [imgErrored, setImgErrored] = useState(false);
  const showImage = !isMonogramOnly && !useFallback && !imgErrored;

  if (showImage) {
    // Heights tuned per variant. Width derived from the real 1672x941
    // logo aspect ratio to avoid layout shift.
    const height = isRail ? 88 : isHero ? 72 : isCompact ? 30 : 42;
    const width = Math.round((height * 1672) / 941);
    return (
      <span className="gtp-brand-lockup inline-flex items-center gap-2 align-middle">
        <img
          src={LOGO_SRC}
          alt="GameTime Picks"
          width={width}
          height={height}
          className="gtp-logo-img"
          onError={() => setImgErrored(true)}
          draggable={false}
        />
        {marker && (
          <span
            className="font-mono tracking-[0.18em] uppercase"
            style={{
              fontSize: 10,
              color: "var(--vault-text-faint)",
              letterSpacing: "0.18em",
            }}
          >
            {marker}
          </span>
        )}
      </span>
    );
  }

  // Fallback: original CSS monogram + wordmark lockup.
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
                fontSize: 10,
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
