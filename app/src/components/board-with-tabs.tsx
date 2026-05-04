"use client";

/**
 * BoardWithTabs — client wrapper that holds the selected-date state.
 *
 * The /board server page reads slate.json + each per-date board.json via fs
 * at build time and passes the lot here. This component:
 *   - Renders the SlateTabs row
 *   - Picks the right board for the selected date
 *   - Renders one of three states:
 *       1. day unavailable / demo-future  → NoGamesToday
 *       2. games but no props (live mode without odds key) → PropsUnavailable + games list
 *       3. demo with leans OR live with leans → existing BoardClient
 */
import { useState } from "react";
import type { BoardData, SlateData } from "@/lib/types";
import SlateTabs from "./slate-tabs";
import BoardClient from "./board-client";
import NoGamesToday from "./no-games-today";
import PropsUnavailable from "./props-unavailable";
import ScheduleStrip from "./schedule-strip";

interface Props {
  slate: SlateData;
  boardsByDate: Record<string, BoardData>;
}

export default function BoardWithTabs({ slate, boardsByDate }: Props) {
  const [selected, setSelected] = useState<string>(slate.primaryDate);
  const day = slate.days.find((d) => d.date === selected) ?? slate.days[0];
  const board = boardsByDate[selected];

  return (
    <>
      <SlateTabs
        days={slate.days}
        selected={selected}
        onChange={setSelected}
      />

      {/* Date is unavailable (demo-future or no schedule) */}
      {!day?.isAvailable ? (
        <NoGamesToday
          date={day?.date ?? selected}
          dayLabel={day?.dayLabel ?? "—"}
          reason={day?.isDemo ? "demo_future" : "no_schedule"}
        />
      ) : !board || board.games?.length === 0 ? (
        // Available but zero games on schedule
        <NoGamesToday
          date={selected}
          dayLabel={day.dayLabel}
          reason="no_schedule"
        />
      ) : (
        <>
          {/* Schedule strip for the selected date */}
          {board.games && board.games.length > 0 && (
            <div className="mb-6">
              <ScheduleStrip
                schedule={{
                  generatedAt: board.generatedAt,
                  source: board.scheduleSource ?? "demo",
                  isDemo: board.isDemo,
                  date: board.generatedFor,
                  games: board.games,
                }}
              />
            </div>
          )}

          {/* If we have leans, show them. Otherwise show props-unavailable. */}
          {board.leans.length > 0 ? (
            <BoardClient leans={board.leans} />
          ) : (
            <PropsUnavailable gameCount={board.games?.length ?? 0} />
          )}
        </>
      )}
    </>
  );
}
