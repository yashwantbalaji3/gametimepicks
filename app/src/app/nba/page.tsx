/**
 * /nba — the NBA hub: schedule and official finals, no forecast (Session 6 · NBA factual shell).
 *
 * This route was a redirect to /results/nba because the old hub's Projections / Player Props tabs read as
 * live coverage while the source was dead. What is here now is only what the repo can stand behind: the
 * ESPN schedule capture (preseason from 2026-10-03, regular season from 2026-10-20) and the write-once
 * finals record. NBA stays HISTORICAL_ONLY in the capability registry and no NBA model has cleared its
 * preregistered bars, so no row carries a probability, a pick or a projected score — the adapter has no
 * path that could attach one. The retired May–June player-prop archive stays where it was, linked below
 * and labelled as the retired model it is.
 */
import SportHubNav from "@/components/sports/sport-hub-nav";
import Link from "next/link";
import HubHeader, { HubTitle } from "@/components/sport-hub/hub-header";
import SportSwitcher from "@/components/sports/sport-switcher";
import { nbaHub } from "@/lib/sport-hub/nba-hub";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import NbaExperimentalLane, { NbaLaneTonight, loadCurrentLane } from "@/components/nba/experimental-lane";
import { currentEtDate } from "@/lib/freshness";
import path from "node:path";
import { publicTheaterRouteIds } from "@/lib/simulation-theater/nba/possession/public-route.mjs";
import { nbaTodaySlate } from "@/lib/sport-hub/nba-hub";
import { NbaSlateOverview, NbaScheduleCards } from "@/components/nba/hub-overview";
import { LANE } from "@/lib/sports/nba/experimental-public-lane.mjs";
import { PUBLIC_TERMS, publicSport } from "@/lib/public-registry";

const NBA_PUBLIC = publicSport("nba")!;

export const metadata = withRouteMetadata("/nba/", {
  title: "NBA — Official Forecasts, Top Boards & Game Simulations · GameTime Picks",
  description:
    "The 2026-27 NBA schedule and official finals, the Official Forecast for every game (favoured side and player medians, frozen before tip-off), Top Boards and a Game Simulation per game. Not betting recommendations. The retired May–June 2026 player-prop archive is linked separately.",
});

const REPO_ROOT = path.resolve(process.cwd(), "..");

export default async function NbaHubPage() {
  /* §12 look 5 · §13 (founder decision 2026-10-20): the experimental lane — null when disabled or empty, and hidden once
     its slate is in the past (a stale snapshot never reads as current; the page falls back to the factual wording). */
  const lane = loadCurrentLane(currentEtDate());
  // Theater entry points (release owner 2026-10-21): exactly the games /nba/simulation/<id>/ builds (the route's own
  // gate and ids). The flag test is an INLINE literal, as on the route, so a flag-OFF build never imports the loader.
  let theaterIds: string[] = [];
  if (process.env.GTP_NBA_THEATER_PUBLIC === "1") {
    const { publicPossessionEvents } = await import("@/lib/simulation-theater/nba/possession/public-loader.mjs");
    theaterIds = publicTheaterRouteIds(() => publicPossessionEvents(REPO_ROOT));
  }
  const nowIso = new Date().toISOString();
  const model = nbaHub(nowIso, lane ? new Set(lane.games.map((g) => g.providerEventId)) : null);
  /* NBA UI parity (2026-10-22): today's slate — the same view the homepage NBA lane reads — leads the page. */
  const slate = nbaTodaySlate(nowIso, lane, { laneEnabled: LANE.enabled, theaterIds });
  const uncovered = slate.games.filter((g) => !g.favoured);
  /* Page weight (/nba ceiling 250 KB): today's games render once, as the cards above — the long schedule lists the rest
     of the window. A card costs ~2.8 KB (HTML + flight), a duplicate schedule row ~1.4 KB more, which a 15-game night
     cannot afford twice. */
  const carded = new Set(slate.games.map((g) => g.id));
  const scheduleModel = carded.size ? { ...model, rows: model.rows.filter((r) => !carded.has(String(r.id))) } : model;
  const finals = model.rows.filter((r) => r.status === "final").length;
  /* A recorded FINAL (from the same finals record the list below uses) is the only status a card states: the page is a
     static export, so "scheduled" or "tipped" computed at build time would go stale after tip-off. Otherwise the card
     shows only its fixed tip-off and freeze times. */
  const statuses: Record<string, string> = {};
  for (const r of model.rows) if (r.status === "final" && lane?.games.some((g) => g.providerEventId === r.id)) statuses[r.id] = `final · ${r.reportNote}`;
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      {/* UX-001 phase 2: the shared sport switcher — every hub links to every other sport. */}
      <SportSwitcher current="nba" />
      <HubTitle model={model} />
      <p className="m-0 max-w-2xl text-[13.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
        {lane ? (
          <>
            <span className="font-semibold" style={{ color: "var(--vault-text)" }}>Schedule, finals and the {PUBLIC_TERMS.OFFICIAL_FORECAST}.</span>{" "}
            Games, start times and official finals, plus the {PUBLIC_TERMS.OFFICIAL_FORECAST}: the Elo-favoured side and frozen pregame player
            medians, with a {PUBLIC_TERMS.GAME_SIMULATION} of each game.
          </>
        ) : (
          <>Games, start times and official finals, and on game days the {PUBLIC_TERMS.OFFICIAL_FORECAST} (see today, below).</>
        )}
      </p>
      <NbaSlateOverview slate={slate} gamesAnchor={lane ? "nba-experimental" : "nba-today-games"} />
      <NbaLaneTonight snapshot={lane} />
      <SportHubNav sport="nba" />
      {/* Founder direction 2026-10-20: tonight's frozen experimental output leads the page, above the schedule. */}
      <NbaExperimentalLane snapshot={lane} statuses={statuses} theaterIds={theaterIds} />
      {/* Today's games with no official forecast in this build (before today's publish, or excluded by the lane). */}
      <NbaScheduleCards games={uncovered} id="nba-today-games" heading={lane ? "Also on today's schedule" : `Today's games · ${slate.dateLabel}`} />
      <section id="nba-games" className="scroll-mt-24" aria-label="NBA games">
        {/* Session 11: schedule-only — one line per game keeps every game inside the page budget. */}
        {carded.size ? <p className="m-0 mb-2 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>Today&rsquo;s {carded.size} game{carded.size === 1 ? " is" : "s are"} in the cards above; the list below is the rest of the window.</p> : null}
        <HubHeader model={scheduleModel} compact />
      </section>

      {/* founder directive 2026-10-23 public readiness: what is published, as what, and its Model Performance — read from
          the public registry (lib/public-registry.ts), the same facts Methodology, Home and the Simulate lobby print */}
      <section id="nba-model-status" className="scroll-mt-24 flex flex-col gap-2" aria-labelledby="nba-model-status-h">
        <h2 id="nba-model-status-h" className="m-0 font-display text-[18px] font-bold" style={{ color: "var(--vault-text)" }}>How it works</h2>
        <ul className="m-0 pl-5 text-[13.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          {NBA_PUBLIC.families.map((f) => (
            <li key={f.id}><strong style={{ color: "var(--vault-text)" }}>{f.label}</strong>: {f.publication === "OFFICIAL_FORECAST" ? `${PUBLIC_TERMS.OFFICIAL_FORECAST}, frozen before tip-off.` : "withheld — not published until it meets its checks."}</li>
          ))}
          <li><strong style={{ color: "var(--vault-text)" }}>{PUBLIC_TERMS.GAME_SIMULATION}</strong>: {NBA_PUBLIC.features.gameSimulation.note} It never changes the {PUBLIC_TERMS.OFFICIAL_FORECAST}.</li>
          <li><strong style={{ color: "var(--vault-text)" }}>{PUBLIC_TERMS.MODEL_PERFORMANCE}</strong>: {NBA_PUBLIC.features.modelPerformance.note}</li>
          <li>Preseason games are tracked for schedule and final-score plumbing only; they never count as model evidence.</li>
        </ul>
      </section>

      <section id="nba-results" className="scroll-mt-24 flex flex-col gap-2" aria-labelledby="nba-results-h">
        <h2 id="nba-results-h" className="m-0 font-display text-[18px] font-bold" style={{ color: "var(--vault-text)" }}>Results</h2>
        <p className="m-0 text-[13.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          {finals > 0
            ? `${finals} official final${finals === 1 ? "" : "s"} in the window above, from the write-once finals record.`
            : "Official finals appear on their game rows once the finals record holds them. A game without one is pending, not a result."}
        </p>
        <p className="m-0 text-[13.5px]">
          <Link href="/results/nba/" className="underline inline-flex items-center" style={{ color: "var(--vault-text)", minHeight: 44 }}>
            May–June 2026 player-prop archive
          </Link>
          <span style={{ color: "var(--vault-text-mute)" }}> — a retired model&rsquo;s settled record, kept for transparency.</span>
        </p>
      </section>
    </div>
  );
}
