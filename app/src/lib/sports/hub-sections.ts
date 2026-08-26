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
export const HUB_SECTIONS: Record<HubSport, readonly HubSection[]> = {
  mlb: [
    { kind: "anchor", target: "mlb-overview", label: "Overview" },
    { kind: "anchor", target: "mlb-board", label: "Today's board" },
    { kind: "anchor", target: "mlb-sims", label: "Simulations" },
    { kind: "anchor", target: "mlb-ladder", label: "Suggested cards" },
    { kind: "anchor", target: "mlb-method", label: "How it works" },
    { kind: "link", target: "/markets", label: "Picks" },
    { kind: "link", target: "/build", label: "Parlay Center" },
    { kind: "link", target: "/results/picks/mlb", label: "Results" },
  ],
  epl: [
    { kind: "anchor", target: "epl-overview", label: "Overview" },
    { kind: "anchor", target: "epl-fixtures", label: "Fixtures" },
    { kind: "anchor", target: "record", label: "Record" },
    { kind: "anchor", target: "schedule", label: "Schedule" },
    { kind: "link", target: "/cards/epl", label: "Paper cards" },
    { kind: "link", target: "/results/picks/epl", label: "Results" },
  ],
  ufc: [
    { kind: "anchor", target: "ufc-overview", label: "Overview" },
    { kind: "anchor", target: "ufc-card", label: "Fight card" },
    { kind: "link", target: "/cards/ufc", label: "Paper cards" },
    { kind: "link", target: "/build/custom?sport=ufc", label: "Build your own" },
    { kind: "link", target: "/results/picks/ufc", label: "Results" },
  ],
  nfl: [
    { kind: "anchor", target: "nfl-slate", label: "This week" },
    { kind: "anchor", target: "nfl-vault", label: "Endzone Vault" },
    { kind: "anchor", target: "nfl-markets", label: "Markets" },
    { kind: "anchor", target: "nfl-results", label: "Results" },
    { kind: "anchor", target: "nfl-coverage", label: "Coverage" },
    { kind: "link", target: "/cards/nfl", label: "Paper cards" },
    { kind: "link", target: "/results/picks/nfl", label: "Picks record" },
  ],
};
