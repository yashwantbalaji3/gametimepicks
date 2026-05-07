import { getMeta, getSlate, getBoardForDate, getAvailableBoardDates } from "@/lib/data";
import { formatDateLong, formatTimestamp } from "@/lib/format";
import type { BoardData, DataMode, SlateDay } from "@/lib/types";
import DataSourceBadge from "@/components/data-source-badge";
import BoardWithTabs from "@/components/board-with-tabs";
import NewsletterSignup from "@/components/newsletter-signup";
import TodayAwareSlateBanner from "@/components/today-aware-slate-banner";
import { currentEtDate } from "@/lib/freshness";

export default function BoardPage() {
  const slate = getSlate();
  const meta = getMeta();

  // Phase 14: build-time guess at "today" — used as the SSR fallback for
  // date labels. Client components recompute this at hydration time
  // using the user's real ET clock, which is what makes the labels
  // accurate even when the static build is hours or days old.
  const buildTimeToday = currentEtDate();

  // Phase 7B-4 — defense in depth: if slate.json is stale (e.g. last
  // pipeline run used --days 1 to save credits) but per-day board files
  // exist on disk for other dates, surface those tabs anyway. This means
  // the user sees every date that actually has data.
  const diskDates = getAvailableBoardDates();
  const slateDateSet = new Set(slate.days.map((d) => d.date));
  const augmentedDays: SlateDay[] = [...slate.days];
  for (const date of diskDates) {
    if (slateDateSet.has(date)) continue;
    // Synthesize a minimal SlateDay from the board file. We only need
    // enough metadata for the tab strip; BoardWithTabs reads the full
    // board for the selected date separately.
    const board = getBoardForDate(date);
    augmentedDays.push({
      date,
      // Phase 14: anchor synthetic labels to today (not stale primaryDate)
      // so the SSR labels are honest. The client-side SlateTabs further
      // recomputes these after hydration with the user's real clock.
      dayLabel: dayLabelFor(date, buildTimeToday),
      isAvailable: true,
      gameCount: board.games?.length ?? 0,
      leanCount: board.leans?.length ?? 0,
      highConfidenceCount: (board.leans ?? []).filter(
        (l) => l.confidence === "High",
      ).length,
      propsAvailable:
        (board.leans ?? []).some(
          (l) =>
            !l.isDemo &&
            (l.confidence === "High" ||
              l.confidence === "Medium" ||
              l.confidence === "Low"),
        ),
      isPrimary: date === slate.primaryDate,
      // Phase 7B-4.1 — SlateDay requires non-null `scheduleSource` (string)
      // and `dataMode` (DataMode union). Boards on disk may omit these
      // (older runs, or runs that wrote partial data); fall back to safe
      // sentinel values rather than weakening the SlateDay contract.
      scheduleSource: board.scheduleSource ?? "unknown",
      oddsSource: board.oddsSource ?? null,
      oddsProviderStatus: board.oddsProviderStatus ?? null,
      isDemo: !!board.isDemo,
      dataMode: board.dataMode ?? "ScheduleUnavailable",
      failureReason:
        board.failureReason ?? board.scheduleFailureReason ?? null,
    });
  }
  augmentedDays.sort((a, b) => a.date.localeCompare(b.date));
  const augmentedSlate = { ...slate, days: augmentedDays, slateDays: augmentedDays.length };

  const boardsByDate: Record<string, BoardData> = {};
  for (const day of augmentedDays) {
    boardsByDate[day.date] = getBoardForDate(day.date);
  }

  const primaryBoard = boardsByDate[slate.primaryDate];
  const todayMode: DataMode =
    (primaryBoard?.dataMode as DataMode) || "ScheduleUnavailable";

  // Header copy reflects the actual state of Today's data
  const { eyebrow, headline, subline } = headerCopyForMode(
    todayMode,
    slate.primaryDate,
    augmentedSlate.slateDays,
    primaryBoard?.generatedAt ?? slate.generatedAt,
  );

  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-8 sm:py-12">
      <div className="reveal vault-hero-eyebrow">
        <div
          className="font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-gold)" }}
        >
          {eyebrow}
        </div>
        <h1 className="mt-2 font-display text-[28px] sm:text-[36px] md:text-[48px] tracking-tightest font-semibold leading-[1]">
          {headline}
        </h1>
        <p className="mt-3 text-[var(--text-mute)] text-[13px] sm:text-[14px] font-mono">
          {subline}
        </p>
        <p
          className="mt-4 max-w-2xl text-[12px] sm:text-[13px] leading-relaxed font-mono"
          style={{ color: "var(--vault-text-faint)" }}
        >
          NBA player props grouped by player. Each card shows up to three
          markets — points, rebounds, assists — with the model's projection,
          edge, and confidence tier. When recent log data is unavailable, the
          card says so honestly. Educational use only.
        </p>
      </div>

      <div className="mt-6 reveal reveal-d1 flex flex-wrap gap-3 items-center">
        <DataSourceBadge meta={meta} />
        <ManualOverridesBadge
          configured={slate.newsSignalsConfigured}
          activeCount={slate.newsSignalsActive}
        />
        <DataModeBadge mode={todayMode} />

        {/* Phase 13: confidence explanation moved out of the hero paragraph
            into its own clean disclosure pill. The previous inline
            <ConfidenceTooltip /> was rendering its hidden popover content
            flat into the paragraph on certain browsers. */}
        <details
          className="group inline-flex"
          style={{ color: "var(--vault-text-mute)" }}
        >
          <summary
            className="cursor-pointer list-none inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.18em] transition-colors hover:bg-[var(--vault-panel-elevated)]"
            style={{
              border: "1px solid var(--vault-border)",
              color: "var(--vault-text-mute)",
            }}
          >
            <span
              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] font-semibold"
              style={{
                background: "var(--vault-gold-dim)",
                color: "var(--vault-gold)",
                border: "1px solid var(--vault-border-strong)",
              }}
              aria-hidden
            >
              i
            </span>
            confidence
            <span
              aria-hidden
              className="ml-1 transition-transform group-open:rotate-180"
            >
              ▾
            </span>
          </summary>

          <div
            className="mt-2 absolute z-10 p-3 rounded-[3px] w-[300px] text-left"
            style={{
              background: "var(--vault-panel-elevated)",
              border: "1px solid var(--vault-border-strong)",
              color: "var(--vault-text-mute)",
              boxShadow: "0 4px 14px rgba(0, 0, 0, 0.4)",
            }}
          >
            <div className="space-y-1 font-mono text-[11px] leading-[1.55]">
              <div>
                <span style={{ color: "var(--vault-gold-bright)" }}>High</span>
                {" "}— strong edge, strong recent log
              </div>
              <div>
                <span style={{ color: "var(--vault-warn)" }}>Medium</span>
                {" "}— some edge, mixed evidence
              </div>
              <div>
                <span style={{ color: "var(--vault-text-mute)" }}>Low</span>
                {" "}— small edge, soft signal
              </div>
              <div>
                <span style={{ color: "var(--vault-text-faint)" }}>no data</span>
                {" "}— recent logs unavailable
              </div>
              <div>
                <span style={{ color: "var(--vault-text-faint)" }}>pass</span>
                {" "}— model declines below threshold
              </div>
            </div>
            <div
              className="mt-2 font-mono text-[9px] leading-[1.55]"
              style={{ color: "var(--vault-text-faint)" }}
            >
              Educational only — not betting advice.
            </div>
          </div>
        </details>
      </div>

      {/* Phase 14: today-aware staleness banner — only renders when slate
          is older than today or pipeline run is stale. Uses the user's
          real ET clock after hydration. */}
      <div className="mt-6 reveal reveal-d2">
        <TodayAwareSlateBanner
          slatePrimaryDate={slate.primaryDate}
          lastPipelineRun={meta.lastPipelineRun}
          buildTimeToday={buildTimeToday}
          dataMode={todayMode}
        />
      </div>

      <div className="mt-8 reveal reveal-d2">
        <BoardWithTabs
          slate={augmentedSlate}
          boardsByDate={boardsByDate}
          buildTimeToday={buildTimeToday}
        />
      </div>

      {/* Compact newsletter — Phase 13 */}
      <div className="mt-12 reveal reveal-d3 max-w-2xl">
        <NewsletterSignup variant="compact" />
      </div>
    </div>
  );
}

function dayLabelFor(date: string, primary: string): string {
  // Mirror the pipeline's day_label logic for synthetic slate entries.
  try {
    const t = new Date(`${date}T12:00:00Z`);
    const p = new Date(`${primary}T12:00:00Z`);
    const delta = Math.round((t.getTime() - p.getTime()) / 86400000);
    if (delta === 0) return "Today";
    if (delta === 1) return "Tomorrow";
    if (delta === -1) return "Yesterday";
    return t.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return date;
  }
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
        subline: `representative sample slate · not tonight's real games`,
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
      <span
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[2px] font-mono text-[10px] uppercase tracking-wider"
        style={{
          color: "var(--vault-text-faint)",
          border: "1px solid var(--vault-border)",
        }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: "var(--vault-text-faint)" }}
        />
        news: not configured
      </span>
    );
  }
  if (activeCount === 0) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[2px] font-mono text-[10px] uppercase tracking-wider"
        style={{
          color: "var(--vault-text-faint)",
          border: "1px solid var(--vault-border)",
        }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: "var(--vault-text-faint)" }}
        />
        news: no active signals
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[2px] font-mono text-[10px] uppercase tracking-wider"
      style={{
        color: "var(--vault-success)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: "var(--vault-success)" }}
      />
      news: {activeCount} active · manual
    </span>
  );
}

function DataModeBadge({ mode }: { mode: DataMode }) {
  const MODE_CONFIG: Record<DataMode, { color: string; label: string }> = {
    Live: { color: "var(--vault-success)", label: "live" },
    ScheduleLiveOddsUnavailable: {
      color: "var(--vault-success)",
      label: "schedule live · no odds",
    },
    NoGames: { color: "var(--vault-text-faint)", label: "no games today" },
    ScheduleUnavailable: { color: "var(--vault-danger)", label: "schedule unavailable" },
    DemoForced: { color: "var(--vault-warn)", label: "demo sample" },
  };
  const cfg = MODE_CONFIG[mode] ?? MODE_CONFIG.ScheduleUnavailable;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[2px] font-mono text-[10px] uppercase tracking-wider"
      style={{
        color: cfg.color,
        border: "1px solid var(--vault-border)",
      }}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: cfg.color }}
      />
      {cfg.label}
    </span>
  );
}
