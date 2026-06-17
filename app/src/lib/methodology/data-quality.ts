/**
 * Data-quality / freshness / missingness helpers — build the explicit missing + stale flags that
 * every prediction carries. Staleness is sport/field-specific (pass the threshold). Pure.
 */
import type { MissingDataFlag, StaleDataFlag, SampleSizedValue } from "./types";
import { sampleSizeBucket, sampleWeight, smallSampleFlag } from "./global-rules";

/** Build a sample-sized value (raw + bucket + weight + small-sample flag) from a raw value + n. */
export function sampleSized(rawValue: number | null, n: number): SampleSizedValue {
  return {
    rawValue,
    sampleSize: n,
    sampleSizeBucket: sampleSizeBucket(n),
    sampleWeight: sampleWeight(n),
    smallSampleFlag: smallSampleFlag(n),
  };
}

/** A missing flag when a value is null/undefined. `critical` drives the No-Bet penalty. */
export function missingFlag(field: string, value: unknown, critical: boolean): MissingDataFlag | null {
  if (value === null || value === undefined || value === "") {
    return { field, critical, reason: `${field} unavailable` };
  }
  return null;
}

/**
 * A stale flag when `capturedAt` is older than `thresholdMinutes` relative to `nowIso`.
 * thresholdMinutes null = the field is not time-sensitive (never stale).
 */
export function staleFlag(
  field: string,
  capturedAt: string | null | undefined,
  thresholdMinutes: number | null,
  nowIso: string,
): StaleDataFlag | null {
  if (thresholdMinutes === null) return null;
  if (!capturedAt) return null; // absence is a MISSING flag, not stale
  const captured = Date.parse(capturedAt);
  const now = Date.parse(nowIso);
  if (Number.isNaN(captured) || Number.isNaN(now)) return null;
  const ageMin = (now - captured) / 60000;
  if (ageMin > thresholdMinutes) {
    return { field, capturedAt, thresholdMinutes, reason: `${field} ${Math.round(ageMin)}m old (> ${thresholdMinutes}m)` };
  }
  return null;
}

/** Sport-specific default staleness thresholds (minutes) for the common time-sensitive feeds. */
export const FRESHNESS_THRESHOLDS: Record<string, number> = {
  lineup: 240,   // confirmed lineups post a few hours pre-game
  injury: 360,
  weather: 180,  // forecast within 3h of first pitch/kickoff
  market: 120,   // odds within 2h of prediction
  projection: 720,
};
