/**
 * Build-time reader for the NFL week reconciliation artifacts (P296). One owner, so /results/nfl and the
 * card on /results can never describe the same week with different numbers.
 */
import fs from "node:fs";
import path from "node:path";

export type Outcome = "HIT" | "MISS" | "VOID" | "NO_LINE" | "PUSH";

export interface WeekProp {
  id: string;
  label: string;
  group: "team" | "player";
  target?: number;
  status?: "PUBLISHED" | "ESTIMATE";
  checks: number;
  hits: number;
  voids: number;
  rate: number | null;
}

export interface WeekGame {
  providerEventId: string;
  matchup: string;
  kickoffUtc: string;
  away: { abbr: string; name: string };
  home: { abbr: string; name: string };
  state: "FINAL" | "PENDING";
  published: {
    generatedAt: string;
    projectedScore: { away: number; home: number };
    pick: { abbr: string; probability: number };
    total: { median: number; low: number; high: number };
    margin: { median: number; low: number; high: number };
    sportsbookTotal: number | null;
  };
  final: { away: number; home: number; total: number; margin: number } | null;
  team: Array<{ prop: string; outcome: Outcome; actual?: number }>;
  players: Array<{ name: string; team: string; prop: string; status: string; median: number | null; low: number; high: number; actual: number | null; outcome: Outcome }>;
  touchdowns: Array<{ name: string; team: string; probability: number; outcome: "SCORED" | "DID_NOT_SCORE" | "VOID"; likeliest?: boolean }>;
  boardNote: string | null;
}

export interface WeekReport {
  generatedAt: string;
  period: { key: string; seasonType: number; week: number; label: string };
  source: string;
  howGraded: Record<string, string>;
  summary: {
    gamesFinal: number;
    gamesPending: number;
    overall: { checks: number; hits: number; rate: number | null };
    props: WeekProp[];
    context: {
      closerThanSportsbook: { oursCloser: number; booksCloser: number; even: number; noLine: number };
      touchdowns: { playersGraded: number; expectedScorers: number; actualScorers: number };
    };
  };
  games: WeekGame[];
  disclaimer: string;
}

export interface WeekIndex {
  weeks: Array<{ key: string; label: string; generatedAt: string; gamesFinal: number; gamesPending: number; overall: { checks: number; hits: number; rate: number | null } }>;
}

const DIR = () => path.join(process.cwd(), "public", "data", "nfl", "reconciliation");
const readJson = <T,>(file: string): T | null => {
  try { return JSON.parse(fs.readFileSync(path.join(DIR(), file), "utf8")) as T; } catch { return null; }
};

/** The index plus the newest week's full report, or nulls when nothing has been reconciled yet. */
export function readNflWeekReports(): { index: WeekIndex | null; latest: WeekReport | null } {
  const index = readJson<WeekIndex>("index.json");
  const newest = index?.weeks?.length ? index.weeks[index.weeks.length - 1] : null;
  const latest = newest ? readJson<WeekReport>(`${newest.key}.json`) : null;
  return { index, latest };
}

export const pct = (rate: number | null | undefined) => (rate == null ? "—" : `${(rate * 100).toFixed(1)}%`);
