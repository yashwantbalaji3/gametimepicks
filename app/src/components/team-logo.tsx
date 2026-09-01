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
import { reportIfAlreadyFailed } from "@/lib/ui/image-failure";
import TeamBadge from "./team-badge";

type SportKey = "nba" | "mlb" | "nhl" | "nfl" | "soccer";

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
 * Source-abbreviation → ESPN-slug aliases, for the teams where the two disagree.
 *
 * MLB StatsAPI calls Arizona "AZ"; ESPN's CDN serves it as "ari". The onError monogram hides the
 * mismatch, so the logo simply never appears and nothing looks broken — which is why this needs an
 * explicit alias rather than trusting the fallback. Verified against the CDN, not assumed.
 */
const ESPN_SLUG_ALIASES: Record<string, Record<string, string>> = {
  mlb: { az: "ari" },
};

/**
 * Build the ESPN logo URL. Both 2-letter and 3-letter abbrs resolve on
 * ESPN's CDN for the teams we render today (verified by HEAD probe);
 * we lowercase whatever we receive and hand it off. The onError path
 * catches any 404 or network failure and shows the monogram instead.
 *
 * Pass an ABBREVIATION. A full team name normalizes to something like
 * "arizonadiamondbacks", which 404s and degrades to the monogram — visually fine, so it ships broken
 * easily. `logo-slug.test.mjs` guards against that.
 */
/**
 * Premier League clubs are identified by NAME in our schedule, but ESPN's soccer logos are keyed by
 * NUMERIC team id — so unlike NFL/NBA/MLB there is no abbreviation that resolves on its own.
 *
 * This table was generated from ESPN's own team endpoint rather than typed from memory, and every
 * one of the 20 URLs was verified to return 200 before it landed. Keys are normalised names, with
 * aliases for the short forms our feed uses ("Bournemouth" for "AFC Bournemouth").
 */
const EPL_TEAM_IDS: Record<string, string> = {
  afcbournemouth: "349",
  arsenal: "359",
  astonvilla: "362",
  bournemouth: "349",
  brentford: "337",
  brighton: "331",
  brightonhovealbion: "331",
  chelsea: "363",
  coventry: "388",
  coventrycity: "388",
  cpalace: "384",
  crystalpalace: "384",
  everton: "368",
  fulham: "370",
  hull: "306",
  hullcity: "306",
  ipswich: "373",
  ipswichtown: "373",
  leeds: "357",
  leedsunited: "357",
  liverpool: "364",
  manchestercity: "382",
  manchesterunited: "360",
  mancity: "382",
  manunited: "360",
  newcastle: "361",
  newcastleunited: "361",
  nottinghamforest: "393",
  nottmforest: "393",
  spurs: "367",
  sunderland: "366",
  tottenhamhotspur: "367",
};

function logoUrl(team: string, sport: SportKey): string {
  const raw = team.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (sport === "soccer") {
    const id = EPL_TEAM_IDS[raw];
    // No id means no logo — the crest falls back to initials rather than requesting a 404.
    return id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png` : "";
  }
  const abbr = ESPN_SLUG_ALIASES[sport]?.[raw] ?? raw;
  return `https://a.espncdn.com/i/teamlogos/${sport}/500/${abbr}.png`;
}

/** Exported for guards: the slug a given team identifier resolves to. */
export function espnLogoSlug(team: string, sport: SportKey): string {
  const raw = team.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ESPN_SLUG_ALIASES[sport]?.[raw] ?? raw;
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
  if (!src) return <TeamBadge team={team} size={size === "xl" ? "lg" : size} highlight={highlight} />;
  return (
    <span
      className="relative inline-flex items-center justify-center"
      style={{
        width: px,
        height: px,
        borderRadius: 10,
        background: "color-mix(in srgb, var(--vault-scrim-base) 45%, transparent)",
        border: highlight
          ? "1.5px solid color-mix(in srgb, var(--vault-accent) 65%, transparent)"
          : "1px solid var(--vault-border)",
        boxShadow: highlight
          ? "0 0 14px color-mix(in srgb, var(--vault-accent) 30%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--vault-accent) 15%, transparent)"
          : "inset 0 0 0 1px color-mix(in srgb, var(--vault-wash-base) 3%, transparent)",
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
        /* And catch the failure that happened BEFORE this handler existed — on a static export the
           browser fetches while parsing SSR HTML, so an error can fire before hydration and never
           reach React. See lib/ui/image-failure. */
        ref={(el) => reportIfAlreadyFailed(el, () => setFailed(true))}
        style={{
          width: px - 8,
          height: px - 8,
          objectFit: "contain",
          // ESPN logos are transparent PNGs — a subtle drop-shadow
          // separates them from the dark card background.
          filter: "drop-shadow(0 1px 3px color-mix(in srgb, var(--vault-ink-black) 55%, transparent))",
        }}
      />
    </span>
  );
}
