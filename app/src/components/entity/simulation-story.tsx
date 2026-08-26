/**
 * SimulationStory (Sprint 014 · Phase 4) — the plain-English read of one simulated game.
 *
 * Presentational ONLY. The sentences arrive fully formed from `buildSimulationStory`, the single canonical
 * derivation; this component chooses type and spacing and nothing else. It renders NOTHING when the story is
 * empty, so a game that was never simulated shows no filler.
 *
 * Both the Game Report and the Explorer card render THIS component, so the two surfaces cannot tell a reader
 * different stories about the same game.
 */
import { buildSimulationStory } from "@/lib/mlb/prediction/story";
import type { FullGameSimGame } from "@/lib/mlb/full-game/types";
import type { GamePredictionDecision } from "@/lib/mlb/prediction/types";

export default function SimulationStory({
  game,
  prediction = null,
  compact = false,
}: {
  game: FullGameSimGame;
  prediction?: GamePredictionDecision | null;
  compact?: boolean;
}) {
  const beats = buildSimulationStory(game, prediction);
  if (beats.length === 0) return null;

  return (
    <section
      aria-label="Simulation story"
      className={`rounded-[12px] ${compact ? "px-3 py-2.5" : "px-4 py-3"} flex flex-col gap-1.5`}
      style={{ background: "color-mix(in srgb, var(--vault-accent-deep) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--vault-accent-deep) 22%, transparent)" }}
    >
      <div
        className="font-mono uppercase tracking-[0.12em]"
        style={{ color: "var(--vault-success, var(--vault-accent-mint))", fontSize: compact ? 8.5 : 9 }}
      >
        Simulation story
      </div>
      {beats.map((beat) => (
        <p
          key={beat.kind}
          className="m-0 leading-relaxed"
          style={{
            color: beat.kind === "winner" ? "var(--vault-text)" : "var(--vault-text-mute)",
            fontSize: compact ? 11.5 : 12.5,
            fontWeight: beat.kind === "winner" ? 600 : 400,
          }}
        >
          {beat.text}
        </p>
      ))}
    </section>
  );
}
