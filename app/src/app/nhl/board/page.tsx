import { activeNhlDate } from "@/lib/data-nhl";
import NhlBoardBody from "@/components/nhl/nhl-board-body";

export const metadata = {
  title: "NHL Model Board · GameTime Picks",
  description:
    "NHL player-prop model board — pending paid odds + per-player log wiring.",
};

const DEFAULT_DATE = "2026-05-18";

export default function NhlBoardPage() {
  const date = activeNhlDate() ?? DEFAULT_DATE;
  return <NhlBoardBody date={date} />;
}
