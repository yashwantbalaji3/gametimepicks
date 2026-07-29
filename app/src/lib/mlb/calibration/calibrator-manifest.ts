/**
 * SPRINT 049 — the calibrator is versioned, and refuses to apply itself where it does not belong.
 *
 * WHY A MANIFEST RATHER THAN TWO NUMBERS
 * Sprint 048 persisted the fitted Platt parameters so production would not silently refit. That closed
 * one hole and left three:
 *
 *   · a calibrator fitted on May–June applied to a board produced by a *different model version*;
 *   · a calibrator fitted on four MLB prop families applied to a market family it never saw;
 *   · a calibrator quietly aging until its fit window bears no relation to current behaviour.
 *
 * None of those fail loudly. Each produces a plausible number, which is the failure mode this
 * repository keeps re-encountering. So compatibility is checked explicitly and the answer is allowed
 * to be "no" — in which case the surface falls back to a clearly-labelled raw-only view rather than
 * showing a corrected number that was never valid for this row.
 *
 * Data-only. No I/O — a caller loads the manifest and passes it in, so this stays testable and pure.
 */
import type { PlattParameters } from "./probability-layers";

export interface CalibratorManifest {
  readonly calibratorVersion: string;
  readonly method: "platt";
  /** The board/lean schema this calibrator was fitted against. */
  readonly modelSchemaVersion: string;
  /** Market families present in the fit. Applying outside this set is refused. */
  readonly marketFamilies: readonly string[];
  readonly parameters: PlattParameters;
  readonly fitWindow: { readonly from: string; readonly to: string; readonly rows: number };
  readonly heldOutWindow: { readonly from: string; readonly to: string; readonly rows: number };
  readonly heldOutEvaluation: {
    readonly rawModelBrier: number;
    readonly calibratedBrier: number;
    readonly marketBrier: number;
    readonly brierImprovementVsRaw: number;
    readonly brierGapToMarket: number;
    readonly stillBehindMarket: boolean;
    readonly observedRate: number;
  };
  /** Deterministic hash of the exact corpus the fit saw. */
  readonly corpusFingerprint: string;
  readonly corpusRows: number;
  readonly generatedForSettledDate: string;
}

/**
 * How stale a calibrator may be before it is refused.
 *
 * 45 days, not 7: the fit window is itself ~40 days, so a tighter bound would reject a calibrator the
 * day after it was produced. The number that matters is whether the fit still describes current
 * behaviour, and there is no evidence of drift in this corpus yet — every market's recent Wilson
 * interval overlaps its prior. When drift is measured, tighten this and say why.
 */
export const MAX_CALIBRATOR_AGE_DAYS = 45;

export type CompatibilityCode =
  | "OK"
  | "MISSING_MANIFEST"
  | "SCHEMA_MISMATCH"
  | "MARKET_NOT_IN_FIT"
  | "STALE"
  | "MALFORMED_PARAMETERS";

export interface CompatibilityVerdict {
  readonly compatible: boolean;
  readonly code: CompatibilityCode;
  /** Why, in a form an operator can act on. */
  readonly reason: string;
}

const dayDiff = (a: string, b: string): number | null => {
  const x = Date.parse(`${a}T00:00:00Z`);
  const y = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return Math.round((x - y) / 86400000);
};

/**
 * May this calibrator be applied to this row?
 *
 * Fails closed on every uncertainty, including an unparseable date — an unknown age is not a young age.
 */
export function checkCompatibility(input: {
  manifest: CalibratorManifest | null | undefined;
  marketFamily: string;
  modelSchemaVersion: string;
  /** The slate being rendered, so staleness is measured against the data, not a wall clock. */
  asOfSettledDate: string;
}): CompatibilityVerdict {
  const { manifest, marketFamily, modelSchemaVersion, asOfSettledDate } = input;

  if (!manifest) {
    return { compatible: false, code: "MISSING_MANIFEST", reason: "no calibrator manifest is available" };
  }
  const p = manifest.parameters;
  if (!p || !Number.isFinite(p.a) || !Number.isFinite(p.b) || !(p.trainRows > 0)) {
    return {
      compatible: false, code: "MALFORMED_PARAMETERS",
      reason: "the manifest's fitted parameters are missing or not finite",
    };
  }
  if (manifest.modelSchemaVersion !== modelSchemaVersion) {
    return {
      compatible: false, code: "SCHEMA_MISMATCH",
      reason: `the calibrator was fitted against schema "${manifest.modelSchemaVersion}" but this row is "${modelSchemaVersion}" — the probabilities may not mean the same thing`,
    };
  }
  if (!manifest.marketFamilies.includes(marketFamily)) {
    return {
      compatible: false, code: "MARKET_NOT_IN_FIT",
      reason: `"${marketFamily}" was not in the calibrator's fit (${manifest.marketFamilies.join(", ")})`,
    };
  }
  const age = dayDiff(asOfSettledDate, manifest.generatedForSettledDate);
  if (age === null) {
    return {
      compatible: false, code: "STALE",
      reason: `cannot compare "${asOfSettledDate}" with the manifest's "${manifest.generatedForSettledDate}" — an unknown age is not a young age`,
    };
  }
  if (age > MAX_CALIBRATOR_AGE_DAYS) {
    return {
      compatible: false, code: "STALE",
      reason: `the calibrator was generated for ${manifest.generatedForSettledDate}, ${age} days before this slate — beyond the ${MAX_CALIBRATOR_AGE_DAYS}-day limit`,
    };
  }
  return {
    compatible: true, code: "OK",
    reason: `fitted on ${manifest.fitWindow.rows.toLocaleString()} rows through ${manifest.fitWindow.to}, ${age} day(s) before this slate`,
  };
}

/**
 * The public-safe interpretation of what this calibrator achieved.
 *
 * Generated from the manifest's own measured numbers rather than written by hand, so it cannot drift
 * from the evidence the way a hardcoded caption does — that class of defect shipped a stale 51.7% for
 * weeks before Sprint 046 caught it.
 */
export function manifestInterpretation(m: CalibratorManifest): string {
  const gain = m.heldOutEvaluation.brierImprovementVsRaw;
  const gap = m.heldOutEvaluation.brierGapToMarket;
  const better = gain > 0
    ? `On ${m.heldOutWindow.rows.toLocaleString()} results it never saw, calibration improved the accuracy of our stated probabilities (Brier ${m.heldOutEvaluation.rawModelBrier.toFixed(4)} → ${m.heldOutEvaluation.calibratedBrier.toFixed(4)}).`
    : `On held-out results calibration did not improve our stated probabilities.`;
  const limit = m.heldOutEvaluation.stillBehindMarket
    ? ` On those same results the sportsbook's own no-vig probability still scored more accurately (${m.heldOutEvaluation.marketBrier.toFixed(4)}, a gap of ${gap.toFixed(4)}). Our numbers are more honest than before; they do not out-predict the sportsbook.`
    : "";
  return `${better}${limit}`;
}
