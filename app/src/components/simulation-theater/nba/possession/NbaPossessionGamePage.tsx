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
import Link from "next/link";
import NbaPossessionSection from "./NbaPossessionSection";
import type { PbLoad, PbUnavailable } from "./possession-types";
import NbaOfficialPredictions, { OFFICIAL_PREDICTIONS_ID } from "@/components/nba/official-predictions";
import { loadCurrentLane, loadLaneForDate } from "@/components/nba/experimental-lane";
import { nbaTodaySlate } from "@/lib/sport-hub/nba-hub";
import { etDateOf } from "@/lib/sports/nba/finals-record.mjs";

export const NBA_RESULTS_HREF = "/nba/#nba-results";

/* Only what the panel prints (id, name, reason) crosses into the client island's props. */
type LaneUnavailable = { away?: { providerAthleteId: string; name: string | null; reason: string }[]; home?: { providerAthleteId: string; name: string | null; reason: string }[] };
const unavailableOf = (g: unknown): PbUnavailable => {
  const u = (g as { players?: { unavailable?: LaneUnavailable } } | null)?.players?.unavailable;
  if (!u) return null;
  const slim = (xs: { providerAthleteId: string; name: string | null; reason: string }[] = []) => xs.map((x) => ({ providerAthleteId: String(x.providerAthleteId), name: x.name ?? null, reason: x.reason }));
  return { away: slim(u.away), home: slim(u.home) };
};

export default function NbaPossessionGamePage({ load, nowIso = new Date().toISOString() }: { load: PbLoad; nowIso?: string }) {
  const payload = load.ok ? load.payload : null;
  const eventId = load.eventId;
  const slateDate = payload?.dateUtc ? (etDateOf(payload.dateUtc) as string | null) : null;
  const laneGame = (slateDate ? loadLaneForDate(slateDate) : null)?.games.find((g) => g.providerEventId === eventId) ?? null;
  const finalNote = nbaTodaySlate(nowIso, loadCurrentLane(etDateOf(nowIso) as string)).games.find((g) => g.id === eventId)?.finalNote ?? null;
  return (
    <>
      {/* Founder mandate 2026-10-24: the skip is the page's first control, full width on a phone, and says what it reaches —
          the Official Forecast is fully readable without touching the playback. */}
      <a href={`#${OFFICIAL_PREDICTIONS_ID}`} className="nbx-skip nbp-skip-cta" data-nba-skip-official="">
        <span className="nbp-skip-main">Skip to the Official Forecast ↓</span>
        <span className="nbp-skip-sub">Favoured side and Predicted Player Statistics, frozen before tip-off. No playback needed.</span>
      </a>
      <nav aria-label="This game" className="nbx-gamenav">
        {/* next/link (not <a>): a full page load from here aborts in-flight route prefetches, which Next logs as errors */}
        <Link href="/nba/">← NBA hub</Link>
        <Link href="/nba/projections/">Top Boards</Link>
        <Link href={NBA_RESULTS_HREF}>Results</Link>
      </nav>
      {/* This game's projection-unavailable players (lane `players.unavailable`, PR 1230), by name and reason only — the
          in-Theater Official Forecast panel lists them as the section below does, never as 0. */}
      <NbaPossessionSection load={load} unavailable={unavailableOf(laneGame)} />
      {payload ? <NbaOfficialPredictions official={payload.official} teams={payload.teams} lane={laneGame} finalNote={finalNote} resultsHref={NBA_RESULTS_HREF} /> : null}
    </>
  );
}
