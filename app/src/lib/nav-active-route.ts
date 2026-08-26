import { destinationsFor } from "./navigation";
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
  | "today"
  | "games"
  | "markets"
  | "picks"
  | "lab"
  | "bank"
  | "moonshot"
  | "mrdub"
  | "results"
  | "sports";

export interface MobileNavItem {
  bucket: MobileNavBucket;
  href: string;
  /** Full name. Stays the ACCESSIBLE name even when a shorter one is painted. */
  label: string;
  /** What the thumb bar paints. Falls back to `label`. */
  shortLabel: string;
}

/**
 * Canonical list rendered by the mobile bottom nav. Order is
 * preserved by the consumer (the component renders these in order).
 *
 * Honesty / scope notes:
 *   - The two paper-bankroll ladders — Bank Builder AND Moonshot — both earn
 *     a bottom-nav slot: they are the flagship money journeys and the user
 *     reaches each one-handed. Moonshot is a first-class product, not a
 *     sub-tab of Bank, so it carries its own bucket (was folded into "bank").
 *   - SIX items, and they must FIT. P185 measured the bar at 390px: it overflowed by 75px with
 *     "MR. DUB'S PORTFOLIO" rendering 132px against a 58px basis, so the trailing label sat
 *     permanently half-cut behind a hidden scrollbar. The old hand-written list abbreviated
 *     "Bank" for exactly this reason; deriving from the canonical list in P196 took `label`
 *     verbatim and silently undid it. `shortLabel` carries that intent in the registry now.
 *   - The bucket ids are route-resolution keys; only the visible labels are user-facing, and the
 *     ACCESSIBLE name stays the full label.
 */
/**
 * P196: derived from the canonical destination list. Every mobile destination also appears on the
 * top nav and the rail, so a phone is never the ONLY route to a page — which it used to be for
 * /build. Bucket ids remain the route-resolution keys.
 */
export const MOBILE_NAV_ITEMS: ReadonlyArray<MobileNavItem> = destinationsFor("mobile").map((d) => ({
  bucket: d.bucket as MobileNavItem["bucket"],
  href: d.href,
  label: d.label,
  shortLabel: d.shortLabel ?? d.label,
}));

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
  // P208: Home is a real destination — the root highlights it; Today owns its own bucket.
  if (p === "" || p === "/") return "home";
  if (p === "/today" || p.startsWith("/today/")) return "today";
  // Picks Lab is retired (Program 143): /picks and the older /parlays + /parlay-lab aliases all
  // redirect to /build#suggested-cards, so they highlight the Build (lab) bucket mid-redirect
  // rather than leaving no active item. The "picks" bucket no longer has a nav item.
  if (
    p === "/build" || p.startsWith("/build/") ||
    p === "/picks" || p.startsWith("/picks/") ||
    p === "/parlays" || p.startsWith("/parlays/") ||
    p === "/parlay-lab" || p.startsWith("/parlay-lab/")
  ) return "lab";
  // P201 (charter F1): the bar carries the SIX PRIMARY destinations, so the paper products no
  // longer own slots — Bank Builder / Moonshot / Mr. Dub highlight nothing, like /about. Their
  // buckets stay in the type for any surface that still keys on them, but no route resolves there.
  // Better silent than misleading. (Homer Nukes retired 2026-06-30 — still no bucket.)
  if (
    p === "/bank-builder" || p.startsWith("/bank-builder/") ||
    p === "/moonshot" || p.startsWith("/moonshot/") ||
    p === "/mr-dub" || p.startsWith("/mr-dub/")
  ) return null;
  // Market Center owns its own slot (P201).
  if (p === "/markets" || p.startsWith("/markets/")) return "markets";
  // Results returned to the bar with the six-primary swap: every record surface highlights it.
  if (p === "/results" || p.startsWith("/results/")) return "results";
  // Simulate owns the cross-sport GAME surfaces: the lobby, game reports, and the legacy
  // board/projections aliases that redirect into them.
  if (
    p === "/simulate" || p.startsWith("/simulate/") ||
    p === "/games" || p.startsWith("/games/") ||
    p === "/events" || p.startsWith("/events/") ||
    p === "/projections" || p.startsWith("/projections/") ||
    p === "/board" || p.startsWith("/board/")
  ) return "games";
  // Sports owns the LEAGUE surfaces (P201): the schedules directory and every sport hub — a
  // reader inside /mlb is inside a league, and the bar item that promises "enter a league"
  // should say so. World Cup archives ride here too (they are league history, not live games).
  if (
    p === "/sports" || p.startsWith("/sports/") ||
    p === "/mlb" || p.startsWith("/mlb/") ||
    p === "/nba" || p.startsWith("/nba/") ||
    p === "/ufc" || p.startsWith("/ufc/") ||
    p === "/epl" || p.startsWith("/epl/") ||
    p === "/nfl" || p.startsWith("/nfl/") ||
    p === "/nhl" || p.startsWith("/nhl/") ||
    p === "/ipl" || p.startsWith("/ipl/") ||
    p === "/world-cup" || p.startsWith("/world-cup/") ||
    p === "/world-cup-specials" || p.startsWith("/world-cup-specials/")
  ) return "sports";
  // Everything else (/about, /methodology, /responsible-use, /trends) returns null so the bottom
  // nav shows nothing highlighted — those live in the rail / footer. Better silent than misleading.
  return null;
}
