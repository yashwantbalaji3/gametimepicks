import NhlSectionTabs from "@/components/nhl/nhl-section-tabs";
import PowerBoardShell from "@/components/power-board-shell";

export const metadata = {
  title: "NHL Power Board · GameTime Picks",
  description:
    "High-variance NHL watch — goals, shot bursts, goalie pressure. Pending paid odds + per-player log wiring.",
};

export default function NhlPowerBoardPage() {
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <NhlSectionTabs />
      </div>
      <PowerBoardShell
        accent="warn"
        eyebrow="NHL · Goals + shot-volume watch"
        headline="High-variance NHL, kept separate on purpose."
        description={
          <>
            A single goal can swing a result; goalie save percentage on a
            25-shot night is wildly noisier than shots on goal itself. These
            signals ride a power-profile scale, never standard High / Medium
            / Low.
          </>
        }
        watchTitle="Goals + shot-volume watch"
        watchSubtitle="Ratings will read as power profile and watch tier, never as confident lean."
        inputsPlanned={[
          "shot bursts (last-3 vs season sog)",
          "expected goals delta",
          "goalie save percentage trend",
          "matchup pace",
          "powerplay time on ice",
          "rest days / back-to-back",
          "elimination context",
        ]}
        mainBoardHref="/nhl/board"
        mainBoardLabel="Open NHL Model Board"
      />
    </div>
  );
}
