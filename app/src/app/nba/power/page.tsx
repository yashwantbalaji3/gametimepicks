import NbaSectionTabs from "@/components/nba/nba-section-tabs";
import PowerBoardShell from "@/components/power-board-shell";

export const metadata = {
  title: "NBA Power Board · GameTime Picks",
  description:
    "High-variance NBA player watch — usage spikes, minutes volatility, rotation/news flags. Pending paid odds + per-player log wiring.",
};

export default function NbaPowerBoardPage() {
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <NbaSectionTabs />
      </div>
      <PowerBoardShell
        accent="warn"
        eyebrow="NBA · Player volatility watch"
        headline="High-variance NBA, kept separate on purpose."
        description={
          <>
            Usage spikes, role changes, and rotation volatility move NBA props
            more than any single projection model can capture. The Power Board
            will rate these signals on a power-profile scale, not High /
            Medium / Low confidence tiers.
          </>
        }
        watchTitle="Player volatility watch"
        watchSubtitle="Ratings will read as power profile and watch tier, never as a confident lean."
        inputsPlanned={[
          "usage spikes (last-3 vs season)",
          "minutes volatility",
          "injury / news flags",
          "matchup pace",
          "playoff elimination context",
          "rotation changes",
          "recent-form anomaly signal",
        ]}
        mainBoardHref="/nba/board"
        mainBoardLabel="Open NBA Model Board"
      />
    </div>
  );
}
