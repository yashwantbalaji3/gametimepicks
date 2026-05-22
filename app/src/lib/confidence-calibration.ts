/**
 * Server-only loader for the dynamic confidence calibration table.
 *
 * The PURE classifier logic + `calibratedConfidenceLabelFromTable()`
 * live in `confidence-calibration-rules.ts` — that file is safe to
 * import from client components.
 *
 * This file reads `app/public/data/audit/model_audit.json` at
 * request time on the server. Client components cannot import from
 * here (the bundler will fail on `fs`/`path`). Instead, server
 * pages should call `loadCalibrationTable()` and pass the result
 * down to client components as a prop.
 *
 * Server components MAY use the convenience wrappers
 * `calibratedConfidenceLabel()` / `calibrationHealthFor()` /
 * `isCuratedEligible()` exported here — they load the audit and
 * delegate to the pure helpers in the rules file.
 */
import fs from "node:fs";
import path from "node:path";

import {
  CALIBRATION_RULES,
  EMPTY_CALIBRATION_TABLE,
  calibratedConfidenceLabelFromTable,
  classifyTier,
  isCuratedEligibleFromTable,
  type CalibrationHealth,
  type CalibrationTable,
  type Sport,
} from "@/lib/confidence-calibration-rules";
import type { RawConfidence } from "@/lib/confidence-labels";

// Re-export for backwards compatibility — existing imports from
// "@/lib/confidence-calibration" still resolve.
export {
  CALIBRATION_RULES,
  EMPTY_CALIBRATION_TABLE,
  classifyTier,
} from "@/lib/confidence-calibration-rules";
export type {
  CalibrationHealth,
  CalibrationTable,
  Sport,
} from "@/lib/confidence-calibration-rules";


interface AuditFile {
  sports?: {
    nba?: { byConfidence?: Array<{ label: string; wins: number; losses: number; decisive?: number; hitRate?: number }> };
    mlb?: { byConfidence?: Array<{ label: string; wins: number; losses: number; decisive?: number; hitRate?: number }> };
  };
}

const AUDIT_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "audit",
  "model_audit.json",
);

let _cached: CalibrationTable | undefined;

/**
 * Load the per-sport calibration table from
 * `model_audit.json`. Result is process-level cached on the first
 * call; tests can reset via `__resetCacheForTest()`. Fails closed:
 * a missing or malformed audit returns
 * `EMPTY_CALIBRATION_TABLE`, which the classifier treats as
 * "unknown" (no downgrade, no promotion).
 */
export function loadCalibrationTable(): CalibrationTable {
  if (_cached !== undefined) return _cached;
  if (!fs.existsSync(AUDIT_PATH)) {
    _cached = EMPTY_CALIBRATION_TABLE;
    return _cached;
  }
  let parsed: AuditFile;
  try {
    parsed = JSON.parse(fs.readFileSync(AUDIT_PATH, "utf-8")) as AuditFile;
  } catch {
    _cached = EMPTY_CALIBRATION_TABLE;
    return _cached;
  }
  const out: CalibrationTable = { nba: {}, mlb: {} };
  for (const sport of ["nba", "mlb"] as const) {
    const rows = parsed.sports?.[sport]?.byConfidence ?? [];
    for (const r of rows) {
      if (r.label) out[sport][r.label] = r;
    }
  }
  _cached = out;
  return out;
}

/* ============================================================================
   Convenience wrappers — for SERVER-COMPONENT callers only.
   Client components should accept a `CalibrationTable` prop and use the
   pure helpers in `confidence-calibration-rules.ts` directly.
============================================================================ */

export function calibratedConfidenceLabel(
  sport: Sport,
  rawConfidence: RawConfidence | null | undefined,
): {
  label: string;
  health: CalibrationHealth | "unknown";
  downgraded: boolean;
  reason: string;
} {
  const table = loadCalibrationTable();
  return calibratedConfidenceLabelFromTable(
    sport,
    rawConfidence,
    table[sport] ?? {},
  );
}

export function calibrationHealthFor(
  sport: Sport,
  rawConfidence: RawConfidence | null | undefined,
): CalibrationHealth | "unknown" {
  if (!rawConfidence) return "unknown";
  const table = loadCalibrationTable();
  return classifyTier(rawConfidence, table[sport] ?? {});
}

export function isCuratedEligible(
  sport: Sport,
  rawConfidence: RawConfidence | null | undefined,
): boolean {
  const table = loadCalibrationTable();
  return isCuratedEligibleFromTable(
    sport,
    rawConfidence,
    table[sport] ?? {},
  );
}

/** @internal test-only */
export function __resetCacheForTest(): void {
  _cached = undefined;
}

/** @internal test-only */
export function __setAuditForTest(table: CalibrationTable | undefined): void {
  _cached = table;
}
