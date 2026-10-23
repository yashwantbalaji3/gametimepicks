/**
 * /nba/projections — postgame ACTUALS beside the frozen board (overnight sprint 2026-10-23, competitor gap 4).
 * SERVER ONLY: reads the committed box scores at BUILD time. Never import this from a "use client" module
 * (client-graph-internal-paths.test.mjs walks every client graph for the internal path).
 *
 * The board shows a player's actual stat line only for a game whose official final is in the write-once finals record
 * (FINAL — never FINAL_UNDER_REVIEW), whose stored box score is FINAL, and whose box-score team points agree with that
 * final. The box score is the one the graders read, in the graders' order (grade-nba-experimental-forecasts.mjs):
 * the newest recorded correction across every family's ledger, then the canonical corpus, then each family's fetch
 * cache. A player's line is read with the graders' shared line reader (boxscore-line.mjs), stat by stat:
 *   MEASURED            the integer (a combo is the sum of its integer components — top-board-grading.mjs's rule);
 *   DNP                 "DNP" — shown as a dash, never 0;
 *   not in box score / not an integer   null — shown as a dash, never 0.
 * Nothing here touches a frozen figure: actuals travel beside the snapshot, keyed by the board's own row id.
 */
import fs from "node:fs";
import path from "node:path";

import type { Snapshot } from "@/components/nba/experimental-lane";
import { boxscoreAthlete, isFinalBoxscore, LINE_STATE, measureAthlete } from "@/lib/sports/nba/boxscore-line.mjs";
import { boxscorePointsCheck, latestCorrectionAcross, upgradeLedger } from "@/lib/sports/nba/experimental-grading-ledger.mjs";
import { FAMILIES } from "@/lib/sports/nba/experimental-forecast.mjs";
import { finalFor, nbaSeasonLabel } from "@/lib/sports/nba/finals-record.mjs";
import { COMBO_COMPONENTS } from "@/lib/sports/nba/top-boards.mjs";

/** Per game: "recorded" = actuals shown; otherwise the one reason they are not. */
export type GameActualState = "recorded" | "no-final" | "under-review" | "no-boxscore" | "points-disagree";
/** Per row: [actual minutes | "DNP" | null, ...one value per board stat]. */
export type RowActual = [number | "DNP" | null, ...(number | null)[]];
export type BoardActuals = { games: Record<string, GameActualState>; rows: Record<string, RowActual> };

const NBA_DIR = () => path.resolve(process.cwd(), "..", "data/internal/research/nba");
const readJson = (f: string) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

let ledgersMemo: unknown[] | null = null;
/** Every family's grading ledger (for recorded box-score corrections), read once per build process. */
function familyLedgers(): unknown[] {
  ledgersMemo ??= Object.values(FAMILIES as Record<string, { dir: string }>)
    .map((f) => readJson(path.join(NBA_DIR(), f.dir, "ledger.json")))
    .filter(Boolean)
    .map((l) => upgradeLedger(l));
  return ledgersMemo;
}

/** The box score the graders read for one event, or null. */
export function gradedBoxscore(id: string): unknown | null {
  const fix = latestCorrectionAcross(familyLedgers(), id) as { new?: { file?: string } } | null;
  if (fix?.new?.file) { const doc = readJson(path.join(NBA_DIR(), fix.new.file)); if (doc) return doc; }
  const dirs = [path.join(NBA_DIR(), "boxscores"), ...Object.values(FAMILIES as Record<string, { dir: string }>).map((f) => path.join(NBA_DIR(), f.dir, "boxscores"))];
  for (const d of dirs) { const doc = readJson(path.join(d, `${id}.json`)); if (doc) return doc; }
  return null;
}

/**
 * Actuals for every game of a snapshot. `stats` is PROJECTION_BOARD_STATS (the board's column order), so a row's
 * values line up with its frozen medians. `boxscoreOf` / `finals` are injectable for tests.
 */
export function boardActuals(
  lane: Snapshot | null,
  stats: ReadonlyArray<readonly [string, string]>,
  { boxscoreOf = gradedBoxscore, finals = undefined as unknown }: { boxscoreOf?: (id: string) => unknown | null; finals?: unknown } = {},
): BoardActuals | null {
  if (!lane || lane.games.length === 0) return null;
  const season = nbaSeasonLabel(lane.date ?? "");
  const record = finals !== undefined ? finals : season ? readJson(path.join(process.cwd(), "public", "data", "nba", "results", `finals-${season}.json`)) : null;
  const games: Record<string, GameActualState> = {};
  const rows: Record<string, RowActual> = {};
  for (const g of lane.games) {
    const id = g.providerEventId;
    const fin = finalFor(record, id) as { state: string; ftHome?: number; ftAway?: number };
    if (fin.state === "FINAL_UNDER_REVIEW") { games[id] = "under-review"; continue; }
    if (fin.state !== "FINAL") { games[id] = "no-final"; continue; }
    const box = boxscoreOf(id) as { players?: unknown[] } | null;
    if (!isFinalBoxscore(box)) { games[id] = "no-boxscore"; continue; }
    // The box score's own home/away teams must be the snapshot's (by abbreviation) before its rows are read.
    const home = boxTeam(box, "home"), away = boxTeam(box, "away");
    if (!home || !away || home.abbr !== g.home.abbr || away.abbr !== g.away.abbr) { games[id] = "no-boxscore"; continue; }
    const pts = boxscorePointsCheck(box, { homeTeamId: home.providerTeamId, awayTeamId: away.providerTeamId, ftHome: fin.ftHome, ftAway: fin.ftAway });
    if (pts?.agrees === false) { games[id] = "points-disagree"; continue; }
    games[id] = "recorded";
    for (const side of ["away", "home"] as const) {
      for (const r of g.players[side]) {
        const a = boxscoreAthlete(box, r.providerAthleteId);
        const values = stats.map(([k]) => {
          const parts = (COMBO_COMPONENTS as Record<string, string[]>)[k] ?? [k];
          const line = measureAthlete(a, parts);
          return line.state === LINE_STATE.MEASURED ? parts.reduce((s: number, p: string) => s + (line.values as Record<string, number>)[p], 0) : null;
        });
        const m = measureAthlete(a, []);
        const minutes = m.state === LINE_STATE.DNP ? "DNP" : m.state === LINE_STATE.MEASURED ? (m.minutes as number) : null;
        rows[`${id}:${r.providerAthleteId}`] = [minutes, ...values];
      }
    }
  }
  return { games, rows };
}

type BoxTeam = { providerTeamId?: string; abbr?: string; homeAway?: string };
const boxTeam = (box: unknown, side: "home" | "away"): BoxTeam | null => ((box as { teams?: BoxTeam[] })?.teams ?? []).find((t) => t.homeAway === side) ?? null;
