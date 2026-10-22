/**
 * NBA Simulation Theater · THE PUBLIC GAME PAGE BODY (server). NBA UI parity, founder directive 2026-10-22.
 *
 * Composes, in reading order: a nav strip with "Skip to Official Predictions" (an in-page anchor, the first thing a
 * keyboard reaches), the possession Theater (NbaPossessionSection, unchanged), and "GameTimePicks Official Predictions"
 * rendered on the SERVER directly below it (components/nba/official-predictions.tsx — no playback input, so nothing the
 * reader does in the Theater can change it). The route page mounts this one component behind its literal flag branch,
 * exactly where it mounted NbaPossessionSection, so a flag-OFF build bundles none of it.
 *
 * Inputs beyond the load: the game's frozen lane snapshot for its own ET slate date (combo medians only) and the
 * finals record (a recorded final only), both through the /nba hub's own loaders.
 */
import NbaPossessionSection from "./NbaPossessionSection";
import type { PbLoad } from "./possession-types";
import NbaOfficialPredictions, { OFFICIAL_PREDICTIONS_ID } from "@/components/nba/official-predictions";
import { loadCurrentLane, loadLaneForDate } from "@/components/nba/experimental-lane";
import { nbaTodaySlate } from "@/lib/sport-hub/nba-hub";
import { etDateOf } from "@/lib/sports/nba/finals-record.mjs";

export const NBA_RESULTS_HREF = "/nba/#nba-results";

export default function NbaPossessionGamePage({ load, nowIso = new Date().toISOString() }: { load: PbLoad; nowIso?: string }) {
  const payload = load.ok ? load.payload : null;
  const eventId = load.eventId;
  const slateDate = payload?.dateUtc ? (etDateOf(payload.dateUtc) as string | null) : null;
  const laneGame = (slateDate ? loadLaneForDate(slateDate) : null)?.games.find((g) => g.providerEventId === eventId) ?? null;
  const finalNote = nbaTodaySlate(nowIso, loadCurrentLane(etDateOf(nowIso) as string)).games.find((g) => g.id === eventId)?.finalNote ?? null;
  return (
    <>
      <nav aria-label="This game" className="nbx-gamenav">
        <a href={`#${OFFICIAL_PREDICTIONS_ID}`} className="nbx-skip" data-nba-skip-official="">Skip to Official Predictions ↓</a>
        <a href="/nba/">← NBA hub</a>
        <a href="/nba/projections/">Top Boards</a>
        <a href={NBA_RESULTS_HREF}>Results</a>
      </nav>
      <NbaPossessionSection load={load} />
      {payload ? <NbaOfficialPredictions official={payload.official} teams={payload.teams} lane={laneGame} finalNote={finalNote} resultsHref={NBA_RESULTS_HREF} /> : null}
    </>
  );
}
