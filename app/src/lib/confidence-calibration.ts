/**
 * Calibration-aware confidence labeling.
 *
 * The raw `confidence` field on every lean is whatever the production
 * scoring path emitted ("High" / "Medium" / "Low" / "insufficient_data").
 * That tier is the model's INTENT — but the forward audit (see
 * `pipeline.calibration_report`) shows it's not always WORKING:
 *
 *   - NBA REB at High → 59.0% on 229 settled (genuine signal)
 *   - NBA PTS at High → ~52% on 252 (coin flip)
 *   - MLB High      → 48.3% on 315 (INVERTED — below Medium and Low)
 *
 * This module wraps `confidenceLabel()` with a calibration overlay.
 * When a (sport, tier) combination is known to be inverted or near
 * coin flip, we downgrade the displayed label to be honest. The raw
 * tier and edge are never mutated — only the display label and the
 * calibration note are adjusted.
 *
 * Why this lives in the UI layer (not in `score_model.py`):
 *   - We don't have enough settled data yet to retrain the scoring
 *     path. Mutating raw projections would be reckless.
 *   - The calibration overlay is reversible, testable, and
 *     surface-only — turning it off restores the raw labels.
 *   - The audit numbers are public; users can verify the overlay
 *     against `/results` themselves.
 *
 * Source of truth for the overlay rules:
 *   - `METHODOLOGY_FINDINGS_2026-05-22.md`
 *   - `pipeline.calibration_report --by-market --by-confidence`
 */
import {
  confidenceLabel,
  type RawConfidence,
} from "@/lib/confidence-labels";

export type Sport = "nba" | "mlb";

export type CalibrationHealth =
  | "strong" // tier outperforms coin flip materially on real data
  | "watch" // tier is at or just above coin flip; treat as informational
  | "inverted" // tier underperforms a lower tier; honesty demands downgrade
  | "thin"; // sample too thin to claim either way

/**
 * Per-sport per-tier calibration health, derived from the 2026-05-22
 * settled sample. These constants ARE the audit's honest read — they
 * should be refreshed each time the methodology pass runs against a
 * larger sample. Locked by tests so we can't change them by accident.
 */
const CALIBRATION_HEALTH: Record<
  Sport,
  Partial<Record<RawConfidence, CalibrationHealth>>
> = {
  nba: {
    High: "strong",   // 53.9% on 473 — strongest tier on volume
    Medium: "thin",   // 59.5% on 79 — best but sample is small
    Low: "watch",     // 51.7% on 118 — controlled, near coin flip
  },
  mlb: {
    High: "inverted", // 48.3% on 315 — BELOW Medium AND Low
    Medium: "watch",  // 52.0% on 102
    Low: "watch",     // 51.4% on 327
  },
};

/** Friendly user-facing label after applying the calibration overlay. */
export function calibratedConfidenceLabel(
  sport: Sport,
  rawConfidence: RawConfidence | null | undefined,
): {
  label: string;
  health: CalibrationHealth | "unknown";
  /** True iff the calibration overlay actually changed the label. */
  downgraded: boolean;
  /** Short reason string surfaced on tooltips / "why this label" UIs. */
  reason: string;
} {
  if (!rawConfidence) {
    return {
      label: "",
      health: "unknown",
      downgraded: false,
      reason: "",
    };
  }
  const sportTable = CALIBRATION_HEALTH[sport] ?? {};
  const health = sportTable[rawConfidence] ?? "unknown";
  const baseLabel = confidenceLabel(rawConfidence);

  // Inverted: the model's stated tier underperforms a lower tier on
  // settled data. Downgrade the display from "Stronger signal" to
  // "Calibration watch" so users don't trust the label more than the
  // numbers justify.
  if (health === "inverted") {
    return {
      label: "Calibration watch",
      health,
      downgraded: true,
      reason:
        rawConfidence === "High"
          ? `${sport.toUpperCase()} Stronger-signal tier currently underperforms Medium and Low on settled data. We downgrade the label until calibration improves.`
          : `${sport.toUpperCase()} ${rawConfidence} tier is currently misaligned with settled outcomes.`,
    };
  }

  // Thin: tier is technically the highest-hit-rate cohort but the
  // sample is too small to label "Stronger signal" without
  // overpromising. Keep the base label but note the caveat.
  if (health === "thin" && rawConfidence === "Medium") {
    return {
      label: baseLabel, // still "Watch"
      health,
      downgraded: false,
      reason: `${sport.toUpperCase()} ${rawConfidence} tier is the highest hit rate on record but sample is thin (<100).`,
    };
  }

  // Default — return the raw label unchanged.
  return {
    label: baseLabel,
    health,
    downgraded: false,
    reason: "",
  };
}

/**
 * Returns the calibration health for a (sport, tier) combo without
 * the label-adjustment side. Used by the curated-pick selector to
 * decide whether to keep a lean in the curated set.
 */
export function calibrationHealthFor(
  sport: Sport,
  rawConfidence: RawConfidence | null | undefined,
): CalibrationHealth | "unknown" {
  if (!rawConfidence) return "unknown";
  return CALIBRATION_HEALTH[sport]?.[rawConfidence] ?? "unknown";
}

/**
 * Whether a (sport, tier) combo is safe to include in a curated
 * surface. We keep "strong", "thin" (with caveat), and "watch" —
 * we EXCLUDE "inverted" because the model's own tier label is
 * misleading on those.
 */
export function isCuratedEligible(
  sport: Sport,
  rawConfidence: RawConfidence | null | undefined,
): boolean {
  const h = calibrationHealthFor(sport, rawConfidence);
  return h === "strong" || h === "thin" || h === "watch";
}
