import { getMeta, getSlate, getBoardForDate, getAvailableBoardDates } from "@/lib/data";
import { formatDateLong, formatTimestamp } from "@/lib/format";
import type { BoardData, DataMode, SlateDay } from "@/lib/types";
import DataSourceBadge from "@/components/data-source-badge";
import BoardWithTabs from "@/components/board-with-tabs";
import BoardDateStatusBanner from "@/components/board-date-status-banner";
import BoardDateRail, {
  type BoardDateEntry,
} from "@/components/board-date-rail";
import TeamGameProjectionCard from "@/components/team-game-projection-card";
import { getTeamProjectionForDate } from "@/lib/data-team-projection";
import {
  getAvailableSettlementDates,
  getSettlementForDate,
} from "@/lib/settlement-data";
import NewsletterSignup from "@/components/newsletter-signup";
import TodayAwareSlateBanner from "@/components/today-aware-slate-banner";
import NoCurrentSlate from "@/components/no-current-slate";
import NeonCornerBracket from "@/components/neon-corner-bracket";
import NbaSectionTabs from "@/components/nba/nba-section-tabs";
import SportsbookStatusBoard, {
  type StatusBoardGame,
  type StatusBoardStat,
} from "@/components/sportsbook-status-board";
import { currentEtDate } from "@/lib/freshness";
import {
  selectActiveSlate,
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
  const rawActiveSlate = selectActiveSlate(
    allBoardDates,
    buildTimeToday,
    boardsByDate,
  );
  // Off-day promotion: if "today" exists but has no games AND a future
  // date in the upcoming window has loaded leans, promote that future
  // date to the default landing. This is the May 16 / May 17 case:
  // today is an empty off-day but Sunday Game 7 has live projections —
  // surface them by default instead of an empty page.
  const activeSlate = (() => {
    if (rawActiveSlate.kind !== "today") return rawActiveSlate;
    const todayDate = rawActiveSlate.selectedDate;
    if (!todayDate) return rawActiveSlate;
    const todayBoard = boardsByDate[todayDate];
    const todayHasGames = (todayBoard?.games?.length ?? 0) > 0;
    if (todayHasGames) return rawActiveSlate;
    const futureWithLeans = rawActiveSlate.upcomingAndTodayDates
      .filter((d) => d > todayDate)
      .find((d) => (boardsByDate[d]?.leans?.length ?? 0) > 0);
    if (!futureWithLeans) return rawActiveSlate;
    return { ...rawActiveSlate, selectedDate: futureWithLeans };
  })();

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
        <div className="mb-6">
          <NbaSectionTabs />
        </div>
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
            Between slates
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
      <div className="mb-6">
        <NbaSectionTabs />
      </div>
      {/* Status banner — settled / live / upcoming / lines-pending.
          Mirrors the MLB board banner so cross-sport readers see the
          same status vocabulary on every date deep-link. */}
      {(() => {
        const selDate = activeSlate.selectedDate;
        if (!selDate) return null;
        const settled = getSettlementForDate(selDate);
        const settledRows = settled.rows ?? [];
        const isSettled = settledRows.length > 0;
        const w = settledRows.filter((r) => r.result === "win").length;
        const l = settledRows.filter((r) => r.result === "loss").length;
        const dec = w + l;
        return (
          <BoardDateStatusBanner
            date={selDate}
            gameCount={primaryBoard?.games?.length ?? 0}
            leanCount={primaryBoard?.leans?.length ?? 0}
            isSettled={isSettled}
            sport="NBA"
            settled={
              isSettled
                ? {
                    wins: w,
                    losses: l,
                    decisive: dec,
                    hitRate: dec > 0 ? w / dec : null,
                  }
                : undefined
            }
          />
        );
      })()}
      {(() => {
        const railEntries = buildNbaBoardRail(
          augmentedDays,
          buildTimeToday,
        );
        const active = activeSlate.selectedDate ?? augmentedSlate.primaryDate;
        if (!active || railEntries.length === 0) return null;
        return (
          <BoardDateRail
            entries={railEntries}
            activeDate={active}
            eyebrow="Slate · pick a date"
          />
        );
      })()}
      <div className="reveal vault-hero-eyebrow vault-data-orbit neon-corner-bracket gtp-line-scan relative overflow-hidden -mx-4 sm:-mx-8 px-4 sm:px-8 py-6 mt-4">
        <NeonCornerBracket />
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
              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[10px] font-semibold"
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
              className="mt-2 font-mono text-[10px] leading-[1.55]"
              style={{ color: "var(--vault-text-faint)" }}
            >
              Educational only — not betting advice.
            </div>
          </div>
        </details>
      </div>

      {/* Sportsbook status board — composes the primary board into an
          LED-style readout (games / projections / High confidence /
          anomalies / last refresh). Only renders when the primary board
          has games or leans; otherwise the TodayAwareSlateBanner below
          covers the off-day / refresh-pending state. */}
      {primaryBoard &&
        ((primaryBoard.games ?? []).length > 0 ||
          (primaryBoard.leans ?? []).length > 0) &&
        (() => {
          const board = primaryBoard;
          const boardGames: StatusBoardGame[] = (board.games ?? [])
            .slice(0, 6)
            .map((g) => ({
              gameId: g.gameId,
              awayTeamAbbr: g.awayTeamAbbr,
              homeTeamAbbr: g.homeTeamAbbr,
              tipoff: g.tipoff,
            }));
          const projectionsCount = (board.leans ?? []).length;
          const highCount = (board.leans ?? []).filter(
            (l) => l.confidence === "High",
          ).length;
          const anomalyCount = (board.leans ?? []).filter((l) =>
            (l.riskFlags ?? []).includes("suspicious_edge"),
          ).length;
          const stats: StatusBoardStat[] = [
            {
              label: "Projections",
              value: String(projectionsCount),
              accent: projectionsCount > 0 ? "gold" : "mute",
            },
            {
              label: "High conf",
              value: String(highCount),
              accent: highCount > 0 ? "gold" : "mute",
            },
            {
              label: "High-variance",
              value: String(anomalyCount),
              accent: anomalyCount > 0 ? "warn" : "mute",
            },
            {
              label: "Refreshed",
              value: shortTimeFromIso(
                board.generatedAt ?? slate.generatedAt,
              ),
              accent: "mute",
            },
          ];
          const selectedDateIso =
            activeSlate.selectedDate ?? slate.primaryDate;
          return (
            <div className="mt-6 reveal reveal-d2">
              <SportsbookStatusBoard
                mode="compact"
                eyebrow={`${formatDateLong(selectedDateIso)} · readout`}
                headline={
                  boardGames.length > 0
                    ? boardGames
                        .map((g) => `${g.awayTeamAbbr} @ ${g.homeTeamAbbr}`)
                        .join(" · ")
                    : "Schedule loaded · projections rendering"
                }
                stats={stats}
                steady
                footnote="Guardrails active · educational only"
              />
            </div>
          );
        })()}

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

      {(() => {
        const selDate =
          activeSlate.selectedDate ?? augmentedSlate.primaryDate;
        if (!selDate) return null;
        const artifact = getTeamProjectionForDate(selDate);
        if (!artifact || artifact.games.length === 0) return null;
        // Surface every game's team view; on most NBA playoff nights
        // there's just one game per date, so this stays compact.
        return (
          <section
            className="mt-8 reveal reveal-d2"
            aria-label="Team-view projection"
          >
            <div className="flex flex-col gap-3">
              {artifact.games.map((g) => (
                <TeamGameProjectionCard
                  key={g.gameId}
                  projection={g}
                />
              ))}
            </div>
          </section>
        );
      })()}

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
                line vs projection · signal strength · high-variance
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
                    border: "1px solid rgba(242, 54, 69, 0.30)",
                    color: "var(--vault-warn)",
                  }}
                >
                  High-variance
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

function buildNbaBoardRail(
  days: SlateDay[],
  today: string,
): BoardDateEntry[] {
  const settledDates = new Set(getAvailableSettlementDates());
  // Show recent + active dates: 4 days back from today on disk + every
  // future date. Keeps the rail scannable on mobile.
  const candidates = days
    .map((d) => d.date)
    .filter(Boolean)
    .sort();
  const filtered = candidates.filter((d) => {
    if (d >= today) return true;
    // include past dates only if they have settled data — that's the
    // useful click target ("view audit").
    return settledDates.has(d);
  });
  return filtered.map((d) => {
    if (settledDates.has(d)) {
      return {
        date: d,
        label: dayLabelFor(d, today),
        status: "settled" as const,
        href: `/results/date/${d}`,
      };
    }
    // future or today — link to board with query.
    const isToday = d === today;
    const board = days.find((x) => x.date === d);
    const hasLeans =
      (board?.leanCount ?? 0) > 0 && board?.propsAvailable;
    return {
      date: d,
      label: dayLabelFor(d, today),
      status: hasLeans
        ? ("live" as const)
        : (board?.gameCount ?? 0) > 0
          ? ("linesPending" as const)
          : ("upcoming" as const),
      href: isToday ? "/board" : `/board?date=${d}`,
    };
  });
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

/** Iteration 2: short HH:MM ET stamp for the status-board "Refreshed" cell. */
function shortTimeFromIso(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    });
  } catch {
    return "—";
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
        eyebrow: "NBA model board · live",
        headline: date,
        subline: `slate · today + ${slateDays - 1} days · generated ${generated}`,
      };

    case "ScheduleLiveOddsUnavailable":
      return {
        eyebrow: "NBA model board · schedule live · awaiting model leans",
        headline: date,
        subline: `real schedule · ${slateDays}-day slate · generated ${generated} · awaiting model leans`,
      };

    case "NoGames":
      return {
        eyebrow: "NBA model board · no games today",
        headline: date,
        subline: `no NBA games scheduled for this date · check the other tabs for upcoming games · generated ${generated}`,
      };

    case "ScheduleUnavailable":
      return {
        eyebrow: "NBA model board · refresh pending",
        headline: date,
        subline: `today's slate is being refreshed · the next scheduled update will retry shortly`,
      };

    case "DemoForced":
      return {
        eyebrow: "NBA model board · demo sample",
        headline: "Demo Sample",
        subline: `representative sample slate · not tonight's real games`,
      };

    default:
      return {
        eyebrow: "NBA model board · unknown",
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
