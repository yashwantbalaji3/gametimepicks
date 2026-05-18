import IplSectionTabs from "@/components/ipl/ipl-section-tabs";
import PowerBoardShell from "@/components/power-board-shell";

export const metadata = {
  title: "IPL Power Board · GameTime Picks",
  description:
    "High-variance IPL watch — sixes, fours, boundary strike rates. Pending stats provider wiring.",
};

export default function IplPowerBoardPage() {
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <IplSectionTabs />
      </div>
      <PowerBoardShell
        accent="warn"
        eyebrow="IPL · Sixes + boundary watch"
        headline="High-variance IPL, kept separate on purpose."
        description={
          <>
            A single over of sixes can swing a result; a finisher walking in
            for a 12-ball cameo is noisier than batter runs over a full
            innings. These signals ride a power-profile scale, never standard
            confidence tiers.
          </>
        }
        watchTitle="Sixes + boundary watch"
        watchSubtitle="Ratings will read as power profile and watch tier, never as confident lean."
        inputsPlanned={[
          "boundary strike rate",
          "match-up vs spinner / pacer",
          "venue / pitch conditions",
          "powerplay opportunity",
          "weather + dew factor",
          "death-overs role",
          "recent form vs opposition",
        ]}
        mainBoardHref="/ipl/board"
        mainBoardLabel="Open IPL Model Board"
      />
    </div>
  );
}
