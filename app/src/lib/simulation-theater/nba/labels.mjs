/**
 * NBA SIMULATION THEATER · LABELS — the client-safe constants (integration 2026-10-19). Pure.
 *
 * Split out of adapter-nba-sim-v1.mjs so the client island and its parts import ONLY these strings and helpers, never
 * the adapter itself: the island's chunk then carries no engine id, no artifact name and no data path (the post-build
 * export boundary, export-boundary.test.mjs, scans every exported file for exactly those). The adapter re-exports
 * everything here, so server code and tests are unchanged.
 */
export const FIXTURE_BANNER = "TEST FIXTURE — not model output";
export const LABEL_TITLES = Object.freeze({ typical: "Typical", close: "Close", high: "High-scoring", low: "Low-scoring", upset: "Upset" });

/** What the engine does not model: shown verbatim on the evidence panel and the final card. */
export const NOT_MODELLED = Object.freeze([
  "Possessions, shots, passes, rebounds as events, player movement, ball position and shot locations are not modelled.",
  "Player stats exist only as each player's game total in a sample; per-quarter player splits are not modelled.",
  "No possession arrow: who has the ball is not modelled.",
  "Score progress inside a quarter is not model output; only quarter-end scores are recorded.",
]);
export const NBA_DISCLOSURE = "SIMULATED · quarter checkpoints only · scoring between checkpoints illustrative · experimental model";

/**
 * The persistent private-candidate banner (integration 2026-10-19). Always the first thing in the NBA theater, on every
 * state including refusals; styled as a hatched notice so it can never be read as a live scoreboard.
 */
export const NBA_PRIVATE_BANNER = "EXPERIMENTAL MODEL — PRIVATE CANDIDATE · SIMULATED QUARTER SCORES · NOT A FORECAST";

/** The first sample that validated (typical when it did), or null. */
export const defaultSampleIndex = (manifest) => {
  const i = manifest?.samples?.findIndex((s) => s.validation.ok) ?? -1;
  return i < 0 ? null : i;
};
