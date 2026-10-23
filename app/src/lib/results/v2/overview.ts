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
import { mlbCallStatus } from "./mlb-call-status";

export interface V2Counts { won: number; lost: number; push: number; void: number; decisive: number; n: number; hitRate: number | null }
export interface V2Day { date: string; won: number; lost: number; push: number; void: number }
export interface V2Population {
  id: string; sport: "mlb" | "nfl" | "epl" | "ufc"; label: string;
  /* UNKNOWN (F05): graded, but whether it was a public pick at the start cannot be established — in neither record. */
  class: "PUBLIC" | "RESEARCH" | "UNKNOWN"; kind: "GAME" | "PROP" | "MATCH" | "FIGHT";
  /** Populations split from ONE owner by publication status share a group, so each can name what the others hold. */
  group?: string; tag?: string | null;
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

  /* F05 (independent audit 2026-10-23): the MLB game-call ledger grades every call the model made, including calls
     the site had PAUSED at first pitch (the live-record gate) and games whose forecast never reached the site. Only
     calls shown before first pitch are the public record; the rest are graded in their own populations — every row
     stays, in exactly one of the three (lib/results/mlb-call-publication.mjs). */
  const mlbGames = readJsonl(path.join(appDir, "public/data/mlb/results/game-predictions-graded.jsonl"));
  if (mlbGames) {
    const owner = "public/data/mlb/results/game-predictions-graded.jsonl";
    const rowsOf = (keep: (s: string) => boolean) => mlbGames.filter((r) => keep(mlbCallStatus(r)))
      .map((r) => ({ date: typeof r.date === "string" ? r.date : null, outcome: outcomeFromWord(r.outcome) }));
    const common = { sport: "mlb", kind: "GAME", owner, group: "mlb-games", seasonStart: SEASON.mlb.start, seasonLabel: SEASON.mlb.label, today };
    pops.push({ ...population({
      ...common, id: "mlb-games", label: "MLB game calls", klass: "PUBLIC",
      note: "Winner, run line and total calls the site showed before first pitch, graded from the official linescore. A call the site had paused is graded in its own record, never here.",
      rows: rowsOf((st) => st === "PUBLIC"),
    }), group: "mlb-games", tag: null } as V2Population);
    pops.push({ ...population({
      ...common, id: "mlb-games-paused", label: "MLB game calls · paused or not shown", klass: "RESEARCH",
      note: "Calls that were not public picks at first pitch: paused on the site while their live record was below a coin flip (the total call since Sep 14, the winner call on Sep 18), or a forecast that never reached the site before the game. Still graded every day.",
      rows: rowsOf((st) => st === "PAUSED" || st === "NOT_SERVED"),
    }), group: "mlb-games", tag: "paused or not shown" } as V2Population);
    const unknown = rowsOf((st) => st === "UNKNOWN");
    if (unknown.length) pops.push({ ...population({
      ...common, id: "mlb-games-unknown", label: "MLB game calls · publication status unknown (legacy)", klass: "UNKNOWN",
      note: "Graded, but the record cannot show whether the site displayed or paused these calls at first pitch (the game calls' launch day, Jul 24–25, and the morning a pause ended). Counted in neither record above; nothing is dropped.",
      rows: unknown,
    }), group: "mlb-games", tag: "status unknown" } as V2Population);
  }

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
  if (mlbProps) pops.push({ ...population({
    id: "mlb-props", sport: "mlb", label: "MLB player-prop leans", klass: "RESEARCH", kind: "PROP",
    owner: "pipeline/validation/mlb_settled_leans.jsonl",
    note: "Market context, not picks: these markets are demoted — the model loses to the market on Brier and log loss. A push is a void.",
    seasonStart: SEASON.mlb.start, seasonLabel: SEASON.mlb.label, today, rows: fromPicks(mlbProps),
  }), tag: "market context · not picks" } as V2Population);

  memo = { today, pops };
  return pops;
}
