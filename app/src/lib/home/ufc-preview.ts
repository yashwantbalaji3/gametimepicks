/**
 * loadUfcPredictionRows — the fs-reading loader for the homepage UFC prediction preview. Reads the real UFC
 * artifacts (schedule + odds + the fighter-stats DB) and returns the Prediction Engine V1 rows, or [] when
 * the card is settled / unavailable. No fabrication; the engine does all the honest work.
 */
import fs from "node:fs";
import path from "node:path";
import { buildUfcCardPredictions, buildFighterIndex, keyForNames, type UfcPredictionRowV1, type EngineOddsBout } from "../ufc/ufc-prediction-engine";
import { isEventPast } from "./load-spotlight";

export interface UfcPreview {
  eventName: string;
  rows: UfcPredictionRowV1[];
  marketWinnerCount: number;
  methodReadCount: number;
}

export function loadUfcPredictionRows(today?: string): UfcPreview | null {
  const dir = path.join(process.cwd(), "public", "data", "ufc");
  const read = (n: string): any => { try { return JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")); } catch { return null; } };
  const sched = read("schedule-latest.json");
  const odds = read("odds-latest.json");
  const fighters = read("fighters-latest.json");
  const proj = read("projections-latest.json");
  const settle = read("results-settled-latest.json");
  if (!sched?.fights?.length) return null;

  const eventName: string = proj?.eventName ?? sched?.eventName ?? "UFC";
  // Don't preview a card that's already settled OR whose event day has passed (stale "tonight's picks").
  if (settle?.status === "final" && (settle?.event ?? "") === eventName) return null;
  if (today && isEventPast(today, sched?.eventDate ?? proj?.eventDate)) return null;

  const oddsIndex = new Map<string, EngineOddsBout>();
  for (const bt of (odds?.bouts ?? []) as Array<{ sides?: Array<{ name: string }> }>) {
    const names = bt.sides ? bt.sides.map((s) => s.name) : [];
    if (names.length >= 2) oddsIndex.set(keyForNames(names[0], names[1]), bt as EngineOddsBout);
  }
  const rows = buildUfcCardPredictions(sched.fights, oddsIndex, buildFighterIndex(fighters?.fighters));
  if (rows.length === 0) return null;

  return {
    eventName,
    rows,
    marketWinnerCount: rows.filter((r) => r.prediction.predictedWinner !== "No clear winner").length,
    methodReadCount: rows.filter((r) => r.prediction.methodOfVictory !== "No clear method").length,
  };
}
