"use client";

/**
 * MlbPlayerAvatar — sibling to PlayerAvatar (NBA) for MLB players.
 *
 * Loads from the official MLB midfield CDN headshot pattern:
 *   https://midfield.mlbstatic.com/v1/people/{personId}/spots/120
 *
 * That URL serves a 120×120 cropped PNG with transparent background and
 * is the same source MLB.com uses on its player pages. On image error
 * (404, blocked request, etc.) we fall back to a premium initials disc,
 * matching the NBA fallback so the two sports feel like sibling products.
 *
 * Accessibility:
 *   - Real `alt` text on the photo
 *   - aria-label on the wrapper carries the player's name when the
 *     fallback initials are showing
 *   - Optional role badge (P / BAT) sits in the corner, hidden from AT
 *     since the player's position is also surfaced as text on the row
 */
import { useState } from "react";

interface Props {
  /** MLB Stats API personId. When missing, the fallback initials disc renders. */
  playerId?: number | null;
  playerName: string;
  /** 2-3 letter team abbreviation for the corner chip. */
  team?: string | null;
  /** P (pitcher) or BAT (batter) badge. Pure presentation. */
  role?: "pitcher" | "batter" | null;
  size?: "xs" | "sm" | "md" | "lg";
  /** When true, no border/glow — for tight contexts. */
  flat?: boolean;
}

const SIZE_PX: Record<NonNullable<Props["size"]>, number> = {
  xs: 24,
  sm: 32,
  md: 44,
  lg: 64,
};

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function MlbPlayerAvatar({
  playerId,
  playerName,
  team,
  role,
  size = "md",
  flat,
}: Props) {
  const px = SIZE_PX[size];
  const fontPx =
    size === "xs" ? 9 : size === "sm" ? 11 : size === "md" ? 14 : 18;
  const teamChipPx = size === "xs" ? 7 : size === "sm" ? 8 : size === "md" ? 9 : 10;

  const [errored, setErrored] = useState(false);
  const hasPhoto = !!playerId && playerId > 0;
  const showFallback = !hasPhoto || errored;

  const initials = initialsFor(playerName);
  // Use the midfield CDN (smaller, transparent PNG) at 120px; the browser
  // scales down for smaller sizes — no layout shift because we set width/height.
  const photoUrl = hasPhoto
    ? `https://midfield.mlbstatic.com/v1/people/${playerId}/spots/120`
    : null;

  // The role accent is communicated by the rim color (warn for pitcher,
  // gold for batter). The avatar parent has `overflow: hidden` so an
  // absolute-positioned badge with negative offsets gets clipped — the
  // row text already says "Pitcher" / "Batter" plainly. Keep the avatar
  // strictly photo + team chip.
  const wrapperClass = `gtp-player-avatar${flat ? " gtp-player-avatar-flat" : ""}`;

  return (
    <span
      className={wrapperClass}
      style={{
        width: px,
        height: px,
        ["--gtp-pa-team" as string]: team ? `"${team}"` : '""',
        position: "relative",
        // A faint role-tinted ring so pitchers/batters are visually
        // distinguishable at a glance even without a badge.
        boxShadow: role
          ? `inset 0 0 0 1px ${role === "pitcher" ? "rgba(212, 175, 55, 0.40)" : "rgba(111, 230, 255, 0.30)"}`
          : undefined,
      }}
      role="img"
      aria-label={playerName}
    >
      {!showFallback && photoUrl && (
        <img
          src={photoUrl}
          alt={playerName}
          width={px}
          height={px}
          loading="lazy"
          decoding="async"
          onError={() => setErrored(true)}
          className="gtp-player-avatar-img"
          draggable={false}
        />
      )}
      {showFallback && (
        <span
          aria-hidden
          className="gtp-player-avatar-fallback"
          style={{ fontSize: fontPx }}
        >
          {initials}
        </span>
      )}
      {team && (
        <span
          aria-hidden
          className="gtp-player-avatar-team"
          style={{ fontSize: teamChipPx }}
        >
          {team}
        </span>
      )}
    </span>
  );
}
