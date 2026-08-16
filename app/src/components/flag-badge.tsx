/**
 * FlagBadge — render a country flag as a Unicode emoji-flag sequence
 * inside a polished glass chip. Used across the World Cup section
 * (schedule cards, team grid, group tables, hero rails).
 *
 * No image dependencies; the emoji glyph is provided by the OS/font.
 * For unsupported codes the badge falls back to a monogram so we never
 * render an empty box.
 */
import { flagEmoji } from "@/lib/flag-emoji";

interface Props {
  code: string;
  /** Optional override text (e.g. team monogram if the code isn't supported). */
  fallback?: string;
  /** sm = 18px badge · md = 24px · lg = 32px · xl = 44px hero size */
  size?: "sm" | "md" | "lg" | "xl";
  /** Optional team name for screen readers. */
  ariaLabel?: string;
}

const SIZE: Record<NonNullable<Props["size"]>, { box: number; font: number }> = {
  sm: { box: 18, font: 14 },
  md: { box: 24, font: 18 },
  lg: { box: 32, font: 24 },
  xl: { box: 44, font: 34 },
};

export default function FlagBadge({
  code,
  fallback,
  size = "md",
  ariaLabel,
}: Props) {
  const dim = SIZE[size];
  const glyph = flagEmoji(code);
  const text = glyph || (fallback ?? code.slice(0, 2).toUpperCase());
  return (
    <span
      aria-label={ariaLabel ?? `Flag: ${code}`}
      role="img"
      className="inline-flex items-center justify-center rounded-[5px] leading-none"
      style={{
        width: dim.box,
        height: dim.box,
        fontSize: dim.font,
        background: glyph ? "transparent" : "rgba(11, 18, 14,0.6)",
        border: glyph ? "none" : "1px solid var(--vault-border)",
        color: "var(--vault-text)",
        fontFamily:
          'apple color emoji, segoe ui emoji, noto color emoji, twemoji mozilla, sans-serif',
      }}
    >
      {text}
    </span>
  );
}
