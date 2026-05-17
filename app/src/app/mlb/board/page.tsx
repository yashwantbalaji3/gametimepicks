import Link from "next/link";
import { activeMlbDate, getMlbBoardForDate } from "@/lib/data-mlb";
import { getMlbComparisonReport, getMlbLifetimeSummary } from "@/lib/data-mlb-results";
import { mlbMarketLabel } from "@/lib/format-mlb";
import MlbSummaryStrip from "@/components/mlb/mlb-summary-strip";
import MlbSectionTabs from "@/components/mlb/mlb-section-tabs";
import MlbTopLeansStrip from "@/components/mlb/mlb-top-leans-strip";
import MlbBoardClient from "@/components/mlb/mlb-board-client";
import NeonStatPanel from "@/components/neon-stat-panel";

export const metadata = {
  title: "MLB board · GameTime Picks",
  description:
    "Daily MLB player-prop board: pitcher strikeouts, batter hits, batter total bases. Educational analytics, not betting advice.",
};

const DEFAULT_DATE = "2026-05-16";

export default function MlbBoardPage() {
  const date = activeMlbDate() ?? DEFAULT_DATE;
  const board = getMlbBoardForDate(date);

  const totalGames = board.games.length;
  const summary = board.summary;
  const isPending = !board.propsAvailable;

  // Unique team list for the filter console (only teams present in
  // leans, sorted alphabetically). Server-side compute so the client
  // doesn't recompute on every render.
  const teamSet = new Set<string>();
  for (const l of board.leans) {
    if (l.playerTeamAbbr) teamSet.add(l.playerTeamAbbr);
  }
  const teamOptions = [...teamSet].sort();

  // Game-state map: derive from the MLB Results comparison report when
  // present. byGame keys are the gamePks that have settled rows (Final
  // games). pendingGameList holds Live + Pre-Game gamePks. Anything
  // else stays unknown.
  const mlbReport = getMlbComparisonReport(date);
  // Lifetime-level audit pointer — surfaced as a link even when viewing
  // a date that hasn't been settled (e.g. today's schedule-only board).
  const mlbLifetime = getMlbLifetimeSummary();
  const gameStateByPk: Record<number, "final" | "live" | "pregame"> = {};
  const settledGamePks: number[] = [];
  if (mlbReport) {
    for (const gpkStr of Object.keys(mlbReport.byGame)) {
      const pk = Number(gpkStr);
      if (Number.isFinite(pk)) {
        gameStateByPk[pk] = "final";
        settledGamePks.push(pk);
      }
    }
    for (const p of mlbReport.pendingGameList ?? []) {
      gameStateByPk[p.gamePk] =
        p.abstractState === "Live" ? "live" : "pregame";
    }
  }

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
          Projections for pitcher strikeouts and batter markets only. Home
          runs live on the separate{" "}
          <Link href="/mlb/power" style={{ color: "var(--vault-warn)" }}>
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

      {/* By-market summary chips — static reference, not interactive */}
      <section className="mt-6 flex flex-wrap gap-2 text-[11px] font-mono uppercase tracking-[0.12em]">
        {(
          [
            "pitcher_strikeouts",
            "batter_hits",
            "batter_total_bases",
            "batter_hits_runs_rbis",
          ] as const
        ).map((m) => {
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
              <span style={{ color: "var(--vault-text-faint)" }}>
                {c.total} total
              </span>
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
            We have today&apos;s schedule but no posted prop lines yet.
            Projections appear here when lines post.{" "}
            {board.pendingReason && <span>Reason: {board.pendingReason}.</span>}
          </div>
        </section>
      )}

      {/* Top Clean Leans strip — always server-rendered, never moves
          when filters change. Surfaces the day's best calls so a
          first-time visitor sees what the model surfaced without
          scrolling 15 game sections. */}
      <div className="mt-8">
        <MlbTopLeansStrip leans={board.leans} max={8} />
      </div>

      {/* Filter console + filtered game sections — client component
          owns interactive state. */}
      <MlbBoardClient
        leans={board.leans}
        games={board.games}
        teamOptions={teamOptions}
        gameStateByPk={gameStateByPk}
        settledGamePks={settledGamePks}
      />

      {/* MLB Results link — text-only so hit-rate emphasis lives on
          the Results page itself, not on the projection board. Surfaces
          whenever any MLB audit data exists, even on dates that haven't
          been settled (e.g. today's schedule-only board). */}
      {mlbLifetime && (
        <section className="mt-12">
          <Link
            href="/mlb/results"
            className="vault-glow-hover inline-flex items-center gap-2 rounded-[3px]"
            style={{
              padding: "10px 14px",
              border: "1px solid rgba(74, 222, 128, 0.30)",
              background: "rgba(74, 222, 128, 0.06)",
              color: "var(--vault-success)",
              textDecoration: "none",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background: "var(--vault-success)",
                boxShadow: "0 0 6px rgba(74, 222, 128, 0.45)",
              }}
            />
            Open MLB model audit
            {mlbLifetime.partial ? " · partial" : ""} →
          </Link>
        </section>
      )}

      {/* Power Board reminder — keep HR analysis discoverable but
          clearly separate. */}
      <section className="mt-12">
        <Link
          href="/mlb/power"
          className="gtp-aurora-halo block vault-glow-hover rounded-[8px]"
        >
          <div
            className="gtp-status-board p-5 sm:p-6"
            style={{ borderRadius: 8 }}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block w-2 h-2 rounded-full"
                style={{
                  background: "var(--vault-warn)",
                  boxShadow: "0 0 10px rgba(212, 175, 55, 0.55)",
                }}
              />
              <span
                className="font-mono uppercase tracking-[0.16em]"
                style={{ color: "var(--vault-warn)", fontSize: 10 }}
              >
                Home runs live on the Power Board
              </span>
            </div>
            <h2
              className="mt-3 font-display font-semibold tracking-tight"
              style={{
                color: "var(--vault-text)",
                fontSize: 20,
                lineHeight: 1.15,
              }}
            >
              Open the MLB Power Board →
            </h2>
            <p
              className="mt-2 text-[13px] leading-relaxed"
              style={{ color: "var(--vault-text-mute)" }}
            >
              HR markets are high-variance and rated on a separate
              power-profile scale (barrel + park + matchup), not the
              standard High / Medium / Low tiers used here.
            </p>
          </div>
        </Link>
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
