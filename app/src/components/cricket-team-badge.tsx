/**
 * CricketTeamBadge — static IPL team badge.
 *
 * IPL doesn't have a clean free CDN for franchise logos comparable to
 * ESPN's NBA/MLB endpoints, so we ship a tasteful abbreviation badge
 * using each franchise's primary color. No remote image hotlinks —
 * removes broken-image risk entirely.
 *
 * Registry covers the 10 current IPL franchises. Unknown abbreviations
 * render a neutral gold badge so we never crash on a typo.
 */

interface Props {
  abbr: string | null;
  /** Used only for aria-label fallback; the badge always shows the
   *  abbreviation. */
  name?: string | null;
  size?: "sm" | "md" | "lg";
}

interface BadgeColors {
  bg: string;
  fg: string;
  border?: string;
}

const IPL_BADGE_COLORS: Record<string, BadgeColors> = {
  // Primary franchise colors, eyeballed for contrast on the navy
  // vault background. We use a soft border so the badge reads as a
  // chip, not a flat block.
  CSK: { bg: "#FFD23F", fg: "#0B1A2D" }, // Chennai Super Kings — yellow
  MI: { bg: "#005FAF", fg: "#FFFFFF" }, // Mumbai Indians — blue
  RCB: { bg: "#B0182F", fg: "#FFFFFF" }, // Royal Challengers — red
  GT: { bg: "#1E2A4F", fg: "#E0B26F", border: "rgba(224,178,111,0.5)" }, // Gujarat Titans — navy + gold
  RR: { bg: "#E94B95", fg: "#FFFFFF" }, // Rajasthan Royals — pink
  KKR: { bg: "#3A225D", fg: "#F0C75E" }, // Kolkata Knight Riders — purple + gold
  DC: { bg: "#17449B", fg: "#FFFFFF" }, // Delhi Capitals — blue
  PBKS: { bg: "#A1303A", fg: "#FFFFFF" }, // Punjab Kings — maroon
  SRH: { bg: "#F1632C", fg: "#FFFFFF" }, // Sunrisers Hyderabad — orange
  LSG: { bg: "#0E7AB5", fg: "#FFFFFF" }, // Lucknow Super Giants — light blue
};

const SIZE_PX: Record<NonNullable<Props["size"]>, { box: number; font: number }> = {
  sm: { box: 28, font: 10 },
  md: { box: 40, font: 13 },
  lg: { box: 56, font: 16 },
};

export default function CricketTeamBadge({ abbr, name, size = "md" }: Props) {
  const key = (abbr ?? "").toUpperCase();
  const colors = IPL_BADGE_COLORS[key] ?? {
    bg: "color-mix(in srgb, var(--vault-accent) 18%, transparent)",
    fg: "var(--vault-gold-bright)",
    border: "color-mix(in srgb, var(--vault-accent) 45%, transparent)",
  };
  const dims = SIZE_PX[size];
  return (
    <span
      role="img"
      aria-label={name || abbr || "IPL team"}
      className="inline-flex items-center justify-center font-display font-bold shrink-0"
      style={{
        width: dims.box,
        height: dims.box,
        borderRadius: 8,
        background: colors.bg,
        color: colors.fg,
        border: `1px solid ${colors.border ?? "color-mix(in srgb, var(--vault-wash-base) 8%, transparent)"}`,
        fontSize: dims.font,
        letterSpacing: "-0.02em",
        boxShadow:
          "inset 0 1px 0 color-mix(in srgb, var(--vault-wash-base) 12%, transparent), 0 1px 2px color-mix(in srgb, var(--vault-ink-black) 40%, transparent)",
      }}
    >
      {key || "?"}
    </span>
  );
}
