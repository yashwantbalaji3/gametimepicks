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
import SportLobbyActions from "@/components/sport-lobby-actions";

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

      {/* Unified sport-lobby action grid — same 4 tiles across every
          sport (NBA / MLB / NHL / IPL). Replaces the previous 2-card
          CTA strip + audit-pointer chip. */}
      <div className="mt-8">
        <SportLobbyActions
          sport="nba"
          status={{
            board: leans.length > 0
              ? { text: `live · ${leans.length} leans`, tone: "success" }
              : { text: "lines pending", tone: "warn" },
            parlays: {
              text: "NBA candidate slips · live",
              tone: "gold",
            },
            power: { text: "high-variance watch", tone: "warn" },
            results: lifetime
              ? {
                  text: `audit · ${lifetime.wins}–${lifetime.losses} on ${lifetime.decisive}`,
                  tone: "gold",
                }
              : { text: "pending first settlement", tone: "mute" },
          }}
        />
      </div>

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
