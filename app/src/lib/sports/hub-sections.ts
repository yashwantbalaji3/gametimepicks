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

export type HubSport = "mlb" | "epl" | "ufc" | "nfl";

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
  ],
  epl: [
    { kind: "anchor", target: "epl-games", label: "Fixtures" },
    { kind: "link", target: "/cards/epl", label: "Products" },
    { kind: "anchor", target: "epl-fixtures", label: "Simulations" },
    { kind: "anchor", target: "schedule", label: "Model picks" },
    { kind: "anchor", target: "record", label: "Results" },
    { kind: "link", target: "/results/picks/epl", label: "Full record" },
  ],
  ufc: [
    // No signature product and no per-bout report route: the card IS the unit. Those two sections
    // are absent rather than padded, which is the honest shape of this sport today.
    { kind: "anchor", target: "ufc-games", label: "Bouts" },
    { kind: "anchor", target: "ufc-card", label: "Fight card" },
    { kind: "link", target: "/cards/ufc", label: "Products" },
    { kind: "link", target: "/results/picks/ufc", label: "Results" },
    { kind: "link", target: "/build/custom?sport=ufc", label: "Build your own" },
  ],
  nfl: [
    { kind: "anchor", target: "nfl-games", label: "Games" },
    { kind: "anchor", target: "nfl-vault", label: "Products" },
    { kind: "anchor", target: "nfl-reports", label: "Simulations" },
    { kind: "anchor", target: "nfl-markets", label: "Model picks" },
    { kind: "anchor", target: "nfl-results", label: "Results" },
    { kind: "anchor", target: "nfl-coverage", label: "Coverage" },
    { kind: "link", target: "/cards/nfl", label: "Paper cards" },
  ],
};
