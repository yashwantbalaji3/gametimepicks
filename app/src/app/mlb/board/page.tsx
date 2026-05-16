import Link from "next/link";
import {
  activeMlbDate,
  getMlbBoardForDate,
} from "@/lib/data-mlb";
import type { MlbBoardLean, MlbScheduleGame } from "@/lib/types-mlb";
import { mlbMarketLabel } from "@/lib/format-mlb";
import MlbGameSection from "@/components/mlb/mlb-game-section";
import MlbSummaryStrip from "@/components/mlb/mlb-summary-strip";
import MlbSectionTabs from "@/components/mlb/mlb-section-tabs";
import NeonStatPanel from "@/components/neon-stat-panel";

export const metadata = {
  title: "MLB board · GameTime Picks",
  description:
    "Daily MLB player-prop board: pitcher strikeouts, batter hits, batter total bases. Educational analytics, not betting advice.",
};

const DEFAULT_DATE = "2026-05-16";

function groupLeansByGame(leans: MlbBoardLean[]): Record<string, MlbBoardLean[]> {
  const map: Record<string, MlbBoardLean[]> = {};
  for (const l of leans) {
    const key = l.gameId;
    if (!map[key]) map[key] = [];
    map[key].push(l);
  }
  return map;
}

function gameKeyFor(g: MlbScheduleGame): string {
  return String(g.gamePk ?? `${g.awayTeamAbbr}-${g.homeTeamAbbr}`);
}

export default function MlbBoardPage() {
  const date = activeMlbDate() ?? DEFAULT_DATE;
  const board = getMlbBoardForDate(date);
  const leansByGameId = groupLeansByGame(board.leans);

  // Build {gameKey -> game}; we use gamePk as primary key for game cards.
  // Leans are keyed by Odds-API event id (gameId), so we cross-reference
  // via the home/away abbr that the lean knows.
  // For our MVP we group leans against their event id and pair each game
  // to its event id via team abbreviations.
  const leanGameIds = new Set(board.leans.map((l) => l.gameId));
  const sectionRows = board.games.map((g) => {
    // Find the matching gameId by team match
    const matchingId = Array.from(leanGameIds).find((gid) => {
      const sample = board.leans.find((l) => l.gameId === gid);
      if (!sample) return false;
      return (
        sample.homeTeamAbbr === g.homeTeamAbbr &&
        sample.awayTeamAbbr === g.awayTeamAbbr
      );
    });
    return {
      game: g,
      leans: matchingId ? leansByGameId[matchingId] ?? [] : [],
    };
  });

  const totalGames = board.games.length;
  const summary = board.summary;
  const isPending = !board.propsAvailable;

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <MlbSectionTabs />
      </div>

      {/* Header strip */}
      <section className="reveal">
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
        >
          MLB model board · {date}
        </div>
        <h1
          className="mt-2 vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          {totalGames} MLB games · {summary.leans} model leans
        </h1>
        <p
          className="mt-3 max-w-2xl text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          Projections for pitcher strikeouts and batter markets only. Home runs
          live on the separate{" "}
          <Link href="/mlb/power" style={{ color: "var(--vault-gold-bright)" }}>
            Power Board
          </Link>{" "}
          because the variance profile is different.
        </p>
        <div className="mt-4">
          <MlbSummaryStrip board={board} />
        </div>
      </section>

      {/* KPI strip — confidence tier distribution */}
      <section className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <NeonStatPanel
          label="High confidence"
          value={String(summary.highConfidence)}
          sub="clean edge ≥ 5 pp"
          valueAccent="success"
          delay={1}
        />
        <NeonStatPanel
          label="Medium"
          value={String(summary.mediumConfidence)}
          sub="edge ≥ 2.5 pp"
          valueAccent="gold"
          delay={2}
        />
        <NeonStatPanel
          label="Low + anomalies"
          value={String(summary.lowConfidence)}
          sub={`${summary.anomalies} R5 anomalies`}
          valueAccent="warn"
          delay={3}
        />
        <NeonStatPanel
          label="Sample too small"
          value={String(summary.insufficientData)}
          sub="no projection emitted"
          valueAccent="mute"
          delay={4}
        />
      </section>

      {/* By-market summary chips */}
      <section className="mt-6 flex flex-wrap gap-2 text-[11px] font-mono uppercase tracking-[0.12em]">
        {(["pitcher_strikeouts", "batter_hits", "batter_total_bases", "batter_hits_runs_rbis"] as const).map((m) => {
          const c = summary.byMarket[m];
          if (!c) return null;
          return (
            <span
              key={m}
              className="gtp-source-chip"
              style={{ color: "var(--vault-text-mute)" }}
            >
              <span>{mlbMarketLabel(m)}</span>
              <span style={{ color: "var(--vault-gold-bright)" }}>{c.high}H</span>
              <span style={{ color: "var(--vault-text-faint)" }}>·</span>
              <span style={{ color: "var(--vault-text-faint)" }}>{c.total} total</span>
            </span>
          );
        })}
      </section>

      {/* Pending banner (only when props weren't fetched) */}
      {isPending && (
        <section className="mt-6">
          <div
            className="rounded-[6px] px-4 py-4 text-[13px]"
            style={{
              background: "rgba(7, 11, 26, 0.5)",
              border: "1px solid var(--vault-border)",
              color: "var(--vault-text-mute)",
            }}
          >
            <div
              className="font-mono uppercase tracking-[0.14em] mb-1"
              style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
            >
              prop lines pending
            </div>
            We have today's schedule but no posted prop lines yet. Projections
            appear here when lines post.{" "}
            {board.pendingReason && <span>Reason: {board.pendingReason}.</span>}
          </div>
        </section>
      )}

      {/* Game sections — the gtp-aurora-halo decoration extends ~28px outside
          each section via ::before/::after pseudo-elements. We wrap the
          flex column in overflow-hidden + small horizontal padding so the
          glow doesn't push the document past viewport width on desktop. */}
      <section className="mt-8 px-1 sm:px-2 overflow-hidden">
        <div className="flex flex-col gap-5">
          {sectionRows.map(({ game, leans }) => (
            <MlbGameSection
              key={gameKeyFor(game)}
              game={game}
              leans={leans}
            />
          ))}
        </div>
      </section>

      {/* Methodology disclosure */}
      <section className="mt-10">
        <details
          className="rounded-[6px] px-4 py-3 text-[12px]"
          style={{
            background: "rgba(7, 11, 26, 0.45)",
            border: "1px solid var(--vault-border)",
            color: "var(--vault-text-mute)",
          }}
        >
          <summary
            className="font-mono uppercase tracking-[0.14em] cursor-pointer"
            style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
          >
            How to read these projections
          </summary>
          <div className="mt-3 leading-relaxed">
            <p>
              Pitcher strikeouts: weighted blend of the last 3 starts and the
              season average. Sigma floored at 1.6.
            </p>
            <p className="mt-2">
              Batter hits and total bases: weighted blend of last 10 games and
              season average. Sigma floored per market.
            </p>
            <p className="mt-2">
              We turn the projection into a probability using a normal
              approximation, then compare against the implied probability from
              the sportsbook odds. Edge is the gap in percentage points.
            </p>
            <p className="mt-2">
              Any edge at or above 25 pp is auto-capped to Low confidence and
              flagged as an R5 model anomaly — mirroring the NBA guardrail. The
              normal approximation is a rough fit for count stats with heavy
              zero-game mass, so thin-line markets (0.5 hits) may bias toward
              Unders. We are honest about that.
            </p>
          </div>
        </details>
      </section>
    </div>
  );
}
