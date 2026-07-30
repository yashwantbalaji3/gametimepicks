/**
 * The NBA board row's tip-off contract, mirrored on the TypeScript side.
 *
 * The producer is `pipeline/nba/board_schema.py`; this is what a consumer surface reads. The two are
 * kept in step by `historical-boards-scale.test.mjs`, which asserts the rule against the real
 * committed boards rather than against this file.
 *
 * WHY A CONSTANT AND NOT A CHECK ON THE DATA
 * "This board has no tip-off instant" and "this board predates the schema" look identical from the
 * row alone, and they mean opposite things: the first is a provider gap worth chasing, the second is
 * permanent and must never be repaired. The epoch is what separates them.
 */

/** First slate date whose board rows may carry `tipoffIso`. Mirrors TIPOFF_SCHEMA_EPOCH in Python. */
export const TIPOFF_SCHEMA_EPOCH = "2026-07-30";

export const BOARD_ROW_SCHEMA_VERSION = "nba-board-row-2";

/** One NBA board game row, as the schema emits it. */
export interface NbaBoardGameRow {
  readonly gameId: string;
  readonly date: string;
  /** Display text ("8:30 PM ET"). Never an instant, never parsed as one. */
  readonly tipoff: string;
  /** ISO 8601 instant, or null when the provider supplied none. */
  readonly tipoffIso: string | null;
  readonly capturedAt: string | null;
  readonly researchEligible: boolean;
  readonly schemaVersion?: string;
  readonly homeTeamAbbr: string;
  readonly awayTeamAbbr: string;
  readonly homeTeamFull?: string;
  readonly awayTeamFull?: string;
  readonly status?: string;
}

/**
 * Was this row observed strictly before tip-off? FAIL-CLOSED — mirrors `research_eligible` in
 * `pipeline/nba/board_schema.py` and `isLeakageSafe` in `lib/identity/sport-adapter.ts`.
 */
export function isResearchEligible(
  capturedAt: string | null | undefined,
  tipoffIso: string | null | undefined,
): boolean {
  if (!capturedAt || !tipoffIso) return false;
  const captured = Date.parse(capturedAt);
  const tipoff = Date.parse(tipoffIso);
  if (!Number.isFinite(captured) || !Number.isFinite(tipoff)) return false;
  return captured < tipoff;
}

/** True for a board date that predates the schema and is therefore permanently ineligible. */
export function isPermanentlyIneligibleDate(date: string): boolean {
  return date < TIPOFF_SCHEMA_EPOCH;
}
