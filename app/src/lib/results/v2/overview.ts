/**
 * RESULTS V2 · THE OVERVIEW READ MODEL (B-1). Server/build time only.
 *
 * Reads the canonical graded owners — the SAME rows the graded-picks builder publishes from
 * (lib/sports/graded-pick-owners.mjs) plus the MLB game-call grader's ledger — and assembles one population
 * per graded record. It grades nothing and recomputes no outcome: every outcome is the owner's own.
 *
 * Product records (Bank Builder, Moonshot, suggested cards) are deliberately NOT recomputed here. Each has one
 * canonical headline (lib/results/current-record.ts over the results projection, incl. the protected Rule S
 * record); a second derivation from raw lanes could disagree with it.
 */
import fs from "node:fs";
import path from "node:path";

import { makeGradedPickOwners } from "@/lib/sports/graded-pick-owners.mjs";
import { population, outcomeOfPick, outcomeFromWord } from "./populations.mjs";
import { publicMlbGradedRows } from "@/lib/mlb/results/grades-of-record-io.mjs";

export interface V2Counts { won: number; lost: number; push: number; void: number; decisive: number; n: number; hitRate: number | null }
export interface V2Day { date: string; won: number; lost: number; push: number; void: number }
export interface V2Population {
  id: string; sport: "mlb" | "nfl" | "epl" | "ufc"; label: string;
  class: "PUBLIC" | "RESEARCH"; kind: "GAME" | "PROP" | "MATCH" | "FIGHT";
  owner: string; note: string | null; seasonStart: string | null; seasonLabel: string | null;
  pending: number | null; undated: number; unreadable: number; noPick?: number;
  days: V2Day[];
  windows: { today: V2Counts; d7: V2Counts; d30: V2Counts; season: V2Counts | null; all: V2Counts };
}

/* Season starts are calendar facts, stated once. NFL's 2026 graded ledger includes preseason, and says so. */
const SEASON = {
  mlb: { start: "2026-03-01", label: "2026 season" },
  nfl: { start: "2026-08-01", label: "2026 season · incl. preseason" },
  epl: { start: "2026-08-01", label: "2026-27 season" },
  ufc: { start: "2026-01-01", label: "2026" },
} as const;

const readJsonl = (p: string): Record<string, unknown>[] | null => {
  try {
    return fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim())
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as Record<string, unknown>[];
  } catch { return null; }
};

let memo: { today: string; pops: V2Population[] } | null = null;

/** Every graded population on `today` (an ET day). Memoised per build worker. */
export function resultsV2Populations(today: string): V2Population[] {
  if (memo && memo.today === today) return memo.pops;
  const appDir = process.cwd();
  const rootDir = path.resolve(appDir, "..");
  const owners = makeGradedPickOwners({ appDir, rootDir });
  // Stage 3E: a no-pick or unknown row has no outcome (counted apart), never a void.
  const fromPicks = (rows: Array<{ when?: string | null; hit?: boolean | null; noPick?: boolean; unknown?: boolean }> | null) =>
    (rows ?? []).map((r) => ({ date: r.when ?? null, outcome: outcomeOfPick(r), noPick: r.noPick === true }));

  const pops: V2Population[] = [];

  // TRUTH-001 Stage B: the public MLB grade rows OF RECORD (approved restatements applied; never-public rows dropped).
  const mlbGames = fs.existsSync(path.join(appDir, "public/data/mlb/results/game-predictions-graded.jsonl")) ? (publicMlbGradedRows(appDir) as Record<string, unknown>[]) : null;
  if (mlbGames) pops.push(population({
    id: "mlb-games", sport: "mlb", label: "MLB game calls", klass: "PUBLIC", kind: "GAME",
    owner: "public/data/mlb/results/game-predictions-graded.jsonl",
    note: "Winner, run line and total calls, graded from the official linescore. The total call is paused on the site while its live record is below a coin flip; it is still graded here.",
    seasonStart: SEASON.mlb.start, seasonLabel: SEASON.mlb.label, today,
    rows: mlbGames.map((r) => ({ date: typeof r.date === "string" ? r.date : null, outcome: outcomeFromWord(r.outcome) })),
  }) as V2Population);

  const nfl = owners.nflPicks();
  if (nfl) pops.push(population({
    id: "nfl-games", sport: "nfl", label: "NFL game winners", klass: "PUBLIC", kind: "GAME",
    owner: "data/internal/nfl/experimental-settlement", note: "Experimental. A tie is a void, never a miss.",
    seasonStart: SEASON.nfl.start, seasonLabel: SEASON.nfl.label, today, rows: fromPicks(nfl),
  }) as V2Population);

  const epl = owners.eplPicks();
  if (epl) pops.push(population({
    id: "epl-matches", sport: "epl", label: "Premier League match results", klass: "PUBLIC", kind: "MATCH",
    owner: "public/data/soccer/epl/results/graded-forecasts.jsonl", note: "The outcome the model gave the most probability to, graded against the full-time score.",
    seasonStart: SEASON.epl.start, seasonLabel: SEASON.epl.label, today, rows: fromPicks(epl),
  }) as V2Population);

  const ufc = owners.ufcPicks();
  if (ufc) pops.push(population({
    id: "ufc-fights", sport: "ufc", label: "UFC fight winners", klass: "PUBLIC", kind: "FIGHT",
    owner: "data/internal/research/ufc/model-vs-market/graded.jsonl", note: "Experimental.",
    seasonStart: SEASON.ufc.start, seasonLabel: SEASON.ufc.label, today, rows: fromPicks(ufc),
  }) as V2Population);

  const mlbProps = owners.mlbPicks();
  if (mlbProps) pops.push(population({
    id: "mlb-props", sport: "mlb", label: "MLB player-prop leans", klass: "RESEARCH", kind: "PROP",
    owner: "pipeline/validation/mlb_settled_leans.jsonl",
    note: "Market context, not picks: these markets are demoted — the model loses to the market on Brier and log loss. A push is a void.",
    seasonStart: SEASON.mlb.start, seasonLabel: SEASON.mlb.label, today, rows: fromPicks(mlbProps),
  }) as V2Population);

  memo = { today, pops };
  return pops;
}
