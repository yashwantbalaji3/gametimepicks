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
import {
  PUBLIC_PARLAY_RESULTS_START_DATE,
  isInPublicParlayEra,
  filterDatesToPublicEra,
  aggregateBuckets,
  emptyPublicParlayBucket,
  type PublicParlayBucket,
} from "./public-parlay-era";

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

/**
 * Returns the optimizer summary with all pre-era rows stripped and
 * lifetime/by-profile/by-sport aggregates recomputed from the
 * post-era `byDate` rows only.
 *
 * The raw JSON on disk is left untouched — this filter runs at read
 * time so the pipeline can keep writing its full record without the
 * UI ever leaking pre-era numbers. See `public-parlay-era.ts` for
 * the rationale.
 *
 * Returns null when the summary JSON itself is missing or unreadable.
 * When all rows are pre-era the summary is still returned but with
 * empty buckets so the UI can render an honest "no settled slips in
 * the new tracking era yet" state.
 */
export function getOptimizerSummary(): OptimizerSummary | null {
  const raw = _readJsonSafe<OptimizerSummary>(OPTIMIZER_SUMMARY_PATH);
  if (!raw) return null;
  const postEraByDate = (raw.byDate ?? []).filter((row) =>
    isInPublicParlayEra(row.date),
  );
  const lifetime = aggregateBuckets(postEraByDate);
  // by-profile / by-sport are pipeline-aggregated over ALL dates on
  // disk. Without per-date breakdowns in those slices we cannot
  // safely recompute them post-era, so we zero them out when no
  // post-era date has settled. Once at least one post-era date is
  // graded, the pipeline overwrites these buckets and they line up
  // with the recomputed lifetime again.
  const hasPostEraData = postEraByDate.length > 0;
  const zeroBucket = emptyPublicParlayBucket();
  const filteredByProfile: Record<string, PublicParlayBucket> = {};
  if (hasPostEraData) {
    for (const [k, v] of Object.entries(raw.byProfile ?? {})) {
      filteredByProfile[k] = v;
    }
  } else {
    for (const k of Object.keys(raw.byProfile ?? {})) {
      filteredByProfile[k] = { ...zeroBucket };
    }
  }
  const filteredBySport: Record<string, PublicParlayBucket> = {};
  if (hasPostEraData) {
    for (const [k, v] of Object.entries(raw.bySport ?? {})) {
      filteredBySport[k] = v;
    }
  } else {
    for (const k of Object.keys(raw.bySport ?? {})) {
      filteredBySport[k] = { ...zeroBucket };
    }
  }
  return {
    ...raw,
    byDate: postEraByDate,
    lifetime,
    byProfile: filteredByProfile,
    bySport: filteredBySport,
  };
}

/**
 * Returns graded-date ISO strings, filtered to the public-era only
 * and ordered newest-first.
 *
 * Pre-era graded files (e.g. 2026-05-25.json) are intentionally left
 * on disk as an internal archive but excluded from the UI. See
 * `public-parlay-era.ts`.
 */
export function getOptimizerGradedDates(): string[] {
  return filterDatesToPublicEra(_listDates(OPTIMIZER_GRADED_DIR))
    .slice()
    .reverse();
}

/**
 * Returns the graded payload for a specific date — but only if that
 * date is in the public era. Pre-era reads return null so direct
 * callers can't bypass the filter by hand-picking a date.
 */
export function getOptimizerGradedForDate(
  date: string,
): OptimizerGradedPayload | null {
  if (!isInPublicParlayEra(date)) return null;
  return _readJsonSafe<OptimizerGradedPayload>(
    path.join(OPTIMIZER_GRADED_DIR, `${date}.json`),
  );
}

/** Re-export the era constant for callers that need to render
 *  fresh-era-start copy. */
export { PUBLIC_PARLAY_RESULTS_START_DATE };

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
