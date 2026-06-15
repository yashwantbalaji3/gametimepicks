"use client";

/**
 * TeamLogo — render an official ESPN team logo with TeamBadge monogram
 * fallback. ESPN's logo CDN (`a.espncdn.com/i/teamlogos/<sport>/500/<abbr>.png`)
 * is the canonical public endpoint that powers ESPN.com itself; URLs
 * verified by HEAD probe at build time for the teams currently
 * appearing on the boards (NBA: OKC SA NY CLE; MLB: every team on
 * the May 21 slate).
 *
 * Honest fallback: if the image 404s or fails to load for any reason,
 * `onError` swaps the rendered output to the existing TeamBadge color
 * monogram. No broken-image icon is ever visible to the user.
 *
 * Why client component: we need `useState` + `onError` to swap to
 * fallback when remote loading fails. Static export still works
 * because the component hydrates without any side effects.
 */
import { useState } from "react";
import TeamBadge from "./team-badge";

type SportKey = "nba" | "mlb" | "nhl";

interface Props {
  team: string | null | undefined;
  sport: SportKey;
  /** sm 24 · md 36 · lg 56 · xl 80 */
  size?: "sm" | "md" | "lg" | "xl";
  /** Optional gold ring when this team is the favored side. */
  highlight?: boolean;
  /** Optional accessible label (defaults to "{team} logo"). */
  ariaLabel?: string;
}

const SIZE_PX: Record<NonNullable<Props["size"]>, number> = {
  sm: 24,
  md: 36,
  lg: 56,
  xl: 80,
};

/**
 * Build the ESPN logo URL. Both 2-letter and 3-letter abbrs resolve on
 * ESPN's CDN for the teams we render today (verified by HEAD probe);
 * we lowercase whatever we receive and hand it off. The onError path
 * catches any 404 or network failure and shows the monogram instead.
 */
function logoUrl(team: string, sport: SportKey): string {
  const abbr = team.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `https://a.espncdn.com/i/teamlogos/${sport}/500/${abbr}.png`;
}

export default function TeamLogo({
  team,
  sport,
  size = "md",
  highlight,
  ariaLabel,
}: Props) {
  const [failed, setFailed] = useState(false);
  const px = SIZE_PX[size];

  if (!team || failed) {
    return <TeamBadge team={team} size={size === "xl" ? "lg" : size} highlight={highlight} />;
  }

  const src = logoUrl(team, sport);
  return (
    <span
      className="relative inline-flex items-center justify-center"
      style={{
        width: px,
        height: px,
        borderRadius: 10,
        background: "rgba(26, 16, 11, 0.45)",
        border: highlight
          ? "1.5px solid rgba(242, 54, 69, 0.65)"
          : "1px solid var(--vault-border)",
        boxShadow: highlight
          ? "0 0 14px rgba(242, 54, 69, 0.30), inset 0 0 0 1px rgba(242, 54, 69, 0.15)"
          : "inset 0 0 0 1px rgba(255, 255, 255, 0.03)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={ariaLabel ?? `${team} logo`}
        width={px - 8}
        height={px - 8}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        style={{
          width: px - 8,
          height: px - 8,
          objectFit: "contain",
          // ESPN logos are transparent PNGs — a subtle drop-shadow
          // separates them from the dark card background.
          filter: "drop-shadow(0 1px 3px rgba(0, 0, 0, 0.55))",
        }}
      />
    </span>
  );
}
