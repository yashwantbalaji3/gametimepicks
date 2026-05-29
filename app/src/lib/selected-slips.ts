/**
 * Build My Card — pure selection helpers.
 *
 * The "Build My Card" flow lets a user hand-pick suggested parlays into
 * a "Selected Slips" tray, then (in a later PR) split a paper bankroll
 * across only the slips they picked. This file holds the *pure* state
 * transitions + tray summary math so they can be unit-tested without a
 * React tree. The client context (`build-my-card-context.tsx`) and the
 * tray UI (`selected-slips-tray.tsx`) are thin wrappers over these.
 *
 * Design rules (see `docs/PARLAY_LAB_BUILDER_DESIGN_2026-05-30.md` §2):
 *   - The stable selection key is `slip.slipId` — the deterministic id
 *     the pipeline stamps on every slip. The same slip surfaced under
 *     the `mlb` and `all` optimizer buckets shares one slipId, so we
 *     never store two copies.
 *   - Selection order is preserved (newest pick appended last) so the
 *     tray + allocator are deterministic.
 *   - We capture the `ParlaySlip` *by value* at selection time, so the
 *     tray still renders a picked slip after the user changes the
 *     sport/team/player filter (which rebuilds the visible pool with
 *     fresh object instances that share the same slipId).
 *   - Honesty: combined odds come from the shared `parlay-risk-sections`
 *     helper, which returns null when any leg lacks a price — the tray
 *     renders "—", never a fabricated number.
 *
 * No fetches, no fabrication, no `node:fs` — safe to import from a
 * "use client" component.
 */
import type { ParlaySlip } from "./parlay-suggested";
import {
  classifyRiskSection,
  combinedAmericanOddsFromLegs,
  getRiskSectionDisplay,
  type RiskSectionKey,
} from "./parlay-risk-sections";

/** The stable selection key for a slip. Centralised so the context,
 *  tray, and (later) allocator all agree on one key derivation. */
export function slipSelectionKey(slip: Pick<ParlaySlip, "slipId">): string {
  return slip.slipId;
}

/** True when a slip with this id is already in the selection. */
export function isSlipSelected(
  selected: ReadonlyArray<ParlaySlip>,
  slipId: string,
): boolean {
  return selected.some((s) => s.slipId === slipId);
}

/**
 * Idempotent add. Returns a new array with the slip appended only when
 * it isn't already present (dedupe by slipId). Never mutates the input.
 * When the slip is already selected the *same* array reference is
 * returned so callers can skip a re-render if they want.
 */
export function selectSlip(
  selected: ReadonlyArray<ParlaySlip>,
  slip: ParlaySlip,
): ParlaySlip[] {
  if (isSlipSelected(selected, slip.slipId)) return selected.slice();
  return [...selected, slip];
}

/** Remove a slip by id. Returns a new array; never mutates the input. */
export function deselectSlip(
  selected: ReadonlyArray<ParlaySlip>,
  slipId: string,
): ParlaySlip[] {
  return selected.filter((s) => s.slipId !== slipId);
}

/**
 * Toggle a slip: add it when absent, remove it when present. Dedupes by
 * slipId so a stale object instance with a known id removes the stored
 * copy rather than appending a duplicate.
 */
export function toggleSlip(
  selected: ReadonlyArray<ParlaySlip>,
  slip: ParlaySlip,
): ParlaySlip[] {
  return isSlipSelected(selected, slip.slipId)
    ? deselectSlip(selected, slip.slipId)
    : selectSlip(selected, slip);
}

/** Clear all selections. Returns a fresh empty array. */
export function clearSlips(): ParlaySlip[] {
  return [];
}

/** Per-slip tray summary. `combinedAmerican` / `sectionKey` are null
 *  when the slip has no computable combined odds (a leg is missing its
 *  price) — the tray renders "—" in that case. */
export interface SelectedSlipSummary {
  slipId: string;
  legCount: number;
  /** Risk section derived from combined odds (odds-only shim, matches
   *  the per-card chip). Null when odds aren't computable. */
  sectionKey: RiskSectionKey | null;
  /** Public label for the section ("Low Risk" …). Null when unknown. */
  sectionLabel: string | null;
  /** Combined American odds, or null when any leg lacks a price. */
  combinedAmerican: number | null;
  /** True when a leg's price is missing so odds can't be computed. */
  oddsUnavailable: boolean;
  /** Honest pregame/graded status carried straight from the slip. */
  status: ParlaySlip["status"];
}

/** Build the compact tray summary for a single slip. Pure. */
export function summarizeSelectedSlip(slip: ParlaySlip): SelectedSlipSummary {
  const combinedAmerican = combinedAmericanOddsFromLegs(slip.legs);
  const oddsUnavailable = combinedAmerican == null;
  const sectionKey = oddsUnavailable ? null : classifyRiskSection(combinedAmerican);
  return {
    slipId: slip.slipId,
    legCount: slip.legs.length,
    sectionKey,
    sectionLabel: sectionKey ? getRiskSectionDisplay(sectionKey).label : null,
    combinedAmerican,
    oddsUnavailable,
    status: slip.status,
  };
}

export interface SelectedSlipsSummary {
  count: number;
  summaries: SelectedSlipSummary[];
  /** Count of selected slips whose combined odds can't be computed. */
  withoutOdds: number;
}

/** Build the whole-tray summary. `count === 0` is the honest empty
 *  state the tray uses to render its prompt copy. */
export function summarizeSelectedSlips(
  selected: ReadonlyArray<ParlaySlip>,
): SelectedSlipsSummary {
  const summaries = selected.map(summarizeSelectedSlip);
  return {
    count: summaries.length,
    summaries,
    withoutOdds: summaries.filter((s) => s.oddsUnavailable).length,
  };
}
