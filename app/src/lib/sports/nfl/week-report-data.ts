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
  /** Range props: mean |printed middle − actual|, mean printed width, mean (middle − actual). Absent on older reports. */
  typicalMiss?: number;
  rangeWidth?: number;
  lean?: number;
  /** Winner: the sum of the published pick chances over graded games. */
  expectedHits?: number;
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

type WeekRow = WeekIndex["weeks"][number];

/**
 * A week is a REPORT once it has graded something. The event window writes the new week's reconciliation
 * as soon as the week opens (2026-10-02 00:32Z: Week 4, 0 final of 16), and "the newest entry" then
 * headlined /results/nfl as "Week 4: — of our predictions came true · 0 of 0 checks". One rule, here.
 */
export const isGradedWeek = (w: WeekRow | null | undefined) => Boolean(w && (w.overall?.checks ?? 0) > 0 && (w.gamesFinal ?? 0) > 0);

/** Session 5 · B7 — every reconciled week's full report, in season order (the season-to-date fold reads these). */
export function readAllNflWeekReports(): { key: string; label: string; report: WeekReport }[] {
  const index = readJson<WeekIndex>("index.json");
  return (index?.weeks ?? []).flatMap((w) => {
    const report = readJson<WeekReport>(`${w.key}.json`);
    return report ? [{ key: w.key, label: w.label, report }] : [];
  });
}

/** The index, the newest GRADED week's full report, and the graded weeks before it — or nulls. */
export function readNflWeekReports(): { index: WeekIndex | null; latest: WeekReport | null; earlier: WeekRow[] } {
  const index = readJson<WeekIndex>("index.json");
  const graded = (index?.weeks ?? []).filter(isGradedWeek);
  const newest = graded.at(-1) ?? null;
  const latest = newest ? readJson<WeekReport>(`${newest.key}.json`) : null;
  return { index, latest, earlier: graded.slice(0, -1) };
}

export const pct = (rate: number | null | undefined) => (rate == null ? "—" : `${(rate * 100).toFixed(1)}%`);

/** A sharpness figure in the prop's own unit: catches to one decimal, points and yards to the whole number. */
export const unitFigure = (id: string, v: number | undefined) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const n = id === "player_receptions" ? (Math.round(v * 10) / 10).toString() : String(Math.round(v));
  return `${n} ${id === "player_receptions" ? "catches" : id === "total_range" || id === "margin_range" ? "pts" : "yds"}`;
};
