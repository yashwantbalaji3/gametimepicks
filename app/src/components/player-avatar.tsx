"use client";

/**
 * PlayerAvatar — sportsbook-styled player headshot with graceful fallback.
 *
 * Loads from the official NBA CDN headshot pattern when a valid NBA
 * stats player ID is available. On error (404, network failure, blocked
 * request) we fall back to a CSS gold-neon disc with player initials +
 * a tiny team chip in the corner — premium even without a photo.
 *
 * Plain `<img>` (not next/image) because the site uses static export
 * with `images.unoptimized: true`, and we don't want to add the NBA
 * CDN to the image-host whitelist. The CDN URLs are stable and the
 * official source — same pattern used by NBA.com.
 *
 * Accessibility:
 *   - Real `alt` text on the photo
 *   - When the fallback is showing, the initials carry the player's
 *     name via aria-label on the wrapper
 *   - Hover/focus is purely decorative (no interaction inside)
 */
import { useState } from "react";

interface Props {
  /** NBA stats player ID OR MLB stats player ID, depending on `sport`.
   *  When missing or the photo fails to load, the fallback initials
   *  disc renders. */
  playerId?: number | null;
  /** Explicit photo URL from an artifact (WC/optimizer legs carry these). When present it wins
   *  over the id-derived CDN URL; on error it falls through to the SAME initials disc, so a dead
   *  artifact URL can never render the browser broken-image icon. */
  photoUrl?: string | null;
  playerName: string;
  /** 3-letter team abbreviation for the corner chip. */
  team?: string | null;
  /** Which CDN to fetch the headshot from. Defaults to "nba" so existing
   *  callers keep working. MLB players resolve via the official MLB
   *  Stats people CDN, which is the same source mlb.com itself uses. */
  sport?: "nba" | "mlb" | "nfl";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** P (pitcher) / batter role ring — the one render feature the MLB sibling had that this
   *  component lacked (consolidated Program 147). Communicated by rim colour; the row text
   *  carries the role in words, so the ring is decoration, not the only signal. */
  role?: "pitcher" | "batter" | null;
  /** When true, no border/glow — for tight contexts like leg rows. */
  flat?: boolean;
}

const SIZE_PX: Record<NonNullable<Props["size"]>, number> = {
  xs: 24,
  sm: 32,
  md: 44,
  lg: 64,
  xl: 84,
};

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function PlayerAvatar({
  playerId,
  photoUrl,
  playerName,
  team,
  sport = "nba",
  size = "md",
  role,
  flat,
}: Props) {
  const px = SIZE_PX[size];
  const fontPx =
    size === "xs" ? 10 : size === "sm" ? 11 : size === "md" ? 14 : size === "xl" ? 24 : 18;
  // Team-abbreviation corner chip: a 2-char decorative overlay, not primary metadata.
  // Floored at 9px (from 7/8) for legibility without overflowing the smallest avatars.
  const teamChipPx =
    size === "xs" ? 9 : size === "sm" ? 9 : size === "md" ? 10 : size === "xl" ? 11 : 10;

  // Start in the photo state when we have a playerId; otherwise jump
  // straight to fallback.
  const [errored, setErrored] = useState(false);
  const hasPhoto = !!photoUrl || (!!playerId && playerId > 0);
  const showFallback = !hasPhoto || errored;

  const initials = initialsFor(playerName);
  // Headshot CDNs (official public endpoints used by the leagues themselves):
  //  - MLB: MLB Stats people CDN, keyed by MLB Stats API player id.
  //  - NBA: ESPN headshot CDN, keyed by ESPN athlete id. The NBA board is
  //    powered by espn_scoreboard, so `playerId` is an ESPN athlete id — the
  //    old cdn.nba.com pattern expects NBA.com stats ids and returns a generic
  //    silhouette (HTTP 200) for ESPN ids, which is why real faces were missing.
  //    ESPN's CDN returns the real photo for valid ESPN ids and a clean 404 for
  //    unknown ids, so `onError` falls through to the initials disc.
  // The explicit artifact URL wins; ids derive a CDN URL otherwise. Either way a load failure
  // lands on the same initials disc below.
  const resolvedUrl = photoUrl
    ? photoUrl
    : hasPhoto
      ? sport === "mlb"
        ? `https://midfield.mlbstatic.com/v1/people/${playerId}/spots/120`
        // NFL (P177-B): the same ESPN headshot CDN as NBA, on the nfl path, keyed by ESPN athlete
        // id. HEAD-probed against the eight players the Vault actually renders — all 200 with real
        // bytes — and an unknown id returns a clean 404, so onError lands on the initials disc.
        : sport === "nfl"
          ? `https://a.espncdn.com/i/headshots/nfl/players/full/${playerId}.png`
          : `https://a.espncdn.com/i/headshots/nba/players/full/${playerId}.png`
      : null;

  const wrapperClass = `gtp-player-avatar${flat ? " gtp-player-avatar-flat" : ""}`;

  return (
    <span
      className={wrapperClass}
      style={{
        width: px,
        height: px,
        boxShadow: role
          ? `inset 0 0 0 1px ${role === "pitcher" ? "rgba(242, 54, 69, 0.40)" : "rgba(111, 230, 255, 0.30)"}`
          : undefined,
        // Provide the team abbreviation as a CSS custom prop so the
        // fallback ::after can render it without extra DOM.
        ["--gtp-pa-team" as string]: team ? `"${team}"` : '""',
      }}
      role="img"
      aria-label={playerName}
    >
      {!showFallback && resolvedUrl && (
        <img
          src={resolvedUrl ?? undefined}
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
