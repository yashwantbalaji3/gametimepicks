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
 * ── The footer was the last surface off the list ─────────────────────────────────────────────────
 * P185 found it still hand-maintained, and it had drifted exactly the way the three shells had
 * before P196: it omitted UFC — a LIVE sport — along with EPL, Moonshot, Homer Nukes and Mr. Dub.
 * Its own comment justified a short Coverage column by saying schedule-only leagues should not be
 * listed, which is right and does NOT apply to sports that have real public destinations. So the
 * footer derives from here too, and the sitemap the footer promises is the site that exists.
 *
 * ── The four groups ─────────────────────────────────────────────────────────────────────────────
 * Ordered by the question a reader is actually asking:
 *   NOW      — what is on today, and what does the model say about it
 *   SPORTS   — take me to one sport
 *   PRODUCTS — the paper products and their bankroll
 *   RECORD   — how has any of this actually done
 *
 * ── The `top` band is the SIX primary destinations (P200) ───────────────────────────────────────
 * Today · Simulate · Market Center · Build · Sports · Results. The tablet header and the mobile
 * top strip had grown to seventeen items — a menu nobody can scan is a menu nobody reads. Every
 * other destination stays fully reachable on the rail (desktop) and in the footer sitemap, and the
 * sport hubs/products are one hop away via Sports/Build. Trimming a surface never removes a
 * destination from the canonical list.
 */

export type NavGroup = "now" | "sports" | "products" | "record";

/** Which surfaces carry a destination. A destination must appear on at least one. */
export type NavSurface = "top" | "rail" | "mobile" | "footer";

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
  /**
   * Coverage state, painted beside the label in the footer sitemap.
   *
   * P185: the hand-written footer annotated its sports — "MLB · live", "NBA · settled archive",
   * "Sports · schedules". Deriving the footer dropped those, and a guard caught it: a sitemap that
   * lists MLB and UFC and EPL identically implies they are the same kind of thing, and they are not.
   * The state is product truth, so it lives in the canonical list where every surface can read it
   * rather than in one surface's markup. Every value here is sourced from what the tree already
   * declares — the prior footer labels and each destination's own `desc`.
   */
  note?: string;
  /**
   * Short form for the mobile bottom bar ONLY, where six items share a thumb-width row.
   * Measured at 390px: "Mr. Dub's Portfolio" renders 132px against a 58px basis and alone caused
   * 74px of the bar's 75px overflow, leaving its own label permanently half-cut behind a hidden
   * scrollbar — an affordance nobody can see is not an affordance.
   *
   * MUST be a prefix-or-subset of `label`, never a different word: the accessible name stays the
   * full label, and WCAG 2.5.3 (Label in Name) requires the visible text to appear within it.
   */
  shortLabel?: string;
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
    surfaces: ["top", "rail", "mobile", "footer"], bucket: "home" },
  { href: "/simulate", label: "Simulate", group: "now", glyph: "▶", desc: "Pick a game, run its report",
    surfaces: ["top", "rail", "mobile", "footer"], bucket: "games" },
  { href: "/markets", label: "Market Center", group: "now", glyph: "◈", desc: "Sportsbook prices vs our sims",
    surfaces: ["top", "rail", "mobile", "footer"], bucket: "markets", shortLabel: "Market" },
  { href: "/build", label: "Build", group: "now", glyph: "✎", desc: "Build a card, or browse suggested ones",
    surfaces: ["top", "rail", "mobile", "footer"], bucket: "lab" },

  // ── SPORTS ─────────────────────────────────────────────────────────────────────────────────────
  { href: "/mlb", label: "MLB", note: "live", group: "sports", glyph: "⚾", desc: "Baseball hub",
    surfaces: ["rail", "footer"] },
  { href: "/nfl", label: "NFL", note: "preseason", group: "sports", glyph: "🏈", desc: "Football hub · preseason simulations",
    surfaces: ["rail", "footer"] },
  { href: "/ufc", label: "UFC", note: "fight card + archive", group: "sports", glyph: "🥊", desc: "Fight card + settled archive",
    surfaces: ["rail", "footer"] },
  /*
   * P185 published EPL forecasts on 2026-08-20; this entry still said "simulation pending" and
   * rendered ON /epl itself, in the rail directly above that page's own heading "Schedule + model
   * forecasts — not validated out of sample". Two contradictory claims about one page, in one
   * viewport. The state that is still true is the VALIDATION gap, not the absence of a model, so
   * that is what the note and descriptor now carry.
   */
  { href: "/epl", label: "Premier League", note: "forecasts · not validated", group: "sports", glyph: "⚽",
    desc: "Schedule + model forecasts · not validated out of sample",
    surfaces: ["rail", "footer"] },
  /* No `note`: the label already ends in "Schedules", and "Sports · Schedules · schedules" is
     what a note that repeats its own label looks like. */
  { href: "/sports", label: "Sports · Schedules", group: "sports", glyph: "🗓", desc: "EPL · NFL · NBA · UFC schedules",
    surfaces: ["top", "rail", "mobile", "footer"], bucket: "sports", shortLabel: "Sports" },

  // ── PRODUCTS ───────────────────────────────────────────────────────────────────────────────────
  { href: "/bank-builder", label: "Bank Builder", group: "products", glyph: "▰", desc: "Conservative paper card",
    surfaces: ["rail", "footer"] },
  { href: "/moonshot", label: "Moonshot", group: "products", glyph: "🌙", desc: "High-risk paper longshots",
    surfaces: ["rail", "footer"] },
  // Revived 2026-08-17. The route was a retired redirect stub for six weeks because the provider
  // home-run feed it read had gone away; it now computes its own probability from StatsAPI, so it
  // is a destination again rather than a name in the archive.
  { href: "/homer-nukes", label: "Homer Nukes", group: "products", glyph: "💣", desc: "Today's five likeliest home runs",
    surfaces: ["rail", "footer"] },
  { href: "/mr-dub", label: "Mr. Dub's Portfolio", group: "products", glyph: "✓", desc: "Paper bankroll journey",
    surfaces: ["rail", "footer"] },
  /*
   * EVERY LIVE LANE'S SIGNATURE PRODUCT, not just baseball's.
   *
   * The four entries above are all MLB. EPL and UFC have published card ladders of their own for
   * days — real posted prices, a settleable leg contract, bands from the same canonical bucket
   * function — and neither had a destination anywhere on the site. They were reachable only by
   * scrolling the sport hub, which is not a product surface.
   *
   * Deliberately NOT on `mobile`: the bottom bar is a thumb-reachable six, and everything it carries
   * has to exist elsewhere too. These live on rail/footer (P200 trimmed `top` to the six primary
   * destinations — products and sport hubs are one hop away via Sports/Build/the rail).
   *
   * Each note names what the lane actually is, and neither claims a record: both have settled
   * nothing, and the pages say so in words.
   */
  { href: "/cards/epl", label: "EPL Paper Cards", note: "market favourites", group: "products", glyph: "⚽",
    desc: "Premier League card ladder · paper-only", surfaces: ["rail", "footer"] },
  { href: "/cards/ufc", label: "UFC Paper Cards", note: "model's own read", group: "products", glyph: "🥊",
    desc: "Fight card ladder · paper-only", surfaces: ["rail", "footer"] },
  /* P201: the NFL lane earned its destination when its cards became gradeable. Market favourites,
     never the rejected model's read — the note says which, exactly as EPL's does. */
  { href: "/cards/nfl", label: "NFL Paper Cards", note: "market favourites", group: "products", glyph: "🏈",
    desc: "NFL card ladder · paper-only", surfaces: ["rail", "footer"] },

  // ── RECORD ─────────────────────────────────────────────────────────────────────────────────────
  /*
   * The Lab's OWN suggested cards, tracked separately from /results/parlays — which is saved slips,
   * cards a reader built and kept. Two different populations answering two different questions, and
   * only the second had a record page.
   */
  { href: "/results/parlay-lab", label: "Parlay Lab Record", group: "record", glyph: "▦",
    desc: "Every card the Lab suggested, all sports", surfaces: ["rail", "footer"] },
  /*
   * The other half of publishing forecasts. Every hub showed what its model predicted and almost
   * none showed how those predictions turned out — an asymmetry that always flatters, because
   * forecasts publish continuously and results publish never. ONE entry rather than four: the
   * per-sport pages are reachable from it and from each hub, and four rail items for one idea is
   * how a rail stops being read.
   */
  { href: "/results/picks", label: "Picks vs Outcomes", group: "record", glyph: "◎",
    desc: "What each model predicted, and what happened", surfaces: ["rail", "footer"] },
  { href: "/results", label: "Results", group: "record", glyph: "≡", desc: "Settled track record",
    surfaces: ["top", "rail", "mobile", "footer"], bucket: "results" },
  { href: "/learn", label: "How It Works", group: "record", glyph: "✦", desc: "Start here",
    surfaces: ["rail", "footer"] },
  { href: "/methodology", label: "Methodology", group: "record", glyph: "◳", desc: "The model, in depth",
    surfaces: ["rail", "footer"] },
  { href: "/system-status", label: "System Status", group: "record", glyph: "◉", desc: "What is running right now",
    surfaces: ["rail", "footer"] },
  { href: "/about", label: "About", group: "record", glyph: "ⓘ", desc: "What this is",
    surfaces: ["rail", "footer"] },

  // ── FOOTER-ONLY ────────────────────────────────────────────────────────────────────────────────
  /*
   * Depth, not wayfinding. These are destinations a reader goes looking for once — the market
   * glossary, the research engine, the responsible-use statement, the deep audit, the settled NBA
   * archive. Putting them in the top nav or the rail would dilute the four questions those surfaces
   * answer; leaving them OUT of the canonical list is how the footer drifted in the first place.
   */
  { href: "/results/nba", label: "NBA", note: "settled archive", group: "sports",
    desc: "NBA is HISTORICAL_ONLY — the record is real, the source is not live",
    surfaces: ["footer"] },
  { href: "/results/model-audit", label: "Deep-dive track record", group: "record",
    desc: "Every settled receipt, in depth", surfaces: ["footer"] },
  { href: "/market-guide", label: "Market Guide", group: "record",
    desc: "How to read a price", surfaces: ["footer"] },
  { href: "/research", label: "Research engine", group: "record",
    desc: "What the model is being tested against", surfaces: ["footer"] },
  { href: "/responsible-use", label: "Responsible use", group: "record",
    desc: "Paper-only, educational, no stake is ever filled", surfaces: ["footer"] },
];

/** Destinations carried by one surface, in canonical order. */
export const destinationsFor = (surface: NavSurface): readonly NavDestination[] =>
  NAV_DESTINATIONS.filter((d) => d.surfaces.includes(surface));

/** Group boundaries, so a surface can render a heading when the group changes. */
export function groupChangedAt(list: readonly NavDestination[], index: number): NavGroup | null {
  if (index === 0) return list[0]?.group ?? null;
  return list[index]?.group !== list[index - 1]?.group ? list[index]!.group : null;
}
