/**
 * Leakage validation — enforce the prediction-time rule
 * `feature_timestamp <= prediction_time < event_start_time` and that no snapshot was captured
 * after prediction time, and that rolling windows never include the target event. Pure.
 */
import type { LeakageValidationResult, PredictionSnapshotMetadata, RollingWindowMeta } from "./types";

function ts(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/**
 * Validate a prediction's snapshot metadata against the leakage rules. Optionally pass the
 * feature/rolling-window metadata used so the windows can be checked too.
 */
export function validateLeakage(
  meta: PredictionSnapshotMetadata,
  rollingWindows: RollingWindowMeta[] = [],
): LeakageValidationResult {
  const checks: Array<{ name: string; passed: boolean; detail?: string }> = [];
  const pred = ts(meta.predictionTime);
  const start = ts(meta.eventStartTime);
  const feat = ts(meta.featureSnapshotTime);

  const add = (name: string, passed: boolean, detail?: string) => checks.push({ name, passed, detail });

  add("prediction_time_present", pred !== null, meta.predictionTime);
  add("event_start_time_present", start !== null, meta.eventStartTime);

  // prediction_time < event_start_time
  add(
    "prediction_before_event_start",
    pred !== null && start !== null ? pred < start : false,
    pred !== null && start !== null && pred >= start ? "prediction made at/after kickoff" : undefined,
  );

  // feature_timestamp <= prediction_time
  add(
    "features_at_or_before_prediction",
    feat !== null && pred !== null ? feat <= pred : feat === null,
    feat !== null && pred !== null && feat > pred ? "feature snapshot AFTER prediction time" : undefined,
  );

  // every optional snapshot must be <= prediction_time (no future data)
  for (const [field, val] of [
    ["market", meta.marketSnapshotTime],
    ["lineup", meta.lineupSnapshotTime],
    ["injury", meta.injurySnapshotTime],
    ["weather", meta.weatherSnapshotTime],
    ["data_cutoff", meta.dataCutoffTime],
  ] as const) {
    const t = ts(val);
    if (t === null) continue; // absent snapshot is allowed (surfaced as a missing flag elsewhere)
    add(
      `${field}_snapshot_not_after_prediction`,
      pred !== null ? t <= pred : false,
      pred !== null && t > pred ? `${field} snapshot captured after prediction time` : undefined,
    );
  }

  // rolling windows must never include the target event
  rollingWindows.forEach((w, i) => {
    add(
      `rolling_window_${i}_excludes_target`,
      w.includesTargetEventFlag === false && (start === null || ts(w.windowEndTime) === null || (ts(w.windowEndTime) as number) <= start),
      w.includesTargetEventFlag !== false ? "window includes target event" : undefined,
    );
  });

  return { passed: checks.every((c) => c.passed), checks };
}
