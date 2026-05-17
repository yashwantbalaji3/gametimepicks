/**
 * Phase 8 — Results page.
 *
 * Reads the real settlement data from pipeline/validation/ written by
 * `python -m pipeline.settle_results --date <date>`.
 *
 * Three states:
 *
 *   1. NO settled data on disk yet         → polished empty state
 *      (the default for a fresh deploy)
 *
 *   2. Settled data exists                 → lifetime summary tile +
 *                                             per-date selector + the
 *                                             newest date's full
 *                                             comparison report rendered
 *
 *   3. Pre-7C demo path                    → still supported via the
 *                                             old hit_rates.json loader
 *                                             but only as a fallback
 *                                             when no real settled data
 *                                             exists. (Current state on
 *                                             your machine: no settled
 *                                             data yet → shows empty
 *                                             state, NOT the demo.)
 *
 * Honest framing throughout: "early validation", "small sample", no
 * profitability language, no ROI, hit rate excludes pushes from the
 * denominator (standard convention) and clearly states so.
 */
import {
  getLifetimeSummary,
  getLatestSettlement,
  getAvailableSettlementDates,
  type ComparisonReport,
} from "@/lib/settlement-data";
import {
  getBoardForDate,
  getAvailableBoardDates,
} from "@/lib/data";
import { getMlbLifetimeSummary } from "@/lib/data-mlb-results";
import { formatPercent } from "@/lib/format";
import Link from "next/link";
import EmptyResultsCard from "@/components/empty-results-card";
import NewsletterSignup from "@/components/newsletter-signup";
import ResultsBreakdown from "@/components/results-breakdown";
import NeonCornerBracket from "@/components/neon-corner-bracket";
import AwaitingSettlementTable from "@/components/awaiting-settlement-table";
import CalibrationRoadmap, {
  type CalibrationDay,
} from "@/components/calibration-roadmap";
import PerGameScorecard from "@/components/per-game-scorecard";
import AnomalyGuardrailPanel from "@/components/anomaly-guardrail-panel";
import ParlayResultsDisclosure from "@/components/parlay-results-disclosure";
import { getPlayoffContext } from "@/components/playoff-context";

/**
 * Walk available board dates newest-first and return the first one
 * that already has scored leans. Used to point the empty-state CTA at
 * the most useful live slate the user can actually look at.
 */
function findLatestScoredBoardDate(): string | null {
  const dates = getAvailableBoardDates().slice().sort().reverse();
  for (const d of dates) {
    const b = getBoardForDate(d);
    const hasScored = (b.leans ?? []).some(
      (l) =>
        typeof l.projection === "number" &&
        typeof l.edgePct === "number" &&
        Number.isFinite(l.edgePct),
    );
    if (hasScored) return d;
  }
  return null;
}

export default function ResultsPage() {
  const lifetime = getLifetimeSummary();
  const latest = getLatestSettlement();
  const allDates = getAvailableSettlementDates();
  const latestScoredDate = findLatestScoredBoardDate();

  // MLB sport-state — drives the chip strip + future MLB link.
  const mlbLifetime = getMlbLifetimeSummary();
  const mlbState: "pending" | "live" | "partial" = !mlbLifetime
    ? "pending"
    : mlbLifetime.partial
      ? "partial"
      : "live";

  // No settled data anywhere → polished empty state.
  if (lifetime.totalSettled === 0 || latest === null) {
    return <ResultsEmptyShell latestScoredDate={latestScoredDate} mlbState={mlbState} />;
  }

  // Load the live board for the most recently settled date so we can
  // cross-reference riskFlags for the guardrail audit and pass games
  // into the per-game scorecard for friendly matchup + tipoff labels.
  const latestBoard = getBoardForDate(latest.date);
  const boardLeans = latestBoard.leans ?? [];
  const boardGames = latestBoard.games ?? [];

  // Build a friendly per-game label map for ResultsBreakdown's byGame
  // bucket. "0042500206" → "Eastern Conf Semis · Game 6 · DET @ CLE".
  const gameLabelMap: Record<string, string> = {};
  for (const g of boardGames) {
    if (!g.gameId) continue;
    const ctx = getPlayoffContext(g.gameId, g.awayTeamAbbr, g.homeTeamAbbr);
    if (ctx.isPlayoffs) {
      gameLabelMap[g.gameId] = ctx.compactLabel;
    } else if (g.awayTeamAbbr && g.homeTeamAbbr) {
      gameLabelMap[g.gameId] = `${g.awayTeamAbbr} @ ${g.homeTeamAbbr}`;
    }
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-8 sm:py-12">
      {/* Hero — model audit headline. Reads as a sportsbook scoreboard
          marquee with the lifetime hit rate front and center. */}
      <section className="reveal vault-data-orbit neon-corner-bracket gtp-line-scan relative overflow-hidden -mx-4 sm:-mx-6 px-4 sm:px-6 pt-6 pb-4">
        <NeonCornerBracket />
        <div className="flex items-center gap-2 mb-3">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
            style={{
              background: "var(--vault-gold-bright)",
              boxShadow: "0 0 8px rgba(240, 199, 94, 0.6)",
            }}
          />
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-gold)", fontSize: 10 }}
          >
            Model audit · graded against final box scores
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <h1
            className="font-display font-semibold tracking-tightest leading-[0.95]"
            style={{
              color: "var(--vault-gold-bright)",
              fontSize: "clamp(48px, 10vw, 96px)",
              textShadow:
                "0 0 24px rgba(240, 199, 94, 0.45), 0 0 8px rgba(212, 175, 55, 0.55)",
            }}
          >
            {lifetime.hitRate !== null
              ? formatPercent(lifetime.hitRate)
              : "—"}
          </h1>
          <span
            className="font-display tracking-tight"
            style={{
              color: "var(--vault-text)",
              fontSize: "clamp(18px, 2.6vw, 22px)",
            }}
          >
            hit rate · {lifetime.wins}–{lifetime.losses}
            {lifetime.pushes > 0 ? `–${lifetime.pushes}P` : ""} on{" "}
            <span style={{ color: "var(--vault-gold-bright)" }}>
              {lifetime.decisive}
            </span>{" "}
            decisive picks
          </span>
        </div>
        <p
          className="mt-4 text-[14px] leading-relaxed max-w-2xl"
          style={{ color: "var(--vault-text-mute)" }}
        >
          Every model lean is logged at generation time and graded
          against the verified box score after the game. {lifetime.totalDates}{" "}
          {lifetime.totalDates === 1 ? "slate" : "slates"} settled
          {lifetime.newestDate ? ` · most recent: ${lifetime.newestDate}` : ""}.
          The audit below covers NBA props; MLB grades land once the first
          MLB slate finishes. Hit rate excludes pushes and No Plays.
          Educational analytics — not betting advice.
        </p>
      </section>

      {/* Sport tabs — keeps the sport context legible. NBA is live with
          a graded slate; MLB grades arrive once settlement is wired. */}
      <SportAuditTabs activeSport="NBA" mlbState={mlbState} />

      {/* Honesty banner */}
      {lifetime.smallSample && (
        <aside
          className="mt-6 px-4 py-3 rounded-[3px] flex items-start gap-3"
          style={{
            background: "var(--vault-warn-dim)",
            border: "1px solid rgba(240, 199, 94, 0.30)",
          }}
        >
          <span
            className="font-mono text-[10px] uppercase tracking-wider shrink-0 mt-0.5"
            style={{ color: "var(--vault-warn)" }}
          >
            small sample
          </span>
          <p
            className="font-mono text-[12px] leading-relaxed"
            style={{ color: "var(--vault-text-mute)" }}
          >
            {lifetime.decisive} decisive picks is below the ~25-pick floor where
            hit rates start to be statistically meaningful. Treat these numbers
            as descriptive, not predictive. Real validation requires many more
            settled slates.
          </p>
        </aside>
      )}

      {/* Lifetime KPI strip */}
      <section className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiTile label="settled" value={String(lifetime.totalSettled)} />
        <KpiTile
          label="wins"
          value={String(lifetime.wins)}
          accent="success"
        />
        <KpiTile
          label="losses"
          value={String(lifetime.losses)}
          accent="danger"
        />
        <KpiTile label="pushes" value={String(lifetime.pushes)} />
      </section>

      {/* Available dates */}
      {allDates.length > 1 && (
        <section className="mt-8">
          <SectionHeading>settled dates</SectionHeading>
          <div className="mt-3 flex flex-wrap gap-2">
            {allDates.map((d) => (
              <span
                key={d}
                className="px-2.5 py-1 rounded-[2px] font-mono text-[11px] tracking-wider uppercase"
                style={{
                  color: d === latest.date ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
                  background:
                    d === latest.date ? "var(--vault-gold-dim)" : "var(--vault-panel-elevated)",
                  border: `1px solid ${
                    d === latest.date ? "var(--vault-border-strong)" : "var(--vault-border)"
                  }`,
                }}
              >
                {d}
              </span>
            ))}
          </div>
          <p
            className="mt-2 font-mono text-[10px] uppercase tracking-wider"
            style={{ color: "var(--vault-text-faint)" }}
          >
            showing {latest.date} below — most recent
          </p>
        </section>
      )}

      {/* Per-game scorecard — sportsbook scoreboard per graded game,
          with best call + biggest miss. Friendly matchup labels +
          playoff context come from the live board. */}
      <PerGameScorecard rows={latest.rows} games={boardGames} />

      {/* Guardrail audit — splits hit rate by R5 model-anomaly vs
          clean, computed by joining settled rows with the board's
          riskFlags. */}
      <AnomalyGuardrailPanel
        settledRows={latest.rows}
        boardLeans={boardLeans}
      />

      {/* Newest date's full comparison report */}
      {latest.report && (
        <section className="mt-10">
          <SectionHeading>{latest.date} · breakdown</SectionHeading>
          <ResultsBreakdown
            report={latest.report}
            gameLabelMap={gameLabelMap}
          />
        </section>
      )}

      {/* Honest disclosure that historical parlay candidates were not
          persisted, so we cannot claim parlay hits without inventing
          the slip. Future-feature framing. */}
      <ParlayResultsDisclosure />

      {/* Footer disclosure */}
      <footer
        className="mt-12 pt-6 text-center font-mono text-[10px] tracking-[0.18em] uppercase"
        style={{
          color: "var(--vault-text-faint)",
          borderTop: "1px solid var(--vault-rule)",
        }}
      >
        hit rate excludes pushes · educational use only · not betting advice
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function ResultsEmptyShell({
  latestScoredDate,
  mlbState,
}: {
  latestScoredDate: string | null;
  mlbState: "pending" | "live" | "partial";
}) {
  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-8 sm:py-12">
      <div className="reveal vault-hero-eyebrow vault-data-orbit neon-corner-bracket gtp-line-scan relative overflow-hidden -mx-4 sm:-mx-6 px-4 sm:px-6 pt-6 pb-2">
        <NeonCornerBracket />
        <div
          className="font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-gold)" }}
        >
          Calibration room · early validation
        </div>
        <h1
          className="mt-2 vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          The grading lab
        </h1>
        <p
          className="mt-3 text-[14px] sm:text-[15px] leading-relaxed max-w-2xl"
          style={{ color: "var(--vault-text-mute)" }}
        >
          Once a slate&apos;s games complete and the box scores are verified,
          every model lean is graded against the actual outcome. Hit rate,
          projection error, and confidence calibration live here — broken
          down by market, confidence tier, game, and bookmaker.
        </p>
      </div>

      <SportAuditTabs activeSport="NBA" mlbState={mlbState} />

      <div className="mt-8">
        <EmptyResultsCard latestScoredDate={latestScoredDate} />
      </div>

      {/* Calibration sigil — small ambient pulsing graphic that visually
          separates the explainer block above from the live slate-await
          panel below. Pure texture, no fabrication. */}
      {latestScoredDate && (
        <div aria-hidden className="gtp-calib-sigil">
          <span className="gtp-calib-rule-left" />
          <span className="gtp-calib-ring" />
          <span className="gtp-calib-rule-right" />
        </div>
      )}

      {/* Slate-awaiting-settlement panel. Points the user at the live
          model board with the loaded projection count so the Results
          page never reads as a dead end while the slate is still in
          flight. Only renders when a scored slate actually exists. */}
      <SlateAwaitingSettlementPanel latestScoredDate={latestScoredDate} />

      {/* Full awaiting-settlement table — surfaces every prop that will
          be graded once box scores land. Pure read of the existing
          board JSON; no fabricated outcomes. */}
      {latestScoredDate && (() => {
        const board = getBoardForDate(latestScoredDate);
        return (
          <AwaitingSettlementTable
            date={latestScoredDate}
            games={board.games ?? []}
            leans={board.leans ?? []}
          />
        );
      })()}

      {/* Calibration roadmap — day-by-day strip. Honest "pending" /
          "no-slate" states; settled cells only when real data exists. */}
      <CalibrationRoadmap
        days={buildCalibrationDays(latestScoredDate)}
        lifetimeDecisive={0}
        liveBoardHref={
          latestScoredDate ? `/board?date=${latestScoredDate}` : "/board"
        }
        liveBoardLabel="open the live model board"
      />

      {/* Educational "how a lean grades" note — keep the page honest
          about exactly what will be graded, and how. */}
      <section className="mt-10 gtp-grading-note">
        <div className="flex items-center gap-2 mb-2">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{
              background: "var(--vault-gold)",
              boxShadow: "0 0 6px rgba(212, 175, 55, 0.6)",
            }}
          />
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-gold)", fontSize: 10 }}
          >
            how a lean grades
          </span>
        </div>
        <ul
          className="grid grid-cols-1 sm:grid-cols-2 gap-2 list-none text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          <li>
            <span style={{ color: "var(--vault-gold-bright)" }}>·</span>{" "}
            <strong style={{ color: "var(--vault-text)" }}>Over</strong> wins
            when actual stat {">"} line; loses when actual {"<"} line.
          </li>
          <li>
            <span style={{ color: "var(--vault-gold-bright)" }}>·</span>{" "}
            <strong style={{ color: "var(--vault-text)" }}>Under</strong> wins
            when actual {"<"} line; loses when actual {">"} line.
          </li>
          <li>
            <span style={{ color: "var(--vault-gold-bright)" }}>·</span>{" "}
            <strong style={{ color: "var(--vault-text)" }}>Push</strong> when
            actual equals the line — excluded from the hit-rate denominator.
          </li>
          <li>
            <span style={{ color: "var(--vault-gold-bright)" }}>·</span>{" "}
            <strong style={{ color: "var(--vault-text)" }}>No Play</strong>{" "}
            leans never grade — surfaced separately for calibration only.
          </li>
        </ul>
      </section>

      {/* Phase 13: compact newsletter signup so users can be notified
          when results actually populate. */}
      <div className="mt-10 max-w-2xl">
        <NewsletterSignup variant="compact" />
      </div>

      <footer
        className="mt-12 pt-6 text-center font-mono text-[10px] tracking-[0.18em] uppercase"
        style={{
          color: "var(--vault-text-faint)",
          borderTop: "1px solid var(--vault-rule)",
        }}
      >
        educational use only · not betting advice
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calibration roadmap helper — walks the available board dates and
// classifies each into "settled" / "pending" / "no-slate" based on the
// actual public results data. NEVER fabricates a hit rate.
//
// Inputs (all already public):
//   - settled dates from getAvailableSettlementDates()
//   - lifetime summary (decisive count, etc.) — not used per-cell here
//   - available board dates from getAvailableBoardDates() for "pending"
// ---------------------------------------------------------------------------
function buildCalibrationDays(latestScoredDate: string | null): CalibrationDay[] {
  // The board dates available on disk anchor the strip.
  const allBoardDates = getAvailableBoardDates().slice().sort();
  if (allBoardDates.length === 0) return [];
  const settledDates = new Set(getAvailableSettlementDates());

  // Show the most recent 10 dates so the strip stays compact on mobile.
  const window = allBoardDates.slice(-10);

  return window.map<CalibrationDay>((date) => {
    if (settledDates.has(date)) {
      return {
        date,
        state: "settled",
        // We don't pull the per-date comparison report into the page
        // payload here to keep the bundle lean. The cell renders the
        // pre-computed hitRate from the lifetime summary's settled
        // dates — until per-date data is wired, treat as decisive=0.
        hitRate: null,
        decisive: 0,
        label: shortDateLabel(date),
        note: "graded",
      };
    }
    const board = getBoardForDate(date);
    const hasScored = (board.leans ?? []).some(
      (l) =>
        typeof l.projection === "number" &&
        typeof l.edgePct === "number" &&
        Number.isFinite(l.edgePct),
    );
    if (hasScored) {
      return {
        date,
        state: "pending",
        label: shortDateLabel(date),
        note: date === latestScoredDate ? "tonight" : "awaiting",
      };
    }
    return {
      date,
      state: "no-slate",
      label: shortDateLabel(date),
      note: "no games",
    };
  });
}

function shortDateLabel(date: string): string {
  // "2026-05-15" -> "5/15"
  const parts = date.split("-");
  if (parts.length !== 3) return date;
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  return `${m}/${d}`;
}

// ---------------------------------------------------------------------------
// Slate-awaiting-settlement panel — used on the empty Results page to
// keep the surface useful. Points the user at the latest scored model
// board with the loaded projection count. Honest about the fact that
// nothing is settled yet.
// ---------------------------------------------------------------------------
function SlateAwaitingSettlementPanel({
  latestScoredDate,
}: {
  latestScoredDate: string | null;
}) {
  if (!latestScoredDate) return null;
  const board = getBoardForDate(latestScoredDate);
  const scoredLeans = (board.leans ?? []).filter(
    (l) =>
      typeof l.projection === "number" &&
      typeof l.edgePct === "number" &&
      Number.isFinite(l.edgePct),
  );
  const projectionCount = scoredLeans.length;
  const highCount = scoredLeans.filter((l) => l.confidence === "High").length;
  const games = board.games ?? [];
  const matchup =
    games.length > 0 && games[0].awayTeamAbbr && games[0].homeTeamAbbr
      ? `${games[0].awayTeamAbbr} @ ${games[0].homeTeamAbbr}${
          games.length > 1 ? ` · +${games.length - 1} more` : ""
        }`
      : null;
  // Decode playoff context from the first game so the panel reads
  // "Conf Semis · Game 6" instead of just "DET @ CLE".
  const firstGame = games[0];
  const playoff = firstGame
    ? getPlayoffContext(
        firstGame.gameId,
        firstGame.awayTeamAbbr,
        firstGame.homeTeamAbbr,
      )
    : null;
  return (
    <div className="mt-8 gtp-slate-await">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
            style={{
              background: "var(--vault-gold-bright)",
              boxShadow: "0 0 8px rgba(240, 199, 94, 0.6)",
            }}
          />
          <span
            className="font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-gold)" }}
          >
            slate in flight · awaiting settlement
          </span>
        </div>
        <Link
          href={`/board?date=${latestScoredDate}`}
          className="font-mono tracking-tight transition-colors"
          style={{ color: "var(--vault-gold)", fontSize: 12 }}
        >
          view the live board →
        </Link>
      </div>
      {playoff?.isPlayoffs && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="gtp-game-chip">{playoff.gameLabel}</span>
          <span
            className="font-mono"
            style={{
              fontSize: 10,
              color: "var(--vault-text-faint)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            {playoff.roundLabel}
          </span>
        </div>
      )}
      <h2
        className="mt-3 font-display font-semibold tracking-tight"
        style={{ color: "var(--vault-text)", fontSize: 20, lineHeight: 1.2 }}
      >
        {latestScoredDate}
        {matchup && (
          <span
            style={{
              color: "var(--vault-text-mute)",
              fontSize: 14,
              fontWeight: 500,
              marginLeft: 8,
            }}
          >
            · {matchup}
          </span>
        )}
      </h2>
      <p
        className="mt-2 text-[13px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)" }}
      >
        The model has{" "}
        <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>
          {projectionCount}
        </span>{" "}
        projection{projectionCount === 1 ? "" : "s"} loaded on this slate (
        <span style={{ color: "var(--vault-gold)" }}>{highCount} High</span>{" "}
        confidence). Once the games complete and box scores verify, every
        lean will land here graded against the actual outcome.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline UI atoms (vault-themed, no external dep)
// ---------------------------------------------------------------------------
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="font-mono text-[10px] uppercase tracking-[0.18em] shrink-0"
        style={{ color: "var(--vault-gold)" }}
      >
        {children}
      </span>
      <div
        className="flex-1 h-px"
        style={{ background: "var(--vault-rule)" }}
      />
    </div>
  );
}

function KpiTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "success" | "danger" | "warn";
}) {
  const accentColor =
    accent === "success"
      ? "var(--vault-success)"
      : accent === "danger"
        ? "var(--vault-danger)"
        : accent === "warn"
          ? "var(--vault-warn)"
          : "var(--vault-text)";

  return (
    <div
      className="rounded-[3px] p-4 sm:p-5"
      style={{
        background: "var(--vault-panel)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div
        className="font-mono text-[10px] tracking-[0.18em] uppercase"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 font-display font-semibold tabular tracking-tight text-[24px] sm:text-[28px]"
        style={{ color: accentColor }}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * SportAuditTabs — small chip strip clarifying that today's audit covers
 * NBA only, and MLB grading arrives once MLB settlement is wired. Stays
 * on the page even when MLB is pending so users can see the sport scope.
 *
 * Pure presentation; no interactivity. When MLB lands, replace the
 * inert "MLB pending" chip with an actual link/tab.
 */
function SportAuditTabs({
  activeSport,
  mlbState,
}: {
  activeSport: "NBA" | "MLB";
  mlbState: "pending" | "live" | "partial";
}) {
  const mlbAvailable = mlbState !== "pending";
  const mlbLabel =
    mlbState === "live"
      ? "MLB audit · live"
      : mlbState === "partial"
        ? "MLB audit · partial"
        : "MLB audit · pending";
  return (
    <div
      className="mt-6 inline-flex flex-wrap items-stretch gap-1 p-1 rounded-[4px]"
      style={{
        background: "rgba(7, 11, 26, 0.55)",
        border: "1px solid var(--vault-border)",
      }}
      aria-label="Model audit sport tabs"
    >
      <span
        className="font-mono uppercase tracking-[0.14em] px-3 py-1.5 rounded-[3px]"
        style={{
          fontSize: 11,
          color:
            activeSport === "NBA"
              ? "var(--vault-gold-bright)"
              : "var(--vault-text-mute)",
          background:
            activeSport === "NBA"
              ? "linear-gradient(180deg, rgba(212, 175, 55, 0.12) 0%, rgba(212, 175, 55, 0) 90%)"
              : "transparent",
          border:
            activeSport === "NBA"
              ? "1px solid rgba(212, 175, 55, 0.30)"
              : "1px solid var(--vault-border)",
        }}
        aria-current={activeSport === "NBA" ? "page" : undefined}
      >
        NBA audit · live
      </span>
      {mlbAvailable ? (
        <Link
          href="/mlb/results"
          className="font-mono uppercase tracking-[0.14em] px-3 py-1.5 rounded-[3px] transition-colors"
          style={{
            fontSize: 11,
            color: "var(--vault-success)",
            border: "1px solid rgba(74, 222, 128, 0.30)",
            background:
              "linear-gradient(180deg, rgba(74, 222, 128, 0.10) 0%, rgba(74, 222, 128, 0) 90%)",
            textDecoration: "none",
          }}
          aria-label="Open the MLB model audit"
        >
          {mlbLabel} →
        </Link>
      ) : (
        <span
          className="font-mono uppercase tracking-[0.14em] px-3 py-1.5 rounded-[3px]"
          style={{
            fontSize: 11,
            color: "var(--vault-text-faint)",
            border: "1px solid var(--vault-border)",
            cursor: "not-allowed",
          }}
          title="MLB audit lights up once MLB settlement is wired."
        >
          {mlbLabel}
        </span>
      )}
    </div>
  );
}
