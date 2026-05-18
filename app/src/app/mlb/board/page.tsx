import { activeMlbDate } from "@/lib/data-mlb";
import MlbBoardBody from "@/components/mlb/mlb-board-body";

export const metadata = {
  title: "MLB board · GameTime Picks",
  description:
    "Daily MLB player-prop board: pitcher strikeouts, batter hits, batter total bases. Educational analytics, not betting advice.",
};

const DEFAULT_DATE = "2026-05-16";

/**
 * /mlb/board — active/latest slate. Date-specific views live under
 * /mlb/board/<YYYY-MM-DD>. The shared body in mlb-board-body.tsx
 * handles all data states (projections / lines pending / off-day).
 */
export default function MlbBoardPage() {
  const date = activeMlbDate() ?? DEFAULT_DATE;
  return <MlbBoardBody date={date} />;
}
