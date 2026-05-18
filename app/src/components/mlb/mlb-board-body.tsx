import Link from "next/link";
import { getMlbBoardForDate } from "@/lib/data-mlb";
import {
  getMlbComparisonReport,
  getMlbLifetimeSummary,
} from "@/lib/data-mlb-results";
import { mlbMarketLabel } from "@/lib/format-mlb";
import MlbSummaryStrip from "@/components/mlb/mlb-summary-strip";
import MlbSectionTabs from "@/components/mlb/mlb-section-tabs";
import MlbTopLeansStrip from "@/components/mlb/mlb-top-leans-strip";
import MlbBoardClient from "@/components/mlb/mlb-board-client";
import NeonStatPanel from "@/components/neon-stat-panel";

/**
 * Shared MLB Board body used by:
 *   - /mlb/board                  (active/latest date)
 *   - /mlb/board/<YYYY-MM-DD>     (date deep-link)
 *
 * Pure server component. Receives the date as a prop; the calling
 * route is responsible for deciding the date.
 *
 * Renders three distinct surfaces based on data state:
 *   1) propsAvailable && leans.length > 0  → full projection board
 *   2) games.length > 0 && no leans        → schedule-only "lines pending"
 *   3) games.length === 0                  → honest off-day shell
 */
export default function MlbBoardBody({ date }: { date: string }) {
  const board = getMlbBoardForDate(date);

  const totalGames = board.games.length;
  const summary = board.summary;
  const isPending = !board.propsAvailable;
  const hasGames = totalGames > 0;
  const hasLeans = (board.leans?.length ?? 0) > 0;

  // Team list for the filter console (only used in projection state).
  const teamSet = new Set<string>();
  for (const l of board.leans) {
    if (l.playerTeamAbbr) teamSet.add(l.playerTeamAbbr);
  }
  const teamOptions = [...teamSet].sort();

  // MLB Results comparison report — used to color game states (final /
  // live / pregame). Present only for dates that have settled audits.
  const mlbReport = getMlbComparisonReport(date);
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
      gameStateByPk[p.gamePk] = p.abstractState === "Live" ? "live" : "pregame";
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
          {hasGames
            ? `${totalGames} MLB games · ${summary.leans} model leans`
            : "Off-day — no MLB games scheduled"}
        </h1>
        <p
          className="mt-3 max-w-2xl text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          Projections for pitcher strikeouts and batter markets only. Home runs
          live on the separate{" "}
          <Link href="/mlb/power" style={{ color: "var(--vault-warn)" }}>
            Power Board
          </Link>{" "}
          because the variance profile is different.
        </p>
        {hasGames && (
          <div className="mt-4">
            <MlbSummaryStrip board={board} />
          </div>
        )}
      </section>

      {!hasGames ? (
        <OffDayPanel />
      ) : (
        <>
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
          {hasLeans && (
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
                    <span style={{ color: "var(--vault-gold-bright)" }}>
                      {c.high}H
                    </span>
                    <span style={{ color: "var(--vault-text-faint)" }}>·</span>
                    <span style={{ color: "var(--vault-text-faint)" }}>
                      {c.total} total
                    </span>
                  </span>
                );
              })}
            </section>
          )}

          {/* Pending banner — schedule loaded but no posted lines */}
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
                  prop lines pending · projections coming soon
                </div>
                {hasLeans
                  ? "Posted prop lines are limited for this slate."
                  : "Schedule is live but no posted prop lines yet. Projections appear here when lines post."}{" "}
                {board.pendingReason && (
                  <span>Reason: {board.pendingReason}.</span>
                )}
              </div>
            </section>
          )}

          {hasLeans && (
            <>
              {/* Top Clean Leans strip — always server-rendered. */}
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
            </>
          )}

          {/* Schedule-only fallback: when no leans yet, surface the
              scheduled games so users can still see what is coming. */}
          {!hasLeans && (
            <section className="mt-8">
              <div
                className="font-mono uppercase tracking-[0.14em] mb-3"
                style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
              >
                Scheduled · {totalGames} {totalGames === 1 ? "game" : "games"}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {board.games.map((g) => (
                  <div
                    key={String(g.gamePk)}
                    className="rounded-[3px]"
                    style={{
                      padding: "12px 14px",
                      border: "1px solid var(--vault-border)",
                      background: "rgba(7, 11, 26, 0.45)",
                    }}
                  >
                    <div
                      style={{
                        color: "var(--vault-text)",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      {g.awayTeamAbbr ?? "?"} @ {g.homeTeamAbbr ?? "?"}
                    </div>
                    <div
                      style={{
                        color: "var(--vault-text-faint)",
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      {g.venue ?? "MLB"}
                    </div>
                    {(g.awayProbablePitcherName ||
                      g.homeProbablePitcherName) && (
                      <div
                        className="font-mono"
                        style={{
                          color: "var(--vault-text-mute)",
                          fontSize: 10,
                          marginTop: 4,
                        }}
                      >
                        {g.awayProbablePitcherName ?? "TBD"} · {g.homeProbablePitcherName ?? "TBD"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* MLB Results link */}
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

      {/* Power Board reminder */}
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
              style={{ color: "var(--vault-text)", fontSize: 20, lineHeight: 1.15 }}
            >
              Open the MLB Power Board →
            </h2>
            <p
              className="mt-2 text-[13px] leading-relaxed"
              style={{ color: "var(--vault-text-mute)" }}
            >
              HR markets are high-variance and rated on a separate
              power-profile scale (barrel + park + matchup), not the standard
              High / Medium / Low tiers used here.
            </p>
          </div>
        </Link>
      </section>

      <BackToOverviewLink />
    </div>
  );
}

function OffDayPanel() {
  return (
    <section className="mt-8">
      <div
        className="rounded-[6px] px-5 py-6 text-[13px] leading-relaxed"
        style={{
          background: "rgba(7, 11, 26, 0.55)",
          border: "1px solid var(--vault-border)",
          color: "var(--vault-text-mute)",
        }}
      >
        <div
          className="font-mono uppercase tracking-[0.14em] mb-2"
          style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
        >
          Off-day
        </div>
        No MLB games are scheduled for this date. Check the{" "}
        <Link href="/mlb" style={{ color: "var(--vault-gold-bright)" }}>
          MLB overview
        </Link>{" "}
        for the next available slate.
      </div>
    </section>
  );
}

function BackToOverviewLink() {
  return (
    <section
      className="mt-10 text-[12px]"
      style={{ color: "var(--vault-text-faint)" }}
    >
      <Link href="/mlb" style={{ color: "var(--vault-gold-bright)" }}>
        ← back to MLB overview
      </Link>
    </section>
  );
}
