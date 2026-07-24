/**
 * /simulate — the clean, user-facing simulation lobby. Renders the shared SimulateLobby (the SAME
 * component as /games), so there is no duplicated logic. Static-export safe; reads committed artifacts
 * only; never generates data or touches money.
 */
import SimulateLobby from "@/components/games/simulate-lobby";
import HowToRead from "@/components/how-to-read";
import SimulationCoverageMatrix from "@/components/simulation-coverage-matrix";
import SimulationExplorer from "@/components/games/simulation-explorer";

export const metadata = {
  title: "Simulate · GameTime Picks",
  description:
    "Simulate today's games — pick a game and run the deterministic model simulation (precomputed, so everyone sees the same result), then see the model's picks, confidence and risk. Educational, paper-only.",
};

export default function SimulatePage() {
  return (
    <>
      <div className="px-3 sm:px-6 lg:px-8 pt-4">
        <HowToRead preset="simulate" title="How to read a simulation" />
      </div>
      <SimulateLobby />
      {/* Simulation Explorer — the whole slate's simulated outcomes + player impact, browsable at a glance. */}
      <div className="px-3 sm:px-6 lg:px-8 pt-6">
        <SimulationExplorer />
      </div>
      {/* Honest market-coverage matrix — what each sport simulates, and every gap with the exact reason. */}
      <div className="px-3 sm:px-6 lg:px-8 pb-10 pt-6">
        <SimulationCoverageMatrix />
      </div>
    </>
  );
}
