import { getMeta, getSlate, getBoardForDate } from "@/lib/data";
import { formatDateLong, formatTimestamp } from "@/lib/format";
import type { BoardData } from "@/lib/types";
import DataSourceBadge from "@/components/data-source-badge";
import BoardWithTabs from "@/components/board-with-tabs";

export default function BoardPage() {
  const slate = getSlate();
  const meta = getMeta();

  // Load each board for the slate window (server-side, build-time fs read).
  const boardsByDate: Record<string, BoardData> = {};
  for (const day of slate.days) {
    boardsByDate[day.date] = getBoardForDate(day.date);
  }

  // Headline reflects the primary date's data
  const primaryBoard = boardsByDate[slate.primaryDate];
  const isDemo = primaryBoard?.isDemo ?? true;

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-12">
      {/* Header */}
      <div className="reveal">
        <div className="eyebrow">
          {isDemo ? "model board · demo snapshot" : "model board"}
        </div>
        <h1 className="mt-2 font-display text-[36px] md:text-[48px] tracking-tightest font-semibold leading-[1]">
          {isDemo ? "Sample Slate" : formatDateLong(slate.primaryDate)}
        </h1>
        <p className="mt-3 text-[var(--text-mute)] text-[14px] font-mono">
          {isDemo ? (
            <>
              demo snapshot · representative day · sample odds and projections,
              not tonight&apos;s games
            </>
          ) : (
            <>
              slate · today + {slate.slateDays - 1} days · generated{" "}
              {formatTimestamp(primaryBoard?.generatedAt ?? slate.generatedAt)}
            </>
          )}
        </p>
      </div>

      {/* Data source + manual overrides status */}
      <div className="mt-6 reveal reveal-d1 flex flex-wrap gap-3 items-center">
        <DataSourceBadge meta={meta} />
        <ManualOverridesBadge
          configured={slate.newsSignalsConfigured}
          activeCount={slate.newsSignalsActive}
        />
      </div>

      {/* Slate tabs + per-date content */}
      <div className="mt-8 reveal reveal-d2">
        <BoardWithTabs slate={slate} boardsByDate={boardsByDate} />
      </div>
    </div>
  );
}

/**
 * Inline small badge — could be its own component if reused. Shown next to
 * the data-source badge to give the operator at-a-glance feedback on whether
 * the manual overrides file is hooked up.
 */
function ManualOverridesBadge({
  configured,
  activeCount,
}: {
  configured: boolean;
  activeCount: number;
}) {
  if (!configured) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[2px] border border-[var(--border)] font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--text-faint)]" />
        news: not configured
      </span>
    );
  }
  if (activeCount === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[2px] border border-[var(--border)] font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--text-faint)]" />
        news: no active signals
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[2px] border border-[var(--border)] font-mono text-[10px] uppercase tracking-wider"
      style={{ color: "var(--lime)" }}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--lime)]" />
      news: {activeCount} active · manual
    </span>
  );
}
