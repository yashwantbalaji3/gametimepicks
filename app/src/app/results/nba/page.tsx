/**
 * /results/nba — the NBA settled archive.
 *
 * NBA is HISTORICAL_ONLY in the capability registry: the source stopped producing on 2026-06-13 and
 * there is no live projection path, so nothing forward-looking may publish for this sport. What is
 * real is the settled record — every lean already graded against an official final box score — and
 * that record stays published rather than being quietly deleted.
 *
 * This is the canonical URL. The sport-namespaced twin /nba/results is a redirect stub pointing here,
 * so this page holds the body: a page that re-exported the stub would redirect to itself.
 */
import Link from "next/link";
import {
  getLifetimeSummary,
  getLatestSettlement,
  getAvailableSettlementDates,
} from "@/lib/settlement-data";
import { getBoardForDate, getAvailableBoardDates } from "@/lib/data";
import { getMlbLifetimeSummary } from "@/lib/data-mlb-results";
import { formatPercent } from "@/lib/format";
import ResultsSportTabs from "@/components/results-sport-tabs";
import EmptyResultsCard from "@/components/empty-results-card";
import PerGameScorecard from "@/components/per-game-scorecard";
import ResultsBreakdown from "@/components/results-breakdown";
import ResultsModelAuditNotes from "@/components/results-model-audit-notes";
import AnomalyGuardrailPanel from "@/components/anomaly-guardrail-panel";
import SettledGameDetail, {
  type SettledLeanRow,
} from "@/components/settled-game-detail";
import SettledPlayerList from "@/components/settled-player-list";
import NeonCornerBracket from "@/components/neon-corner-bracket";
import { getPlayoffContext } from "@/components/playoff-context";
import ModelLessonsCard from "@/components/model-lessons-card";

export const metadata = {
  title: "NBA Model Audit (archive) · GameTime Picks",
  description:
    "The settled NBA archive — every lean graded against the verified final box score. Historical record only; NBA is no longer covered.",
};

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

export default function NbaResultsPage() {
  const lifetime = getLifetimeSummary();
  const mlbLifetime = getMlbLifetimeSummary();
  const latest = getLatestSettlement();
  const allDates = getAvailableSettlementDates();
  const latestScoredDate = findLatestScoredBoardDate();
  const nbaHasData = lifetime.totalSettled > 0;
  const mlbHasData = mlbLifetime !== null && mlbLifetime.totalSettled > 0;

  if (lifetime.totalSettled === 0 || latest === null) {
    return (
      <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
        <div className="mb-2">
          <ResultsSportTabs
            activeSport="nba"
            nbaHasData={nbaHasData}
            mlbHasData={mlbHasData}
          />
        </div>
        <div className="reveal mt-4">
          <div
            className="font-mono uppercase tracking-[0.16em]"
            style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
          >
            NBA model audit · pending first settlement
          </div>
          <h1
            className="mt-2 vault-display-h2"
            style={{ color: "var(--vault-text)" }}
          >
            Grades land here after final box scores post.
          </h1>
          <p
            className="mt-3 max-w-2xl text-[13px] leading-relaxed"
            style={{ color: "var(--vault-text-mute)" }}
          >
            Every NBA model lean is logged at generation time and
            graded against the verified box score after each game
            completes. When the next slate finals, the audit lands
            here.
          </p>
        </div>
        <div className="mt-8">
          <EmptyResultsCard latestScoredDate={latestScoredDate} />
        </div>
      </div>
    );
  }

  const latestBoard = getBoardForDate(latest.date);
  const boardLeans = latestBoard.leans ?? [];
  const boardGames = latestBoard.games ?? [];

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
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <ResultsSportTabs
          activeSport="nba"
          nbaHasData={nbaHasData}
          mlbHasData={mlbHasData}
        />
      </div>

      {/* Hero — NBA-only audit. The cross-sport overall hit rate lives
          on the global /results hub. */}
      <section className="reveal vault-data-orbit neon-corner-bracket gtp-line-scan relative overflow-hidden -mx-4 sm:-mx-8 px-4 sm:px-8 pt-6 pb-4">
        <NeonCornerBracket />
        <div className="flex items-center gap-2 mb-3">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
            style={{
              background: "var(--vault-gold-bright)",
              boxShadow: "0 0 8px rgba(242, 54, 69, 0.6)",
            }}
          />
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-gold)", fontSize: 10 }}
          >
            NBA model audit · graded against final box scores
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <h1
            className="font-display font-semibold tracking-tightest leading-[0.95]"
            style={{
              color: "var(--vault-gold-bright)",
              fontSize: "clamp(48px, 10vw, 96px)",
              textShadow:
                "0 0 24px rgba(242, 54, 69, 0.45), 0 0 8px rgba(242, 54, 69, 0.55)",
            }}
          >
            {lifetime.hitRate !== null ? formatPercent(lifetime.hitRate) : "—"}
          </h1>
          <span
            className="font-display tracking-tight"
            style={{
              color: "var(--vault-text)",
              fontSize: "clamp(18px, 2.6vw, 22px)",
            }}
          >
            NBA hit rate · {lifetime.wins}–{lifetime.losses}
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
          {lifetime.totalDates}{" "}
          {lifetime.totalDates === 1 ? "slate" : "slates"} settled
          {lifetime.newestDate ? ` · most recent: ${lifetime.newestDate}` : ""}
          . Looking for the cross-sport overall audit? See the{" "}
          <Link href="/results" style={{ color: "var(--vault-gold-bright)" }}>
            global Results hub
          </Link>
          . Hit rate excludes pushes and No Plays. Educational analytics —
          not betting advice.
        </p>
      </section>

      {lifetime.smallSample && (
        <aside
          className="mt-6 px-4 py-3 rounded-[3px] flex items-start gap-3"
          style={{
            background: "var(--vault-warn-dim)",
            border: "1px solid rgba(242, 54, 69, 0.30)",
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
            {lifetime.decisive} decisive picks is below the ~25-pick floor
            where hit rates start to be statistically meaningful. Treat
            these numbers as descriptive, not predictive.
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

      {allDates.length > 1 && (
        <section className="mt-8">
          <SectionHeading>settled dates</SectionHeading>
          <div className="mt-3 flex flex-wrap gap-2">
            {allDates.map((d) => (
              <span
                key={d}
                className="px-2.5 py-1 rounded-[2px] font-mono text-[11px] tracking-wider uppercase"
                style={{
                  color:
                    d === latest.date
                      ? "var(--vault-gold-bright)"
                      : "var(--vault-text-mute)",
                  background:
                    d === latest.date
                      ? "var(--vault-gold-dim)"
                      : "var(--vault-panel-elevated)",
                  border: `1px solid ${
                    d === latest.date
                      ? "var(--vault-border-strong)"
                      : "var(--vault-border)"
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

      <PerGameScorecard rows={latest.rows} games={boardGames} />

      <AnomalyGuardrailPanel
        settledRows={latest.rows}
        boardLeans={boardLeans}
      />

      {/* PR #111: player-by-player accordion grid as the first-paint
          audit surface. Replaces the giant 8-column per-game table on
          mobile + desktop. The per-game table stays accessible below
          inside a `<details>` so power users can still cross-reference.
       */}
      {latest.rows.length > 0 && (
        <section className="mt-10">
          <SectionHeading>
            {latest.date} · player audit · projection vs actual
          </SectionHeading>
          <div className="mt-4">
            <SettledPlayerList
              rows={latest.rows}
              sport="nba"
              matchupLabels={gameLabelMap}
            />
          </div>
        </section>
      )}

      {/* Settled games · tap to expand each game's projection-vs-actual
          audit. Same SettledGameDetail component used on the MLB Results
          page for consistent UX across sports. */}
      {latest.rows.length > 0 && (
        <section className="mt-10">
          <details
            className="group"
            style={{
              background: "rgba(26, 16, 11,0.40)",
              border: "1px dashed var(--vault-border)",
              borderRadius: 8,
              padding: "10px 14px",
            }}
          >
            <summary
              className="list-none cursor-pointer flex items-center justify-between gap-2"
              style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
            >
              <span
                className="font-mono uppercase tracking-[0.16em]"
                style={{ color: "var(--vault-gold)", fontSize: 10 }}
              >
                Full per-game audit table · {latest.date}
              </span>
              <span
                aria-hidden
                className="font-mono transition-transform group-open:rotate-180"
                style={{ color: "var(--vault-text-faint)" }}
              >
                ▾
              </span>
            </summary>
            <div className="mt-3">
          <SectionHeading>
            {latest.date} · settled games · projection vs actual
          </SectionHeading>
          <div className="mt-4 flex flex-col gap-3">
            {(() => {
              const rowsByGame = new Map<string, typeof latest.rows>();
              for (const r of latest.rows) {
                const k = r.gameId ?? "_";
                const list = rowsByGame.get(k) ?? [];
                list.push(r);
                rowsByGame.set(k, list);
              }
              const orderedGameIds = Object.keys(latest.report?.byGame || {});
              const seen = new Set<string>();
              const ordered = [
                ...orderedGameIds.filter((g) => rowsByGame.has(g)),
                ...[...rowsByGame.keys()].filter(
                  (g) => !orderedGameIds.includes(g),
                ),
              ].filter((g) => {
                if (seen.has(g)) return false;
                seen.add(g);
                return true;
              });
              return ordered.map((gameId) => {
                const rows = rowsByGame.get(gameId) || [];
                const wins = rows.filter((r) => r.result === "win").length;
                const losses = rows.filter((r) => r.result === "loss").length;
                const pushes = rows.filter((r) => r.result === "push").length;
                const decisive = wins + losses;
                const hitRate = decisive > 0 ? wins / decisive : null;
                const matchup =
                  gameLabelMap[gameId] ||
                  (rows[0]?.team && rows[0]?.opponent
                    ? `${rows[0].team} @ ${rows[0].opponent}`
                    : "Settled game");
                const ctx = getPlayoffContext(
                  gameId,
                  rows[0]?.team,
                  rows[0]?.opponent,
                );
                const subtitle = ctx.isPlayoffs
                  ? `${ctx.roundLabel} · ${ctx.gameLabel}`
                  : undefined;
                const detailRows: SettledLeanRow[] = rows.map((r, i) => {
                  const odds = r.side === "Over" ? r.oddsOver : r.oddsUnder;
                  const outcome: SettledLeanRow["outcome"] =
                    r.result === "win"
                      ? "Win"
                      : r.result === "loss"
                        ? "Loss"
                        : r.result === "push"
                          ? "Push"
                          : "—";
                  return {
                    id: `${r.date}-${r.gameId}-${r.playerId}-${r.market}-${i}`,
                    playerName: r.playerName ?? "—",
                    marketLabel: r.market ?? "—",
                    side: r.side ?? "Pass",
                    line: r.line ?? null,
                    projection: r.modelProjection ?? null,
                    actual:
                      typeof r.finalStat === "number" ? r.finalStat : null,
                    outcome,
                    confidence: r.confidence ?? "—",
                    edgePct:
                      typeof r.edgePct === "number" ? r.edgePct : null,
                    bookmaker: r.bookmaker ?? null,
                    oddsForSide: odds ?? null,
                  };
                });
                return (
                  <SettledGameDetail
                    key={gameId}
                    matchup={matchup}
                    subtitle={subtitle}
                    wins={wins}
                    losses={losses}
                    pushes={pushes}
                    decisive={decisive}
                    hitRate={hitRate}
                    rows={detailRows}
                    tone="gold"
                    defaultOpen={false}
                  />
                );
              });
            })()}
            </div>
            </div>
          </details>
        </section>
      )}

      {latest.report && (
        <section className="mt-10">
          <SectionHeading>{latest.date} · breakdown</SectionHeading>
          <ResultsBreakdown
            report={latest.report}
            gameLabelMap={gameLabelMap}
          />
        </section>
      )}

      {/* Audit notes computed from every settled NBA slate, not just
          the latest. Side / market / edge-band splits are auto-derived
          from the same JSONL the lifetime tile reads. */}
      <ResultsModelAuditNotes mode="sport" sport="NBA" />

      <ModelLessonsCard
        title="NBA model lessons"
        lessons={[
          {
            eyebrow: "Anomaly guardrail working",
            tone: "gold",
            text: (
              <>
                R5 anomaly leans (capped at Low with a model-anomaly chip) hit
                roughly a coin flip on settled NBA rows; clean leans
                outperform. The cap is doing its job.
              </>
            ),
            caveat: <>NBA settled rows audited: {lifetime.decisive} decisive.</>,
          },
          {
            eyebrow: "Edge band findings",
            tone: "gold",
            text: (
              <>
                Mid-band edges (10–20pp) outperformed both weak edges and
                anomaly-territory edges on this slate. We did not encode this
                bucketing yet — needs more graded slates first.
              </>
            ),
            caveat: <>Single-slate signal — descriptive, not predictive.</>,
          },
        ]}
      />

      <section
        className="mt-10 text-[12px]"
        style={{ color: "var(--vault-text-faint)" }}
      >
        <Link href="/results" style={{ color: "var(--vault-gold-bright)" }}>
          ← global Results hub (cross-sport)
        </Link>
      </section>

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
