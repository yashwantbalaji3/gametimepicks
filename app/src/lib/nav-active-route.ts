/**
 * Active-route resolver for the primary navigation.
 *
 * v1 architecture: the app has exactly FIVE primary destinations. Every other
 * route folds into the one of these five it belongs to, so the highlighted nav
 * item always matches what the user is looking at.
 *
 *   Home          /today        the front door (identity + proof + headline)
 *   Bank Builder  /bank-builder the flagship live $100→$10K ladder
 *   Today's Picks /picks        everything the model is playing today + build
 *   Track Record  /mr-dub       the $100→$20K journey, calendar, full ledger
 *   How It Works  /methodology  methodology · paper-only · trust
 *
 * Lives separate from the component so it can be unit tested without a React tree.
 */

export type MobileNavBucket = "home" | "bank" | "picks" | "record" | "how";

export interface MobileNavItem {
  bucket: MobileNavBucket;
  href: string;
  label: string;   // full label — desktop rail + top nav
  short: string;    // compact label — mobile bottom bar (fits 5 across at 320px)
}

/** The five primary destinations, in order. Rendered on the desktop rail + mobile bottom nav. */
export const MOBILE_NAV_ITEMS: ReadonlyArray<MobileNavItem> = [
  { bucket: "home", href: "/today", label: "Home", short: "Home" },
  { bucket: "bank", href: "/bank-builder", label: "Bank Builder", short: "Bank" },
  { bucket: "picks", href: "/picks", label: "Today's Picks", short: "Picks" },
  { bucket: "record", href: "/mr-dub", label: "Track Record", short: "Record" },
  { bucket: "how", href: "/methodology", label: "How It Works", short: "How" },
] as const;

/**
 * Returns the primary-nav bucket to highlight for a pathname, or null when the
 * route maps to nothing (render no highlight). Every secondary route folds into
 * the destination it belongs to:
 *   - the daily-play surfaces (Parlay Lab, Build), the game/board context, and
 *     the secondary lanes (Moonshot / WC Specials / Homer Nukes) → Today's Picks
 *   - all results / settled history → Track Record
 *   - methodology / about / learn / responsible-use → How It Works
 */
export function resolveMobileNavBucket(
  pathname: string | null | undefined,
): MobileNavBucket | null {
  if (!pathname || typeof pathname !== "string") return null;
  const p = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const is = (...bases: string[]) => bases.some((b) => p === b || p.startsWith(`${b}/`));

  if (p === "" || p === "/" || is("/today")) return "home";
  if (is("/bank-builder")) return "bank";
  // Track Record owns the full settled history (the cross-product results live here in v1).
  if (is("/mr-dub", "/results")) return "record";
  // How It Works is the trust / education hub.
  if (is("/methodology", "/about", "/learn", "/responsible-use")) return "how";
  // Today's Picks is the model's daily output + the build tool + game context + secondary lanes.
  if (is(
    "/picks", "/parlays", "/parlay-lab", "/build",
    "/games", "/sports", "/events", "/board", "/projections", "/trends",
    "/world-cup", "/world-cup-specials", "/mlb", "/nba", "/nhl", "/ipl", "/ufc",
    "/moonshot", "/homer-nukes",
  )) return "picks";
  return null;
}
