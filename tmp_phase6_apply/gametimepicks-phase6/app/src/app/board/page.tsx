import { getBoard, getMeta, getSchedule } from "@/lib/data";
import { formatDateLong, formatTimestamp } from "@/lib/format";
import DataSourceBadge from "@/components/data-source-badge";
import ScheduleStrip from "@/components/schedule-strip";
import BoardClient from "@/components/board-client";

export default function BoardPage() {
  const board = getBoard();
  const meta = getMeta();
  const schedule = getSchedule();

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-12">
      {/* Header */}
      <div className="reveal">
        <div className="eyebrow">{board.isDemo ? "model board · demo snapshot" : "model board"}</div>
        <h1 className="mt-2 font-display text-[36px] md:text-[48px] tracking-tightest font-semibold leading-[1]">
          {board.isDemo ? "Sample Slate" : formatDateLong(board.generatedFor)}
        </h1>
        <p className="mt-3 text-[var(--text-mute)] text-[14px] font-mono">
          {board.isDemo
            ? <>demo snapshot · representative day · sample odds and projections, not tonight&apos;s games</>
            : <>generated {formatTimestamp(board.generatedAt)} · {board.dataSources.join(", ")} · <span className="text-[var(--lime)]">live</span></>
          }
        </p>
      </div>

      {/* Data source badge */}
      <div className="mt-6 reveal reveal-d1">
        <DataSourceBadge meta={meta} />
      </div>

      {/* Schedule strip */}
      <div className="mt-8 reveal reveal-d2">
        <ScheduleStrip schedule={schedule} />
      </div>

      {/* Filterable board */}
      <div className="reveal reveal-d3">
        <BoardClient leans={board.leans} />
      </div>
    </div>
  );
}
