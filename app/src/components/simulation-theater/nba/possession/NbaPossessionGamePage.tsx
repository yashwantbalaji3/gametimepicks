/**
 * NBA Simulation Theater · THE PUBLIC GAME PAGE BODY (server). NBA UI parity, founder directive 2026-10-22.
 *
 * Composes, in reading order (P0-A, founder 2026-10-30: the Theater opens on the official projected game): the page
 * title, a two-link view nav (Default · Simulated scenarios — the first thing a keyboard reaches), the DEFAULT VIEW —
 * "GameTimePicks Official Forecast" rendered on the SERVER (components/nba/official-predictions.tsx: winner side, the Elo
 * estimate, the withheld team score said in words, both teams' official player medians; no playback input, so nothing
 * the reader does in the Theater can change it) — and then the SIMULATED SCENARIOS section labelled "Simulated scenario
 * (hypothetical)", holding the possession Theater (NbaPossessionSection: playback + What-if runs, each with its own
 * reconciled box score). The route page mounts this one component behind its literal flag branch, so a flag-OFF build
 * bundles none of it.
 *
 * Inputs beyond the load: the game's frozen lane snapshot for its own ET slate date (combo medians only) and the
 * finals record (a recorded final only), both through the /nba hub's own loaders.
 */
import Link from "next/link";
import NbaPossessionSection from "./NbaPossessionSection";
import type { PbLoad, PbUnavailable } from "./possession-types";
import NbaOfficialPredictions, { OFFICIAL_PREDICTIONS_ID } from "@/components/nba/official-predictions";
import { loadCurrentLane, loadLaneForDate } from "@/components/nba/experimental-lane";
import { nbaTodaySlate } from "@/lib/sport-hub/nba-hub";
import { etDateOf } from "@/lib/sports/nba/finals-record.mjs";

export const NBA_RESULTS_HREF = "/results/nba/"; // the official record (expired-simulation.mjs NBA_RESULTS_LINK)

/* Only what the panel prints (id, name, reason, pre-cutoff status) crosses into the client island's props. */
type LaneUnavailableRow = { providerAthleteId: string; name: string | null; reason: string; status?: string | null };
type LaneUnavailable = { away?: LaneUnavailableRow[]; home?: LaneUnavailableRow[] };
const unavailableOf = (g: unknown): PbUnavailable => {
  const u = (g as { players?: { unavailable?: LaneUnavailable } } | null)?.players?.unavailable;
  if (!u) return null;
  const slim = (xs: LaneUnavailableRow[] = []) => xs.map((x) => ({ providerAthleteId: String(x.providerAthleteId), name: x.name ?? null, reason: x.reason, ...(x.status ? { status: x.status } : {}) }));
  return { away: slim(u.away), home: slim(u.home) };
};

/** The simulated-scenarios section (playback + What-if) — after the Default view, always labelled hypothetical. */
export const SIMULATED_SCENARIOS_ID = "simulated-scenarios";
export const SIMULATED_SCENARIOS_KIND = "Simulated scenario (hypothetical) · not the Official Forecast";
export const SIMULATED_SCENARIOS_TITLE = "Simulated scenarios: playback and What-if";
export const SIMULATED_SCENARIOS_NOTE = "One stored game of the NBA possession engine at a time, with its own box score that adds up to its own final. A scenario may differ from the Official Forecast above and never changes it.";

export default function NbaPossessionGamePage({ load, nowIso = new Date().toISOString() }: { load: PbLoad; nowIso?: string }) {
  const payload = load.ok ? load.payload : null;
  const eventId = load.eventId;
  const slateDate = payload?.dateUtc ? (etDateOf(payload.dateUtc) as string | null) : null;
  const laneGame = (slateDate ? loadLaneForDate(slateDate) : null)?.games.find((g) => g.providerEventId === eventId) ?? null;
  const finalNote = nbaTodaySlate(nowIso, loadCurrentLane(etDateOf(nowIso) as string)).games.find((g) => g.id === eventId)?.finalNote ?? null;
  const teams = payload?.teams ?? null;
  return (
    <>
      <nav aria-label="This game" className="nbx-gamenav">
        {/* next/link (not <a>): a full page load from here aborts in-flight route prefetches, which Next logs as errors */}
        <Link href="/nba/" className="gtp-backlink">← NBA hub</Link>
        <Link href="/nba/projections/">Top Boards</Link>
        <Link href={NBA_RESULTS_HREF}>Results</Link>
      </nav>
      {teams ? <h1 className="nbp-page-title">{teams.away.name} at {teams.home.name}</h1> : null}
      {/* P0-A (founder 2026-10-30): the Theater OPENS on the Default view — the official projected game — and the
          simulated scenarios follow, clearly secondary. The view nav is the page's first control (founder mandate
          2026-10-24: the Official Forecast is fully readable without touching the playback). */}
      <nav aria-label="Simulation Theater views" className="nbp-views" data-nba-theater-views="">
        <a href={`#${OFFICIAL_PREDICTIONS_ID}`} aria-current="true" data-nba-view="default">Official projected game <span>Default</span></a>
        <a href={`#${SIMULATED_SCENARIOS_ID}`} data-nba-view="scenarios">Simulated scenarios <span>Hypothetical</span></a>
      </nav>
      {payload ? <NbaOfficialPredictions official={payload.official} teams={payload.teams} lane={laneGame} finalNote={finalNote} resultsHref={NBA_RESULTS_HREF} /> : null}
      <section id={SIMULATED_SCENARIOS_ID} tabIndex={-1} className="nbp-scenarios" aria-labelledby={`${SIMULATED_SCENARIOS_ID}-h`} data-nba-simulated-scenarios="">
        <p className="nbx-kind">{SIMULATED_SCENARIOS_KIND}</p>
        <h2 id={`${SIMULATED_SCENARIOS_ID}-h`}>{SIMULATED_SCENARIOS_TITLE}</h2>
        <p className="nbx-fine">{SIMULATED_SCENARIOS_NOTE}</p>
        {/* This game's projection-unavailable players (lane `players.unavailable`, PR 1230), by name and reason only — the
            in-Theater Official Forecast panel lists them as the section above does, never as 0. */}
        <NbaPossessionSection load={load} unavailable={unavailableOf(laneGame)} defaultHref={teams ? `#${OFFICIAL_PREDICTIONS_ID}` : null} />
      </section>
    </>
  );
}
