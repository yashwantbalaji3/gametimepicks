/**
 * HOMEPAGE GAME ANSWERS (Sprint 015 · Phase 1). The homepage used to show that simulations EXIST — a count,
 * a badge, a "Generate Simulation" button — without ever stating what any of them concluded. This turns each
 * featured card into the answer it already had:
 *
 *   prediction → who wins, and how often          (prediction.moneyline)
 *   score      → the single most common final     (fullGameSim.finalScores[0])
 *   story      → how close it stays               (the canonical story layer's closeness beat)
 *
 * A pure lookup + format over the SAME canonical objects the report, /today and the Explorer read. It runs no
 * simulation, ranks nothing, and re-derives no probability. A game whose canonical objects are missing simply
 * carries null fields, and the card falls back to what it showed before — never a fabricated answer.
 */
import { buildSimulationStory, simulationFrequency } from "@/lib/mlb/prediction/story";
import type { FullGameSimGame } from "@/lib/mlb/full-game/types";
import type { GamePredictionDecision } from "@/lib/mlb/prediction/types";

/** The answer fields a featured card can show. Every one is nullable — absent data renders as absent. */
export interface HomeGameAnswer {
  slug: string;
  /** "SF wins 58% of simulations" — the prediction stated as an answer. */
  prediction: string | null;
  /** "5,820 / 10,000 simulations" — the frequency behind it. */
  frequency: string | null;
  /** "LAA 3 – SF 4" — the single most common simulated final. */
  mostLikelyScore: string | null;
  /** One line on how close the game stays. The winner and score are their own fields, so the story adds the
   *  uncertainty dimension rather than repeating them. */
  story: string | null;
}

/** The minimal shape this builder needs from a game detail — kept structural so it is trivially testable. */
export interface AnswerSource {
  slug: string;
  fullGameSim?: FullGameSimGame | null;
  prediction?: GamePredictionDecision | null;
}

/** Build one game's answers. Returns all-null fields when the canonical objects are absent or unsimulated. */
export function buildHomeGameAnswer(source: AnswerSource): HomeGameAnswer {
  const empty: HomeGameAnswer = { slug: source.slug, prediction: null, frequency: null, mostLikelyScore: null, story: null };
  const sim = source.fullGameSim;
  if (!sim || sim.status === "unavailable" || sim.runCount <= 0) return empty;

  const ml = source.prediction?.moneyline ?? null;
  const top = sim.finalScores?.[0] ?? null;
  // The story layer is the ONE place a sentence about this game is composed; take its closeness beat.
  const closeness = buildSimulationStory(sim, source.prediction ?? null).find((b) => b.kind === "closeness");

  return {
    slug: source.slug,
    prediction: ml ? `${ml.team} wins ${Math.round(ml.simulationProbability * 100)}% of simulations` : null,
    frequency: ml ? simulationFrequency(ml.simulationProbability, sim.runCount) : null,
    mostLikelyScore: top ? `${sim.awayTeam} ${top.away} – ${sim.homeTeam} ${top.home}` : null,
    story: closeness?.text ?? null,
  };
}

/**
 * Index the answers by slug so a presentational card can look itself up without re-deriving anything.
 * Deterministic: one entry per source, last write wins on a duplicate slug.
 */
export function buildHomeGameAnswers(sources: AnswerSource[]): Record<string, HomeGameAnswer> {
  const out: Record<string, HomeGameAnswer> = {};
  for (const s of sources) out[s.slug] = buildHomeGameAnswer(s);
  return out;
}
