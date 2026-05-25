/**
 * Loaders for the optimizer-graded parlay artifacts written by
 * `pipeline.grade_optimizer`.
 *
 * Distinct from data-parlays.ts which loads the legacy snapshot/
 * graded pair. Optimizer-graded is the new primary track-record
 * source because the homepage now serves optimizer slips.
 *
 * File layout:
 *   app/public/data/parlays/optimizer-graded/<YYYY-MM-DD>.json
 *   app/public/data/parlays/optimizer-summary.json
 */
import fs from "node:fs";
import path from "node:path";

import type { OptimizerSnapshot, OptimizerSlip } from "./parlay-optimizer";

const ROOT = path.join(process.cwd(), "public", "data", "parlays");
const OPTIMIZER_GRADED_DIR = path.join(ROOT, "optimizer-graded");
const OPTIMIZER_SUMMARY_PATH = path.join(ROOT, "optimizer-summary.json");

export interface OptimizerSummaryBucket {
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  decisive: number;
  hitRate: number | null;
}

export interface OptimizerSummary {
  _disclaimer?: string;
  generatedAt: string;
  byDate: Array<{ date: string } & OptimizerSummaryBucket>;
  lifetime: OptimizerSummaryBucket;
  byProfile: Record<string, OptimizerSummaryBucket>;
  bySport: Record<string, OptimizerSummaryBucket>;
}

/** The optimizer snapshot shape extended with grader-stamped fields. */
export interface OptimizerGradedPayload extends OptimizerSnapshot {
  gradedAt?: string;
  uniqueSlips?: OptimizerSlip[];
}

function _readJsonSafe<T>(p: string): T | null {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch {
    return null;
  }
}

function _listDates(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch {
    return [];
  }
}

export function getOptimizerSummary(): OptimizerSummary | null {
  return _readJsonSafe<OptimizerSummary>(OPTIMIZER_SUMMARY_PATH);
}

export function getOptimizerGradedDates(): string[] {
  return _listDates(OPTIMIZER_GRADED_DIR).slice().reverse();
}

export function getOptimizerGradedForDate(
  date: string,
): OptimizerGradedPayload | null {
  return _readJsonSafe<OptimizerGradedPayload>(
    path.join(OPTIMIZER_GRADED_DIR, `${date}.json`),
  );
}

/** Sort uniqueSlips for date-section display. Newest by status
 *  (wins → losses → pushes → pending) so a reader scrolls
 *  results-first, then explores. */
export function sortGradedSlipsForDisplay(
  slips: OptimizerSlip[],
): OptimizerSlip[] {
  const order: Record<string, number> = {
    win: 0,
    loss: 1,
    push: 2,
    pending: 3,
  };
  return slips
    .slice()
    .sort((a, b) => {
      const sa = order[(a as unknown as { status?: string }).status ?? "pending"] ?? 9;
      const sb = order[(b as unknown as { status?: string }).status ?? "pending"] ?? 9;
      if (sa !== sb) return sa - sb;
      return (b.score ?? 0) - (a.score ?? 0);
    });
}
