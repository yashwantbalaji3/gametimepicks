/**
 * GameCard — compact card showing one game in the schedule strip.
 *
 * Displayed in a horizontally-scrolling row above the model board so users
 * can see today's slate at a glance.
 */
import type { ScheduleGame } from "@/lib/types";

interface Props {
  game: ScheduleGame;
}

export default function GameCard({ game }: Props) {
  const isLive = game.status === "Live";
  const isFinal = game.status === "Final";
  const statusColor = isLive
    ? "var(--lime)"
    : isFinal
    ? "var(--text-faint)"
    : "var(--text-mute)";

  return (
    <div className="surface px-4 py-3 min-w-[200px] shrink-0">
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
          {game.tipoff}
        </span>
        <span
          className="font-mono text-[10px] uppercase tracking-wider tabular"
          style={{ color: statusColor }}
        >
          {isLive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--lime)] mr-1 align-middle" />}
          {game.status}
        </span>
      </div>
      <div className="font-display text-[14px] font-semibold tracking-tight">
        <span>{game.awayTeamAbbr}</span>
        <span className="text-[var(--text-faint)] mx-1.5">@</span>
        <span>{game.homeTeamAbbr}</span>
      </div>
    </div>
  );
}
