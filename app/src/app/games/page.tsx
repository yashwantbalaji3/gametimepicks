/**
 * /games — kept for compatibility. Renders the shared SimulateLobby (the same component mounted at the
 * clearer user-facing /simulate route), so there is ONE source of truth for the game-simulation lobby.
 */
import SimulateLobby from "@/components/games/simulate-lobby";

export const metadata = {
  title: "Simulate Games · GameTime Picks",
  description:
    "Simulate Games — every sport's games in one board. Pick a game to run the deterministic model simulation (precomputed, same result for everyone) and see the model's picks, confidence and risk. Educational, paper-only.",
};

export default function GamesPage() {
  return <SimulateLobby />;
}
