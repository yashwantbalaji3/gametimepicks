/**
 * Build-time reader for the NFL week reconciliation artifacts (P296). One owner, so /results/nfl and the
 * card on /results can never describe the same week with different numbers.
 */
import fs from "node:fs";
import path from "node:path";
import { sampleStateFor, SAMPLE_STATE } from "@/lib/sports/graded-picks.mjs";

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

/**
 * THE WEEK'S HEADLINE (launch audit, 2026-10-13). /results and /results/nfl used to lead with
 * "82.2% of our NFL predictions came true (393 of 478 checks)". That number added three different things:
 *   · range checks (378 of 451) — whether a final number landed inside an 80% range. Their AIM is about 8 in 10;
 *     a higher share means the ranges were too wide, not that the predictions were better;
 *   · the winner record (8 of 13) — the only check that is "the team we picked won";
 *   · the likeliest touchdown scorer (7 of 14).
 * Summed, the ranges dominate and read as an accuracy rate the model never earned. The headline now names each
 * kind on its own terms, from this one owner, so the card and the report cannot drift apart.
 */
export interface WeekHeadline {
  winner: { hits: number; checks: number; expected: number | null } | null;
  ranges: { hits: number; checks: number; rate: number | null; target: number } | null;
  scorer: { hits: number; checks: number } | null;
}

export function weekHeadline(report: WeekReport): WeekHeadline {
  const props = report.summary?.props ?? [];
  const winnerProp = props.find((p) => p.id === "winner" && p.checks > 0);
  const scorerProp = props.find((p) => p.id === "likeliest_scorer" && p.checks > 0);
  const rangeProps = props.filter((p) => typeof p.target === "number" && p.checks > 0);
  const targets = [...new Set(rangeProps.map((p) => p.target as number))];
  const rangeHits = rangeProps.reduce((a, p) => a + p.hits, 0);
  const rangeChecks = rangeProps.reduce((a, p) => a + p.checks, 0);
  return {
    winner: winnerProp ? { hits: winnerProp.hits, checks: winnerProp.checks, expected: winnerProp.expectedHits ?? null } : null,
    /* One shared aim or no pooled line at all — ranges with different aims cannot be added up honestly. */
    ranges: rangeChecks > 0 && targets.length === 1 ? { hits: rangeHits, checks: rangeChecks, rate: rangeHits / rangeChecks, target: targets[0] } : null,
    scorer: scorerProp ? { hits: scorerProp.hits, checks: scorerProp.checks } : null,
  };
}

const inTen = (target: number) => `${Math.round(target * 10)} in 10`;

/** "Week 5: the team we favored won 8 of 13 games" — or, with no graded winner, just "Week 5 report". */
export function headlineTitle(label: string, h: WeekHeadline): string {
  return h.winner ? `${label}: the team we favored won ${h.winner.hits} of ${h.winner.checks} games` : `${label} report`;
}

/** The other two kinds of check, each against its own yardstick. Never one pooled "came true" rate. */
export function headlineDetail(h: WeekHeadline): string {
  const parts: string[] = [];
  if (h.winner?.expected != null) parts.push(`Our win chances expected about ${h.winner.expected} of those ${h.winner.checks}.`);
  if (h.ranges) {
    parts.push(
      `Final numbers landed inside our ${Math.round(h.ranges.target * 100)}% ranges ${h.ranges.hits} of ${h.ranges.checks} times (${pct(h.ranges.rate)}) — ` +
        `the aim is about ${inTen(h.ranges.target)}: far more means the ranges were too wide, far fewer too narrow.`,
    );
  }
  if (h.scorer) parts.push(`Our likeliest touchdown scorer scored in ${h.scorer.hits} of ${h.scorer.checks} games.`);
  /* RESULTS INTEGRITY (2026-10-17): the site's one small-sample rule travels with the week's winner record. A week
     holds at most 16 games, under the 30 floor, so a week's record is always said to be too few on its own. */
  if (h.winner && sampleStateFor(h.winner.checks) === SAMPLE_STATE.TOO_SMALL) {
    parts.push(`${h.winner.checks} graded game${h.winner.checks === 1 ? " is" : "s is"} far too few to judge the winner record on its own.`);
  }
  return parts.join(" ");
}
