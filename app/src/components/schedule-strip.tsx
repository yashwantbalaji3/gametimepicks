/**
 * ScheduleStrip — horizontally-scrolling row of GameCards.
 *
 * Lives at the top of /board so users can see today's slate at a glance.
 * Empty state ("No games scheduled") if the schedule is empty.
 */
import type { ScheduleData } from "@/lib/types";
import GameCard from "./game-card";

interface Props {
  schedule: ScheduleData;
}

export default function ScheduleStrip({ schedule }: Props) {
  const games = schedule.games || [];

  return (
    <section className="mb-8">
      <div className="flex items-end justify-between mb-3">
        <span className="eyebrow">today's slate</span>
        <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
          {games.length} {games.length === 1 ? "game" : "games"} · source: {schedule.source}
        </span>
      </div>

      {games.length === 0 ? (
        <div className="surface px-4 py-6 text-center text-[13px] text-[var(--text-faint)] font-mono">
          No games scheduled.
        </div>
      ) : (
        <div className="overflow-x-auto -mx-1 pb-2">
          <div className="flex gap-2 px-1 min-w-min">
            {games.map((g) => (
              <GameCard key={g.gameId} game={g} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
