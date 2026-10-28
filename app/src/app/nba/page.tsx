/**
 * /nba — the NBA hub (founder mandate 2026-10-24: NBA publicly usable end-to-end, in reader words).
 *
 * THE ORDER IS THE READER'S JOURNEY: today's games → the Official Forecasts → Top Boards → Predicted Player Statistics →
 * Game Simulations → Results & Model Performance → how it works (with the model ids, sources and receipts in a "Model
 * details" disclosure — moved out of the consumer text, never deleted).
 *
 * What is here is only what the repo can stand behind: the ESPN schedule capture, the write-once finals record, the
 * frozen Official Forecast snapshot (Elo-favoured side + player medians; team scores, chances, ranges and prices
 * withheld — the lane tests pin it) and the Game Simulation pages actually built. A game is never shown with a forecast
 * that was not frozen before its tip-off: past games read their side only from that date's committed snapshot.
 * The retired May–June player-prop archive stays where it was, linked below and labelled as the retired model it is.
 */
import SportHubNav from "@/components/sports/sport-hub-nav";
import Link from "next/link";
import { HubTitle } from "@/components/sport-hub/hub-header";
import SportSwitcher from "@/components/sports/sport-switcher";
import { NBA_HUB_BEHIND_DAYS, nbaHub } from "@/lib/sport-hub/nba-hub";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import NbaExperimentalLane, { committedLaneDates, loadCurrentLane, loadLaneForDate } from "@/components/nba/experimental-lane";
import { currentEtDate } from "@/lib/freshness";
import path from "node:path";
import { publicTheaterRouteIds } from "@/lib/simulation-theater/nba/possession/public-route.mjs";
import { nbaTodaySlate } from "@/lib/sport-hub/nba-hub";
import { HubSlipBar, hubSlipLegs } from "@/components/products/hub-slip";
import { NBA_HUB_SECTIONS, NbaGameList, NbaSlateOverview, NbaTodayGames } from "@/components/nba/hub-overview";
import { LANE } from "@/lib/sports/nba/experimental-public-lane.mjs";
import { NBA_MODEL_PERFORMANCE_NOTE, PUBLIC_TERMS, publicSport } from "@/lib/public-registry";

const NBA_PUBLIC = publicSport("nba")!;
const S = NBA_HUB_SECTIONS;
const H2 = "m-0 font-display text-[18px] font-bold";
const MUTE = "m-0 text-[13.5px] leading-relaxed";

export const metadata = withRouteMetadata("/nba/", {
  title: "NBA — Official Forecasts, Top Boards & Game Simulations · GameTime Picks",
  description:
    "Today's NBA games, the Official Forecast for every game (favoured side and Predicted Player Statistics, frozen before tip-off), Top Boards, a Game Simulation per game, and official results. Not betting recommendations.",
});

const REPO_ROOT = path.resolve(process.cwd(), "..");

export default async function NbaHubPage() {
  /* §12 look 5 · §13 (founder decision 2026-10-20): the current Official Forecast snapshot — null when disabled or empty,
     and hidden once its slate is in the past (a stale snapshot never reads as current). */
  const today = currentEtDate();
  const lane = loadCurrentLane(today);
  // Game Simulation entry points (release owner 2026-10-21): exactly the games /nba/simulation/<id>/ builds (the route's
  // own gate and ids). The flag test is an INLINE literal, as on the route, so a flag-OFF build never imports the loader.
  let theaterIds: string[] = [];
  if (process.env.GTP_NBA_THEATER_PUBLIC === "1") {
    const { publicPossessionEvents } = await import("@/lib/simulation-theater/nba/possession/public-loader.mjs");
    theaterIds = publicTheaterRouteIds(() => publicPossessionEvents(REPO_ROOT));
  }
  const nowIso = new Date().toISOString();
  const model = nbaHub(nowIso, lane ? new Set(lane.games.map((g) => g.providerEventId)) : null);
  /* NBA UI parity (2026-10-22): today's slate — the same view the homepage NBA lane reads — leads the page. */
  const slate = nbaTodaySlate(nowIso, lane, { laneEnabled: LANE.enabled, theaterIds });
  const boardDates = committedLaneDates();
  /* Vehicle N: "Add to slip" only on a game Level A suggests (its exact leg, or nothing); the bar renders once, and only
     when a button does, so the slip island never ships to a /nba without one. */
  const slip = await hubSlipLegs("nba", slate.games.map((g) => g.id));
  /* Page weight (/nba ceiling 245 KiB at 15 games): today's games render once, as the cards; the window's other games are
     one line each — upcoming under the cards, started or final under Results. */
  const carded = new Set(slate.games.map((g) => g.id));
  const rest = model.rows.filter((r) => !carded.has(String(r.id)));
  const upcoming = rest.filter((r) => !r.started);
  const played = rest.filter((r) => r.started).reverse();
  /* FORECAST VS. ACTUAL: a past game shows a side ONLY from its own date's committed snapshot — receipt-verified and frozen
     before tip-off by construction (scripts/nba/build-nba-experimental-public.mjs). No snapshot, no side. */
  const pastSide = new Map<string, string>();
  for (const d of boardDates.filter((x) => x < today).slice(-4)) {
    for (const g of loadLaneForDate(d)?.games ?? []) {
      const fav = g.elo.favoured === g.home.abbr ? g.home.name : g.elo.favoured === g.away.abbr ? g.away.name : null;
      if (fav) pastSide.set(String(g.providerEventId), fav);
    }
  }
  const finals = model.rows.filter((r) => r.status === "final").length;
  const simLinks = slate.games.some((g) => g.theaterHref);
  /* A recorded FINAL (from the same finals record the list below uses) is the only status the forecast section states. */
  const statuses: Record<string, string> = {};
  for (const r of model.rows) if (r.status === "final" && lane?.games.some((g) => g.providerEventId === r.id)) statuses[r.id] = `final · ${r.reportNote}`;
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      {/* UX-001 phase 2: the shared sport switcher — every hub links to every other sport. */}
      <SportSwitcher current="nba" />
      <HubTitle model={model} />
      <p className="m-0 max-w-2xl text-[13.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
        <span className="font-semibold" style={{ color: "var(--vault-text)" }}>Today&rsquo;s games, the {PUBLIC_TERMS.OFFICIAL_FORECAST} for each one, and a {PUBLIC_TERMS.GAME_SIMULATION} you can watch.</span>{" "}
        Every forecast is frozen before tip-off and graded against the official final.
      </p>
      <NbaSlateOverview slate={slate} boardDates={boardDates} />
      <SportHubNav sport="nba" anchors={[S.games, ...(lane ? [S.forecast] : []), ...(simLinks ? [S.simulations] : []), S.results]} />

      {/* 1 · TODAY'S GAMES — a card per game (each links to its Official Forecast and its Game Simulation), then the week */}
      <section id="nba-games" className="scroll-mt-24 flex flex-col gap-3" aria-labelledby="nba-games-h">
        <h2 id="nba-games-h" className={H2} style={{ color: "var(--vault-text)" }}>{slate.games.length ? `Today’s games · ${slate.dateLabel}` : "Games"}</h2>
        <NbaTodayGames slate={slate} slip={slip} />
        <NbaGameList rows={upcoming} heading={`Coming up · ${upcoming.length} game${upcoming.length === 1 ? "" : "s"} in the next 7 days`} collapsed />
      </section>

      {/* 2 · THE OFFICIAL FORECASTS — favoured side (with the Elo-derived estimate where the receipt carries it) */}
      {lane ? (
        <div id="nba-forecast" className="scroll-mt-24">
          <NbaExperimentalLane snapshot={lane} statuses={statuses} theaterIds={theaterIds} />
        </div>
      ) : null}

      {/* 3 · TOP BOARDS and 4 · PREDICTED PLAYER STATISTICS — both live on /nba/projections (the boards session's page) */}
      <section id="nba-boards" className="scroll-mt-24 flex flex-col gap-2" aria-labelledby="nba-boards-h">
        <h2 id="nba-boards-h" className={H2} style={{ color: "var(--vault-text)" }}>Top Boards</h2>
        <p className={MUTE} style={{ color: "var(--vault-text-mute)" }}>Pick a stat — points, rebounds, assists, 3-pointers or PRA — and sort the slate&rsquo;s players to see its leaders, from the {PUBLIC_TERMS.OFFICIAL_FORECAST}.</p>
        <p className="m-0"><Link href="/nba/projections/" className="gtp-hit-44 nbx-pill no-underline">Open Top Boards →</Link></p>
      </section>
      <section id="nba-players" className="scroll-mt-24 flex flex-col gap-2" aria-labelledby="nba-players-h">
        <h2 id="nba-players-h" className={H2} style={{ color: "var(--vault-text)" }}>{PUBLIC_TERMS.PLAYER_STATISTICS}</h2>
        <p className={MUTE} style={{ color: "var(--vault-text-mute)" }}>
          Every player&rsquo;s predicted points, rebounds, assists and 3-pointers, with PRA, P+R and P+A — filter by team and sort by any
          column. Medians only: the ranges have not yet shown reliable coverage.
        </p>
        <p className="m-0"><Link href="/nba/projections/" className="gtp-hit-44 nbx-pill no-underline">All player projections →</Link></p>
      </section>

      {/* 5 · GAME SIMULATIONS — opened from each of today's game cards; never the forecast. Overnight W7 2026-10-28: shown
          only when today has one to open (a section with no link was a dead end); "How it works" still explains them. */}
      {simLinks ? (
        <section id="nba-simulations" className="scroll-mt-24 flex flex-col gap-2" aria-labelledby="nba-simulations-h">
          <h2 id="nba-simulations-h" className={H2} style={{ color: "var(--vault-text)" }}>{PUBLIC_TERMS.GAME_SIMULATION}s</h2>
          <p className={MUTE} style={{ color: "var(--vault-text-mute)" }}>
            {NBA_PUBLIC.features.gameSimulation.note} A simulation is one possible game, not a real one, and it never changes the {PUBLIC_TERMS.OFFICIAL_FORECAST}.{" "}
            Open one from any of <a href={`#${S.games}`} className="underline nbx-inl">today&rsquo;s games</a>.
          </p>
        </section>
      ) : null}

      {/* 6 · RESULTS & MODEL PERFORMANCE — official finals beside the forecast that was frozen for them */}
      <section id="nba-results" className="scroll-mt-24 flex flex-col gap-2" aria-labelledby="nba-results-h">
        <h2 id="nba-results-h" className={H2} style={{ color: "var(--vault-text)" }}>Results &amp; {PUBLIC_TERMS.MODEL_PERFORMANCE}</h2>
        <p className={MUTE} style={{ color: "var(--vault-text-mute)" }}>
          <strong style={{ color: "var(--vault-text)" }}>{PUBLIC_TERMS.MODEL_PERFORMANCE}:</strong> {NBA_MODEL_PERFORMANCE_NOTE}
        </p>
        <NbaGameList rows={played} heading="Forecast vs. Actual · recent games" forecasts={pastSide} />
        <p className={MUTE} style={{ color: "var(--vault-text-mute)" }}>
          {finals > 0
            ? `${finals} official final${finals === 1 ? "" : "s"} in the last ${NBA_HUB_BEHIND_DAYS} days, from the official finals record.`
            : "Official finals appear here once the finals record holds them. A game without one is pending, not a result."}
        </p>
        <p className="m-0 text-[13.5px]">
          <Link href="/results/nba/" className="underline inline-flex items-center" style={{ color: "var(--vault-text)", minHeight: 44 }}>
            NBA results: the official favoured-side record
          </Link>
          {/* Audit 2026-10-28 F04: this link led to the current record under an archive label. */}
          <span style={{ color: "var(--vault-text-mute)" }}> — game by game against the official finals, with the retired May–June player-prop archive kept below it.</span>
        </p>
      </section>

      {/* founder directive 2026-10-23 public readiness: what is published, as what, and its Model Performance — read from
          the public registry (lib/public-registry.ts), the same facts Methodology, Home and the Simulate lobby print */}
      <section id="nba-model-status" className="scroll-mt-24 flex flex-col gap-2" aria-labelledby="nba-model-status-h">
        <h2 id="nba-model-status-h" className={H2} style={{ color: "var(--vault-text)" }}>How it works</h2>
        <ul className="m-0 pl-5 text-[13.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          {NBA_PUBLIC.families.map((f) => (
            <li key={f.id}><strong style={{ color: "var(--vault-text)" }}>{f.label}</strong>: {f.publication === "OFFICIAL_FORECAST" ? `${PUBLIC_TERMS.OFFICIAL_FORECAST}, frozen before tip-off.` : "not published until it meets its checks."}</li>
          ))}
          <li><strong style={{ color: "var(--vault-text)" }}>{PUBLIC_TERMS.GAME_SIMULATION}</strong>: {NBA_PUBLIC.features.gameSimulation.note} It never changes the {PUBLIC_TERMS.OFFICIAL_FORECAST}.</li>
          <li><strong style={{ color: "var(--vault-text)" }}>{PUBLIC_TERMS.MODEL_PERFORMANCE}</strong>: {NBA_PUBLIC.features.modelPerformance.note}</li>
          <li>Preseason games are listed for the schedule and final scores only; they never count toward the model&rsquo;s record.</li>
        </ul>
        <p className="m-0 text-[13.5px]"><Link href="/methodology/" className="underline inline-flex items-center" style={{ color: "var(--vault-text)", minHeight: 44 }}>Methodology — where the numbers come from</Link></p>
      </section>
      <HubSlipBar legs={slip} />
    </div>
  );
}
