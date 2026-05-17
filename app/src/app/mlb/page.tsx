import Link from "next/link";
import {
  activeMlbDate,
  getMlbBoardForDate,
  getMlbScheduleForDate,
} from "@/lib/data-mlb";
import { getMlbLifetimeSummary } from "@/lib/data-mlb-results";
import { formatTipoffEt } from "@/lib/format-mlb";
import NeonStatPanel from "@/components/neon-stat-panel";
import MlbSummaryStrip from "@/components/mlb/mlb-summary-strip";
import MlbSectionTabs from "@/components/mlb/mlb-section-tabs";

export const metadata = {
  title: "MLB · GameTime Picks",
  description:
    "Educational MLB player-prop analytics — transparent model leans on pitcher strikeouts and batter markets, with a separate Power Board for home-run analysis.",
};

const DEFAULT_DATE = "2026-05-16";

export default function MlbLandingPage() {
  const date = activeMlbDate() ?? DEFAULT_DATE;
  const board = getMlbBoardForDate(date);
  const schedule = getMlbScheduleForDate(date);
  const mlbLifetime = getMlbLifetimeSummary();

  const summary = board.summary;
  const propsAvailable = board.propsAvailable;

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <MlbSectionTabs />
      </div>

      {/* Hero — sport-eyebrow + headline */}
      <section className="reveal vault-data-orbit relative overflow-hidden -mx-4 sm:-mx-8 px-4 sm:px-8 py-8">
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
        >
          MLB · educational analytics
        </div>
        <h1
          className="mt-3 vault-display-h1"
          style={{ color: "var(--vault-text)" }}
        >
          MLB player props with a transparent model.
        </h1>
        <p
          className="mt-4 max-w-2xl text-[14px] sm:text-[15px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          We project pitcher strikeouts and batter markets from free MLB Stats
          API game logs, compare against posted prop lines, and surface the gap.
          Home-run picks live on a separate Power Board because the variance
          profile is different.
        </p>
        <div className="mt-5">
          <MlbSummaryStrip board={board} />
        </div>
      </section>

      {/* KPI tiles — today's MLB at a glance */}
      <section className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
        <NeonStatPanel
          label="Games today"
          value={String(summary.scheduledGames || schedule.games.length || 0)}
          sub={date}
          valueAccent="gold"
          delay={1}
        />
        <NeonStatPanel
          label="Model leans"
          value={String(summary.leans)}
          sub={propsAvailable ? "real prop lines" : "lines pending"}
          valueAccent={propsAvailable ? "default" : "mute"}
          delay={2}
        />
        <NeonStatPanel
          label="High confidence"
          value={String(summary.highConfidence)}
          sub={`anomalies flagged ${summary.anomalies}`}
          valueAccent="success"
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

      {/* CTA cards — main board + Power Board */}
      <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/mlb/board"
          className="gtp-aurora-halo block reveal vault-glow-hover"
        >
          <div className="gtp-status-board p-5 sm:p-6 h-full">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block w-2 h-2 rounded-full gtp-neon-pulse"
                style={{
                  background: "var(--vault-gold-bright)",
                  boxShadow: "0 0 10px rgba(240, 199, 94, 0.7)",
                }}
              />
              <span
                className="font-mono uppercase tracking-[0.16em]"
                style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
              >
                main projection board
              </span>
            </div>
            <h2
              className="mt-3 font-display font-semibold tracking-tight"
              style={{ color: "var(--vault-text)", fontSize: 22, lineHeight: 1.15 }}
            >
              MLB board
            </h2>
            <p
              className="mt-2 text-[13px] leading-snug"
              style={{ color: "var(--vault-text-mute)" }}
            >
              Pitcher strikeouts and batter hits + total bases for every game
              with posted lines. Confidence tiers, R5 anomaly guardrails, and
              recent-form notes on every card.
            </p>
            <div
              className="mt-4 font-mono"
              style={{ color: "var(--vault-gold-bright)", fontSize: 12 }}
            >
              Open the board →
            </div>
          </div>
        </Link>

        <Link
          href="/mlb/power"
          className="gtp-aurora-halo block reveal vault-glow-hover"
        >
          <div className="gtp-status-board p-5 sm:p-6 h-full">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block w-2 h-2 rounded-full"
                style={{
                  background: "var(--vault-warn)",
                  boxShadow: "0 0 10px rgba(212, 175, 55, 0.6)",
                }}
              />
              <span
                className="font-mono uppercase tracking-[0.16em]"
                style={{ color: "var(--vault-warn)", fontSize: 10 }}
              >
                power board · HR watch
              </span>
            </div>
            <h2
              className="mt-3 font-display font-semibold tracking-tight"
              style={{ color: "var(--vault-text)", fontSize: 22, lineHeight: 1.15 }}
            >
              Power Board
            </h2>
            <p
              className="mt-2 text-[13px] leading-snug"
              style={{ color: "var(--vault-text-mute)" }}
            >
              Home-run analytics live here, with a power-profile rating instead
              of standard confidence tiers. Inputs are barrel rate, pitcher HR
              allowed, park, and weather. Today: warming up.
            </p>
            <div
              className="mt-4 font-mono"
              style={{ color: "var(--vault-warn)", fontSize: 12 }}
            >
              Open the Power Board →
            </div>
          </div>
        </Link>
      </section>

      {/* MLB audit tile — only renders when there's at least one settled
          row on disk. Surfaces the lifetime hit rate + W/L/P + partial
          status. Never fabricates anything. */}
      {mlbLifetime && (
        <section className="mt-6">
          <Link
            href="/mlb/results"
            className="vault-glow-hover block rounded-[6px]"
            style={{
              padding: "16px 18px",
              border: "1px solid rgba(74, 222, 128, 0.30)",
              background:
                "linear-gradient(180deg, rgba(74, 222, 128, 0.08) 0%, rgba(7, 11, 26, 0.55) 100%)",
              color: "inherit",
              textDecoration: "none",
            }}
            aria-label="Open the MLB model audit"
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                aria-hidden
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{
                  background: "var(--vault-success)",
                  boxShadow: "0 0 8px rgba(74, 222, 128, 0.55)",
                }}
              />
              <span
                className="font-mono uppercase tracking-[0.16em]"
                style={{ color: "var(--vault-success)", fontSize: 10 }}
              >
                MLB model audit · {mlbLifetime.partial ? "partial" : "live"}
              </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <span
                className="font-display font-semibold tracking-tight"
                style={{
                  color: "var(--vault-success)",
                  fontSize: 28,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {mlbLifetime.hitRate !== null
                  ? `${(mlbLifetime.hitRate * 100).toFixed(1)}%`
                  : "—"}
              </span>
              <span
                className="font-display"
                style={{ color: "var(--vault-text)", fontSize: 14 }}
              >
                hit rate · {mlbLifetime.wins}–{mlbLifetime.losses}
                {mlbLifetime.pushes > 0 ? `–${mlbLifetime.pushes}P` : ""}{" "}
                on{" "}
                <span style={{ color: "var(--vault-text-mute)" }}>
                  {mlbLifetime.decisive} decisive picks
                </span>
              </span>
              {mlbLifetime.partial && (
                <span
                  className="font-mono uppercase tracking-[0.14em]"
                  style={{ color: "var(--vault-warn)", fontSize: 10 }}
                >
                  · {mlbLifetime.pendingGamesTotal} game
                  {mlbLifetime.pendingGamesTotal === 1 ? "" : "s"} still pending
                </span>
              )}
              <span
                className="font-mono uppercase tracking-[0.14em] ml-auto"
                style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
              >
                Open audit →
              </span>
            </div>
          </Link>
        </section>
      )}

      {/* Slate strip — today's matchups + tipoff */}
      <section className="mt-10">
        <h2
          className="font-mono uppercase tracking-[0.16em] mb-3"
          style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
        >
          Today's slate · {date}
        </h2>
        {schedule.games.length === 0 ? (
          <div
            className="rounded-[6px] px-4 py-5 text-[13px]"
            style={{
              background: "rgba(7, 11, 26, 0.55)",
              border: "1px solid var(--vault-border)",
              color: "var(--vault-text-mute)",
            }}
          >
            Schedule warming up. The MLB Stats API will return today's games
            shortly.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {schedule.games.map((g) => {
              const anchor = `game-${g.gamePk ?? `${g.awayTeamAbbr}-${g.homeTeamAbbr}`}`;
              const tileKey = g.gamePk ?? `${g.awayTeamAbbr}-${g.homeTeamAbbr}`;
              return (
                <Link
                  key={tileKey}
                  href={`/mlb/board#${anchor}`}
                  className="vault-glow-hover flex items-center justify-between gap-3 rounded-[3px] focus:outline-none focus-visible:outline focus-visible:outline-2"
                  style={{
                    paddingTop: 10,
                    paddingBottom: 10,
                    paddingLeft: 14,
                    paddingRight: 14,
                    border: "1px solid var(--vault-border)",
                    background: "rgba(7, 11, 26, 0.45)",
                    minWidth: 0,
                    overflow: "hidden",
                    color: "inherit",
                    textDecoration: "none",
                  }}
                  aria-label={`View props for ${g.awayTeamAbbr ?? "?"} at ${g.homeTeamAbbr ?? "?"}`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span
                      style={{
                        color: "var(--vault-text)",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      {g.awayTeamAbbr ?? "?"} @ {g.homeTeamAbbr ?? "?"}
                    </span>
                    <span
                      style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
                    >
                      {g.venue ?? "MLB"}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <span
                      className="font-mono"
                      style={{ color: "var(--vault-gold-bright)", fontSize: 12 }}
                    >
                      {formatTipoffEt(g.gameDate)}
                    </span>
                    <span
                      className="font-mono uppercase tracking-[0.14em]"
                      style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
                    >
                      View props →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Methodology + Responsible-use anchor row */}
      <section className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          className="rounded-[6px] px-4 py-4 text-[12px] leading-relaxed"
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
            MVP projection method
          </div>
          Pitcher strikeouts: 0.55 × last-3 mean + 0.45 × season mean, normal
          approximation. Batters: 0.5 × last-10 mean + 0.5 × season mean, with
          floor on sigma. R5 anomaly guardrail caps edges above 25 pp to Low
          confidence, matching the NBA model.
        </div>
        <div
          className="rounded-[6px] px-4 py-4 text-[12px] leading-relaxed"
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
            Honest framing
          </div>
          This is an educational analytics project. Not betting advice. Same
          responsible-use commitments as NBA — see{" "}
          <Link
            href="/responsible-use"
            style={{ color: "var(--vault-gold-bright)" }}
          >
            Responsible Use
          </Link>{" "}
          for helplines.
        </div>
      </section>
    </div>
  );
}
