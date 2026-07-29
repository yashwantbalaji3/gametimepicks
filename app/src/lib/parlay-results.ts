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
  /** PR `feature/risk-section-results-data` — per-section breakdown
   *  of the user-facing `publicRiskSections` slips. Keyed by
   *  section ("low"/"medium"/"high"/"longshot"). Lifetime aggregates
   *  the post-era dates; `byDate` exposes per-day rows so the UI can
   *  ground a specific slate in the section data the pipeline
   *  graded. Optional for back-compat with summaries written before
   *  the field landed. */
  byPublicSection?: {
    lifetime: Record<string, OptimizerSummaryBucket>;
    byDate: Record<string, Record<string, OptimizerSummaryBucket>>;
  };
  /** Same shape, but bucketed by sport tab the publicRiskSections
   *  slips lived under ("nba"/"mlb"/"multi"). */
  bySportBucket?: {
    lifetime: Record<string, OptimizerSummaryBucket>;
    byDate: Record<string, Record<string, OptimizerSummaryBucket>>;
  };
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

  // by-profile / by-sport in the on-disk summary are pipeline-
  // aggregated across EVERY date in `optimizer-graded/*.json`, which
  // includes pre-era files left on disk as internal archive. Passing
  // those through would leak pre-era 5/25 numbers into the post-era
  // tiles. To stay honest we ignore the summary's pre-aggregated
  // values and recompute byProfile/bySport directly from the
  // post-era per-date graded files (which we already filter via
  // `getOptimizerGradedDates`). When no post-era day has settled,
  // both maps are empty — the UI hides them.
  const filteredByProfile: Record<string, PublicParlayBucket> = {};
  const filteredBySport: Record<string, PublicParlayBucket> = {};
  for (const date of getOptimizerGradedDates()) {
    const payload = _readJsonSafe<OptimizerGradedPayload>(
      path.join(OPTIMIZER_GRADED_DIR, `${date}.json`),
    );
    for (const slip of payload?.uniqueSlips ?? []) {
      const status = ((slip as unknown as { status?: string }).status ?? "")
        .toLowerCase();
      const profile = ((slip as unknown as { profile?: string }).profile ?? "")
        .toLowerCase();
      const sport = ((slip as unknown as { sport?: string }).sport ?? "")
        .toLowerCase();
      const apply = (bucket: PublicParlayBucket) => {
        if (status === "win") {
          bucket.wins += 1;
          bucket.decisive += 1;
        } else if (status === "loss") {
          bucket.losses += 1;
          bucket.decisive += 1;
        } else if (status === "push") {
          bucket.pushes += 1;
        } else {
          bucket.pending += 1;
        }
      };
      if (profile) {
        if (!filteredByProfile[profile]) {
          filteredByProfile[profile] = emptyPublicParlayBucket();
        }
        apply(filteredByProfile[profile]);
      }
      if (sport) {
        if (!filteredBySport[sport]) {
          filteredBySport[sport] = emptyPublicParlayBucket();
        }
        apply(filteredBySport[sport]);
      }
    }
  }
  // Final pass — compute hitRate per bucket.
  const seal = (b: PublicParlayBucket) => {
    b.hitRate = b.decisive > 0 ? b.wins / b.decisive : null;
  };
  Object.values(filteredByProfile).forEach(seal);
  Object.values(filteredBySport).forEach(seal);
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
/**
 * Dates whose optimizer snapshot contains at least one DECIDED leg.
 *
 * SPRINT 051. `getOptimizerGradedDates()` returns dates for which a graded FILE exists, which is not
 * the same thing as a settled slate. On 2026-07-28 the settlement-lineage gate correctly refused the
 * MLB slate (a doubleheader identity collision), so the snapshot was written with 168 legs and every
 * one of them `pending` — and the global status bar, keying on file existence, told every visitor
 * "Slate settled · Jul 28".
 *
 * Settlement is a property of the CONTENT, not of the filename. A date qualifies here only when
 * something actually resolved.
 */
export function getOptimizerSettledDates(): string[] {
  const decided = new Set(["win", "loss", "push", "void"]);
  const hasDecided = (node: unknown): boolean => {
    if (Array.isArray(node)) return node.some(hasDecided);
    if (node && typeof node === "object") {
      const o = node as Record<string, unknown>;
      if (typeof o.status === "string" && decided.has(o.status.toLowerCase())) return true;
      if (typeof o.result === "string" && decided.has(o.result.toLowerCase())) return true;
      return Object.values(o).some(hasDecided);
    }
    return false;
  };
  return getOptimizerGradedDates().filter((d) => {
    const payload = getOptimizerGradedForDate(d);
    return payload ? hasDecided(payload) : false;
  });
}

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
