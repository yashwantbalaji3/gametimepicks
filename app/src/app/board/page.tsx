import { getMeta, getSlate, getBoardForDate } from "@/lib/data";
import { formatDateLong, formatTimestamp } from "@/lib/format";
import type { BoardData, DataMode } from "@/lib/types";
import DataSourceBadge from "@/components/data-source-badge";
import BoardWithTabs from "@/components/board-with-tabs";

export default function BoardPage() {
  const slate = getSlate();
  const meta = getMeta();

  const boardsByDate: Record<string, BoardData> = {};
  for (const day of slate.days) {
    boardsByDate[day.date] = getBoardForDate(day.date);
  }

  const primaryBoard = boardsByDate[slate.primaryDate];
  const todayMode: DataMode =
    (primaryBoard?.dataMode as DataMode) || "ScheduleUnavailable";

  // Header copy reflects the actual state of Today's data
  const { eyebrow, headline, subline } = headerCopyForMode(
    todayMode,
    slate.primaryDate,
    slate.slateDays,
    primaryBoard?.generatedAt ?? slate.generatedAt,
  );

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-12">
      <div className="reveal">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="mt-2 font-display text-[36px] md:text-[48px] tracking-tightest font-semibold leading-[1]">
          {headline}
        </h1>
        <p className="mt-3 text-[var(--text-mute)] text-[14px] font-mono">
          {subline}
        </p>
      </div>

      <div className="mt-6 reveal reveal-d1 flex flex-wrap gap-3 items-center">
        <DataSourceBadge meta={meta} />
        <ManualOverridesBadge
          configured={slate.newsSignalsConfigured}
          activeCount={slate.newsSignalsActive}
        />
        <DataModeBadge mode={todayMode} />
      </div>

      <div className="mt-8 reveal reveal-d2">
        <BoardWithTabs slate={slate} boardsByDate={boardsByDate} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header copy — explicit per state, never claims real when demo
// ---------------------------------------------------------------------------
function headerCopyForMode(
  mode: DataMode,
  primaryDate: string,
  slateDays: number,
  generatedAt: string,
) {
  const generated = formatTimestamp(generatedAt);
  const date = formatDateLong(primaryDate);

  switch (mode) {
    case "Live":
      return {
        eyebrow: "model board · live",
        headline: date,
        subline: `slate · today + ${slateDays - 1} days · generated ${generated}`,
      };

    case "ScheduleLiveOddsUnavailable":
      return {
        eyebrow: "model board · schedule live · props not configured",
        headline: date,
        subline: `real schedule · ${slateDays}-day slate · generated ${generated} · odds API key not set`,
      };

    case "NoGames":
      return {
        eyebrow: "model board · no games today",
        headline: date,
        subline: `provider confirmed no NBA games scheduled · check tabs for upcoming dates · generated ${generated}`,
      };

    case "ScheduleUnavailable":
      return {
        eyebrow: "model board · schedule unavailable",
        headline: date,
        subline: `schedule provider failed and no manual override available · this is not a confirmed off-day`,
      };

    case "DemoForced":
      return {
        eyebrow: "model board · demo sample",
        headline: "Demo Sample",
        subline: `NBA_DATA_MODE=demo · representative slate · not tonight's real games`,
      };

    default:
      return {
        eyebrow: "model board · unknown",
        headline: "Slate Unavailable",
        subline: `unknown data mode · re-run pipeline`,
      };
  }
}

// ---------------------------------------------------------------------------
// Inline badges
// ---------------------------------------------------------------------------
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

function DataModeBadge({ mode }: { mode: DataMode }) {
  const MODE_CONFIG: Record<DataMode, { color: string; label: string }> = {
    Live: { color: "var(--lime)", label: "live" },
    ScheduleLiveOddsUnavailable: {
      color: "var(--lime)",
      label: "schedule live · no odds",
    },
    NoGames: { color: "var(--text-faint)", label: "no games today" },
    ScheduleUnavailable: { color: "var(--rose)", label: "schedule unavailable" },
    DemoForced: { color: "var(--amber)", label: "demo sample" },
  };
  const cfg = MODE_CONFIG[mode] ?? MODE_CONFIG.ScheduleUnavailable;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[2px] border border-[var(--border)] font-mono text-[10px] uppercase tracking-wider"
      style={{ color: cfg.color }}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: cfg.color }}
      />
      {cfg.label}
    </span>
  );
}
