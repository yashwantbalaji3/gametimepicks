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
import ResultsSportTabs from "@/components/results-sport-tabs";
import SettledGameDetail, {
  type SettledLeanRow,
} from "@/components/settled-game-detail";
import PlayerResultsCards from "@/components/player-results-cards";
import { getPlayoffContext } from "@/components/playoff-context";
import DateSportControls from "@/components/nav/date-sport-controls";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { surfaceHref } from "@/lib/nav/date-sport-route";
import ResultsDay from "@/components/results/results-day";
import { resultsDay, resultsDayDates } from "@/lib/results/v2/day";
import TopBoards from "@/components/results/top-boards";
import { sportsWithoutBoards, topBoardDates, topBoardsFor } from "@/lib/results/v2/top-boards";

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
  // A frozen Top-5 day gets its page before any result exists — the board is published pre-kickoff.
  const all = Array.from(new Set([...nbaDates, ...mlbDates, ...resultsDayDates(), ...topBoardDates()])).sort();
  return all.map((date) => ({ date }));
}

export function generateMetadata({ params }: PageProps) {
  return withRouteMetadata(surfaceHref("results", { date: params.date }) ?? "/results/", {
    title: `Results · ${formatDateLong(params.date)} · GameTime Picks`,
    description: `Every forecast graded on ${formatDateLong(params.date)}, game by game, against the official result. Each sport keeps its own record.`,
  });
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
  const dayDates = new Set([...resultsDayDates(), ...topBoardDates()]);
  const hasAny = nbaAllDates.has(date) || mlbAllDates.has(date) || dayDates.has(date);
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

  // For the date-strip navigation row.
  const allDatesSorted = Array.from(
    new Set([...nbaAllDates, ...mlbAllDates, ...dayDates]),
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

      {/* Header. There is deliberately NO combined hit rate: this page used to lead with one percentage
          across NBA and MLB player-prop leans — research rows, summed across sports — which is exactly
          the universal number Results V2 forbids. Each sport's record now stands alone below. */}
      <header className="mt-6">
        <span className="font-mono uppercase tracking-[0.18em]" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>Results · one day</span>
        <h1 className="m-0 mt-1 font-display font-semibold tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(28px, 5vw, 44px)" }}>
          {formatDateLong(date)}
        </h1>
      </header>

      <ResultsDay day={resultsDay(date)} />

      <TopBoards day={topBoardsFor(date)} without={sportsWithoutBoards()} dayLabel={formatDateLong(date)} />

      {(nbaDecisive > 0 || mlbDecisive > 0 || nbaRows.length > 0 || mlbRows.length > 0) && (
        <div className="mt-12 rounded-xl px-4 py-3" style={{ border: "1px dashed var(--vault-border)" }}>
          <h2 id="research" className="m-0 font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-mute)" }}>Model research · player-prop leans, not public picks</h2>
          <p className="m-0 mt-1 text-[12.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
            Projection vs actual for every settled prop lean, graded for transparency and model development.
            {mlbReport?.partial && (mlbReport.pendingGameList?.length ?? 0) > 0 ? ` ${mlbReport.pendingGameList!.length} game(s) still pending — pending never counts as a loss.` : ""}
          </p>
        </div>
      )}

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

      {/* Biggest hits / biggest misses — cross-sport leaderboards.
          Edge magnitude on the wins side, |projection error| on the
          misses side. Both pull from the pipeline-emitted bestCalls /
          largestMisses lists so there is no fresh number derivation
          here — same data backs the page hero. */}
      <BigCallsRow
        nbaReport={
          nba?.report ? (nba.report as unknown as ComparisonReportLike) : null
        }
        mlbReport={mlbReport ? (mlbReport as unknown as MlbReportLike) : null}
      />

      {/* NBA per-player card view — friendlier scan for non-bettors.
          De-duplicates by (player, market) so each player surfaces once
          with PTS/REB/AST rows showing line / projection / actual /
          hit-miss color. Full per-bookmaker breakdown still renders
          below for audit detail. */}
      {nbaRows.length > 0 && <PlayerResultsCards rows={nbaRows} />}

      {/* NBA per-game expandable cards — full audit detail */}
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

      {/* ── Prev / today / next + a date picker, from the shared control family (P218 R-A). ──
           This was a hand-rolled prev/next pair with no picker, so reaching a date three weeks back
           took three weeks of clicks. The window it navigates is the same `allDatesSorted` the page
           already computes; the family only renders it. */}
      <section className="mt-12 flex flex-col gap-3">
        <DateSportControls
          surface="results"
          navLabel="Settled date"
          defaultLabel="Latest"
          date={date}
          defaultDate={allDatesSorted.at(-1) ?? date}
          availableDates={allDatesSorted}
        />
        <Link
          href="/results/"
          className="font-mono self-start"
          style={{ color: "var(--vault-text-mute)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.14em", textDecoration: "none" }}
        >
          all settled dates
        </Link>
      </section>

      <footer
        className="mt-12 pt-6 text-center font-mono text-[10px] tracking-[0.18em] uppercase"
        style={{
          color: "var(--vault-text-faint)",
          borderTop: "1px solid var(--vault-rule)",
        }}
      >
        each record stands alone · pushes and voids are never losses · educational use only · not betting advice
      </footer>
    </div>
  );
}

interface TopCall {
  playerName: string;
  market: string;
  side: string;
  line: number;
  edgePct?: number | null;
  finalStat?: number | null;
  modelProjection?: number | null;
  result?: string;
  sport: "NBA" | "MLB";
  confidence?: string;
}

function BigCallsRow({
  nbaReport,
  mlbReport,
}: {
  nbaReport: ComparisonReportLike | null;
  mlbReport: MlbReportLike | null;
}) {
  // Cross-sport rollup. Pipeline already de-dupes by (player, market, side,
  // line) and stamps both rows; we de-dupe again on this layer because
  // bestCalls/largestMisses are emitted per-bookmaker.
  const hits: TopCall[] = [];
  const misses: TopCall[] = [];

  const seen = new Set<string>();
  const pushUnique = (
    bucket: TopCall[],
    c: TopCall,
  ) => {
    const key = `${c.sport}-${c.playerName}-${c.market}-${c.side}-${c.line}`;
    if (seen.has(key)) return;
    seen.add(key);
    bucket.push(c);
  };

  // NBA bestCalls / largestMisses — pipeline-emitted, no fabrication.
  for (const raw of nbaReport?.bestCalls ?? []) {
    pushUnique(hits, {
      sport: "NBA",
      playerName: String(raw.playerName ?? ""),
      market: String(raw.market ?? ""),
      side: String(raw.side ?? ""),
      line: Number(raw.line ?? 0),
      edgePct: typeof raw.edgePct === "number" ? raw.edgePct : null,
      finalStat: typeof raw.finalStat === "number" ? raw.finalStat : null,
      modelProjection:
        typeof raw.modelProjection === "number" ? raw.modelProjection : null,
      result: String(raw.result ?? "win"),
    });
  }
  for (const raw of nbaReport?.largestMisses ?? []) {
    pushUnique(misses, {
      sport: "NBA",
      playerName: String(raw.playerName ?? ""),
      market: String(raw.market ?? ""),
      side: String(raw.side ?? ""),
      line: Number(raw.line ?? 0),
      edgePct: typeof raw.edgePct === "number" ? raw.edgePct : null,
      finalStat: typeof raw.finalStat === "number" ? raw.finalStat : null,
      modelProjection:
        typeof raw.modelProjection === "number" ? raw.modelProjection : null,
      result: String(raw.result ?? "loss"),
    });
  }

  // MLB topHits / biggestMisses use richer keys.
  for (const raw of mlbReport?.topHits ?? []) {
    pushUnique(hits, {
      sport: "MLB",
      playerName: String(raw.playerName ?? ""),
      market: String(raw.marketLabel ?? raw.marketKey ?? ""),
      side: String(raw.lean ?? ""),
      line: Number(raw.line ?? 0),
      edgePct: typeof raw.edgePct === "number" ? raw.edgePct : null,
      finalStat: typeof raw.actual === "number" ? raw.actual : null,
      modelProjection:
        typeof raw.projection === "number" ? raw.projection : null,
      confidence: String(raw.confidence ?? ""),
      result: "win",
    });
  }
  for (const raw of mlbReport?.biggestMisses ?? []) {
    pushUnique(misses, {
      sport: "MLB",
      playerName: String(raw.playerName ?? ""),
      market: String(raw.marketLabel ?? raw.marketKey ?? ""),
      side: String(raw.lean ?? ""),
      line: Number(raw.line ?? 0),
      edgePct: typeof raw.edgePct === "number" ? raw.edgePct : null,
      finalStat: typeof raw.actual === "number" ? raw.actual : null,
      modelProjection:
        typeof raw.projection === "number" ? raw.projection : null,
      confidence: String(raw.confidence ?? ""),
      result: "loss",
    });
  }

  if (hits.length === 0 && misses.length === 0) return null;

  // Top 5 by |edgePct| descending for the leaderboard. Honest sort key:
  // edge magnitude is the model's own conviction signal.
  const byEdge = (a: TopCall, b: TopCall) =>
    Math.abs(b.edgePct ?? 0) - Math.abs(a.edgePct ?? 0);

  const topHits = [...hits].sort(byEdge).slice(0, 5);
  const topMisses = [...misses].sort(byEdge).slice(0, 5);

  return (
    <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3">
      <BigCallsCard
        eyebrow="Biggest hits"
        accent="success"
        rows={topHits}
        emptyText="No hits to spotlight on this date."
      />
      <BigCallsCard
        eyebrow="Biggest misses"
        accent="warn"
        rows={topMisses}
        emptyText="No misses to spotlight on this date."
      />
    </section>
  );
}

function BigCallsCard({
  eyebrow,
  accent,
  rows,
  emptyText,
}: {
  eyebrow: string;
  accent: "success" | "warn";
  rows: TopCall[];
  emptyText: string;
}) {
  const c =
    accent === "success" ? "var(--vault-success)" : "var(--vault-warn)";
  return (
    <div
      className="rounded-[6px] px-4 py-4 sm:px-5 sm:py-5"
      style={{
        background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div
        className="font-mono uppercase tracking-[0.18em] mb-3"
        style={{ color: c, fontSize: 10 }}
      >
        {eyebrow}
      </div>
      {rows.length === 0 ? (
        <p className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
          {emptyText}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
          {rows.map((r, i) => (
            <li
              key={`${r.sport}-${r.playerName}-${r.market}-${i}`}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]"
              style={{ color: "var(--vault-text-mute)" }}
            >
              <span
                className="font-mono uppercase tracking-[0.14em] shrink-0"
                style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
              >
                {r.sport}
              </span>
              <span
                className="font-medium"
                style={{ color: "var(--vault-text)" }}
              >
                {r.playerName}
              </span>
              <span style={{ color: "var(--vault-text-faint)" }}>
                {r.side} {r.line} {r.market}
              </span>
              {/* P293: the separator used to render unconditionally while the span below rendered ""
                  for a missing edge, so a row with no edge read "Over 16.5 PTS··actual 3" — two
                  separators with nothing between them. 15 of these across 5 archived NBA dates, all
                  in "Biggest misses". A separator belongs INSIDE the conditional for the thing it
                  separates, which is how the `actual` block just below already does it. */}
              {typeof r.edgePct === "number" ? (
                <>
                  <span aria-hidden style={{ color: "var(--vault-text-faint)" }}>
                    ·
                  </span>
                  <span
                    className="font-mono tabular"
                    style={{ color: c, fontSize: 11 }}
                  >
                    {`${r.edgePct >= 0 ? "+" : ""}${r.edgePct.toFixed(1)}pp edge`}
                  </span>
                </>
              ) : null}
              {typeof r.finalStat === "number" && (
                <>
                  <span aria-hidden style={{ color: "var(--vault-text-faint)" }}>
                    ·
                  </span>
                  <span
                    className="font-mono tabular"
                    style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
                  >
                    actual {r.finalStat}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Loose shapes for the cross-sport BigCallsRow — both NBA and MLB reports
// expose these fields but with different schemas; we only read the keys
// we need so a future schema addition can't break this row.
// Each entry is read field-by-field with explicit guards — index-signature
// typing keeps the cross-sport access path simple without forcing every
// pipeline schema field into this UI layer.
type LooseEntry = Record<string, unknown>;
interface ComparisonReportLike {
  bestCalls?: ReadonlyArray<LooseEntry>;
  largestMisses?: ReadonlyArray<LooseEntry>;
}
interface MlbReportLike {
  topHits?: ReadonlyArray<LooseEntry>;
  biggestMisses?: ReadonlyArray<LooseEntry>;
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
        background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)",
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
            <div key={gpk} id={`leans-mlb-${gpk}`} style={{ scrollMarginTop: 80 }}>
            <SettledGameDetail
              matchup={matchup}
              wins={wins}
              losses={losses}
              pushes={pushes}
              decisive={decisive}
              hitRate={hitRate}
              rows={detailRows}
              tone="success"
            />
            </div>
          );
        })}
      </div>
    </section>
  );
}
