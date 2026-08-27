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
import PlayerResultsCards from "@/components/player-results-cards";
import { getPlayoffContext } from "@/components/playoff-context";
import { surfaceHref } from "@/lib/nav/date-sport-route";

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
              boxShadow: "0 0 8px color-mix(in srgb, var(--vault-accent) 60%, transparent)",
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
                "0 0 24px color-mix(in srgb, var(--vault-accent) 45%, transparent), 0 0 8px color-mix(in srgb, var(--vault-accent) 55%, transparent)",
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

      {/* "At a glance" + Hit / Miss / Push / Pending glossary.
          Plain-language read-out so a first-time visitor doesn't need to
          parse decimals to understand what the page is showing. */}
      <AtAGlanceCard
        totalWins={totalWins}
        totalLosses={totalLosses}
        totalPushes={totalPushes}
        totalDecisive={totalDecisive}
        mlbPending={mlbReport?.partial ? (mlbReport.pendingGameList?.length ?? 0) : 0}
      />

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

      {/* Prev / next date navigation */}
      <section className="mt-12 flex flex-wrap items-center justify-between gap-3">
        {prevDate ? (
          <Link
            href={surfaceHref("results", { date: prevDate }) ?? "/results/"}
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
            href={surfaceHref("results", { date: nextDate }) ?? "/results/"}
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

function AtAGlanceCard({
  totalWins,
  totalLosses,
  totalPushes,
  totalDecisive,
  mlbPending,
}: {
  totalWins: number;
  totalLosses: number;
  totalPushes: number;
  totalDecisive: number;
  mlbPending: number;
}) {
  if (totalDecisive === 0 && mlbPending === 0) return null;
  return (
    <section className="mt-6">
      <div
        className="rounded-[6px] px-5 py-5 sm:px-6 sm:py-6"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--vault-scrim-cocoa) 55%, transparent) 0%, color-mix(in srgb, var(--vault-scrim-base) 55%, transparent) 100%)",
          border: "1px solid var(--vault-border)",
        }}
      >
        <div
          className="font-mono uppercase tracking-[0.18em] mb-3"
          style={{ color: "var(--vault-gold)", fontSize: 10 }}
        >
          At a glance
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Glance label="Hit" value={String(totalWins)} tone="success"
                  sub="model agreed and the line cleared" />
          <Glance label="Miss" value={String(totalLosses)} tone="warn"
                  sub="model agreed but the line did not clear" />
          <Glance label="Push" value={String(totalPushes)} tone="mute"
                  sub="final stat tied the line — excluded from hit rate" />
          <Glance
            label="Pending"
            value={String(mlbPending)}
            tone="mute"
            sub={
              mlbPending > 0
                ? "game not final — never counts as a loss"
                : "no games still pending on this date"
            }
          />
        </div>
      </div>
    </section>
  );
}

function Glance({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone: "success" | "warn" | "mute";
  sub: string;
}) {
  const color =
    tone === "success"
      ? "var(--vault-success)"
      : tone === "warn"
        ? "var(--vault-warn)"
        : "var(--vault-text-faint)";
  return (
    <div>
      <div
        className="font-mono uppercase tracking-[0.14em]"
        style={{ color, fontSize: 10 }}
      >
        {label}
      </div>
      <div
        className="font-display font-semibold tabular tracking-tight"
        style={{
          color: "var(--vault-text)",
          fontSize: 28,
          lineHeight: 1,
          marginTop: 4,
        }}
      >
        {value}
      </div>
      <div
        className="mt-1.5 text-[11px] leading-snug"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {sub}
      </div>
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
              <span aria-hidden style={{ color: "var(--vault-text-faint)" }}>
                ·
              </span>
              <span
                className="font-mono tabular"
                style={{ color: c, fontSize: 11 }}
              >
                {typeof r.edgePct === "number" ? `${r.edgePct >= 0 ? "+" : ""}${r.edgePct.toFixed(1)}pp edge` : ""}
              </span>
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
