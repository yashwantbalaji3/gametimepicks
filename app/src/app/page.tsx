import Link from "next/link";
import { getBoard, getBoardForDate, getLifetimeSummary, getMeta, getSlate } from "@/lib/data";
import { formatPercent } from "@/lib/format";
import type { DataMode, BoardData } from "@/lib/types";
import KpiTile from "@/components/kpi-tile";
import NewsletterSignup from "@/components/newsletter-signup";
import { currentEtDate } from "@/lib/freshness";
import { selectActiveSlate } from "@/lib/active-slate";

export default function HomePage() {
  const board = getBoard();
  // Phase 11: replaced the legacy `getHitRates()` (demo-data path) with
  // `getLifetimeSummary()` which reads real settled-data aggregates from
  // `app/public/data/results/lifetime_summary.json`. Returns null when
  // nothing has been settled yet — the UI then shows honest "—" tiles
  // with a "no settled data yet" sub instead of misleading demo numbers.
  const lifetime = getLifetimeSummary();
  const meta = getMeta();
  const slate = getSlate();

  // Phase 15: pick today's actual game count using the active-slate
  // selector. The pipeline-stamped `isPrimary` is unreliable when the
  // slate is stale — it points at whichever date the pipeline last ran
  // for, which may be days in the past. Use real today and fall back
  // gracefully to whatever upcoming/today date actually has games.
  const buildTimeToday = currentEtDate();
  const allBoardDates = slate.days.map((d) => d.date);
  const slateBoardsByDate: Record<string, BoardData> = {};
  for (const d of slate.days) {
    slateBoardsByDate[d.date] = getBoardForDate(d.date);
  }
  const activeHomeSlate = selectActiveSlate(
    allBoardDates,
    buildTimeToday,
    slateBoardsByDate,
  );

  // The "today" day for hero copy. If active is "today", use today's
  // SlateDay. If active is "upcoming", use the upcoming SlateDay. If
  // active is "no_current" or "no_data", fall through to honest empty
  // state copy below.
  const activeDate = activeHomeSlate.selectedDate;
  const todayDay = activeDate
    ? slate.days.find((d) => d.date === activeDate)
    : undefined;
  const todayMode: DataMode =
    (todayDay?.dataMode as DataMode) ||
    (board.dataMode as DataMode) ||
    "ScheduleUnavailable";

  // "Next game day" pointer: the next upcoming date AFTER the active
  // one that actually has games. Used in copy like "next slate tomorrow".
  const nextGameDay = activeHomeSlate.upcomingAndTodayDates
    .filter((d) => d !== activeDate)
    .map((d) => slate.days.find((sd) => sd.date === d))
    .find((sd) => (sd?.gameCount ?? 0) > 0);

  // Honest game counts. Only count games for the ACTIVE slate's day.
  // When no current slate exists, todayGames is 0 — and the copy
  // below will say "no current slate" rather than "0 games today".
  const todayGames = todayDay?.gameCount ?? 0;
  const isDemoMode = todayMode === "DemoForced";
  const isUnavailable = todayMode === "ScheduleUnavailable";
  const noCurrentSlate =
    activeHomeSlate.kind === "no_current" || activeHomeSlate.kind === "no_data";

  // Eyebrow string — Phase 15: honest "no current slate" when active is
  // neither today nor upcoming.
  const eyebrow = noCurrentSlate
    ? "no current slate · awaiting next refresh"
    : eyebrowForMode(
        todayMode,
        todayDay?.dayLabel ?? "Today",
        todayGames,
        slate.slateDays,
        nextGameDay,
      );

  // For board lean counts on the home page hero KPIs: only count leans
  // from the active slate's board, not the stale top-level board.json.
  const activeBoard: BoardData | undefined = activeDate
    ? slateBoardsByDate[activeDate]
    : undefined;
  const activeLeans = activeBoard?.leans ?? [];
  const leansToday = activeLeans.filter((l) => l.lean !== "No Play").length;
  const highConfidence = activeLeans.filter(
    (l) => l.lean !== "No Play" && l.confidence === "High",
  ).length;

  // For real-mode + no odds, KPI tiles label leans as "—" instead of zero
  // to communicate "props unavailable" rather than "no leans found".
  const showLeanTiles = !(
    todayMode === "ScheduleLiveOddsUnavailable" ||
    todayMode === "NoGames" ||
    todayMode === "ScheduleUnavailable"
  );

  // CTA button text per mode
  const ctaText = ctaForMode(todayMode);

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-12 md:py-20">
      {/* Hero */}
      <section className="reveal vault-hero-grid">
        <div className="eyebrow mb-5 flex items-center gap-2">
          <span className="live-dot vault-pulse" />
          {eyebrow}
        </div>
        <h1 className="font-display text-[44px] md:text-[72px] leading-[0.95] tracking-tightest font-semibold text-[var(--text)] max-w-4xl">
          Transparent model leans on{" "}
          <span style={{ color: "var(--vault-gold-bright)" }}>NBA player props.</span>
        </h1>
        <p className="mt-6 text-[var(--text-mute)] text-[16px] md:text-[18px] max-w-2xl leading-relaxed">
          GametimePicks compares model projections against sportsbook lines,
          surfaces edges with explanations, and tracks every result publicly.
          Educational analytics — not betting advice.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/board"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-[3px] bg-[var(--vault-gold)] text-[#06070A] font-medium text-[14px] tracking-tight hover:bg-[var(--vault-gold-bright)] transition-colors"
          >
            {ctaText}
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/methodology"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-[3px] border border-[var(--border-strong)] text-[var(--text)] font-medium text-[14px] tracking-tight hover:bg-[var(--hover)] transition-colors"
          >
            How the model works
          </Link>
        </div>

        {/* State-specific callouts */}
        {todayMode === "ScheduleLiveOddsUnavailable" && (
          <ScheduleLiveCallout
            todayGames={todayGames}
            primaryLabel={todayDay?.dayLabel ?? "Today"}
            manualOverride={!!meta.todayManualOverrideUsed}
          />
        )}
        {todayMode === "NoGames" && nextGameDay && (
          <NoGamesCallout next={nextGameDay} />
        )}
        {isUnavailable && (
          <ScheduleUnavailableCallout reason={meta.todayFailureReason} />
        )}
      </section>

      {/* KPI strip — different per mode */}
      <section className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile
          label={isDemoMode ? "leans in sample" : "leans today"}
          value={
            showLeanTiles ? String(leansToday) : "—"
          }
          sub={
            !showLeanTiles
              ? "awaiting model leans"
              : isDemoMode
                ? "demo data"
                : undefined
          }
          delay={1}
        />
        <KpiTile
          label={isDemoMode ? "high-conf in sample" : "high confidence"}
          value={showLeanTiles ? String(highConfidence) : "—"}
          sub={!showLeanTiles ? "awaiting model leans" : undefined}
          delay={2}
        />
        {/* Phase 11: real settled hit rate (replaces legacy demo hit_rates.json) */}
        <KpiTile
          label="settled hit rate"
          value={
            lifetime && typeof lifetime.hitRate === "number"
              ? formatPercent(lifetime.hitRate)
              : "—"
          }
          sub={
            lifetime
              ? `${lifetime.decisive} decisive · ${lifetime.totalDates} slate${lifetime.totalDates === 1 ? "" : "s"}${lifetime.smallSample ? " · small sample" : ""}`
              : "no settled slates yet"
          }
          delay={3}
        />
        <KpiTile
          label="settled wins / losses"
          value={
            lifetime
              ? `${lifetime.wins} / ${lifetime.losses}`
              : "—"
          }
          sub={
            lifetime
              ? lifetime.pushes > 0
                ? `${lifetime.pushes} push${lifetime.pushes === 1 ? "" : "es"}`
                : undefined
              : "no settled data"
          }
          delay={4}
        />
      </section>

      {/* Three-up explainer */}
      <section className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-4">
        <ExplainerCard
          n="01"
          title="Compare projection to line"
          body="For each NBA player prop, the model produces a projected stat value and over/under probability. We pull the sportsbook line and convert the odds to an implied probability."
          delay={1}
        />
        <ExplainerCard
          n="02"
          title="Quantify the edge"
          body="Edge = model probability minus implied probability. Positive edge means the model thinks the market is mispricing the prop. We surface only edges that clear a transparent threshold."
          delay={2}
        />
        <ExplainerCard
          n="03"
          title="Track every result"
          body="Every lean is logged before tipoff and settled after the box score. Hit rate, calibration, and breakdown by market and confidence tier are all public."
          delay={3}
        />
      </section>

      {/* Newsletter signup — Phase 13 */}
      <section className="mt-16 reveal">
        <NewsletterSignup variant="full" />
      </section>

      {/* Demo banner — only when DemoForced */}
      {isDemoMode && (
        <section className="mt-16 surface px-6 py-5 reveal">
          <div className="flex flex-wrap items-start gap-4">
            <div className="text-[var(--vault-warn)] font-mono text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-[2px] bg-[var(--vault-warn-dim)]">
              demo sample
            </div>
            <div className="flex-1 min-w-[280px] text-[13px] text-[var(--text-mute)] leading-relaxed">
              This deployment is showing a representative sample slate
              instead of live data. Real props and projections appear when
              the live data sources are active.
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// State-specific callouts and copy
// ---------------------------------------------------------------------------
function eyebrowForMode(
  mode: DataMode,
  dayLabel: string,
  todayGames: number,
  slateDays: number,
  nextGameDay: { dayLabel: string } | undefined,
): string {
  switch (mode) {
    case "Live":
      return `${todayGames} NBA game${todayGames === 1 ? "" : "s"} today · ${slateDays}-day slate`;
    case "ScheduleLiveOddsUnavailable":
      return `${todayGames} NBA game${todayGames === 1 ? "" : "s"} tonight · awaiting model leans`;
    case "NoGames":
      return nextGameDay
        ? `no games today · next slate ${nextGameDay.dayLabel.toLowerCase()}`
        : "no games in 4-day window";
    case "ScheduleUnavailable":
      return "refreshing the slate · check back shortly";
    case "DemoForced":
      return "demo sample · representative slate";
    default:
      return "slate unavailable";
  }
}

function ctaForMode(mode: DataMode): string {
  switch (mode) {
    case "Live":
      return "View today's board";
    case "ScheduleLiveOddsUnavailable":
      return "View today's schedule";
    case "NoGames":
      return "View 4-day slate";
    case "ScheduleUnavailable":
      return "View status";
    case "DemoForced":
      return "View the demo board";
    default:
      return "View board";
  }
}

function ScheduleLiveCallout({
  todayGames,
  primaryLabel,
}: {
  todayGames: number;
  primaryLabel: string;
  /** Preserved on the type for caller compatibility; not rendered publicly. */
  manualOverride?: boolean;
}) {
  return (
    <div
      className="mt-6 surface px-5 py-4 max-w-[680px] border-l-2"
      style={{ borderLeftColor: "var(--vault-gold)" }}
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
        {primaryLabel.toLowerCase()} · schedule live
      </div>
      <div className="mt-1 text-[14px] text-[var(--text-mute)]">
        {todayGames} NBA game{todayGames === 1 ? "" : "s"} on the schedule.
        Model leans are pending — the board will populate as the model
        finishes scoring tonight&rsquo;s matchups. Educational analytics
        only.
      </div>
    </div>
  );
}

function NoGamesCallout({ next }: { next: { dayLabel: string; gameCount: number } }) {
  return (
    <div
      className="mt-6 surface px-5 py-4 max-w-[680px] border-l-2"
      style={{ borderLeftColor: "var(--text-faint)" }}
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
        today
      </div>
      <div className="mt-1 text-[14px] text-[var(--text-mute)]">
        No NBA games scheduled for today. The next available slate is{" "}
        <span className="text-[var(--text)] font-semibold">
          {next.dayLabel}
        </span>{" "}
        with {next.gameCount} game{next.gameCount === 1 ? "" : "s"}.
      </div>
    </div>
  );
}

function ScheduleUnavailableCallout({
  reason: _reason,
}: {
  /** Preserved on the type for caller compatibility; not rendered publicly. */
  reason?: string | null;
}) {
  return (
    <div
      className="mt-6 surface px-5 py-4 max-w-[680px] border-l-2"
      style={{ borderLeftColor: "var(--vault-warn)" }}
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--vault-warn)]">
        refresh pending
      </div>
      <div className="mt-1 text-[14px] text-[var(--text-mute)]">
        Today&rsquo;s slate is refreshing. New schedule and model leans appear
        after the next scheduled update.
      </div>
    </div>
  );
}

function ExplainerCard({
  n,
  title,
  body,
  delay,
}: {
  n: string;
  title: string;
  body: string;
  delay: number;
}) {
  return (
    <div className={`surface p-6 reveal reveal-d${delay}`}>
      <div className="font-mono text-[11px] text-[var(--vault-gold-bright)] tracking-wider mb-3">
        {n}
      </div>
      <h3 className="font-display text-[20px] font-semibold tracking-tight mb-2">
        {title}
      </h3>
      <p className="text-[14px] text-[var(--text-mute)] leading-relaxed">
        {body}
      </p>
    </div>
  );
}
