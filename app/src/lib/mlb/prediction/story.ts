/**
 * SIMULATION STORYTELLING LAYER (Sprint 014 · Phase 4) — turns the canonical simulation objects into a few
 * plain-English sentences a reader can understand without knowing what a percentile is.
 *
 * It is a FORMATTER, not a model. Every beat restates a value that already exists on the Sprint 008
 * full-game artifact or the Sprint 009 prediction decision:
 *
 *   winner    → game.winProbability            ("SF wins 58% of simulations")
 *   outcome   → game.finalScores[0]            ("Most common outcome: SF 4 – LAA 3")
 *   closeness → game.runDifferential.distribution  ("31% of simulations finish within one run")
 *   player    → prediction.topPlayerPredictions[0] ("Logan Webb UNDER 5.5 Strikeouts: 8,400 / 10,000")
 *
 * Nothing here simulates, re-derives a probability, or reaches for a sportsbook number. A beat whose inputs
 * are missing is OMITTED — never padded with an estimate, a placeholder, or a hedge sentence. The story can
 * therefore be empty, and an empty story renders as nothing rather than as filler.
 *
 * Copy rules: the story describes how DECIDED the simulation is, never how it compares to a book. The words
 * "edge", "value", "lock", "profitable", and "guaranteed" are banned in public copy (public-beta-safety) and
 * must never appear here — see story.test.mjs, which asserts it against real slate data.
 */
import type { FullGameSimGame } from "@/lib/mlb/full-game/types";
import type { GamePredictionDecision } from "./types";

/** Share of simulations at or above which the matchup is described as "relatively close". Documented so the
 *  adjective is a stated threshold rather than a vibe. */
export const CLOSE_GAME_THRESHOLD = 0.3;

export type StoryBeatKind = "winner" | "outcome" | "closeness" | "player";

export interface StoryBeat {
  kind: StoryBeatKind;
  text: string;
}

/** Format probability × runCount as the honest simulated frequency ("8,400 / 10,000 simulations"). */
export function simulationFrequency(probability: number, runCount: number): string | null {
  if (!Number.isFinite(probability) || !Number.isFinite(runCount) || runCount <= 0) return null;
  return `${Math.round(probability * runCount).toLocaleString()} / ${runCount.toLocaleString()} simulations`;
}

/**
 * Share of simulated games decided by one run or fewer.
 *
 * Only EXACT integer bins count. The histogram may carry range bins at its edges (`≤-8`, `8+`), whose label
 * differs from their value; a range bin cannot be attributed to a specific margin, so it is skipped rather
 * than approximated. Returns null when the distribution is absent.
 */
export function withinOneRunShare(game: FullGameSimGame): number | null {
  const bins = game.runDifferential?.distribution;
  if (!bins?.length) return null;
  let share = 0;
  for (const bin of bins) {
    if (bin.label !== String(bin.value)) continue; // range bin — not an exact margin
    if (Math.abs(bin.value) <= 1) share += bin.probability;
  }
  return share;
}

/** "SF wins 58% of simulations." Null when the simulation produced no win probability. */
function winnerBeat(game: FullGameSimGame): StoryBeat | null {
  const wp = game.winProbability;
  if (!wp) return null;
  const homeFavored = wp.home >= wp.away;
  const team = homeFavored ? game.homeTeam : game.awayTeam;
  const pct = Math.round((homeFavored ? wp.home : wp.away) * 100);
  return { kind: "winner", text: `${team} wins ${pct}% of simulations.` };
}

/** "Most common outcome: SF 4 – LAA 3 (370 / 10,000 simulations)." Null when no final scores were recorded. */
function outcomeBeat(game: FullGameSimGame): StoryBeat | null {
  const top = game.finalScores?.[0];
  if (!top) return null;
  const freq = simulationFrequency(top.probability, game.runCount);
  const score = `${game.awayTeam} ${top.away} – ${game.homeTeam} ${top.home}`;
  return { kind: "outcome", text: freq ? `Most common outcome: ${score} (${freq}).` : `Most common outcome: ${score}.` };
}

/** "This matchup is relatively close: 31% of simulations finish within one run." */
function closenessBeat(game: FullGameSimGame): StoryBeat | null {
  const share = withinOneRunShare(game);
  if (share == null) return null;
  const pct = Math.round(share * 100);
  const lead = share >= CLOSE_GAME_THRESHOLD ? "This matchup is relatively close: " : "";
  return { kind: "closeness", text: `${lead}${pct}% of simulations finish within one run.` };
}

/** "Biggest player factor: Logan Webb UNDER 5.5 Strikeouts — 8,400 / 10,000 simulations." */
function playerBeat(game: FullGameSimGame, prediction: GamePredictionDecision | null): StoryBeat | null {
  const top = prediction?.topPlayerPredictions?.[0];
  if (!top) return null;
  const freq = simulationFrequency(top.simulationProbability, game.runCount);
  const line = `${top.player} ${top.pick} ${top.line} ${top.marketLabel}`;
  return { kind: "player", text: freq ? `Biggest player factor: ${line} — ${freq}.` : `Biggest player factor: ${line}.` };
}

/**
 * Build the simulation story for one game. Deterministic and order-stable: winner → outcome → closeness →
 * player, with any beat missing its inputs simply absent. A game that was never simulated yields [].
 */
export function buildSimulationStory(
  game: FullGameSimGame,
  prediction: GamePredictionDecision | null = null,
): StoryBeat[] {
  if (game.status === "unavailable" || game.runCount <= 0) return [];
  return [winnerBeat(game), outcomeBeat(game), closenessBeat(game), playerBeat(game, prediction)].filter(
    (b): b is StoryBeat => b !== null,
  );
}
