/**
 * Pure classification rules + thresholds for the dynamic confidence
 * calibration layer.
 *
 * This file has NO `fs` / `path` / Node.js imports — it is safe to
 * import from both server components AND client components.
 *
 * Audit data loading + JSON reading live in
 * `confidence-calibration.ts` (server only). Client components that
 * need calibration should receive the precomputed table as a prop
 * and call `classifyTier()` here directly.
 */
import { confidenceLabel, type RawConfidence } from "@/lib/confidence-labels";

export type Sport = "nba" | "mlb";

export type CalibrationHealth =
  | "strong"
  | "watch"
  | "inverted"
  | "thin";

/** Classification thresholds. Locked by tests. */
export const CALIBRATION_RULES = {
  thinSample: 60,
  invertedMarginPp: 1.5,
  strongHitRate: 0.57,
  strongMinSample: 100,
} as const;

export interface AuditRow {
  label: string;
  wins: number;
  losses: number;
  decisive?: number;
  hitRate?: number;
}

/** Calibration table for one sport keyed by tier label. */
export type SportCalibrationTable = Record<string, AuditRow>;

/** Cross-sport table — what server pages hand to client components. */
export interface CalibrationTable {
  nba: SportCalibrationTable;
  mlb: SportCalibrationTable;
}

/** Empty fallback used when audit is missing or sport is out of scope. */
export const EMPTY_CALIBRATION_TABLE: CalibrationTable = {
  nba: {},
  mlb: {},
};

/**
 * Classify a single tier within a sport's audit table. Pure
 * function. Locked by `confidence-calibration.test.mjs`.
 *
 *   thin     → decisive < CALIBRATION_RULES.thinSample
 *   inverted → tier === "High" AND every non-thin rival tier beats
 *              this hitRate by ≥ invertedMarginPp
 *   strong   → hitRate ≥ strongHitRate AND decisive ≥ strongMinSample
 *   watch    → otherwise
 *   unknown  → tier not in table
 */
export function classifyTier(
  tier: RawConfidence,
  sportTable: SportCalibrationTable,
): CalibrationHealth | "unknown" {
  const row = sportTable[tier];
  if (!row) return "unknown";
  const decisive = row.decisive ?? row.wins + row.losses;
  const hitRate = row.hitRate ?? (decisive > 0 ? row.wins / decisive : 0);

  if (decisive < CALIBRATION_RULES.thinSample) {
    return "thin";
  }

  if (tier === "High") {
    const rivals = Object.entries(sportTable).filter(([label, r]) => {
      if (label === tier) return false;
      if (label === "insufficient_data" || label === "no_play") return false;
      const d = r.decisive ?? r.wins + r.losses;
      return d >= CALIBRATION_RULES.thinSample;
    });
    if (rivals.length >= 2) {
      const allBeat = rivals.every(([, r]) => {
        const d = r.decisive ?? r.wins + r.losses;
        const rhr = r.hitRate ?? (d > 0 ? r.wins / d : 0);
        return rhr - hitRate >= CALIBRATION_RULES.invertedMarginPp / 100;
      });
      if (allBeat) return "inverted";
    }
  }

  if (
    hitRate >= CALIBRATION_RULES.strongHitRate &&
    decisive >= CALIBRATION_RULES.strongMinSample
  ) {
    return "strong";
  }

  return "watch";
}

/** Friendly user-facing label after applying the calibration overlay
 *  against a pre-resolved sport calibration table. Pure — no fs
 *  imports — so it's safe to call from client components. */
export function calibratedConfidenceLabelFromTable(
  sport: Sport,
  rawConfidence: RawConfidence | null | undefined,
  table: SportCalibrationTable,
): {
  label: string;
  health: CalibrationHealth | "unknown";
  downgraded: boolean;
  reason: string;
} {
  if (!rawConfidence) {
    return { label: "", health: "unknown", downgraded: false, reason: "" };
  }
  const health = classifyTier(rawConfidence, table);
  const baseLabel = confidenceLabel(rawConfidence);

  if (health === "inverted") {
    return {
      label: "Calibration watch",
      health,
      downgraded: true,
      reason:
        rawConfidence === "High"
          ? `${sport.toUpperCase()} Stronger-signal tier currently underperforms another tier on settled data. We downgrade the label until the audit shows separation.`
          : `${sport.toUpperCase()} ${rawConfidence} tier is currently misaligned with settled outcomes.`,
    };
  }
  if (health === "thin") {
    return {
      label: baseLabel,
      health,
      downgraded: false,
      reason: `${sport.toUpperCase()} ${rawConfidence} tier sample is below the ${CALIBRATION_RULES.thinSample}-row floor — treat the label as informational.`,
    };
  }
  return { label: baseLabel, health, downgraded: false, reason: "" };
}

/** Whether a (sport, tier) combo is safe to include in a curated
 *  surface. Keeps strong / thin / watch; EXCLUDES inverted. */
export function isCuratedEligibleFromTable(
  sport: Sport,
  rawConfidence: RawConfidence | null | undefined,
  table: SportCalibrationTable,
): boolean {
  if (!rawConfidence) return false;
  const h = classifyTier(rawConfidence, table);
  return h === "strong" || h === "thin" || h === "watch";
}
