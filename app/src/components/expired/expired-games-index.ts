/**
 * The index of recently expired game links — SERVER / BUILD TIME ONLY (see expired-games.mjs for the shapes).
 * Reads committed PUBLIC files only (the same records Results reads) — no private research file, no network.
 * Bounded to the last EXPIRED_GAMES_MAX_DAYS days, so the fetched file stays small.
 */
import fs from "node:fs";
import path from "node:path";

import { EXPIRED_GAMES_MAX_DAYS, mlbExpiredIndex, nbaExpiredFacts, ufcExpiredIndex } from "./expired-games.mjs";
import { nbaForecastVsActualView } from "@/lib/results/nba-level-a-readers";

const DATA = () => path.join(process.cwd(), "public", "data");
const readJson = <T,>(rel: string): T | null => { try { return JSON.parse(fs.readFileSync(path.join(DATA(), rel), "utf8")) as T; } catch { return null; } };
const readJsonl = (rel: string): unknown[] => {
  try { return fs.readFileSync(path.join(DATA(), rel), "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }); } catch { return []; }
};
const daysBefore = (today: string, n: number) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

export type ExpiredGamesIndex = { mlb: Record<string, unknown[]>; ufc: Record<string, unknown[]> };

export function expiredGamesIndex(today: string): ExpiredGamesIndex {
  const sinceDate = daysBefore(today, EXPIRED_GAMES_MAX_DAYS);
  return {
    mlb: mlbExpiredIndex(readJsonl("mlb/results/game-predictions-graded.jsonl"), { sinceDate }),
    ufc: ufcExpiredIndex(readJson<{ rows?: unknown[] }>("ufc/results/latest.json")?.rows ?? [], readJson<{ picks?: unknown[] }>("ufc/graded-picks.json")?.picks ?? [], { sinceDate }),
  };
}

/** NBA: the recorded final and the official record's state + side for the ids the existing NBA expired map names. */
export type NbaExpiredFacts = Record<string, [number, number, string, string | null]>;
export function expiredNbaFacts(nbaMap: Record<string, [string, string]>): NbaExpiredFacts {
  // the /results/nba record itself (lane side vs. the season's finals record, holds and team checks included)
  return nbaExpiredFacts(nbaMap, nbaForecastVsActualView().games) as NbaExpiredFacts;
}
