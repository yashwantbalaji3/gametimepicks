/**
 * NBA social data — SERVER / BUILD TIME ONLY. Reads the committed public lane files and the /results/nba record (the
 * same owners the NBA pages read) and hands them to the pure contract builder (nba-social.mjs). No private file.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { committedLaneDates, loadCurrentLane, loadLaneForDate } from "@/components/nba/experimental-lane";
import { nbaTodaySlate } from "@/lib/sport-hub/nba-hub";
import { LANE } from "@/lib/sports/nba/experimental-public-lane.mjs";
import { nbaForecastVsActualView } from "@/lib/results/nba-level-a-readers";
import { currentEtDate } from "@/lib/freshness";
import { unavailableReasonText } from "@/components/nba/official-predictions";
import { buildNbaSocialDay, nbaSocialToday, NBA_SOCIAL_BASE, NBA_SOCIAL_SCHEMA } from "./nba-social.mjs";

/** How many dated day files ship (bytes stay bounded; the index lists exactly these). */
export const NBA_SOCIAL_MAX_DATES = 14;

const laneSha = (date: string): string | null => {
  try { return crypto.createHash("sha256").update(fs.readFileSync(path.join(process.cwd(), "public", "data", "nba", "experimental-public", `${date}.json`))).digest("hex"); } catch { return null; }
};

let recordMemo: ReturnType<typeof nbaForecastVsActualView> | null = null;
const record = () => (recordMemo ??= nbaForecastVsActualView());

/** The dates that get a day file: the newest NBA_SOCIAL_MAX_DATES committed lanes, ascending. */
export function nbaSocialDates(): string[] {
  return committedLaneDates().slice().sort().slice(-NBA_SOCIAL_MAX_DATES);
}

export function nbaSocialDay(date: string) {
  const lane = loadLaneForDate(date);
  if (!lane) return null;
  const r = record();
  return buildNbaSocialDay({
    lane, recordGames: r.games as any[], buildEtDate: currentEtDate(), latestDate: nbaSocialDates().at(-1) ?? null, laneSha256: laneSha(date),
    recordCounts: { matched: r.counts.matched, missed: r.counts.missed, graded: r.counts.graded },
    reasonText: (reason: string | null, status: string | null) => unavailableReasonText(reason, status),
  });
}

/**
 * `today` (additive, 2026-10-29): the build's ET date — the SAME currentEtDate() `stale` is computed against — and the
 * /nba hub's own today state for it (nbaTodaySlate.forecast: the schedule capture, the finals record and the current lane,
 * exactly as the hub reads them). The hub's loader takes an instant; it reads only that instant's ET date, so it is
 * given a fixed noon-ET instant ON the build's ET date (16:00Z is 11:00 or 12:00 in New York) — no clock is read here.
 */
export function nbaSocialTodayStatus(etDate: string = currentEtDate()) {
  const slate = nbaTodaySlate(`${etDate}T16:00:00.000Z`, loadCurrentLane(etDate), { laneEnabled: LANE.enabled });
  return nbaSocialToday(etDate, slate.forecast);
}

/** latest.json: the newest day file, plus `today` (appended last). Before any lane is committed: the NO_LANE stub. */
export function nbaSocialLatest() {
  const d = nbaSocialDates().at(-1);
  const day = (d && nbaSocialDay(d)) ?? { schemaVersion: NBA_SOCIAL_SCHEMA, publication: { status: "NO_LANE" }, events: [] };
  return { ...day, today: nbaSocialTodayStatus() };
}

export function nbaSocialIndex() {
  const dates = nbaSocialDates();
  return {
    schemaVersion: NBA_SOCIAL_SCHEMA,
    latest: dates.at(-1) ?? null,
    days: dates.map((d) => ({ date: d, href: `${NBA_SOCIAL_BASE}${d}.json` })),
    latestHref: `${NBA_SOCIAL_BASE}latest.json`,
    contractDoc: "GameTimePicks_Launch_Program_2026-10-28/LAUNCH_PROGRAM.md §6 (gtp-social-nba@1)",
    // additive (2026-10-29), appended last
    today: nbaSocialTodayStatus(),
  };
}
