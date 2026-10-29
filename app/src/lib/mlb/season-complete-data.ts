/**
 * MLB season-complete — the loader (SERVER / BUILD TIME ONLY). Rule and derivation: season-complete.mjs.
 * Reads committed PUBLIC files only: the season-state doc the products job writes, the StatsAPI schedule captures for
 * the postseason window, the graded game record (the settled game pages' own source) and the lifetime summary
 * /results/mlb leads with. Changes no file.
 */
import fs from "node:fs";
import path from "node:path";

import { deriveMlbSeasonComplete, mlbSeasonCompleteCopy, isMlbSeasonComplete } from "./season-complete.mjs";

export type MlbSeasonComplete = NonNullable<ReturnType<typeof deriveMlbSeasonComplete>>;
export type MlbSeasonCompleteCopy = NonNullable<ReturnType<typeof mlbSeasonCompleteCopy>>;

const readJson = (p: string): any => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const memo = new Map<string, MlbSeasonComplete | null>();

/** `dataRoot` is public/data. Null while MLB is in season (or the evidence is missing / UNKNOWN). */
export function loadMlbSeasonComplete(dataRoot: string = path.join(process.cwd(), "public", "data")): MlbSeasonComplete | null {
  if (memo.has(dataRoot)) return memo.get(dataRoot)!;
  const mlb = path.join(dataRoot, "mlb");
  const seasonState = readJson(path.join(mlb, "season-state.json"));
  let out: MlbSeasonComplete | null = null;
  if (isMlbSeasonComplete(seasonState)) {
    const from: string | null = seasonState.calendar?.postSeasonStartDate ?? null;
    const dir = path.join(mlb, "statsapi-schedule");
    let files: string[] = [];
    try { files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)); } catch { files = []; }
    const scheduleDays = files
      .map((f) => f.slice(0, 10))
      .filter((d) => from != null && d >= from && d <= seasonState.date)
      .map((d) => { const doc = readJson(path.join(dir, `${d}.json`)); return { date: d, games: Array.isArray(doc?.games) ? doc.games : [] }; });
    let gradedRows: unknown[] = [];
    try {
      gradedRows = fs.readFileSync(path.join(mlb, "results", "game-predictions-graded.jsonl"), "utf8").split("\n").filter(Boolean)
        .flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
    } catch { gradedRows = []; }
    const record = readJson(path.join(mlb, "results", "lifetime_summary.json"));
    out = deriveMlbSeasonComplete({ seasonState, scheduleDays, gradedRows, record });
  }
  memo.set(dataRoot, out);
  return out;
}

/** The reader-facing copy, or null in season. */
export function mlbSeasonCompleteCopyFor(dataRoot?: string): MlbSeasonCompleteCopy | null {
  return mlbSeasonCompleteCopy(loadMlbSeasonComplete(dataRoot));
}
