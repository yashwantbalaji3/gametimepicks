import { activeMlbDate, getMlbPowerForDate } from "@/lib/data-mlb";
import MlbSectionTabs from "@/components/mlb/mlb-section-tabs";
import PowerBoardShell from "@/components/power-board-shell";

export const metadata = {
  title: "MLB Power Board · GameTime Picks",
  description:
    "Home-run analytics for MLB. Separate from the main projection board because HR markets have a different variance profile.",
};

const DEFAULT_DATE = "2026-05-16";

export default function MlbPowerBoardPage() {
  const date = activeMlbDate() ?? DEFAULT_DATE;
  const power = getMlbPowerForDate(date);
  const reasonChip = power.reason ? `state · ${power.state}` : undefined;

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <MlbSectionTabs />
      </div>
      <PowerBoardShell
        accent="warn"
        eyebrow={`MLB · HR watch · ${date}`}
        headline="Home-run analytics, kept separate on purpose."
        description={
          <>
            HR markets are far more variant than pitcher strikeouts or batter
            hits. The Power Board rates them on a power-profile scale (barrel
            + park + matchup), not standard confidence tiers, so a HR call
            never reads as a confident lean.
          </>
        }
        watchTitle="High-variance HR watch"
        watchSubtitle={
          reasonChip ? (
            <span className="font-mono uppercase tracking-[0.12em] text-[10px]">
              {reasonChip}
            </span>
          ) : undefined
        }
        inputsPlanned={
          power.inputsPlanned && power.inputsPlanned.length > 0
            ? power.inputsPlanned
            : [
                "barrel rate",
                "pitcher HR allowed",
                "handedness split",
                "park factor",
                "weather",
                "batting order position",
              ]
        }
        mainBoardHref="/mlb/board"
        mainBoardLabel="Open MLB Model Board"
      />
    </div>
  );
}
