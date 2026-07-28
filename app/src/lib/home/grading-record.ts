/**
 * grading-record — the counts behind the homepage's "what we have not proven" band.
 *
 * Reads the canonical MLB lifetime summary that the nightly settlement pipeline writes. Nothing here
 * is computed, estimated, or cached across builds: if the artifact is missing or malformed the loader
 * returns nulls and the band renders its sentence without numbers rather than inventing any.
 *
 * Sprint 035. Deliberately separate from `record-families.ts` (the MONEY record). This is the
 * model-performance ledger — graded predictions, money-independent — and the two must never be
 * blended, which is the reason it gets its own tiny loader rather than an extra field on a money type.
 */
import fs from "node:fs";
import path from "node:path";

export interface GradingRecord {
  /** Total graded predictions. Null when the artifact could not be read. */
  gradedCount: number | null;
  /** Distinct slate dates covered. */
  gradedDates: number | null;
  /** Decisive (non-void) outcomes. */
  decisive: number | null;
  /** Measured hit rate across decisive outcomes. Presented only alongside its denominator. */
  hitRate: number | null;
}

const EMPTY: GradingRecord = { gradedCount: null, gradedDates: null, decisive: null, hitRate: null };

const posInt = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null;

/**
 * Load the graded-prediction counts.
 *
 * Fails closed to nulls — a homepage claim about sample size must never be backed by a guess.
 */
export function loadGradingRecord(dataRoot?: string): GradingRecord {
  const root = dataRoot ?? path.join(process.cwd(), "public", "data");
  try {
    const raw = fs.readFileSync(path.join(root, "mlb", "results", "lifetime_summary.json"), "utf8");
    const doc = JSON.parse(raw) as Record<string, unknown>;
    const hit = typeof doc.hitRate === "number" && Number.isFinite(doc.hitRate) ? doc.hitRate : null;
    return {
      gradedCount: posInt(doc.totalSettled),
      gradedDates: posInt(doc.totalDates),
      decisive: posInt(doc.decisive),
      hitRate: hit,
    };
  } catch {
    return EMPTY;
  }
}
