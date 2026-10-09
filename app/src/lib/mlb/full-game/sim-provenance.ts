/**
 * Moved verbatim from components/game/mlb-full-game-report.tsx (TRUTH-001, 2026-10-09) so the
 * simulation story (lib/simulate/presentation/mlb.ts) labels its time with the SAME rule as the report
 * header, instead of printing the slate's clock after first pitch beside a carried pregame forecast.
 */
import type { FullGameSimGame } from "./types";
import type { FullGameArtifactMeta } from "./read";

/**
 * The provenance of THIS game's simulation, from the artifact alone.
 *
 * 🔴 THE ARTIFACT'S TOP-LEVEL `generatedAt` IS NOT EVERY GAME'S GENERATION TIME, and the header
 * printed it as though it were. The producer carries a game's pregame forecast FORWARD verbatim
 * when a later run happens after its first pitch — "never regenerated and never destroyed" — and a
 * carried game keeps NO per-game timestamp. So on 2026-09-26 the slate's `generatedAt` is 21:24Z
 * while three games with 20:05–20:10Z first pitches are correctly `startedBeforeGeneration: false`,
 * and the header rendered "Simulated 5:24 PM · pregame" — a clock from after kickoff attached to a
 * forecast made before it. Each half is defensible; together they are the contradiction §7 names.
 *
 * ⚠ AND AN INSTANT COMPARISON HERE IS WORSE, NOT BETTER. My first cut fell back to
 * `generatedAt < firstPitch`, which labels exactly those three genuine pregame forecasts "after
 * first pitch". The producer's flag is the only field that knows, and re-deriving it in a component
 * makes this a second owner with strictly less information.
 */
export type SimProvenance = "PREGAME" | "PREGAME_CARRIED" | "AFTER_FIRST_PITCH" | "UNSTATED";

export function simProvenance(g: FullGameSimGame, meta: FullGameArtifactMeta | null): SimProvenance {
  const started = (g.completeness as { startedBeforeGeneration?: boolean } | null)?.startedBeforeGeneration;
  if (started === true) return "AFTER_FIRST_PITCH";
  /* An artifact written before the flag existed says nothing, so neither does this. */
  if (started !== false) return "UNSTATED";
  const gen = Date.parse(meta?.generatedAt ?? "");
  const first = Date.parse(g.firstPitch ?? "");
  if (!Number.isFinite(gen) || !Number.isFinite(first)) return "PREGAME";
  /* Pregame, but the slate's clock is a LATER run's and is not this game's. */
  return gen >= first ? "PREGAME_CARRIED" : "PREGAME";
}
