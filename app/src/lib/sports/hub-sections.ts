/**
 * SPORT-HUB SECTION REGISTRY (P208 · Release C).
 *
 * One shared map of what each sport hub offers and where it lives — in-page anchors for the hub's
 * own sections, plain routes for the capabilities that live at their canonical owners (Picks,
 * Parlay Center, Results). The shared SportHubNav renders this, so every hub presents the same
 * journey vocabulary in the same order and every capability is ONE action from the hub top.
 *
 * PRESENTATION ONLY. This registry names sections; it never decides availability. Each section on
 * the page renders its own truth — content or a typed refusal — from the owners it already reads,
 * and a refusal under an anchor is a destination, not a gap. Adding a row here without a matching
 * anchor on the page fails the hub-shell guard.
 */

export type HubSport = "mlb" | "epl" | "ufc" | "nfl" | "nba";

export interface HubSection {
  /** Anchor id on the hub page (kind "anchor") or the route (kind "link"). */
  readonly target: string;
  readonly label: string;
  readonly kind: "anchor" | "link";
}

/** Ordered sections per hub: the reader's journey — orient, choose an event, go deeper. */
/**
 * THE ORDER IS THE SAME FOR ALL FOUR SPORTS, and it was not.
 *
 * These four lists grew independently and shared nothing but a component. MLB opened on "Overview",
 * EPL on "Overview" then "Fixtures", UFC on "Fight card", NFL on "This week" followed by Endzone
 * Vault, Markets, Results and Coverage. Same page, four vocabularies, four orders — a reader who
 * learned one hub learned nothing about the next, and no two sports put the games in the same place.
 *
 * Every hub now runs: the events, then the products, then the simulations, then the wider picks
 * board, then the record. The NOUN changes where the sport requires it — Games, Fixtures, Bouts —
 * and nothing else does. Sections a sport genuinely lacks are absent rather than present-and-empty;
 * `SportHubNav` also filters to anchors the page actually rendered, so a missing artifact removes a
 * strip entry instead of leaving a link into nothing.
 *
 * Existing anchor ids are preserved. They are in shipped URLs and other pages link to them, so the
 * order changed and the targets did not.
 */
export const HUB_SECTIONS: Record<HubSport, readonly HubSection[]> = {
  mlb: [
    { kind: "anchor", target: "mlb-games", label: "Games" },
    { kind: "anchor", target: "mlb-ladder", label: "Products" },
    { kind: "anchor", target: "mlb-sims", label: "Simulations" },
    { kind: "anchor", target: "mlb-board", label: "Model picks" },
    { kind: "link", target: "/results/picks/mlb", label: "Results" },
    { kind: "anchor", target: "mlb-method", label: "How it works" },
    { kind: "link", target: "/build", label: "Parlay Center" },
    // Phase A-3: the MLB route tabs folded into this one strip.
    { kind: "link", target: "/mlb/board", label: "Full board" },
    { kind: "link", target: "/homer-nukes", label: "Homer Nukes" }, // GTP-25: /mlb/power is a placeholder
    /* Session 5 · B8: the hub links the live hub for the sports /live covers, and Ask everywhere. */
    { kind: "link", target: "/live", label: "Live" },
    { kind: "link", target: "/ask", label: "Ask" },
  ],
  epl: [
    { kind: "anchor", target: "epl-games", label: "Fixtures" },
    { kind: "link", target: "/cards/epl", label: "Products" },
    { kind: "anchor", target: "epl-fixtures", label: "Simulations" },
    /* Session 5 · B8: this section is the full 2026-27 fixture list, not model picks. */
    { kind: "anchor", target: "schedule", label: "Fixture list" },
    { kind: "anchor", target: "record", label: "Results" },
    { kind: "link", target: "/results/picks/epl", label: "Full record" },
    { kind: "link", target: "/ask", label: "Ask" },
  ],
  ufc: [
    // No signature product and no per-bout report route: the card IS the unit. Those two sections
    // are absent rather than padded, which is the honest shape of this sport today.
    { kind: "anchor", target: "ufc-games", label: "Bouts" },
    { kind: "anchor", target: "ufc-card", label: "Fight card" },
    { kind: "link", target: "/cards/ufc", label: "Products" },
    { kind: "link", target: "/results/picks/ufc", label: "Results" },
    { kind: "link", target: "/build/custom?sport=ufc", label: "Build your own" },
    { kind: "link", target: "/ask", label: "Ask" },
  ],
  /* 2026-10-15 (UX audit M8): /nba was the one hub with no section strip. It is schedule-only, so it offers only
     what the page holds — games, model status, results — plus Ask (every hub links it); no product, simulation or Live
     entry it cannot back (/live has no NBA adapter). */
  nba: [
    { kind: "anchor", target: "nba-games", label: "Games" },
    { kind: "anchor", target: "nba-model-status", label: "Model status" },
    { kind: "anchor", target: "nba-results", label: "Results" },
    { kind: "link", target: "/ask", label: "Ask" },
  ],
  nfl: [
    { kind: "anchor", target: "nfl-games", label: "Games" },
    // P246: weekly top boards sit directly under the game table on /nfl.
    { kind: "anchor", target: "nfl-boards", label: "Top boards" },
    { kind: "anchor", target: "nfl-vault", label: "Products" },
    { kind: "anchor", target: "nfl-reports", label: "Simulations" },
    // "Model picks" over the sportsbook-price capture was a mislabel — those rows are the
    // books' own numbers, and the section says so. The strip now says what the reader gets.
    { kind: "anchor", target: "nfl-markets", label: "Prices" },
    { kind: "anchor", target: "nfl-results", label: "Results" },
    { kind: "anchor", target: "nfl-coverage", label: "Coverage" },
    { kind: "link", target: "/cards/nfl", label: "Paper cards" },
    { kind: "link", target: "/live", label: "Live" },
    { kind: "link", target: "/ask", label: "Ask" },
  ],
};

/** A hub section's box, in viewport pixels (getBoundingClientRect), in document order. */
export interface HubSectionBox { id: string; top: number; bottom: number }

/**
 * UXR1-15: which section the hub strip marks as current, from the sections' boxes and the "reading band" (the
 * strip's IntersectionObserver band: 20%–35% of the viewport). The strip used to remember the LAST section that
 * entered the band, so scrolling back to the top of a hub left e.g. "Results" highlighted over the hero.
 *
 * - The first section overlapping the band is current.
 * - Above the first section (the hero, the page top) nothing is current.
 * - In a gap between sections, or past the last one, the last section that began above the band stays current.
 */
export function currentHubSection(sections: readonly HubSectionBox[], bandTop: number, bandBottom: number): string | null {
  const boxes = [...sections].sort((a, b) => a.top - b.top);
  const hit = boxes.find((s) => s.top < bandBottom && s.bottom > bandTop);
  if (hit) return hit.id;
  if (boxes.length === 0 || boxes[0].top >= bandBottom) return null;
  const above = boxes.filter((s) => s.top < bandTop);
  return above.length ? above[above.length - 1].id : null;
}
