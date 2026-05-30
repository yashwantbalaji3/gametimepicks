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

export type MobileNavBucket = "home" | "picks" | "lab" | "results";

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
 *   - 4 items only — anything beyond ~4 starts to feel cramped on
 *     375px and small-thumb-friendly tap targets become hard.
 *   - Labels MATCH the desktop top nav so the same destination reads
 *     the same in both navs: "Projections" (/projections) and
 *     "Parlay Lab" (/parlay-lab). Previously the bottom nav said
 *     "Picks"/"Lab" while the top nav said "Projections"/"Parlay Lab",
 *     which made the two navs look like different sites. The `picks`
 *     and `lab` *bucket ids* are unchanged (route resolution is keyed
 *     on them) — only the visible labels changed.
 *   - No "About" / "Bank Builder" / "Events" — those live in the top
 *     nav. Bottom nav stays ruthlessly minimal to be useful one-handed.
 */
export const MOBILE_NAV_ITEMS: ReadonlyArray<MobileNavItem> = [
  { bucket: "home", href: "/", label: "Home" },
  { bucket: "picks", href: "/projections", label: "Projections" },
  { bucket: "lab", href: "/parlay-lab", label: "Parlay Lab" },
  { bucket: "results", href: "/results", label: "Results" },
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
  if (p === "" || p === "/") return "home";
  if (p === "/projections" || p.startsWith("/projections/")) return "picks";
  if (p === "/parlay-lab" || p.startsWith("/parlay-lab/")) return "lab";
  if (p === "/results" || p.startsWith("/results/")) return "results";
  // Sport boards live under /nba, /mlb, /nhl — these are picks-class
  // surfaces (projections / player props).
  if (p === "/nba" || p.startsWith("/nba/")) return "picks";
  if (p === "/mlb" || p.startsWith("/mlb/")) return "picks";
  if (p === "/nhl" || p.startsWith("/nhl/")) return "picks";
  // Everything else (/about, /responsible-use, /trends, /world-cup/*,
  // future routes) returns null so the bottom nav shows nothing
  // highlighted. Better silent than misleading.
  return null;
}
