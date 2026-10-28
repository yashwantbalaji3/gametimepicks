/**
 * NBA social data — SERVER / BUILD TIME ONLY. Reads the committed public lane files and the /results/nba record (the
 * same owners the NBA pages read) and hands them to the pure contract builder (nba-social.mjs). No private file.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { committedLaneDates, loadLaneForDate } from "@/components/nba/experimental-lane";
import { nbaForecastVsActualView } from "@/lib/results/nba-level-a-readers";
import { currentEtDate } from "@/lib/freshness";
import { buildNbaSocialDay, NBA_SOCIAL_BASE, NBA_SOCIAL_SCHEMA } from "./nba-social.mjs";

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
    lane, recordGames: r.games as any[], buildEtDate: currentEtDate(), laneSha256: laneSha(date),
    recordCounts: { matched: r.counts.matched, missed: r.counts.missed, graded: r.counts.graded },
  });
}

export function nbaSocialIndex() {
  const dates = nbaSocialDates();
  return {
    schemaVersion: NBA_SOCIAL_SCHEMA,
    latest: dates.at(-1) ?? null,
    days: dates.map((d) => ({ date: d, href: `${NBA_SOCIAL_BASE}${d}.json` })),
    latestHref: `${NBA_SOCIAL_BASE}latest.json`,
    contractDoc: "GameTimePicks_Launch_Program_2026-10-28/LAUNCH_PROGRAM.md §6 (gtp-social-nba@1)",
  };
}
