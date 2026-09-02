/**
 * /simulate — the date-first, sport-first event selection destination (P209 · Release A).
 *
 * Today's view of the ONE day selector (lib/simulate/day-view). Other dates are real routes at
 * /simulate/d/[date] (same component, same selector), so date survives refresh/share/back.
 * The deeper context — how to read a simulation, the slate-wide explorer, the honest coverage
 * matrix — stays below the chooser: the page's first job is picking an event.
 */
import SimulateDay from "@/components/simulate/simulate-day";
import { buildSimulateDay } from "@/lib/simulate/day-view";
import HowToRead from "@/components/how-to-read";
import SimulationCoverageMatrix from "@/components/simulation-coverage-matrix";
import SimulationExplorer from "@/components/games/simulation-explorer";
import { currentEtDate } from "@/lib/freshness";

export const metadata = {
  title: "Simulate · GameTime Picks",
  description:
    "Pick a sport and a date, then open the event's deterministic simulation report — precomputed, so everyone sees the same result. Educational, paper-only.",
};

export default function SimulatePage() {
  const view = buildSimulateDay();
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: 24, fontWeight: 800 }}>
          Simulate
        </h1>
        <p className="m-0 max-w-[72ch]" style={{ color: "var(--vault-text-mute)", fontSize: 13, lineHeight: 1.6 }}>
          Choose a sport and a date, then open the event&rsquo;s report. {view.totals.ready} of {view.totals.events} events
          on this slate have a simulation report ready; every other state says exactly what it is.
        </p>
      </header>

      <SimulateDay view={view} />

      <HowToRead preset="simulate" title="How to read a simulation" />

      {/* Slate-wide simulated outcomes + player impact — depth AFTER the chooser. */}
      <SimulationExplorer selectedDate={currentEtDate()} />

      {/* Honest market-coverage matrix — what each sport simulates, and every gap with the reason. */}
      <SimulationCoverageMatrix />
    </div>
  );
}
