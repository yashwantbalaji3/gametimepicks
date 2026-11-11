/**
 * GAME STATE TAG (founder acceptance 2026-11-09): every game card says which of four things a figure is, in words, so
 * colour is never the only cue —
 *   official     the frozen Official Forecast (MODEL PROJECTION)       gold, solid
 *   simulation   a hypothetical simulated game, not the forecast       green, dashed
 *   live         the score as the game is being played                 red dot, solid
 *   final        the settled, official result                          white, solid
 * Pure (no hooks); server- and client-safe. Styles: globals.css `.gtp-state-tag`. The first piece of the shared game card.
 */
export type GameState = "official" | "simulation" | "live" | "final";

export const GAME_STATE_TEXT: Readonly<Record<GameState, string>> = Object.freeze({
  official: "MODEL PROJECTION",
  simulation: "SIMULATION · hypothetical",
  live: "LIVE SCORE",
  final: "FINAL · settled",
});

export default function GameStateTag({ state }: { state: GameState }) {
  return <span className={`gtp-state-tag is-${state}`} data-game-state={state}>{GAME_STATE_TEXT[state]}</span>;
}
