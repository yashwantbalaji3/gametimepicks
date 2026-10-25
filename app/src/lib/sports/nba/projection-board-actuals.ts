/**
 * /nba/projections — postgame ACTUALS beside the frozen board (overnight sprint 2026-10-23, competitor gap 4).
 * SERVER ONLY: reads the committed box scores at BUILD time. Never import this from a "use client" module
 * (client-graph-internal-paths.test.mjs walks every client graph for the internal path).
 *
 * The board shows a player's actual stat line only for a game whose official final is in the write-once finals record
 * (FINAL — never FINAL_UNDER_REVIEW), whose stored box score is FINAL, and whose box-score team points agree with that
 * final. The box score is the one the graders read, in the graders' order (grade-nba-experimental-forecasts.mjs):
 * the newest stored correction (<cache>/corrections/<id>.<hash12>.json — written only together with the ledger's
 * CORRECTION record), then the canonical corpus, then each family's fetch cache. The directories are named one by one
 * (BOX_DIRS): each is a BUILD_INPUT in scripts/vercel-ignore-build.sh (build-input-coverage.test.mjs), and the
 * unarmed v0.3 candidate's directory is never read (minutes-model-v03.test.mjs ISOLATION). A player's line is read with the graders' shared line reader (boxscore-line.mjs), stat by stat:
 *   MEASURED            the integer (a combo is the sum of its integer components — top-board-grading.mjs's rule; the components are the public lane's COMBO_COMPONENTS, the same map);
 *   DNP                 "DNP" — shown as a dash, never 0;
 *   not in box score / not an integer   null — shown as a dash, never 0.
 * Nothing here touches a frozen figure: actuals travel beside the snapshot, keyed by the board's own row id.
 *
 * STAT CORRECTIONS (release owner P0, 2026-10-25): ESPN may correct a final box score after the graders read it. The
 * nightly re-check stores the corrected box as a correction (it never rewrites the first capture), and the board shows
 * the newest verified figures. Grades are never rewritten here: each value that the correction CHANGED keeps the first
 * capture's value beside it (`corrected[rowId][valueIndex]` = the value the graders graded on), and the game records
 * when the correction was captured — so the page says "stat corrected after grading" instead of silently differing.
 */
import fs from "node:fs";
import path from "node:path";

import type { Snapshot } from "@/components/nba/experimental-lane";
import { boxscoreAthlete, isFinalBoxscore, LINE_STATE, measureAthlete } from "@/lib/sports/nba/boxscore-line.mjs";
import { boxscorePointsCheck } from "@/lib/sports/nba/experimental-grading-ledger.mjs";
import { finalFor, nbaSeasonLabel } from "@/lib/sports/nba/finals-record.mjs";
import { COMBO_COMPONENTS } from "@/lib/sports/nba/experimental-public-lane.mjs";

/** Per game: "recorded" = actuals shown; otherwise the one reason they are not. */
export type GameActualState = "recorded" | "no-final" | "under-review" | "no-boxscore" | "points-disagree";
/** Per row: [actual minutes | "DNP" | null, ...one value per board stat]. */
export type RowActual = [number | "DNP" | null, ...(number | null)[]];
/** A player who PLAYED in a recorded game (integer minutes > 0 in the final box score) but has no row on the frozen
    board: the Official Forecast had no projection for him. His actuals are shown; no forecast figure is invented. */
export type UnprojectedPlayer = { id: string; game: string; side: "away" | "home"; name: string; actual: RowActual };
/** Per row id: value index (0 = minutes, k = the k-th board stat) → the first capture's value, for values a correction changed. */
export type CorrectedValues = Record<string, Record<number, number | "DNP" | null>>;
/** Per game whose shown box score is a stored correction: when the first capture and the correction were captured. */
export type GameCorrection = { firstCapturedAt: string | null; correctedAt: string | null };
export type BoardActuals = {
  games: Record<string, GameActualState>;
  rows: Record<string, RowActual>;
  unprojected?: UnprojectedPlayer[];
  /** values a stat correction changed after grading (absent = none) */
  corrected?: CorrectedValues;
  corrections?: Record<string, GameCorrection>;
};

/** Repo-relative box-score directories, in the graders' lookup order: the canonical corpus, then the fetch cache the
    nightly grader writes (the v0 family's directory). The other families' caches are empty in the repository; a box
    score stored only there reads as "not yet recorded" here (never a wrong figure) until it is added below — and to
    BUILD_INPUTS, which build-input-coverage.test.mjs enforces. */
export const BOX_DIRS = Object.freeze([
  "data/internal/research/nba/boxscores",
  "data/internal/research/nba/experimental/boxscores",
]);
const abs = (rel: string) => path.resolve(process.cwd(), "..", rel);
const readJson = (f: string) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

/** The newest stored correction of one event across the fetch caches (by its own capture time), or null. */
function latestCorrection(id: string): unknown | null {
  let best: { capturedAt?: string } | null = null;
  for (const d of BOX_DIRS.slice(1)) {
    const dir = path.join(abs(d), "corrections");
    let names: string[] = [];
    try { names = fs.readdirSync(dir).filter((n) => n.startsWith(`${id}.`) && n.endsWith(".json")); } catch { continue; }
    for (const n of names) {
      const doc = readJson(path.join(dir, n));
      if (doc && (!best || Date.parse(doc.capturedAt ?? "") > Date.parse(best.capturedAt ?? ""))) best = doc;
    }
  }
  return best;
}

/** The FIRST capture of an event's box score (corpus, then the fetch cache) — the one the graders graded on — or null. */
export function firstCapturedBoxscore(id: string): unknown | null {
  if (!/^\d+$/.test(id)) return null;
  for (const d of BOX_DIRS) { const doc = readJson(path.join(abs(d), `${id}.json`)); if (doc) return doc; }
  return null;
}

/** The newest verified box score for one event (a stored correction, else the first capture), or null. */
export function gradedBoxscore(id: string): unknown | null {
  if (!/^\d+$/.test(id)) return null;
  return latestCorrection(id) ?? firstCapturedBoxscore(id);
}

/**
 * Actuals for every game of a snapshot. `stats` is PROJECTION_BOARD_STATS (the board's column order), so a row's
 * values line up with its frozen medians. `boxscoreOf` / `finals` are injectable for tests.
 */
export function boardActuals(
  lane: Snapshot | null,
  stats: ReadonlyArray<ReadonlyArray<string>>,
  { boxscoreOf = gradedBoxscore, firstCaptureOf: firstOf, finals = undefined as unknown }: { boxscoreOf?: (id: string) => unknown | null; firstCaptureOf?: (id: string) => unknown | null; finals?: unknown } = {},
): BoardActuals | null {
  // The first capture comes from the same store as the shown box score: an injected reader brings its own (or none).
  const firstCaptureOf = firstOf ?? (boxscoreOf === gradedBoxscore ? firstCapturedBoxscore : () => null);
  if (!lane || lane.games.length === 0) return null;
  const season = nbaSeasonLabel(lane.date ?? "");
  const record = finals !== undefined ? finals : season ? readJson(path.join(process.cwd(), "public", "data", "nba", "results", `finals-${season}.json`)) : null;
  const games: Record<string, GameActualState> = {};
  const rows: Record<string, RowActual> = {};
  const unprojected: UnprojectedPlayer[] = [];
  const corrected: CorrectedValues = {};
  const corrections: Record<string, GameCorrection> = {};
  const lineOf = (a: object | null): RowActual => {
    const values = stats.map(([k]) => {
      const parts: string[] = [...((COMBO_COMPONENTS as Record<string, readonly string[]>)[k] ?? [k])];
      const line = measureAthlete(a, parts);
      return line.state === LINE_STATE.MEASURED ? parts.reduce((s: number, p: string) => s + (line.values as Record<string, number>)[p], 0) : null;
    });
    const m = measureAthlete(a, []);
    const minutes = m.state === LINE_STATE.DNP ? "DNP" : m.state === LINE_STATE.MEASURED ? (m.minutes as number) : null;
    return [minutes, ...values];
  };
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
    // A shown correction keeps the first capture's values beside the values it changed (never silently differing).
    const first = firstCaptureOf(id) as { capturedAt?: string } | null;
    const isCorrection = first != null && first !== box && isFinalBoxscore(first) && (first as { capturedAt?: string }).capturedAt !== (box as { capturedAt?: string }).capturedAt;
    const keepLine = (key: string, athleteId: string, shown: RowActual) => {
      rows[key] = shown;
      if (!isCorrection) return;
      const was = lineOf(boxscoreAthlete(first, athleteId));
      const diff: Record<number, number | "DNP" | null> = {};
      shown.forEach((v, i) => { if (v !== was[i]) diff[i] = was[i]; });
      if (Object.keys(diff).length) {
        corrected[key] = diff;
        corrections[id] = { firstCapturedAt: first.capturedAt ?? null, correctedAt: (box as { capturedAt?: string }).capturedAt ?? null };
      }
    };
    for (const side of ["away", "home"] as const) {
      for (const r of g.players[side]) keepLine(`${id}:${r.providerAthleteId}`, r.providerAthleteId, lineOf(boxscoreAthlete(box, r.providerAthleteId)));
      // Played, but not on the board: every box-score row of this side with integer minutes > 0 and no board row.
      const onBoard = new Set(g.players[side].map((r) => String(r.providerAthleteId)));
      const tid = String((side === "home" ? home : away).providerTeamId);
      for (const p of (box as { players?: { providerAthleteId?: string; providerTeamId?: string; name?: string; minutes?: unknown; didNotPlay?: boolean }[] }).players ?? []) {
        if (String(p.providerTeamId) !== tid || onBoard.has(String(p.providerAthleteId)) || p.didNotPlay || !Number.isInteger(p.minutes) || (p.minutes as number) <= 0) continue;
        const shown = lineOf(p);
        unprojected.push({ id: String(p.providerAthleteId), game: id, side, name: p.name ?? "", actual: shown });
        // keyed like a board row, for the corrected-after-grading marks (not added to `rows`)
        if (isCorrection) { const keep = rows[`${id}:${p.providerAthleteId}`]; keepLine(`${id}:${p.providerAthleteId}`, String(p.providerAthleteId), shown); if (keep === undefined) delete rows[`${id}:${p.providerAthleteId}`]; }
      }
    }
  }
  return { games, rows, unprojected, ...(Object.keys(corrected).length ? { corrected, corrections } : {}) };
}

type BoxTeam = { providerTeamId?: string; abbr?: string; homeAway?: string };
const boxTeam = (box: unknown, side: "home" | "away"): BoxTeam | null => ((box as { teams?: BoxTeam[] })?.teams ?? []).find((t) => t.homeAway === side) ?? null;
