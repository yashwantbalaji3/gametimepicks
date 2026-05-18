import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getSettlementForDate,
  getAvailableSettlementDates,
} from "@/lib/settlement-data";
import {
  getMlbAvailableResultDates,
  getMlbSettledLeansForDate,
  getMlbComparisonReport,
} from "@/lib/data-mlb-results";
import { mlbMarketLabel } from "@/lib/format-mlb";
import { formatPercent, formatDateLong } from "@/lib/format";
import NeonCornerBracket from "@/components/neon-corner-bracket";
import ResultsSportTabs from "@/components/results-sport-tabs";
import SettledGameDetail, {
  type SettledLeanRow,
} from "@/components/settled-game-detail";
import { getPlayoffContext } from "@/components/playoff-context";

interface PageProps {
  params: { date: string };
}

/**
 * Static-export friendly: enumerate every date that has settled rows
 * in either NBA or MLB. Next.js pre-renders one HTML page per date.
 */
export function generateStaticParams() {
  const nbaDates = getAvailableSettlementDates();
  const mlbDates = getMlbAvailableResultDates().dates ?? [];
  const all = Array.from(new Set([...nbaDates, ...mlbDates])).sort();
  return all.map((date) => ({ date }));
}

export function generateMetadata({ params }: PageProps) {
  return {
    title: `Audit · ${params.date} · GameTime Picks`,
    description: `Centralized projection-vs-actual audit for every settled lean on ${params.date}.`,
  };
}

/**
 * /results/date/[date] — combined NBA + MLB settled audit for one
 * specific date. Renders:
 *   - hero with the date and a combined hit-rate scoreboard
 *   - per-sport scorecards
 *   - expandable per-game projection-vs-actual cards
 *
 * Honest framing: this page shows ONLY settled rows. Pending games are
 * never counted as losses; sports without settled rows on this date
 * simply don't appear in the totals.
 */
export default function ResultsDatePage({ params }: PageProps) {
  // Validate the date param against the union of settled dates so a
  // missing/typo'd date returns a 404 rather than an empty shell.
  const nbaAllDates = new Set(getAvailableSettlementDates());
  const mlbAllDates = new Set(getMlbAvailableResultDates().dates ?? []);
  const date = params.date;
  const hasAny = nbaAllDates.has(date) || mlbAllDates.has(date);
  if (!hasAny) {
    notFound();
  }

  // Load each sport's rows for this date. Either or both can be empty.
  const nba = nbaAllDates.has(date) ? getSettlementForDate(date) : null;
  const mlbRows = mlbAllDates.has(date) ? getMlbSettledLeansForDate(date) : [];
  const mlbReport = mlbAllDates.has(date) ? getMlbComparisonReport(date) : null;

  // Per-sport decisive counts
  const nbaRows = nba?.rows ?? [];
  const nbaWins = nbaRows.filter((r) => r.result === "win").length;
  const nbaLosses = nbaRows.filter((r) => r.result === "loss").length;
  const nbaPushes = nbaRows.filter((r) => r.result === "push").length;
  const nbaDecisive = nbaWins + nbaLosses;
  const nbaHit = nbaDecisive > 0 ? nbaWins / nbaDecisive : null;

  const mlbWins = mlbRows.filter((r) => r.outcome === "Win").length;
  const mlbLosses = mlbRows.filter((r) => r.outcome === "Loss").length;
  const mlbPushes = mlbRows.filter((r) => r.outcome === "Push").length;
  const mlbDecisive = mlbWins + mlbLosses;
  const mlbHit = mlbDecisive > 0 ? mlbWins / mlbDecisive : null;

  // Combined totals across whichever sport(s) settled on this date.
  const totalWins = nbaWins + mlbWins;
  const totalLosses = nbaLosses + mlbLosses;
  const totalPushes = nbaPushes + mlbPushes;
  const totalDecisive = nbaDecisive + mlbDecisive;
  const totalHit = totalDecisive > 0 ? totalWins / totalDecisive : null;

  // For the date-strip navigation row.
  const allDatesSorted = Array.from(
    new Set([...nbaAllDates, ...mlbAllDates]),
  ).sort();
  const idx = allDatesSorted.indexOf(date);
  const prevDate = idx > 0 ? allDatesSorted[idx - 1] : null;
  const nextDate =
    idx >= 0 && idx < allDatesSorted.length - 1 ? allDatesSorted[idx + 1] : null;

  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-8 sm:py-12">
      {/* Cross-sport navigation strip */}
      <ResultsSportTabs
        activeSport="overview"
        nbaHasData={nbaAllDates.size > 0}
        mlbHasData={mlbAllDates.size > 0}
      />

      {/* Hero — combined hit-rate scoreboard for this date */}
      <section className="reveal vault-data-orbit neon-corner-bracket gtp-line-scan relative overflow-hidden -mx-4 sm:-mx-6 px-4 sm:px-6 pt-6 pb-5 mt-6">
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
            Settled projections · {formatDateLong(date)}
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
            {totalHit !== null ? formatPercent(totalHit) : "—"}
          </h1>
          <span
            className="font-display tracking-tight"
            style={{
              color: "var(--vault-text)",
              fontSize: "clamp(18px, 2.6vw, 22px)",
            }}
          >
            {totalDecisive > 0
              ? `${totalWins}–${totalLosses}${totalPushes > 0 ? `–${totalPushes}P` : ""} on ${totalDecisive} decisive`
              : "no decisive rows"}
          </span>
        </div>
        <p
          className="mt-4 text-[14px] leading-relaxed max-w-2xl"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {totalDecisive > 0
            ? `Combined audit across the sports that had settled rows on ${date}. Pushes excluded. Pending games never count as losses.`
            : `No settled rows for this date.`}
        </p>
      </section>

      {/* Per-sport scorecards */}
      <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3">
        {nbaDecisive > 0 && (
          <SportScoreCard
            sport="NBA"
            accent="gold"
            hitRate={nbaHit}
            wins={nbaWins}
            losses={nbaLosses}
            pushes={nbaPushes}
            decisive={nbaDecisive}
            detailHref="/results/nba"
          />
        )}
        {mlbDecisive > 0 && (
          <SportScoreCard
            sport="MLB"
            accent="success"
            hitRate={mlbHit}
            wins={mlbWins}
            losses={mlbLosses}
            pushes={mlbPushes}
            decisive={mlbDecisive}
            detailHref="/results/mlb"
          />
        )}
      </section>

      {/* NBA per-game expandable cards */}
      {nbaRows.length > 0 && (
        <NbaGameGroups
          rows={nbaRows}
          date={date}
        />
      )}

      {/* MLB per-game expandable cards */}
      {mlbRows.length > 0 && (
        <MlbGameGroups
          rows={mlbRows}
          report={mlbReport}
        />
      )}

      {/* Prev / next date navigation */}
      <section className="mt-12 flex flex-wrap items-center justify-between gap-3">
        {prevDate ? (
          <Link
            href={`/results/date/${prevDate}`}
            className="font-mono"
            style={{
              color: "var(--vault-gold-bright)",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              textDecoration: "none",
            }}
          >
            ← {prevDate}
          </Link>
        ) : (
          <span />
        )}
        <Link
          href="/results"
          className="font-mono"
          style={{
            color: "var(--vault-text-mute)",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            textDecoration: "none",
          }}
        >
          all settled dates
        </Link>
        {nextDate ? (
          <Link
            href={`/results/date/${nextDate}`}
            className="font-mono"
            style={{
              color: "var(--vault-gold-bright)",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              textDecoration: "none",
            }}
          >
            {nextDate} →
          </Link>
        ) : (
          <span />
        )}
      </section>

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

function SportScoreCard({
  sport,
  accent,
  hitRate,
  wins,
  losses,
  pushes,
  decisive,
  detailHref,
}: {
  sport: string;
  accent: "gold" | "success";
  hitRate: number | null;
  wins: number;
  losses: number;
  pushes: number;
  decisive: number;
  detailHref: string;
}) {
  const c = accent === "gold" ? "var(--vault-gold-bright)" : "var(--vault-success)";
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
        style={{ color: c, fontSize: 10 }}
      >
        {sport}
      </div>
      <div className="flex items-baseline gap-3 flex-wrap">
        <div
          className="font-display font-semibold tabular tracking-tight"
          style={{ color: c, fontSize: 40, lineHeight: 1 }}
        >
          {hitRate !== null ? formatPercent(hitRate) : "—"}
        </div>
        <div
          style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 500 }}
        >
          {wins}–{losses}
          {pushes > 0 ? `–${pushes}P` : ""} on {decisive}
        </div>
      </div>
      <div className="mt-4">
        <Link
          href={detailHref}
          className="font-mono"
          style={{
            color: c,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            textDecoration: "none",
          }}
        >
          Full {sport} audit →
        </Link>
      </div>
    </div>
  );
}

function NbaGameGroups({
  rows,
  date,
}: {
  rows: ReturnType<typeof getSettlementForDate>["rows"];
  date: string;
}) {
  // Group by gameId. Keys are stable for static export.
  const byGame = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.gameId ?? "_";
    const list = byGame.get(k) ?? [];
    list.push(r);
    byGame.set(k, list);
  }
  const ordered = [...byGame.keys()].sort();
  return (
    <section className="mt-10">
      <div className="flex items-center gap-3 mb-4">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.18em] shrink-0"
          style={{ color: "var(--vault-gold)" }}
        >
          NBA settled games · projection vs actual
        </span>
        <div className="flex-1 h-px" style={{ background: "var(--vault-rule)" }} />
      </div>
      <div className="flex flex-col gap-3">
        {ordered.map((gid) => {
          const gameRows = byGame.get(gid) || [];
          const wins = gameRows.filter((r) => r.result === "win").length;
          const losses = gameRows.filter((r) => r.result === "loss").length;
          const pushes = gameRows.filter((r) => r.result === "push").length;
          const decisive = wins + losses;
          const hitRate = decisive > 0 ? wins / decisive : null;
          const r0 = gameRows[0];
          const matchup =
            r0?.team && r0?.opponent
              ? `${r0.team} @ ${r0.opponent}`
              : "Settled NBA game";
          const ctx = getPlayoffContext(gid, r0?.team, r0?.opponent);
          const subtitle = ctx.isPlayoffs
            ? `${ctx.roundLabel} · ${ctx.gameLabel}`
            : undefined;
          const detailRows: SettledLeanRow[] = gameRows.map((r, i) => ({
            id: `${date}-${gid}-${r.playerId}-${r.market}-${i}`,
            playerName: r.playerName ?? "—",
            marketLabel: r.market ?? "—",
            side: r.side ?? "Pass",
            line: r.line ?? null,
            projection: r.modelProjection ?? null,
            actual:
              typeof r.finalStat === "number" ? r.finalStat : null,
            outcome:
              r.result === "win"
                ? "Win"
                : r.result === "loss"
                  ? "Loss"
                  : r.result === "push"
                    ? "Push"
                    : "—",
            confidence: r.confidence ?? "—",
            edgePct: typeof r.edgePct === "number" ? r.edgePct : null,
            bookmaker: r.bookmaker ?? null,
            oddsForSide:
              r.side === "Over" ? r.oddsOver ?? null : r.oddsUnder ?? null,
          }));
          return (
            <SettledGameDetail
              key={gid}
              matchup={matchup}
              subtitle={subtitle}
              wins={wins}
              losses={losses}
              pushes={pushes}
              decisive={decisive}
              hitRate={hitRate}
              rows={detailRows}
              tone="gold"
              defaultOpen={ordered.length === 1}
            />
          );
        })}
      </div>
    </section>
  );
}

function MlbGameGroups({
  rows,
  report,
}: {
  rows: ReturnType<typeof getMlbSettledLeansForDate>;
  report: ReturnType<typeof getMlbComparisonReport>;
}) {
  // Group by gamePk
  const byGame = new Map<number, typeof rows>();
  for (const r of rows) {
    const list = byGame.get(r.gamePk) ?? [];
    list.push(r);
    byGame.set(r.gamePk, list);
  }
  const sortedGamePks = [...byGame.keys()].sort((a, b) => {
    const aDate = report?.byGame[String(a)]?.gameDate ?? "";
    const bDate = report?.byGame[String(b)]?.gameDate ?? "";
    return aDate.localeCompare(bDate);
  });
  return (
    <section className="mt-10">
      <div className="flex items-center gap-3 mb-4">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.18em] shrink-0"
          style={{ color: "var(--vault-success)" }}
        >
          MLB settled games · projection vs actual
        </span>
        <div className="flex-1 h-px" style={{ background: "var(--vault-rule)" }} />
      </div>
      <div className="flex flex-col gap-3">
        {sortedGamePks.map((gpk) => {
          const gameRows = byGame.get(gpk) || [];
          const wins = gameRows.filter((r) => r.outcome === "Win").length;
          const losses = gameRows.filter((r) => r.outcome === "Loss").length;
          const pushes = gameRows.filter((r) => r.outcome === "Push").length;
          const decisive = wins + losses;
          const hitRate = decisive > 0 ? wins / decisive : null;
          const r0 = gameRows[0];
          const matchup =
            report?.byGame[String(gpk)]?.matchup ||
            (r0?.playerTeamAbbr && r0?.opponentAbbr
              ? `${r0.playerTeamAbbr} @ ${r0.opponentAbbr}`
              : "MLB game");
          const detailRows: SettledLeanRow[] = gameRows.map((r, i) => ({
            id: `${r.id}-${i}`,
            playerName: r.playerName,
            marketLabel: mlbMarketLabel(r.marketKey),
            side: r.lean,
            line: r.line,
            projection: r.projection,
            actual: r.actual,
            outcome: r.outcome,
            confidence: r.confidence,
            edgePct: r.edgePct,
          }));
          return (
            <SettledGameDetail
              key={gpk}
              matchup={matchup}
              wins={wins}
              losses={losses}
              pushes={pushes}
              decisive={decisive}
              hitRate={hitRate}
              rows={detailRows}
              tone="success"
            />
          );
        })}
      </div>
    </section>
  );
}
