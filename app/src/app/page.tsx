import Link from "next/link";
import { getBoard, getHitRates, getMeta, getSlate } from "@/lib/data";
import { formatPercent } from "@/lib/format";
import type { DataMode } from "@/lib/types";
import KpiTile from "@/components/kpi-tile";

export default function HomePage() {
  const board = getBoard();
  const hitRates = getHitRates();
  const meta = getMeta();
  const slate = getSlate();

  const todayDay = slate.days.find((d) => d.isPrimary) ?? slate.days[0];
  const todayMode: DataMode =
    (board.dataMode as DataMode) || (slate.dataMode as DataMode) || "ScheduleUnavailable";

  const nextGameDay = slate.days.find(
    (d) => !d.isPrimary && d.gameCount > 0,
  );

  const todayGames = todayDay?.gameCount ?? 0;
  const isDemoMode = todayMode === "DemoForced";
  const isUnavailable = todayMode === "ScheduleUnavailable";

  // Eyebrow string — explicit per state
  const eyebrow = eyebrowForMode(todayMode, todayDay?.dayLabel ?? "Today", todayGames, slate.slateDays, nextGameDay);

  const leansToday = board.leans.filter((l) => l.lean !== "No Play").length;
  const highConfidence = board.leans.filter(
    (l) => l.lean !== "No Play" && l.confidence === "High",
  ).length;
  const highConfBucket = hitRates.byConfidence.find((b) => b.label === "High");

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
      <section className="reveal">
        <div className="eyebrow mb-5 flex items-center gap-2">
          <span className="live-dot" />
          {eyebrow}
        </div>
        <h1 className="font-display text-[44px] md:text-[72px] leading-[0.95] tracking-tightest font-semibold text-[var(--text)] max-w-4xl">
          Transparent model leans on{" "}
          <span style={{ color: "var(--lime)" }}>NBA player props.</span>
        </h1>
        <p className="mt-6 text-[var(--text-mute)] text-[16px] md:text-[18px] max-w-2xl leading-relaxed">
          GametimePicks compares model projections against sportsbook lines,
          surfaces edges with explanations, and tracks every result publicly.
          Educational analytics — not betting advice.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/board"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-[3px] bg-[var(--lime)] text-[var(--bg)] font-medium text-[14px] tracking-tight hover:bg-[#B5EE52] transition-colors"
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
              ? "props not configured"
              : isDemoMode
                ? "demo data"
                : undefined
          }
          delay={1}
        />
        <KpiTile
          label={isDemoMode ? "high-conf in sample" : "high confidence"}
          value={showLeanTiles ? String(highConfidence) : "—"}
          sub={!showLeanTiles ? "props not configured" : undefined}
          delay={2}
        />
        <KpiTile
          label="sample hit rate"
          value={formatPercent(hitRates.overall.hitRate)}
          sub={
            isDemoMode
              ? "demo data"
              : `across ${hitRates.overall.total} sample leans`
          }
          delay={3}
        />
        <KpiTile
          label="high-conf sample"
          value={highConfBucket ? formatPercent(highConfBucket.hitRate) : "—"}
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

      {/* Demo banner — only when DemoForced */}
      {isDemoMode && (
        <section className="mt-16 surface px-6 py-5 reveal">
          <div className="flex flex-wrap items-start gap-4">
            <div className="text-[var(--amber)] font-mono text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-[2px] bg-[var(--amber-dim)]">
              demo sample
            </div>
            <div className="flex-1 min-w-[280px] text-[13px] text-[var(--text-mute)] leading-relaxed">
              This deployment is running on bundled demo data because{" "}
              <code className="font-mono text-[var(--text)]">
                NBA_DATA_MODE=demo
              </code>
              . Phase 7B-2 wires the real Odds API integration; for now,
              the only path that produces model leans is explicit demo mode.
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
      return `${todayGames} NBA game${todayGames === 1 ? "" : "s"} today · props not configured`;
    case "NoGames":
      return nextGameDay
        ? `no games today · next slate ${nextGameDay.dayLabel.toLowerCase()}`
        : "no games in 4-day window";
    case "ScheduleUnavailable":
      return "schedule unavailable · provider failed";
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
  manualOverride,
}: {
  todayGames: number;
  primaryLabel: string;
  manualOverride: boolean;
}) {
  return (
    <div
      className="mt-6 surface px-5 py-4 max-w-[680px] border-l-2"
      style={{ borderLeftColor: "var(--lime)" }}
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
        {primaryLabel.toLowerCase()} · live schedule
        {manualOverride && (
          <span className="ml-2 text-[var(--lime)]">· manual verified</span>
        )}
      </div>
      <div className="mt-1 text-[14px] text-[var(--text-mute)]">
        {todayGames} NBA game{todayGames === 1 ? "" : "s"} on the schedule
        {manualOverride
          ? " (operator-verified manual override)."
          : " from nba_api."}{" "}
        Player-prop scoring is unavailable until a free Odds API key is
        configured (Phase 7B-2). The board page shows the real schedule with
        a &ldquo;props unavailable&rdquo; state.
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

function ScheduleUnavailableCallout({ reason }: { reason?: string | null }) {
  return (
    <div
      className="mt-6 surface px-5 py-4 max-w-[680px] border-l-2"
      style={{ borderLeftColor: "var(--rose)" }}
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--rose)]">
        schedule unavailable
      </div>
      <div className="mt-1 text-[14px] text-[var(--text-mute)]">
        The pipeline could not confirm whether NBA games are scheduled for
        today.{" "}
        <code className="font-mono text-[12px]">nba_api</code> returned an
        error or was unreachable, and no manual schedule override exists for
        this date. This is{" "}
        <span className="text-[var(--text)] font-semibold">not</span> the
        same as &ldquo;no games today&rdquo;.
      </div>
      {reason && (
        <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
          provider error: {reason}
        </div>
      )}
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
      <div className="font-mono text-[11px] text-[var(--lime)] tracking-wider mb-3">
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
