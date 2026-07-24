/**
 * SimulationExplorer (Sprint 012 · R9) — the flagship simulation DISCOVERY surface: the whole slate as a
 * gallery of SimulationCards, so a user can browse "what does the simulation say about every game today?"
 * without opening each report.
 *
 * It is a presentation shell over the SAME canonical objects the game report and /today already use
 * (Sprint 008 full-game artifact + Sprint 009 prediction decision) — no new engine, no recomputation, and
 * no fabricated data. Games without a full-game artifact are simply absent (they still have their own
 * honest report action elsewhere); an empty slate renders an honest empty state rather than a fake grid.
 */
import SimulationCard, { type SimulationCardInput } from "@/components/entity/simulation-card";
import { buildAllGameDetails } from "@/lib/game-detail";
import { formatEtTime } from "@/lib/mlb/public-provenance";

/**
 * Derive the explorer's cards from the canonical details — ONCE, here in the component (the same pattern
 * SimulateLobby follows), never duplicated into a page file. Only games with a REAL full-game artifact
 * appear; ordering is chronological by first pitch.
 */
function explorerCards(): SimulationCardInput[] {
  return buildAllGameDetails()
    .filter((d) => d.sport === "mlb" && d.fullGameSim)
    .map((d) => ({
      slug: d.slug,
      href: `/games/mlb/${d.slug}/`,
      homeLogo: d.homeLogo ?? null,
      awayLogo: d.awayLogo ?? null,
      firstPitchLabel: formatEtTime(d.fullGameSim!.firstPitch ?? null),
      game: d.fullGameSim!,
      prediction: d.prediction ?? null,
    }))
    .sort((a, b) => (a.game.firstPitch ?? "").localeCompare(b.game.firstPitch ?? ""));
}

export default function SimulationExplorer() {
  const cards = explorerCards();
  return (
    <section aria-labelledby="simulation-explorer-h" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 id="simulation-explorer-h" className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold)", fontSize: 11 }}>
          Simulation Explorer
        </h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>
          every simulated game · outcomes and player impact
        </span>
      </div>

      {cards.length === 0 ? (
        <p className="text-[12px] m-0" style={{ color: "var(--vault-text-mute)" }}>
          No full-game simulations have been generated for this slate yet. Simulations are deterministic and
          only appear once genuinely produced — never placeholder numbers.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {cards.map((c) => (
            <SimulationCard key={c.slug} card={c} />
          ))}
        </div>
      )}

      <p className="font-mono m-0" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
        Frequencies are the share of simulated games an outcome occurred in. Predictions are the simulation&rsquo;s
        directional read — not a bet, and not a claim to out-perform the book.
      </p>
    </section>
  );
}
