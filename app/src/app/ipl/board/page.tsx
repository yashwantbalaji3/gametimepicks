import { activeIplDate } from "@/lib/data-ipl";
import IplBoardBody from "@/components/ipl/ipl-board-body";

export const metadata = {
  title: "IPL Model Board · GameTime Picks",
  description:
    "IPL player-prop model board — pending a stable per-player stats source.",
};

const DEFAULT_DATE = "2026-05-18";

export default function IplBoardPage() {
  const date = activeIplDate() ?? DEFAULT_DATE;
  return <IplBoardBody date={date} />;
}
