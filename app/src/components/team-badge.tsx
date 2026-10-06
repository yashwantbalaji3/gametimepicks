/**
 * TeamBadge — small color-coded monogram for any NBA/MLB team abbr.
 *
 * No external logos / no hotlinked assets / no licensing concerns. The
 * badge uses each team's official primary + secondary colors as a
 * gradient backing, with the abbreviation centered on top. Pure CSS;
 * works at every size from a 24px chip to a 64px hero badge.
 *
 * Size variants:
 *   sm — 24×24  (inline next to a player name)
 *   md — 36×36  (default — matchup row, projection card)
 *   lg — 56×56  (game hero header)
 *
 * Colors are sourced from a static map so the component never depends
 * on any external image fetch. Unknown abbreviations fall back to a
 * neutral graphite badge.
 */
import type { CSSProperties } from "react";

interface Props {
  team: string | null | undefined;
  size?: "sm" | "md" | "lg";
  /** Outline ring color when this team is the favored side. */
  highlight?: boolean;
  className?: string;
  style?: CSSProperties;
}

const SIZES: Record<NonNullable<Props["size"]>, { px: number; font: number }> = {
  sm: { px: 24, font: 9 },
  md: { px: 36, font: 11 },
  lg: { px: 56, font: 16 },
};

// Primary/secondary colors per NBA + MLB team (subset of the most
// commonly-rendered teams in playoff coverage). Unknown teams fall
// through to NEUTRAL.
//
// Values are the public brand-color hex codes; not licensed logo assets.
const TEAM_COLORS: Record<
  string,
  { primary: string; secondary: string; ink: string }
> = {
  // NBA — current playoff coverage
  SA:  { primary: "#000000", secondary: "#C4CED4", ink: "#FFFFFF" },
  OKC: { primary: "#007AC1", secondary: "#EF3B24", ink: "#FFFFFF" },
  CLE: { primary: "#860038", secondary: "#FDBB30", ink: "#FFFFFF" },
  NY:  { primary: "#006BB6", secondary: "#F58426", ink: "#FFFFFF" },
  NYK: { primary: "#006BB6", secondary: "#F58426", ink: "#FFFFFF" },

  // NBA — adjacent / common
  LAL: { primary: "#552583", secondary: "#FDB927", ink: "#FFFFFF" },
  BOS: { primary: "#007A33", secondary: "#BA9653", ink: "#FFFFFF" },
  DEN: { primary: "#0E2240", secondary: "#FEC524", ink: "#FFFFFF" },
  MIN: { primary: "#0C2340", secondary: "#236192", ink: "#FFFFFF" },
  MIL: { primary: "#00471B", secondary: "#EEE1C6", ink: "#FFFFFF" },
  PHI: { primary: "#006BB6", secondary: "#ED174C", ink: "#FFFFFF" },
  IND: { primary: "#002D62", secondary: "#FDBB30", ink: "#FFFFFF" },
  MIA: { primary: "#98002E", secondary: "#F9A01B", ink: "#FFFFFF" },
  DAL: { primary: "#00538C", secondary: "#002B5E", ink: "#FFFFFF" },
  PHX: { primary: "#1D1160", secondary: "#E56020", ink: "#FFFFFF" },

  // MLB — frequent in current MLB slate
  NYY: { primary: "#003087", secondary: "#E4002C", ink: "#FFFFFF" },
  BOS_MLB: { primary: "#BD3039", secondary: "#0C2340", ink: "#FFFFFF" },
  LAD: { primary: "#005A9C", secondary: "#A5ACAF", ink: "#FFFFFF" },
  HOU: { primary: "#002D62", secondary: "#EB6E1F", ink: "#FFFFFF" },
  SEA: { primary: "#0C2C56", secondary: "#005C5C", ink: "#FFFFFF" },
  CWS: { primary: "#27251F", secondary: "#C4CED4", ink: "#FFFFFF" },
  ATL: { primary: "#CE1141", secondary: "#13274F", ink: "#FFFFFF" },
};

/** WCAG relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mix(a: string, b: string, t: number): string {
  const hex = [1, 3, 5].map((i) => {
    const v = Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t);
    return v.toString(16).padStart(2, "0");
  });
  return `#${hex.join("")}`;
}

/**
 * The gradient's light end, pulled toward the primary until white ink on it reaches 4.5:1. The
 * monogram is what readers see when an ESPN logo fails to load; QA 2026-10-05 measured white on
 * the raw secondary at 1.6:1 (CWS, #C4CED4) and 1.7:1 (CLE, #FDBB30).
 */
function readableSecondary(primary: string, secondary: string): string {
  for (let t = 0; t <= 1; t += 0.05) {
    const stop = mix(secondary, primary, t);
    if (1.05 / (luminance(stop) + 0.05) >= 4.5) return stop;
  }
  return primary;
}

const NEUTRAL = {
  primary: "#1a1f33",
  secondary: "#2a3247",
  ink: "var(--vault-text)",
};

export default function TeamBadge({
  team,
  size = "md",
  highlight = false,
  className,
  style,
}: Props) {
  const abbr = (team ?? "?").trim().toUpperCase();
  const colors = TEAM_COLORS[abbr] ?? NEUTRAL;
  const dim = SIZES[size];
  return (
    <span
      aria-label={team ? `${team} team badge` : "team badge unknown"}
      className={`inline-flex items-center justify-center font-display font-semibold ${
        className ?? ""
      }`}
      style={{
        width: dim.px,
        height: dim.px,
        borderRadius: dim.px / 5,
        background: `linear-gradient(155deg, ${colors.primary} 0%, ${
          luminance(colors.ink) > 0.5 ? readableSecondary(colors.primary, colors.secondary) : colors.secondary
        } 100%)`,
        color: colors.ink,
        fontSize: dim.font,
        letterSpacing: dim.font > 12 ? "-0.02em" : "0.02em",
        boxShadow: highlight
          ? `0 0 0 1px color-mix(in srgb, var(--vault-accent) 65%, transparent), 0 0 12px color-mix(in srgb, var(--vault-accent) 30%, transparent)`
          : "inset 0 0 0 1px color-mix(in srgb, var(--vault-wash-base) 5%, transparent)",
        textShadow: "0 1px 2px color-mix(in srgb, var(--vault-ink-black) 45%, transparent)",
        flexShrink: 0,
        ...style,
      }}
    >
      {abbr.slice(0, 3)}
    </span>
  );
}
