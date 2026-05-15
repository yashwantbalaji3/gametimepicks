import { getMeta, getSlate, getBoardForDate, getAvailableBoardDates } from "@/lib/data";
import { formatDateLong, formatTimestamp } from "@/lib/format";
import type { BoardData, DataMode, SlateDay } from "@/lib/types";
import DataSourceBadge from "@/components/data-source-badge";
import BoardWithTabs from "@/components/board-with-tabs";
import NewsletterSignup from "@/components/newsletter-signup";
import TodayAwareSlateBanner from "@/components/today-aware-slate-banner";
import NoCurrentSlate from "@/components/no-current-slate";
import { currentEtDate } from "@/lib/freshness";
import {
  selectActiveSlate,
  activeSlateHeading,
  activeSlateSubtitle,
} from "@/lib/active-slate";

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

  // Phase 15: active-slate selection — pick today (or nearest upcoming)
  // as the default board. Past dates DO NOT become the default just
  // because they have leans. May 5 viewed on May 7 ≠ active.
  //
  // SSR uses buildTimeToday; the SlateTabs component re-evaluates client-
  // side using the user's real ET clock. The data-correctness guard here
  // protects users whose JS is disabled or who see the cached HTML.
  const allBoardDates = augmentedDays.map((d) => d.date);
  const activeSlate = selectActiveSlate(
    allBoardDates,
    buildTimeToday,
    boardsByDate,
  );

  // Build the FUTURE-AND-TODAY-ONLY slate days for the primary tab strip.
  // Past dates are hidden from the main tabs; the archive teaser inside
  // NoCurrentSlate (when applicable) and the Results page surface them.
  const upcomingSlateDays = augmentedDays.filter((d) =>
    activeSlate.upcomingAndTodayDates.includes(d.date),
  );
  const upcomingSlate = {
    ...augmentedSlate,
    days: upcomingSlateDays,
    primaryDate: activeSlate.selectedDate ?? augmentedSlate.primaryDate,
  };

  const primaryBoard = activeSlate.selectedDate
    ? boardsByDate[activeSlate.selectedDate]
    : undefined;
  const todayMode: DataMode =
    (primaryBoard?.dataMode as DataMode) || "ScheduleUnavailable";

  // Phase 15 — render path 1: only past data exists. Show the premium
  // "no current slate" state instead of resurrecting an old date.
  if (activeSlate.kind === "no_current" || activeSlate.kind === "no_data") {
    return (
      <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14">
        <div className="reveal vault-hero-eyebrow vault-data-orbit relative overflow-hidden -mx-4 sm:-mx-8 px-4 sm:px-8 py-6">
          <div
            className="vault-quiet-label"
            style={{ color: "var(--vault-gold)", letterSpacing: "0.08em" }}
          >
            Model board · NBA player props
          </div>
          <h1
            className="mt-3 vault-display-h2"
            style={{ color: "var(--vault-text)" }}
          >
            {activeSlateHeading(activeSlate)}
          </h1>
          <p
            className="mt-4 text-[14px] sm:text-[15px] max-w-2xl leading-relaxed"
            style={{ color: "var(--vault-text-mute)" }}
          >
            {activeSlateSubtitle(activeSlate)}
          </p>
        </div>

        <div className="mt-8 reveal reveal-d1 vault-rise">
          <NoCurrentSlate
            latestArchivedDate={activeSlate.latestArchivedDate}
            lastRefreshDisplay={formatTimestamp(meta.lastPipelineRun)}
          />
        </div>

        {/* Compact newsletter — Phase 13 */}
        <div className="mt-12 reveal reveal-d2 max-w-2xl">
          <NewsletterSignup variant="compact" />
        </div>
      </div>
    );
  }

  // Header copy reflects the actual state of the selected slate
  const { eyebrow, headline, subline } = headerCopyForMode(
    todayMode,
    activeSlate.selectedDate ?? augmentedSlate.primaryDate,
    upcomingSlate.slateDays,
    primaryBoard?.generatedAt ?? slate.generatedAt,
  );

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14">
      <div className="reveal vault-hero-eyebrow vault-data-orbit relative overflow-hidden -mx-4 sm:-mx-8 px-4 sm:px-8 py-6">
        <div
          className="vault-quiet-label"
          style={{ color: "var(--vault-gold)", letterSpacing: "0.08em" }}
        >
          {eyebrow}
        </div>
        <h1
          className="mt-3 vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          {headline}
        </h1>
        <p
          className="mt-3 text-[14px] sm:text-[15px]"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {subline}
        </p>
        <p
          className="mt-5 max-w-2xl text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-faint)" }}
        >
          NBA player props grouped by player. Each card shows up to three
          markets — points, rebounds, assists — with the model&apos;s
          projection, edge, and confidence tier. When recent log data is
          unavailable, the card says so honestly. Educational use only.
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
          slatePrimaryDate={activeSlate.selectedDate ?? slate.primaryDate}
          lastPipelineRun={meta.lastPipelineRun}
          buildTimeToday={buildTimeToday}
          dataMode={todayMode}
        />
      </div>

      <div className="mt-8 reveal reveal-d2">
        <BoardWithTabs
          slate={upcomingSlate}
          boardsByDate={boardsByDate}
          buildTimeToday={buildTimeToday}
        />
      </div>

      {/* "How to read these projections" — calm educational disclosure
          that pairs with the model anomaly chip + the per-card visual
          encoding. Default collapsed; never claims accuracy or advises
          a bet. */}
      <div className="mt-12 reveal reveal-d3">
        <details
          className="rounded-[5px] vault-glass overflow-hidden group"
          style={{ color: "var(--vault-text-mute)" }}
        >
          <summary
            className="flex items-center justify-between gap-4 cursor-pointer list-none px-4 sm:px-5 py-3.5 transition-colors"
          >
            <span className="inline-flex items-center gap-3">
              <span
                className="vault-quiet-label"
                style={{ color: "var(--vault-gold)", letterSpacing: "0.08em" }}
              >
                How to read these projections
              </span>
              <span
                className="text-[12px] hidden sm:inline"
                style={{ color: "var(--vault-text-faint)" }}
              >
                line vs projection · confidence · model anomalies
              </span>
            </span>
            <span
              aria-hidden
              className="font-mono text-[12px] leading-none transition-transform group-open:rotate-180"
              style={{ color: "var(--vault-text-faint)" }}
            >
              ▾
            </span>
          </summary>
          <div
            className="px-4 sm:px-5 py-5 grid gap-5 md:grid-cols-2"
            style={{
              borderTop: "1px solid var(--vault-rule)",
              color: "var(--vault-text-mute)",
            }}
          >
            <section>
              <h3
                className="font-display text-[14px] font-semibold tracking-tight mb-1.5"
                style={{ color: "var(--vault-text)" }}
              >
                Sportsbook line vs model projection
              </h3>
              <p className="text-[13px] leading-relaxed">
                Each row shows the bookmaker&apos;s line alongside the
                model&apos;s projection drawn from the player&apos;s last 10
                games and their matchup. The bar between the two numbers
                shows how far apart they sit, capped visually so a small gap
                looks small and a large gap looks large — not so a 200% edge
                feels indistinguishable from 5%.
              </p>
            </section>

            <section>
              <h3
                className="font-display text-[14px] font-semibold tracking-tight mb-1.5"
                style={{ color: "var(--vault-text)" }}
              >
                Confidence tiers
              </h3>
              <ul className="space-y-1 text-[13px] leading-relaxed">
                <li>
                  <span style={{ color: "var(--vault-gold-bright)" }}>
                    High
                  </span>{" "}
                  — strong edge with strong recent log support.
                </li>
                <li>
                  <span style={{ color: "var(--vault-warn)" }}>Medium</span>{" "}
                  — meaningful edge, mixed evidence.
                </li>
                <li>
                  <span style={{ color: "var(--vault-text-mute)" }}>Low</span>{" "}
                  — small edge or thin sample.
                </li>
                <li>
                  <span style={{ color: "var(--vault-text-faint)" }}>
                    Not enough data / Pass
                  </span>{" "}
                  — the model declines to weigh in.
                </li>
              </ul>
            </section>

            <section className="md:col-span-2">
              <h3
                className="font-display text-[14px] font-semibold tracking-tight mb-1.5 flex items-center gap-2"
                style={{ color: "var(--vault-text)" }}
              >
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-[3px] text-[10px]"
                  style={{
                    background: "var(--vault-warn-dim)",
                    border: "1px solid rgba(240, 199, 94, 0.30)",
                    color: "var(--vault-warn)",
                  }}
                >
                  Model anomaly
                </span>
                <span>What it means</span>
              </h3>
              <p className="text-[13px] leading-relaxed">
                When the model&apos;s edge crosses about 25%, that&apos;s
                usually a signal that something is off — a stale line, a
                missing rest-day adjustment, a player whose role just
                changed, or a thin recent-log sample. We cap the card&apos;s
                confidence at Low, tag the row, and present the edge in a
                calmer tone instead of gold. The projection can still be
                informative as a directional read; the headline percentage
                should not be taken at face value.
              </p>
            </section>

            <section className="md:col-span-2">
              <h3
                className="font-display text-[14px] font-semibold tracking-tight mb-1.5"
                style={{ color: "var(--vault-text)" }}
              >
                Before relying on any single number
              </h3>
              <ul className="space-y-1 text-[13px] leading-relaxed">
                <li>
                  · Sportsbook lines move. The line you see here is the line
                  at the last refresh — always check the current book.
                </li>
                <li>
                  · A projection is one model&apos;s estimate, not an
                  outcome. NBA props are noisy at the player level.
                </li>
                <li>
                  · Recent10 shows the last 10 games — useful, but it
                  doesn&apos;t know about today&apos;s rotation, foul
                  trouble, or coaching decisions.
                </li>
                <li>
                  · If you bet, line-shop, stake responsibly, and never bet
                  money you can&apos;t afford to lose.
                </li>
              </ul>
              <p
                className="mt-3 text-[11px]"
                style={{ color: "var(--vault-text-faint)" }}
              >
                Educational analysis only — not betting advice.
              </p>
            </section>
          </div>
        </details>
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
        eyebrow: "model board · schedule live · awaiting model leans",
        headline: date,
        subline: `real schedule · ${slateDays}-day slate · generated ${generated} · awaiting model leans`,
      };

    case "NoGames":
      return {
        eyebrow: "model board · no games today",
        headline: date,
        subline: `no NBA games scheduled for this date · check the other tabs for upcoming games · generated ${generated}`,
      };

    case "ScheduleUnavailable":
      return {
        eyebrow: "model board · refresh pending",
        headline: date,
        subline: `today's slate is being refreshed · the next scheduled update will retry shortly`,
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
        subline: `unknown data state · the next refresh will retry`,
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
    ScheduleUnavailable: { color: "var(--vault-warn)", label: "refresh pending" },
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
