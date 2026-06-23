/**
 * Active-route resolver for the mobile bottom nav.
 *
 * The bottom nav has 4 buckets (Home / Picks / Lab / Results) but the
 * app has many more routes. This helper maps a pathname to the
 * correct bucket so the highlighted item matches what the user is
 * actually looking at.
 *
 * Lives separate from the component so it can be unit tested without
 * a React tree.
 */

export type MobileNavBucket =
  | "home"
  | "games"
  | "picks"
  | "lab"
  | "bank"
  | "mrdub"
  | "results"
  | "sports";

export interface MobileNavItem {
  bucket: MobileNavBucket;
  href: string;
  label: string;
}

/**
 * Canonical list rendered by the mobile bottom nav. Order is
 * preserved by the consumer (the component renders these in order).
 *
 * Honesty / scope notes:
 *   - 5 items max — 5 is the upper bound for comfortable 360px thumb
 *     targets; anything beyond that crowds the labels.
 *   - Bank Builder is a flagship journey, so it earns a bottom-nav slot
 *     (the user reaches the paper-bankroll ladder one-handed). "Sports"
 *     (/events, schedule-only leagues) was the least core of the five, so
 *     it moves to the scrollable top nav to make room.
 *   - Labels MATCH the mobile top nav where the destination is the same:
 *     "Projections" (/projections), "Results" (/results). "Parlays" and
 *     "Bank" are abbreviated for thumb-width. The bucket ids are
 *     route-resolution keys; only the visible labels are user-facing.
 */
export const MOBILE_NAV_ITEMS: ReadonlyArray<MobileNavItem> = [
  { bucket: "home", href: "/today", label: "Today" },
  { bucket: "games", href: "/games", label: "Games" },
  { bucket: "picks", href: "/picks", label: "Parlay Lab" },
  { bucket: "lab", href: "/build", label: "Build" },
  { bucket: "bank", href: "/bank-builder", label: "Bank" },
  { bucket: "mrdub", href: "/mr-dub", label: "Mr. Dub" },
] as const;

/**
 * Returns the bottom-nav bucket that should be highlighted for the
 * given pathname. Returns null when the pathname doesn't map to any
 * bucket — caller renders no highlight in that case (e.g. /about).
 *
 * Mapping rules (intentionally explicit, not regex-driven):
 *   - "/"                          → home
 *   - "/projections"               → picks
 *   - "/projections/anything"      → picks
 *   - "/parlay-lab"                → lab
 *   - "/parlay-lab/anything"       → lab
 *   - "/results"                   → results
 *   - "/results/nba"               → results
 *   - "/results/mlb"               → results
 *   - "/results/date/2026-05-27"   → results
 *   - any /results/* descendant    → results
 *   - "/nba/*"                     → picks (sport boards are picks-adjacent)
 *   - "/mlb/*"                     → picks
 *   - "/nhl/*"                     → picks
 *   - "/about"                     → null (lives only in top nav)
 *   - "/responsible-use"           → null
 *   - "/trends"                    → null
 *   - "/world-cup/*"               → null (deferred sport)
 *
 * Anything not listed → null. Defensive: avoid mismatched
 * highlighting that would mislead the user about where they are.
 */
export function resolveMobileNavBucket(
  pathname: string | null | undefined,
): MobileNavBucket | null {
  if (!pathname || typeof pathname !== "string") return null;
  // Strip trailing slash for consistent matching.
  const p = pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
  // Today owns the root/home as the default landing experience.
  if (p === "" || p === "/" || p === "/today" || p.startsWith("/today/")) return "home";
  // The canonical Parlay Lab is /picks; /parlays + /parlay-lab are legacy aliases that redirect there,
  // so all three highlight the Parlay Lab (picks) bucket.
  if (
    p === "/picks" || p.startsWith("/picks/") ||
    p === "/parlays" || p.startsWith("/parlays/") ||
    p === "/parlay-lab" || p.startsWith("/parlay-lab/")
  ) return "picks";
  // Build is the custom paper-card builder (distinct from the Parlay Lab lobby).
  if (p === "/build" || p.startsWith("/build/")) return "lab";
  // Moonshot is a Bankroll surface (its own lane); it highlights the Bank bucket on mobile.
  if (p === "/bank-builder" || p.startsWith("/bank-builder/") || p === "/moonshot" || p.startsWith("/moonshot/")) return "bank";
  if (p === "/mr-dub" || p.startsWith("/mr-dub/")) return "mrdub";
  // The unified Games board + the Sports directory + every sport hub/board + schedule-only
  // leagues all resolve to the Games bucket (Games is the cross-sport entry on mobile).
  if (
    p === "/games" || p.startsWith("/games/") ||
    p === "/sports" || p.startsWith("/sports/") ||
    p === "/events" || p.startsWith("/events/") ||
    p === "/world-cup" || p.startsWith("/world-cup/") ||
    p === "/world-cup-specials" || p.startsWith("/world-cup-specials/") ||
    p === "/mlb" || p.startsWith("/mlb/") ||
    p === "/nba" || p.startsWith("/nba/") ||
    p === "/ufc" || p.startsWith("/ufc/") ||
    p === "/nhl" || p.startsWith("/nhl/") ||
    p === "/ipl" || p.startsWith("/ipl/") ||
    p === "/projections" || p.startsWith("/projections/") ||
    p === "/board" || p.startsWith("/board/")
  ) return "games";
  // Everything else (/results, /about, /methodology, /responsible-use, /trends)
  // returns null so the bottom nav shows nothing highlighted — those live in
  // the top nav / drawer. Better silent than misleading.
  return null;
}
