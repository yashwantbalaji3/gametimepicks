/**
 * Reads a sport's published "model picks vs actual outcomes" artifact.
 *
 * Separate from graded-picks.mjs so the contract stays pure and testable without a filesystem: the
 * shape and its rules are one thing, which files happen to hold them is another.
 */
import fs from "node:fs";
import path from "node:path";

export interface GradedPick {
  eventId: string | null;
  when: string | null;
  eventName: string | null;
  subject: string | null;
  market: string;
  predicted: string | null;
  actual: string | null;
  modelProbability: number | null;
  probabilityOfActual: number | null;
  /** Only UFC records both sides; absent everywhere else rather than faked. */
  marketProbabilityOfActual: number | null;
  hit: boolean | null;
}

export interface GradedRecord {
  sport: string;
  label: string;
  what: string;
  caveat: string | null;
  generatedAt: string;
  counts: { counted: number; hits: number; misses: number; voided: number; shown: number; total: number };
  hitRate: number | null;
  /** Stage 3D: where the graded side came from; "MIXED" means render byBasis, never the pooled counts as one record. */
  recordBasis?: string;
  byBasis?: { basis: string; counted: number; hits: number; misses: number; hitRate: number | null }[] | null;
  sampleState: string;
  sampleNote: string;
  picks: GradedPick[];
}

export const PICK_SPORTS = ["mlb", "nfl", "ufc", "epl"] as const;

export function loadGradedPicks(sport: string): GradedRecord | null {
  if (!(PICK_SPORTS as readonly string[]).includes(sport)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data", sport, "graded-picks.json"), "utf8"));
    // A record with nothing graded is NOT rendered as a zero — "nothing has been graded yet" and
    // "the model went 0 for 0" are different statements and only one of them is true.
    if (!Array.isArray(raw?.picks)) return null;
    return raw as GradedRecord;
  } catch {
    return null;
  }
}

/** Every sport that has a record, for the cross-sport archive. */
export function loadAllGradedPicks(): GradedRecord[] {
  return PICK_SPORTS.map((s) => loadGradedPicks(s)).filter((r): r is GradedRecord => Boolean(r));
}

/* ── MLB game-level record (P196 · Release B1) — a SEPARATE ledger, never blended ────────────── */

export interface GameFamilyRecord {
  n: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number | null;
  styleBreakdown?: { minusLines: number; plusLines: number };
  note?: string | null;
}

export interface MlbGameRecord {
  generatedAt: string;
  what: string;
  caveat: string;
  families: Record<string, GameFamilyRecord>;
  counts: { rows: number; missingPreEventFinals: number };
  recent: Array<{
    date: string | null;
    gamePk: number;
    matchup: string;
    market: string;
    pick: string;
    line: number | null;
    modelProbability: number | null;
    marketImpliedProbability: number | null;
    outcome: "WIN" | "LOSS" | "PUSH";
    forecastGeneratedAt: string;
  }>;
}

/**
 * Reader labels for the MLB game-record families (moved here from /results/picks/[sport] so the cross-sport
 * /results/picks summary names them the same way). UXJ-04: that summary printed the keys with only the FIRST
 * underscore replaced — "run line_posted 5–3" beside an unqualified "run line 510–300" for the retired v1 record.
 * Two run-line definitions, two records (TRUTH-001): v1 picked ±1.5 off the simulated favourite; v2 picks at the
 * sportsbook's posted line.
 */
export const MLB_GAME_FAMILY_LABEL: Record<string, string> = {
  moneyline: "Winner (moneyline)",
  total: "Total (over/under)",
  run_line: "Run line (simulated ±1.5, retired)",
  run_line_posted: "Run line (posted line)",
};
/** A family's reader label; an unknown key is spaced out in full rather than shown with underscores. */
export const mlbGameFamilyLabel = (key: string): string => MLB_GAME_FAMILY_LABEL[key] ?? key.replace(/_/g, " ");

/**
 * The game-level prediction record — winner / total / run line graded from the forecast of record.
 * Deliberately NOT part of GradedRecord: the player-prop and game ledgers answer different
 * questions over denominators four hundred times apart, and the one mistake this loader must make
 * impossible is a surface quietly adding them together.
 */
export function loadMlbGameRecord(): MlbGameRecord | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/mlb/results/game-predictions-record.json"), "utf8"));
    if (!raw?.families || !Array.isArray(raw?.recent)) return null;
    return raw as MlbGameRecord;
  } catch {
    return null;
  }
}
