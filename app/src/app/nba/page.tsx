import Link from "next/link";
import {
  getSlate,
  getBoardForDate,
  getAvailableBoardDates,
  getLifetimeSummary,
} from "@/lib/data";
import type { BoardData } from "@/lib/types";
import { selectActiveSlate } from "@/lib/active-slate";
import { currentEtDate } from "@/lib/freshness";
import { formatDateLong } from "@/lib/format";
import NeonStatPanel from "@/components/neon-stat-panel";
import NbaSectionTabs from "@/components/nba/nba-section-tabs";
import { getPlayoffContext } from "@/components/playoff-context";
import OverviewFooterDisclosure from "@/components/overview-footer-disclosure";

export const metadata = {
  title: "NBA · GameTime Picks",
  description:
    "Educational NBA player-prop analytics — transparent model leans on points, rebounds and assists with a separate audit page for hit-rate calibration.",
};

export default function NbaLandingPage() {
  const slate = getSlate();
  const lifetime = getLifetimeSummary();
  const buildTimeToday = currentEtDate();
  const allDates = getAvailableBoardDates();

  // Mirror /board's active-slate logic so the Overview lines up with
  // whatever the Model Board actually defaults to.
  const boardsByDate: Record<string, BoardData> = {};
  for (const d of allDates) {
    boardsByDate[d] = getBoardForDate(d);
  }
  const rawActiveSlate = selectActiveSlate(allDates, buildTimeToday, boardsByDate);
  const activeSlate = (() => {
    if (rawActiveSlate.kind !== "today") return rawActiveSlate;
    const todayDate = rawActiveSlate.selectedDate;
    if (!todayDate) return rawActiveSlate;
    const todayBoard = boardsByDate[todayDate];
    if ((todayBoard?.games?.length ?? 0) > 0) return rawActiveSlate;
    const futureWithLeans = rawActiveSlate.upcomingAndTodayDates
      .filter((d) => d > todayDate)
      .find((d) => (boardsByDate[d]?.leans?.length ?? 0) > 0);
    if (!futureWithLeans) return rawActiveSlate;
    return { ...rawActiveSlate, selectedDate: futureWithLeans };
  })();

  const activeDate = activeSlate.selectedDate ?? slate.primaryDate;
  const board = activeDate ? boardsByDate[activeDate] : undefined;
  const leans = board?.leans ?? [];
  const games = board?.games ?? [];
  const highCount = leans.filter((l) => l.confidence === "High").length;
  const mediumCount = leans.filter((l) => l.confidence === "Medium").length;
  const anomalyCount = leans.filter((l) =>
    (l.riskFlags ?? []).includes("suspicious_edge"),
  ).length;
  const propsLoaded = leans.some(
    (l) =>
      typeof l.projection === "number" &&
      typeof l.edgePct === "number" &&
      Number.isFinite(l.edgePct),
  );

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <NbaSectionTabs />
      </div>

      {/* Hero — sport-eyebrow + headline. Same data-orbit shell as /mlb
          so the two sport hubs feel like equal siblings. */}
      <section className="reveal vault-data-orbit relative overflow-hidden -mx-4 sm:-mx-8 px-4 sm:px-8 py-8">
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
        >
          NBA · educational analytics
        </div>
        <h1
          className="mt-3 vault-display-h1"
          style={{ color: "var(--vault-text)" }}
        >
          NBA player props with a transparent model.
        </h1>
        <p
          className="mt-4 max-w-2xl text-[14px] sm:text-[15px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          We project points, rebounds, and assists from each
          player&apos;s last 10 games, compare against posted prop
          lines, and surface the gap. High-variance markets and edges
          above ~25% are tagged as model anomalies and capped at Low
          confidence — never sold as confident leans.
        </p>
      </section>

      {/* KPI tiles — NBA at a glance for the active slate. */}
      <section className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
        <NeonStatPanel
          label="Games on slate"
          value={String(games.length)}
          sub={activeDate || "—"}
          valueAccent="gold"
          delay={1}
        />
        <NeonStatPanel
          label="Model leans"
          value={String(leans.length)}
          sub={propsLoaded ? "real prop lines" : "lines pending"}
          valueAccent={propsLoaded ? "default" : "mute"}
          delay={2}
        />
        <NeonStatPanel
          label="High confidence"
          value={String(highCount)}
          sub={`${mediumCount} medium · ${anomalyCount} anomalies`}
          valueAccent="success"
          delay={3}
        />
        <NeonStatPanel
          label="Settled audit"
          value={
            lifetime?.hitRate !== null && lifetime?.hitRate !== undefined
              ? `${(lifetime.hitRate * 100).toFixed(1)}%`
              : "—"
          }
          sub={
            lifetime
              ? `${lifetime.wins}–${lifetime.losses} on ${lifetime.decisive}`
              : "no settled slates yet"
          }
          valueAccent={lifetime ? "default" : "mute"}
          delay={4}
        />
      </section>

      {/* CTA cards — Model Board + Parlays. Mirrors the MLB hub layout. */}
      <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/nba/board"
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
              NBA board
            </h2>
            <p
              className="mt-2 text-[13px] leading-snug"
              style={{ color: "var(--vault-text-mute)" }}
            >
              Points, rebounds and assists for every player with a
              posted line. Confidence tiers, R5 anomaly guardrails,
              and recent-form notes on every card.
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
          href="/nba/parlays"
          className="gtp-aurora-halo block reveal vault-glow-hover"
        >
          <div className="gtp-status-board p-5 sm:p-6 h-full">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block w-2 h-2 rounded-full"
                style={{
                  background: "var(--vault-gold)",
                  boxShadow: "0 0 10px rgba(212, 175, 55, 0.6)",
                }}
              />
              <span
                className="font-mono uppercase tracking-[0.16em]"
                style={{ color: "var(--vault-gold)", fontSize: 10 }}
              >
                NBA Parlay Lab
              </span>
            </div>
            <h2
              className="mt-3 font-display font-semibold tracking-tight"
              style={{ color: "var(--vault-text)", fontSize: 22, lineHeight: 1.15 }}
            >
              Build candidate slips
            </h2>
            <p
              className="mt-2 text-[13px] leading-snug"
              style={{ color: "var(--vault-text-mute)" }}
            >
              Generate parlay candidates from clean model leans across
              Conservative, Balanced and wider-edge modes. Same-game,
              same-team and anomaly correlations are surfaced — never
              hidden.
            </p>
            <div
              className="mt-4 font-mono"
              style={{ color: "var(--vault-gold-bright)", fontSize: 12 }}
            >
              Open the lab →
            </div>
          </div>
        </Link>
      </section>

      {/* NBA audit pointer — hit-rate emphasis lives on Results, so this
          is a quiet text chip rather than a giant percentage. */}
      {lifetime && (
        <section className="mt-6">
          <Link
            href="/nba/results"
            className="vault-glow-hover inline-flex items-center gap-2 rounded-[3px]"
            style={{
              padding: "10px 14px",
              border: "1px solid rgba(212, 175, 55, 0.30)",
              background: "rgba(212, 175, 55, 0.06)",
              color: "var(--vault-gold-bright)",
              textDecoration: "none",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
            aria-label="Open the NBA model audit"
          >
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background: "var(--vault-gold-bright)",
                boxShadow: "0 0 6px rgba(240, 199, 94, 0.45)",
              }}
            />
            Open NBA model audit
            <span style={{ color: "var(--vault-text-faint)" }}>
              · {lifetime.wins}–{lifetime.losses} on {lifetime.decisive}
            </span>
            <span style={{ color: "var(--vault-gold-bright)" }}>→</span>
          </Link>
        </section>
      )}

      {/* Slate strip — active-slate games with playoff context chips. */}
      <section className="mt-10">
        <h2
          className="font-mono uppercase tracking-[0.16em] mb-3"
          style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
        >
          Active slate · {activeDate ? formatDateLong(activeDate) : "—"}
        </h2>
        {games.length === 0 ? (
          <div
            className="rounded-[6px] px-4 py-5 text-[13px]"
            style={{
              background: "rgba(7, 11, 26, 0.55)",
              border: "1px solid var(--vault-border)",
              color: "var(--vault-text-mute)",
            }}
          >
            No NBA games on the active slate. The next refresh will surface
            tomorrow&apos;s matchups as soon as the schedule posts.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {games.map((g) => {
              const ctx = getPlayoffContext(
                g.gameId,
                g.awayTeamAbbr,
                g.homeTeamAbbr,
              );
              return (
                <Link
                  key={g.gameId}
                  href={`/nba/board`}
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
                      {ctx.isPlayoffs
                        ? `${ctx.roundLabel} · ${ctx.gameLabel}`
                        : "regular season"}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <span
                      className="font-mono"
                      style={{ color: "var(--vault-gold-bright)", fontSize: 12 }}
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

      <OverviewFooterDisclosure
        inputsLabel="Projection method"
        inputsBody={
          <>
            Last-10 weighted means with matchup adjustments,
            normal-approximation edges, and an R5 anomaly guardrail
            that caps confidence on edges above 25 pp. See{" "}
            <Link
              href="/methodology"
              style={{ color: "var(--vault-gold-bright)" }}
            >
              Methodology
            </Link>{" "}
            for the full formula.
          </>
        }
        framingBody={
          <>
            Educational analytics, not betting advice. The Results
            page is where hit-rate calibration lives — every model
            lean is logged at generation time and graded against the
            final box score.
          </>
        }
      />
    </div>
  );
}
