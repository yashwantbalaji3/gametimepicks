/**
 * ONE NAME FOR ONE AFFORDANCE (P251 · F7).
 *
 * Four boards shipped a filter box and each wrote its own placeholder: "Player name", "Search
 * player…", "Search player or team…", "Search team or player…". Same control, same behaviour,
 * four labels — a reader who learns the pattern on one board has to re-read it on the next.
 *
 * Two strings, because there are genuinely two scopes: a board that already has team pills filters
 * players only; a flat pool filters both. Every call site also declares `type="search"` (a clear
 * button, and the right keyboard on mobile) and an aria-label, which three of the four lacked.
 */
export const SEARCH_PLAYERS = "Search players…";
export const SEARCH_PLAYERS_OR_TEAMS = "Search players or teams…";

export const SEARCH_PLAYERS_LABEL = "Search players by name";
export const SEARCH_PLAYERS_OR_TEAMS_LABEL = "Search players or teams by name";
