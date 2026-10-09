import { destinationsFor, NAV_DESTINATIONS } from "./navigation";
import { COMPETITIONS } from "./sports/catalog";
/**
 * THE ACTIVE-ROUTE RESOLVER — one answer to "where is the reader?" for every navigation surface (UX-001 phase 2).
 *
 * The top nav, the desktop rail, the phone bar and the Menu sheet each kept their own matcher, and they had drifted:
 * /simulate/* lit Simulations in the top nav but nothing in the rail, /board lit MLB on desktop and Simulations on a
 * phone, /methodology lit Learn in one and Methodology in the other, the Menu sheet used a plain prefix rule. Now every
 * surface asks `activeHref(pathname, theHrefsItCarries)`.
 *
 * HOW IT DECIDES. `ownersOf(pathname)` lists the destinations that own a path, most specific first; a surface lights
 * the first owner it actually carries. So /mlb/board lights MLB on the rail (which carries /mlb) and Sports on the phone
 * bar (which does not), and /results/nba lights the footer's NBA archive and the rail's Results — each surface honest
 * about the closest thing it has. An owner chain is:
 *   1. an explicit entry below (retired aliases mid-redirect, pages that belong to another destination), else
 *   2. every canonical destination whose path is a segment-prefix of this one, longest first, then
 *   3. Sports, for anything inside a sport hub (the catalog's competitions).
 * Home owns "/" only, never everything.
 */

export type MobileNavBucket =
  | "home"
  | "today"
  | "games"
  | "markets"
  | "lab"
  | "results"
  | "live"
  | "sports"
  | "account";

export interface MobileNavItem {
  bucket: MobileNavBucket;
  href: string;
  /** Full name. Stays the ACCESSIBLE name even when a shorter one is painted. */
  label: string;
  /** What the thumb bar paints. Falls back to `label`. */
  shortLabel: string;
}

/**
 * The phone bar's items, from the canonical list (P196). Every bar destination is also on the rail and in the footer, so
 * a phone is never the only route to a page. `shortLabel` keeps each item near its 58px basis at 390px (P185).
 */
export const MOBILE_NAV_ITEMS: ReadonlyArray<MobileNavItem> = destinationsFor("mobile").map((d) => ({
  bucket: d.bucket as MobileNavItem["bucket"],
  href: d.href,
  label: d.label,
  shortLabel: d.shortLabel ?? d.label,
}));

/**
 * Paths whose owner is not simply the destination they sit under. Matched by segment prefix, longest first.
 *   - Retired aliases light the destination they redirect to, so the bounce never flashes "nowhere"
 *     (lib/audits/route-inventory.mjs holds the redirect table; nav-resolver.test.mjs keeps the two in step).
 *     /board and /projections land on the MLB board: MLB where a surface carries it, else Simulations (the phone
 *     bar's game surfaces, P201). /events and /games are the old cross-sport game hubs: Simulations.
 *   - Learn owns the reader-education pages that are not destinations of their own on a surface; Methodology and the
 *     deep audit light themselves where a surface carries them.
 *   - Retired league routes (NHL, IPL, the completed World Cup) are league history: Sports.
 *   - /trends redirects to Results but is retired analysis, not the record: nothing.
 */
const OWNERS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["/picks", ["/build"]], ["/parlays", ["/build"]], ["/parlay-lab", ["/build"]],
  ["/mlb/parlays", ["/build"]], ["/nba/parlays", ["/build"]],
  ["/games", ["/simulate"]], ["/events", ["/simulate"]],
  ["/board", ["/mlb", "/simulate"]], ["/projections", ["/mlb", "/simulate"]],
  ["/methodology", ["/methodology", "/learn"]],
  ["/responsible-use", ["/responsible-use", "/learn"]],
  ["/results/model-audit", ["/results/model-audit", "/learn", "/results"]],
  ["/nhl", ["/sports"]], ["/ipl", ["/sports"]], ["/world-cup", ["/sports"]], ["/world-cup-specials", ["/sports"]],
  ["/trends", []],
];

const HREFS = [...new Set(NAV_DESTINATIONS.map((d) => d.href))];
const HUBS = new Set(COMPETITIONS.map((c) => c.href));

/** "/a/b/" → "/a/b"; "" and non-strings → null. */
function normalize(pathname: unknown): string | null {
  if (!pathname || typeof pathname !== "string") return null;
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}
const under = (p: string, href: string) => p === href || p.startsWith(`${href}/`);

/** The destinations that own a path, most specific first. */
export function ownersOf(pathname: string | null | undefined): readonly string[] {
  const p = normalize(pathname);
  if (!p) return [];
  if (p === "/") return ["/"];
  const explicit = OWNERS.filter(([prefix]) => under(p, prefix)).sort((a, b) => b[0].length - a[0].length)[0];
  if (explicit) return explicit[1];
  const chain = HREFS.filter((h) => h !== "/" && under(p, h)).sort((a, b) => b.length - a.length);
  if (chain.some((h) => HUBS.has(h))) chain.push("/sports");
  return chain;
}

/** The one href, among those a surface carries, that marks where the reader is — or null. */
export function activeHref(pathname: string | null | undefined, hrefs: Iterable<string>): string | null {
  const carried = new Set(hrefs);
  return ownersOf(pathname).find((h) => carried.has(h)) ?? null;
}

const BUCKET_OF = new Map(NAV_DESTINATIONS.filter((d) => d.bucket).map((d) => [d.href, d.bucket as MobileNavBucket]));

/**
 * The phone-bar bucket for a pathname: the bucket of the first owner that has one, or null (better silent than a
 * highlight on a slot that does not hold the page — /about, the paper products, retired /homer-nukes).
 */
export function resolveMobileNavBucket(pathname: string | null | undefined): MobileNavBucket | null {
  const href = activeHref(pathname, BUCKET_OF.keys());
  return href ? BUCKET_OF.get(href) ?? null : null;
}
