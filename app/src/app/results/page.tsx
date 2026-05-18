/**
 * /results — unified cross-sport model audit hub.
 *
 * This is the Overview surface: it computes the cross-sport overall
 * hit rate (settled NBA decisive rows + settled MLB decisive rows,
 * pushes excluded, pending games never counted) and points users to
 * the per-sport detail pages where every settled game expands to a
 * projection-vs-actual table:
 *
 *   - NBA detail:  /nba/results  (also reachable via this hub's tabs)
 *   - MLB detail:  /mlb/results
 *   - Parlays:     /results/parlays (placeholder — candidate slips
 *                  must be persisted before any parlay hit rate can
 *                  be claimed honestly)
 *
 * Honest framing throughout: never invents data, pending games never
 * count as losses, parlay hit rate is never folded into overall.
 */
import {
  getLifetimeSummary,
  getLatestSettlement,
  getAvailableSettlementDates,
  getSettlementForDate,
} from "@/lib/settlement-data";
import {
  getBoardForDate,
  getAvailableBoardDates,
} from "@/lib/data";
import {
  getMlbLifetimeSummary,
  getMlbAvailableResultDates,
  getMlbSettledLeansForDate,
} from "@/lib/data-mlb-results";
import { formatPercent } from "@/lib/format";
import Link from "next/link";
import EmptyResultsCard from "@/components/empty-results-card";
import NewsletterSignup from "@/components/newsletter-signup";
import NeonCornerBracket from "@/components/neon-corner-bracket";
import AwaitingSettlementTable from "@/components/awaiting-settlement-table";
import CalibrationRoadmap, {
  type CalibrationDay,
} from "@/components/calibration-roadmap";
import ParlayResultsDisclosure from "@/components/parlay-results-disclosure";
import { getPlayoffContext } from "@/components/playoff-context";
import ResultsSportTabs from "@/components/results-sport-tabs";
import ModelLessonsCard, {
  type ModelLesson,
} from "@/components/model-lessons-card";

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

export default function ResultsOverviewPage() {
  const nbaLifetime = getLifetimeSummary();
  const mlbLifetime = getMlbLifetimeSummary();
  const latestScoredDate = findLatestScoredBoardDate();

  const nbaHasData = nbaLifetime.totalSettled > 0;
  const mlbHasData = mlbLifetime !== null && mlbLifetime.totalSettled > 0;

  // Cross-sport overall: combine settled decisive rows from both sports.
  // We exclude pushes from the denominator, matching the per-sport
  // convention. Parlay hit rate is never folded in because candidate
  // slips are not yet persisted.
  const overallSettled =
    nbaLifetime.totalSettled + (mlbLifetime?.totalSettled ?? 0);
  const overallDecisive =
    nbaLifetime.decisive + (mlbLifetime?.decisive ?? 0);
  const overallWins = nbaLifetime.wins + (mlbLifetime?.wins ?? 0);
  const overallLosses = nbaLifetime.losses + (mlbLifetime?.losses ?? 0);
  const overallPushes = nbaLifetime.pushes + (mlbLifetime?.pushes ?? 0);
  const overallHitRate =
    overallDecisive > 0 ? overallWins / overallDecisive : null;
  const overallSmallSample = overallDecisive < 25;
  const newestSettledDate = (() => {
    const candidates = [
      nbaLifetime.newestDate,
      mlbLifetime?.newestDate ?? null,
    ].filter(Boolean) as string[];
    return candidates.sort().slice(-1)[0] ?? null;
  })();

  if (!nbaHasData && !mlbHasData) {
    return (
      <ResultsEmptyShell latestScoredDate={latestScoredDate} />
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-8 sm:py-12">
      {/* Hero — overall audit headline. Hits across both sports. */}
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
            Model audit · overall · graded against final box scores
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
            {overallHitRate !== null ? formatPercent(overallHitRate) : "—"}
          </h1>
          <span
            className="font-display tracking-tight"
            style={{
              color: "var(--vault-text)",
              fontSize: "clamp(18px, 2.6vw, 22px)",
            }}
          >
            Overall hit rate · {overallWins}–{overallLosses}
            {overallPushes > 0 ? `–${overallPushes}P` : ""} on{" "}
            <span style={{ color: "var(--vault-gold-bright)" }}>
              {overallDecisive}
            </span>{" "}
            decisive picks
          </span>
        </div>
        <p
          className="mt-4 text-[14px] leading-relaxed max-w-2xl"
          style={{ color: "var(--vault-text-mute)" }}
        >
          Overall combines settled NBA and MLB player-prop projections
          only. Pending games never count as losses; pushes are excluded
          from the denominator; parlay candidate slips are not folded
          in. {newestSettledDate ? `Most recent settled slate: ${newestSettledDate}. ` : ""}
          Hit rate excludes pushes and No Plays. Educational analytics — not betting advice.
        </p>
      </section>

      <ResultsSportTabs activeSport="overview" nbaHasData={nbaHasData} mlbHasData={mlbHasData} />

      {overallSmallSample && (
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
            {overallDecisive} decisive picks across NBA + MLB is below the
            ~25-pick floor where hit rates start to be statistically
            meaningful. Treat these numbers as descriptive, not predictive.
          </p>
        </aside>
      )}

      {/* Overall KPIs */}
      <section className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiTile label="settled rows" value={String(overallSettled)} />
        <KpiTile label="wins" value={String(overallWins)} accent="success" />
        <KpiTile label="losses" value={String(overallLosses)} accent="danger" />
        <KpiTile label="pushes" value={String(overallPushes)} />
      </section>

      {/* Per-sport summary cards. Each links to the sport-specific
          results page where every settled game expands to a projection-
          vs-actual table. */}
      <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3">
        <SportSummaryCard
          title="NBA audit"
          hitRate={nbaLifetime.hitRate}
          wins={nbaLifetime.wins}
          losses={nbaLifetime.losses}
          pushes={nbaLifetime.pushes}
          decisive={nbaLifetime.decisive}
          totalDates={nbaLifetime.totalDates}
          smallSample={nbaLifetime.smallSample}
          newestDate={nbaLifetime.newestDate}
          detailHref="/results/nba"
          detailLabel="Open NBA breakdown"
          accent="gold"
        />
        <SportSummaryCard
          title="MLB audit"
          hitRate={mlbLifetime?.hitRate ?? null}
          wins={mlbLifetime?.wins ?? 0}
          losses={mlbLifetime?.losses ?? 0}
          pushes={mlbLifetime?.pushes ?? 0}
          decisive={mlbLifetime?.decisive ?? 0}
          totalDates={mlbLifetime?.totalDates ?? 0}
          smallSample={mlbLifetime?.smallSample ?? true}
          newestDate={mlbLifetime?.newestDate ?? null}
          detailHref="/results/mlb"
          detailLabel="Open MLB breakdown"
          accent="success"
          partial={mlbLifetime?.partial ?? false}
        />
      </section>

      {/* Calibration trend — last N settled dates across NBA + MLB.
          Each tile links to /results/date/<date> for the full audit. */}
      <CalibrationTrendStrip />

      <section
        className="mt-8 rounded-[6px] px-4 py-4 text-[12px] leading-relaxed"
        style={{
          background: "rgba(7, 11, 26, 0.45)",
          border: "1px solid var(--vault-border)",
          color: "var(--vault-text-mute)",
        }}
      >
        <div
          className="font-mono uppercase tracking-[0.14em] mb-2"
          style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
        >
          How the overall hit rate is computed
        </div>
        Settled NBA player-prop rows plus settled MLB player-prop rows.
        Pushes and No Plays are excluded from the denominator;
        insufficient-data rows are never counted; pending games never
        count as losses. Home-run markets live on the{" "}
        <Link href="/mlb/power" style={{ color: "var(--vault-warn)" }}>
          MLB Power Board
        </Link>{" "}
        and do not feed this hit rate. Parlay candidate slips are not
        yet persisted, so no parlay hit rate is folded in here.
      </section>

      {buildOverallLessons({
        nbaLifetime,
        mlbLifetime,
      }).length > 0 && (
        <ModelLessonsCard
          lessons={buildOverallLessons({ nbaLifetime, mlbLifetime })}
          footnote="Lessons are derived from settled NBA + MLB rows only. Small-sample patterns from a single slate are deliberately excluded."
        />
      )}

      <ParlayResultsDisclosure />

      <footer
        className="mt-12 pt-6 text-center font-mono text-[10px] tracking-[0.18em] uppercase"
        style={{
          color: "var(--vault-text-faint)",
          borderTop: "1px solid var(--vault-rule)",
        }}
      >
        hit rate excludes pushes · settled decisive rows only · educational use only · not betting advice
      </footer>
    </div>
  );
}

function buildOverallLessons({
  nbaLifetime,
  mlbLifetime,
}: {
  nbaLifetime: ReturnType<typeof getLifetimeSummary>;
  mlbLifetime: ReturnType<typeof getMlbLifetimeSummary>;
}): ModelLesson[] {
  const lessons: ModelLesson[] = [];
  const nbaHas = nbaLifetime.totalSettled > 0;
  const mlbHas = mlbLifetime !== null && mlbLifetime.totalSettled > 0;
  if (!nbaHas && !mlbHas) return lessons;

  // Honest, sport-specific lessons drawn straight from the model audit.
  if (nbaHas) {
    lessons.push({
      eyebrow: "NBA · model anomaly cap working",
      tone: "gold",
      text: (
        <>
          On settled NBA rows, R5 anomaly leans (capped at Low with a model-anomaly
          chip) hit roughly a coin flip — the cap correctly downgrades these
          and clean leans outperform them.
        </>
      ),
      caveat: <>NBA settled rows audited: {nbaLifetime.decisive} decisive.</>,
    });
  }
  if (mlbHas) {
    lessons.push({
      eyebrow: "MLB · anomaly threshold tightened",
      tone: "warn",
      text: (
        <>
          The May 16 audit showed MLB |edge| of 20–25pp behaved like an
          anomaly bucket. The MLB R5 cap is now triggered at <strong>20pp</strong>{" "}
          instead of 25pp so borderline leans get the same risk-aware
          treatment as the NBA cap.
        </>
      ),
      caveat: (
        <>
          Sample is one slate; cap tightening only adds caution. We never
          upgrade a lean from this audit.
        </>
      ),
    });
  }
  lessons.push({
    eyebrow: "Parlay slips · pending persistence",
    tone: "gold",
    text: (
      <>
        Parlay hit rate stays empty until exact candidate slips are written
        before first game and graded after settlement. We refuse to invent
        slips after the fact.
      </>
    ),
  });
  return lessons;
}

/**
 * Calibration trend — chronological tile row of every settled date
 * across NBA + MLB. Each tile shows that date's hit rate and links to
 * /results/date/<date> for the full per-game audit. Honest framing:
 * we say "tracking" rather than "improving" because sample size is
 * still small.
 */
function CalibrationTrendStrip() {
  const nbaDates = getAvailableSettlementDates();
  const mlbDates = getMlbAvailableResultDates().dates ?? [];
  const allDates = Array.from(new Set([...nbaDates, ...mlbDates])).sort();
  if (allDates.length === 0) return null;

  // Last 10 only — the row stays scannable on mobile.
  const window = allDates.slice(-10);

  type Tile = {
    date: string;
    sport: "NBA" | "MLB";
    hitRate: number | null;
    wins: number;
    losses: number;
    pushes: number;
    decisive: number;
  };
  const tiles: Tile[] = [];
  for (const date of window) {
    if (nbaDates.includes(date)) {
      const { rows } = getSettlementForDate(date);
      const w = rows.filter((r) => r.result === "win").length;
      const l = rows.filter((r) => r.result === "loss").length;
      const p = rows.filter((r) => r.result === "push").length;
      const d = w + l;
      tiles.push({
        date,
        sport: "NBA",
        hitRate: d > 0 ? w / d : null,
        wins: w,
        losses: l,
        pushes: p,
        decisive: d,
      });
    }
    if (mlbDates.includes(date)) {
      const rows = getMlbSettledLeansForDate(date);
      const w = rows.filter((r) => r.outcome === "Win").length;
      const l = rows.filter((r) => r.outcome === "Loss").length;
      const p = rows.filter((r) => r.outcome === "Push").length;
      const d = w + l;
      tiles.push({
        date,
        sport: "MLB",
        hitRate: d > 0 ? w / d : null,
        wins: w,
        losses: l,
        pushes: p,
        decisive: d,
      });
    }
  }

  return (
    <section className="mt-8">
      <div className="flex items-center gap-3 mb-4">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.18em] shrink-0"
          style={{ color: "var(--vault-gold)" }}
        >
          Calibration trend · last {tiles.length}{" "}
          {tiles.length === 1 ? "settled slate" : "settled slates"}
        </span>
        <div className="flex-1 h-px" style={{ background: "var(--vault-rule)" }} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {tiles.map((t) => {
          const accent =
            t.sport === "NBA" ? "var(--vault-gold-bright)" : "var(--vault-success)";
          return (
            <Link
              key={`${t.date}-${t.sport}`}
              href={`/results/date/${t.date}`}
              className="vault-glow-hover rounded-[5px] block"
              style={{
                padding: "10px 12px",
                border: "1px solid var(--vault-border)",
                background: "rgba(7, 11, 26, 0.55)",
                textDecoration: "none",
              }}
              aria-label={`Audit for ${t.date} (${t.sport})`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="font-mono uppercase tracking-[0.16em]"
                  style={{ color: accent, fontSize: 9 }}
                >
                  {t.sport}
                </span>
                <span
                  className="font-mono"
                  style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
                >
                  {t.date.slice(5)}
                </span>
              </div>
              <div
                className="mt-1 font-display font-semibold tabular tracking-tight"
                style={{ color: accent, fontSize: 22, lineHeight: 1.1 }}
              >
                {t.hitRate !== null ? formatPercent(t.hitRate) : "—"}
              </div>
              <div
                className="mt-0.5 font-mono"
                style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
              >
                {t.wins}–{t.losses} on {t.decisive}
              </div>
            </Link>
          );
        })}
      </div>
      <p
        className="mt-3 text-[11px] leading-relaxed"
        style={{ color: "var(--vault-text-faint)" }}
      >
        Each tile is one settled slate, graded after final box scores. Click any
        tile to see every projection vs actual for that date. Early sample —
        tracking calibration as more slates settle.
      </p>
    </section>
  );
}

function SportSummaryCard({
  title,
  hitRate,
  wins,
  losses,
  pushes,
  decisive,
  totalDates,
  smallSample,
  newestDate,
  detailHref,
  detailLabel,
  accent,
  partial,
}: {
  title: string;
  hitRate: number | null;
  wins: number;
  losses: number;
  pushes: number;
  decisive: number;
  totalDates: number;
  smallSample: boolean;
  newestDate: string | null;
  detailHref: string;
  detailLabel: string;
  accent: "gold" | "success";
  partial?: boolean;
}) {
  const accentColor =
    accent === "gold" ? "var(--vault-gold-bright)" : "var(--vault-success)";
  return (
    <div
      className="rounded-[6px] px-5 py-5"
      style={{
        background: "rgba(7, 11, 26, 0.55)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div
        className="font-mono uppercase tracking-[0.14em] mb-2"
        style={{ color: accentColor, fontSize: 10 }}
      >
        {title}
        {partial ? " · partial" : ""}
      </div>
      <div className="flex items-baseline gap-3 flex-wrap">
        <div
          className="font-display font-semibold tabular tracking-tight"
          style={{ color: accentColor, fontSize: 40, lineHeight: 1 }}
        >
          {hitRate !== null ? formatPercent(hitRate) : "—"}
        </div>
        <div
          style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 500 }}
        >
          {decisive > 0
            ? `${wins}–${losses}${pushes > 0 ? `–${pushes}P` : ""} on ${decisive}`
            : "no settled rows yet"}
        </div>
      </div>
      <div
        className="mt-2 font-mono text-[10px] uppercase tracking-wider"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {totalDates} {totalDates === 1 ? "slate" : "slates"}
        {newestDate ? ` · most recent ${newestDate}` : ""}
        {smallSample ? " · small sample" : ""}
      </div>
      <div className="mt-4">
        <Link
          href={detailHref}
          className="font-mono"
          style={{
            color: accentColor,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            textDecoration: "none",
          }}
        >
          {detailLabel} →
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty shell (zero data anywhere)
// ---------------------------------------------------------------------------
function ResultsEmptyShell({
  latestScoredDate,
}: {
  latestScoredDate: string | null;
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
          Once a slate&apos;s games complete and box scores are verified,
          every model lean is graded against the actual outcome. Hit rate,
          projection error, and confidence calibration live here — broken
          down by sport, market, confidence tier, game, and bookmaker.
        </p>
      </div>

      <ResultsSportTabs
        activeSport="overview"
        nbaHasData={false}
        mlbHasData={false}
      />

      <div className="mt-8">
        <EmptyResultsCard latestScoredDate={latestScoredDate} />
      </div>

      {latestScoredDate && (
        <div aria-hidden className="gtp-calib-sigil">
          <span className="gtp-calib-rule-left" />
          <span className="gtp-calib-ring" />
          <span className="gtp-calib-rule-right" />
        </div>
      )}

      <SlateAwaitingSettlementPanel latestScoredDate={latestScoredDate} />

      {latestScoredDate &&
        (() => {
          const board = getBoardForDate(latestScoredDate);
          return (
            <AwaitingSettlementTable
              date={latestScoredDate}
              games={board.games ?? []}
              leans={board.leans ?? []}
            />
          );
        })()}

      <CalibrationRoadmap
        days={buildCalibrationDays(latestScoredDate)}
        lifetimeDecisive={0}
        liveBoardHref={
          latestScoredDate ? `/board?date=${latestScoredDate}` : "/board"
        }
        liveBoardLabel="open the live model board"
      />

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

function buildCalibrationDays(latestScoredDate: string | null): CalibrationDay[] {
  const allBoardDates = getAvailableBoardDates().slice().sort();
  if (allBoardDates.length === 0) return [];
  const settledDates = new Set(getAvailableSettlementDates());
  const window = allBoardDates.slice(-10);

  return window.map<CalibrationDay>((date) => {
    if (settledDates.has(date)) {
      return {
        date,
        state: "settled",
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
  const parts = date.split("-");
  if (parts.length !== 3) return date;
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  return `${m}/${d}`;
}

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
// Inline UI atoms
// ---------------------------------------------------------------------------
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
