/**
 * THE CANONICAL DESTINATION LIST — one source of truth for every navigation surface.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────────────────────────
 * The site had three hand-maintained navigation lists: the top nav (13 items), the mobile bottom bar
 * (6) and the desktop command rail (17). Nothing kept them in agreement, and they had drifted into
 * genuinely different products:
 *
 *   · /build was in the mobile bar and NOT in the top nav — a destination that existed only if you
 *     happened to be on a phone.
 *   · /mr-dub sat in two surfaces under two different treatments.
 *   · the rail offered four more destinations than the top nav, so "everything" meant something
 *     different depending on the viewport.
 *
 * A reader cannot build a mental model of a site whose menu changes shape by device. So the list
 * lives here ONCE, each destination declares which surfaces carry it, and the surfaces render a
 * filtered view. Adding a page is one line, and it cannot land on one surface by accident.
 *
 * ── The four groups ─────────────────────────────────────────────────────────────────────────────
 * Ordered by the question a reader is actually asking:
 *   NOW      — what is on today, and what does the model say about it
 *   SPORTS   — take me to one sport
 *   PRODUCTS — the paper products and their bankroll
 *   RECORD   — how has any of this actually done
 */

export type NavGroup = "now" | "sports" | "products" | "record";

/** Which surfaces carry a destination. A destination must appear on at least one. */
export type NavSurface = "top" | "rail" | "mobile";

export type NavDestination = {
  href: string;
  label: string;
  group: NavGroup;
  /** Rail glyph. The rail is the only surface that shows one. */
  glyph?: string;
  /** One-line plain-English descriptor, shown in the rail. */
  desc?: string;
  surfaces: readonly NavSurface[];
  /** Mobile bottom-bar bucket key, for active-route resolution. */
  bucket?: string;
};

export const NAV_GROUP_LABEL: Record<NavGroup, string> = {
  now: "Now",
  sports: "Sports",
  products: "Products",
  record: "Track record",
};

/**
 * Every destination, in reading order within its group.
 *
 * `surfaces` is the load-bearing field. The mobile bar is deliberately the SHORTEST list — a
 * thumb-reachable bar of six — but everything it carries also exists on the other surfaces, so a
 * phone is never the only way to reach something.
 */
export const NAV_DESTINATIONS: readonly NavDestination[] = [
  // ── NOW ────────────────────────────────────────────────────────────────────────────────────────
  { href: "/today", label: "Today", group: "now", glyph: "▤", desc: "Tonight's slate at a glance",
    surfaces: ["top", "rail", "mobile"], bucket: "home" },
  { href: "/simulate", label: "Simulate", group: "now", glyph: "▶", desc: "Pick a game, run its report",
    surfaces: ["top", "rail", "mobile"], bucket: "games" },
  { href: "/markets", label: "Market Center", group: "now", glyph: "◈", desc: "Sportsbook prices vs our sims",
    surfaces: ["top", "rail"] },
  { href: "/build", label: "Build", group: "now", glyph: "✎", desc: "Build a card, or browse suggested ones",
    surfaces: ["top", "rail", "mobile"], bucket: "lab" },

  // ── SPORTS ─────────────────────────────────────────────────────────────────────────────────────
  { href: "/mlb", label: "MLB", group: "sports", glyph: "⚾", desc: "Baseball hub",
    surfaces: ["top", "rail"] },
  { href: "/nfl", label: "NFL", group: "sports", glyph: "🏈", desc: "Football hub · preseason simulations",
    surfaces: ["top", "rail"] },
  { href: "/ufc", label: "UFC", group: "sports", glyph: "🥊", desc: "Fight card + settled archive",
    surfaces: ["top", "rail"] },
  { href: "/epl", label: "Premier League", group: "sports", glyph: "⚽", desc: "Schedule · simulation pending",
    surfaces: ["top", "rail"] },
  { href: "/sports", label: "Sports · Schedules", group: "sports", glyph: "🗓", desc: "EPL · NFL · NBA · UFC schedules",
    surfaces: ["top", "rail"] },

  // ── PRODUCTS ───────────────────────────────────────────────────────────────────────────────────
  { href: "/bank-builder", label: "Bank Builder", group: "products", glyph: "▰", desc: "Conservative paper card",
    surfaces: ["top", "rail", "mobile"], bucket: "bank" },
  { href: "/moonshot", label: "Moonshot", group: "products", glyph: "🌙", desc: "High-risk paper longshots",
    surfaces: ["top", "rail", "mobile"], bucket: "moonshot" },
  // Revived 2026-08-17. The route was a retired redirect stub for six weeks because the provider
  // home-run feed it read had gone away; it now computes its own probability from StatsAPI, so it
  // is a destination again rather than a name in the archive.
  { href: "/homer-nukes", label: "Homer Nukes", group: "products", glyph: "💣", desc: "Today's five likeliest home runs",
    surfaces: ["top", "rail"] },
  { href: "/mr-dub", label: "Mr. Dub's Portfolio", group: "products", glyph: "✓", desc: "Paper bankroll journey",
    surfaces: ["top", "rail", "mobile"], bucket: "mrdub" },

  // ── RECORD ─────────────────────────────────────────────────────────────────────────────────────
  { href: "/results", label: "Results", group: "record", glyph: "≡", desc: "Settled track record",
    surfaces: ["top", "rail"] },
  { href: "/learn", label: "How It Works", group: "record", glyph: "✦", desc: "Start here",
    surfaces: ["top", "rail"] },
  { href: "/methodology", label: "Methodology", group: "record", glyph: "◳", desc: "The model, in depth",
    surfaces: ["rail"] },
  { href: "/system-status", label: "System Status", group: "record", glyph: "◉", desc: "What is running right now",
    surfaces: ["rail"] },
  { href: "/about", label: "About", group: "record", glyph: "ⓘ", desc: "What this is",
    surfaces: ["rail"] },
];

/** Destinations carried by one surface, in canonical order. */
export const destinationsFor = (surface: NavSurface): readonly NavDestination[] =>
  NAV_DESTINATIONS.filter((d) => d.surfaces.includes(surface));

/** Group boundaries, so a surface can render a heading when the group changes. */
export function groupChangedAt(list: readonly NavDestination[], index: number): NavGroup | null {
  if (index === 0) return list[0]?.group ?? null;
  return list[index]?.group !== list[index - 1]?.group ? list[index]!.group : null;
}
