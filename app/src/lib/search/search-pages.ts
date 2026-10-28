/**
 * PAGE ROWS FOR THE SITE SEARCH INDEX (overnight 2026-10-28 · W3).
 *
 * The page list was hand-written and had drifted from the menus: no NBA, Live, Sports, Ligue 1, Ask, Research Lab or
 * About, and "Today's Picks" / "Parlay Center" / "System status" named destinations the menus call Today / Parlays /
 * System Status ("Today's Picks" is also the one name reserved for /markets — p1-journeys.test). Every navigation
 * destination now comes from the canonical list (lib/navigation.ts) with ITS label and descriptor, so a URL carries one
 * name in search, the rail, the top bar, the phone Menu and the footer. Extra search words ride beside it, keyed by
 * URL; the pages the menus do not carry follow, and none of them may reuse a menu URL.
 */
import { NAV_DESTINATIONS } from "../navigation";

export type SearchPageRow = { label: string; sub: string; href: string; terms: string[] };

/** Words a reader might type for a destination, beyond its label — never a second name for it. */
const PAGE_TERMS: Record<string, readonly string[]> = {
  "/today/": ["slate", "daily", "tonight"],
  "/simulate/": ["simulate", "games", "game report"],
  "/markets/": ["markets", "odds", "prices"],
  /* Older names a reader may still type; the row is named "Parlays", the menus' label. */
  "/build/": ["parlay", "parlay center", "suggested parlays", "cards", "builder"],
  "/results/": ["record", "receipts", "settled"],
  "/models/": ["models", "model status", "calibration", "experiments"],
  "/nfl/": ["football"],
  "/nba/": ["basketball"],
  "/mlb/": ["baseball"],
  "/epl/": ["epl", "soccer", "football"],
  "/ufc/": ["mma", "fights"],
  "/endzone-vault/": ["touchdown", "td", "scorer"],
  "/cage-chaos/": ["ufc", "method", "round"],
  "/homer-nukes/": ["home run", "hr", "power"],
  "/bank-builder/": ["ladder", "bankroll"],
  "/moonshot/": ["longshot"],
  "/methodology/": ["method", "how it works"],
  "/learn/": ["learn", "guide", "help"],
  "/system-status/": ["status", "health"],
  "/live/": ["scores", "live scores", "in progress"],
  "/ask/": ["question", "help", "assistant"],
  "/research/": ["teams", "players", "research engine"],
};

/** Pages search lists that no menu carries. */
const EXTRA_PAGES: readonly SearchPageRow[] = [
  { label: "Forecast record", sub: "Every published forecast, measured against the result", href: "/results/forecasts/",
    terms: ["accuracy", "how accurate", "calibration", "track record", "brier", "forecast history"] },
  { label: "NBA Predicted Player Statistics", sub: "Projected player stats for each NBA slate, frozen before tip-off",
    href: "/nba/projections/", terms: ["nba", "basketball", "projections", "player stats", "player projections"] },
];

/** The export writes every page as <route>/index.html, so a search href carries the trailing slash. */
export const searchHref = (href: string): string => (href === "/" ? "/" : `${href}/`);

export function searchPageRows(): SearchPageRow[] {
  const rows: SearchPageRow[] = NAV_DESTINATIONS.map((d) => {
    const href = searchHref(d.href);
    return { label: d.label, sub: d.desc ?? "", href, terms: [...(PAGE_TERMS[href] ?? []), ...(d.note ? [d.note] : [])] };
  });
  return [...rows, ...EXTRA_PAGES.map((p) => ({ ...p, terms: [...p.terms] }))];
}
