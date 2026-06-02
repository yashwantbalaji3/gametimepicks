/**
 * sport-capabilities — typed capability gates for the sports-coverage
 * expansion. This is the SINGLE place that answers, per sport:
 *   "May this sport show projections / official suggested parlays / be used
 *    in Build Your Own / be graded?"
 *
 * Why this exists (sports-coverage expansion, 2026-06-02):
 *   `sports-coverage.ts` is the canonical registry of WHICH sports we cover
 *   and at WHAT level (full / projections / schedule / coming-soon). This
 *   module DERIVES strict, typed capability booleans from that registry so
 *   product code never has to re-derive "is this sport modeled?" ad hoc — and
 *   so a future sport can be graduated by changing ONE place (its `level` in
 *   sports-coverage.ts) with these gates and their tests enforcing the rest.
 *
 * HARD honesty rules enforced here (mirrors the repo guardrails):
 *   - A sport may show projections / official suggested parlays ONLY when it
 *     has a real projection + graded-parlay pipeline — today that is exactly
 *     NBA and MLB (`level: "full"`).
 *   - Schedule-only and coming-soon sports can NEVER show projections,
 *     suggested parlays, or enter Build Your Own.
 *   - Mixed-sport parlays are NOT allowed as official Suggested Parlays.
 *     Mixed sport is allowed ONLY inside Build Your Own, and only when EVERY
 *     sport on the slip is itself modeled (real legs, never fabricated).
 *   - Fail closed: an unknown / unregistered sport key has NO capabilities.
 *
 * This file is pure data + pure helpers — no `fs` / server-only imports — so
 * server pages, client components, and `tsx --test` can all import it.
 *
 * NOTE: this module adds GATES + TESTS only. It does not, by itself, rewire
 * the live Suggested / Projections / Build-Your-Own surfaces — see the
 * SPORTS_PROJECTIONS_EXPANSION_PLAN doc (PR B / PR C) for that wiring.
 */
import { SPORTS_COVERAGE, type SportCoverageLevel } from "./sports-coverage";

/** Coarse lifecycle status for a sport, derived from its coverage level. */
export type SportStatus =
  | "modeled" // full pipeline: projections + suggested parlays + grading
  | "projections_only" // real projections, but no graded parlays yet
  | "schedule_only" // real attributed schedule only — no odds/projections
  | "coming_soon"; // nothing published yet

/** The strict capability surface for one sport. Every flag is honest: it is
 *  true only when a REAL pipeline backs it. */
export interface SportCapabilities {
  /** Normalized sport key (matches `sports-coverage.ts` keys, lowercased). */
  readonly key: string;
  readonly status: SportStatus;
  /** Real, attributed schedule snapshot exists. */
  readonly hasSchedule: boolean;
  /** Real odds / prop-market source exists. */
  readonly hasOdds: boolean;
  /** Real pregame player-prop projections exist. */
  readonly hasProjections: boolean;
  /** May appear as an OFFICIAL (tracked, graded) Suggested Parlay. */
  readonly hasSuggestedParlays: boolean;
  /** May contribute legs to the Build Your Own custom builder. */
  readonly hasBuildYourOwn: boolean;
  /** Has a real settlement / grading pipeline for its markets. */
  readonly hasGrading: boolean;
}

/** Fail-closed capabilities for an unknown / unregistered sport key. */
function emptyCapabilities(key: string): SportCapabilities {
  return {
    key,
    status: "coming_soon",
    hasSchedule: false,
    hasOdds: false,
    hasProjections: false,
    hasSuggestedParlays: false,
    hasBuildYourOwn: false,
    hasGrading: false,
  };
}

/**
 * Map a coverage `level` to its capability flags. This is the ONLY place the
 * level→capability policy lives, so the rules stay consistent and testable.
 *
 *   full          → modeled:          schedule+odds+projections+suggested+byo+grading
 *   projections   → projections_only: schedule+odds+projections (NO suggested/byo/grading
 *                                      until a graded parlay pipeline exists)
 *   schedule      → schedule_only:    schedule only
 *   coming-soon   → coming_soon:      nothing
 */
function capabilitiesForLevel(
  key: string,
  level: SportCoverageLevel,
): SportCapabilities {
  switch (level) {
    case "full":
      return {
        key,
        status: "modeled",
        hasSchedule: true,
        hasOdds: true,
        hasProjections: true,
        hasSuggestedParlays: true,
        hasBuildYourOwn: true,
        hasGrading: true,
      };
    case "projections":
      return {
        key,
        status: "projections_only",
        hasSchedule: true,
        hasOdds: true,
        hasProjections: true,
        // Projections-only sports are NOT eligible for official suggested
        // parlays, Build Your Own, or grading until a graded parlay pipeline
        // is wired and proven. Conservative + honest by default.
        hasSuggestedParlays: false,
        hasBuildYourOwn: false,
        hasGrading: false,
      };
    case "schedule":
      return {
        key,
        status: "schedule_only",
        hasSchedule: true,
        hasOdds: false,
        hasProjections: false,
        hasSuggestedParlays: false,
        hasBuildYourOwn: false,
        hasGrading: false,
      };
    case "coming-soon":
    default:
      return emptyCapabilities(key);
  }
}

/** Normalize a free-form sport tag to a registry key (lowercased, trimmed). */
export function normalizeSportKey(sport: string | null | undefined): string {
  return (sport ?? "").toLowerCase().trim();
}

/** Capability table for every registered sport, derived from the registry. */
export const SPORT_CAPABILITIES: ReadonlyArray<SportCapabilities> =
  SPORTS_COVERAGE.map((s) =>
    capabilitiesForLevel(normalizeSportKey(s.key), s.level),
  );

const _CAPABILITIES_BY_KEY: ReadonlyMap<string, SportCapabilities> = new Map(
  SPORT_CAPABILITIES.map((c) => [c.key, c]),
);

/** Capabilities for a sport key. Unknown keys return fail-closed (all-false)
 *  capabilities — a sport we don't recognize can do NOTHING. */
export function getSportCapabilities(
  sport: string | null | undefined,
): SportCapabilities {
  const key = normalizeSportKey(sport);
  return _CAPABILITIES_BY_KEY.get(key) ?? emptyCapabilities(key);
}

/** Sport keys with a full modeled pipeline (NBA + MLB today). */
export const MODELED_SPORT_KEYS: ReadonlyArray<string> = SPORT_CAPABILITIES.filter(
  (c) => c.status === "modeled",
).map((c) => c.key);

// ---------------------------------------------------------------------------
// Single-sport gates
// ---------------------------------------------------------------------------

/** May this sport surface player-prop projections? */
export function canShowProjections(sport: string | null | undefined): boolean {
  return getSportCapabilities(sport).hasProjections;
}

/** May this sport appear as an OFFICIAL (tracked) Suggested Parlay? */
export function canShowSuggestedParlays(
  sport: string | null | undefined,
): boolean {
  return getSportCapabilities(sport).hasSuggestedParlays;
}

/** May this sport contribute legs to the Build Your Own custom builder? */
export function canUseInBuildYourOwn(sport: string | null | undefined): boolean {
  return getSportCapabilities(sport).hasBuildYourOwn;
}

/** Does this sport have a real settlement / grading pipeline? */
export function canGradeSport(sport: string | null | undefined): boolean {
  return getSportCapabilities(sport).hasGrading;
}

// ---------------------------------------------------------------------------
// Mixed-sport rules (the core product rule for this expansion)
// ---------------------------------------------------------------------------

/** Distinct, normalized, non-empty sport keys from an iterable. */
function distinctSportKeys(sports: Iterable<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const s of sports) {
    const k = normalizeSportKey(s);
    if (k) out.add(k);
  }
  return [...out];
}

/**
 * Is this set of sports allowed as an OFFICIAL Suggested Parlay?
 *
 * Rule: official Suggested Parlays are INDIVIDUAL-SPORT only. The slip must
 * carry exactly one distinct sport, and that sport must be eligible for
 * suggested parlays (modeled). Mixed-sport slips are rejected here — they may
 * only live in Build Your Own.
 */
export function isOfficialSuggestedParlayAllowed(
  sports: Iterable<string | null | undefined>,
): boolean {
  const keys = distinctSportKeys(sports);
  if (keys.length !== 1) return false; // no mixed, no empty
  return canShowSuggestedParlays(keys[0]);
}

/**
 * Is this set of sports allowed in Build Your Own?
 *
 * Rule: Build Your Own may be mixed-sport, but EVERY sport on the slip must
 * itself be modeled (real legs only). A single schedule-only / coming-soon
 * sport anywhere on the slip disqualifies it. Empty slips are not allowed.
 */
export function isBuildYourOwnParlayAllowed(
  sports: Iterable<string | null | undefined>,
): boolean {
  const keys = distinctSportKeys(sports);
  if (keys.length === 0) return false;
  return keys.every((k) => canUseInBuildYourOwn(k));
}

// ---------------------------------------------------------------------------
// Slip-level helpers (generic over the slip/leg shape — no parlay-suggested
// import, so this stays dependency-light and client-safe)
// ---------------------------------------------------------------------------

type LegLike = { sport?: string | null };
type SlipLike = { sport?: string | null; legs?: ReadonlyArray<LegLike> | null };

/** Normalized sport for a single leg, optionally falling back to a slip-level
 *  sport tag when the leg carries none. Returns "" when neither is present
 *  (caller treats "" as ineligible — fail closed). */
export function getLegSport(
  leg: LegLike | null | undefined,
  fallbackSlipSport?: string | null,
): string {
  const own = normalizeSportKey(leg?.sport);
  return own || normalizeSportKey(fallbackSlipSport);
}

/** May this single leg be used in a Build Your Own custom slip? True only when
 *  the leg's sport is modeled (NBA/MLB today). Fail-closed for schedule-only,
 *  coming-soon, unknown, or missing-sport legs — no fabrication, never a
 *  schedule-only leg in a custom build. */
export function canUseLegInBuildYourOwn(leg: LegLike | null | undefined): boolean {
  return canUseInBuildYourOwn(getLegSport(leg));
}

/** Drop any leg whose sport is not modeled. This is the Build Your Own
 *  candidate-pool gate: both the custom generator and the manual builder draw
 *  from the filtered pool, so a non-modeled-sport leg can never be selected.
 *  Pure; never mutates. */
export function filterBuildYourOwnLegs<T extends LegLike>(
  legs: ReadonlyArray<T>,
): T[] {
  return legs.filter((l) => canUseLegInBuildYourOwn(l));
}

/** Distinct sports actually present on a slip's legs, falling back to the
 *  slip-level `sport` tag when legs carry no sport metadata. Mirrors
 *  `parlay-suggested.getSlipSports` but kept local to avoid a dependency. */
export function sportsOnSlip(slip: SlipLike): string[] {
  const keys = distinctSportKeys((slip.legs ?? []).map((l) => l.sport));
  if (keys.length === 0 && slip.sport) {
    const k = normalizeSportKey(slip.sport);
    if (k) keys.push(k);
  }
  return keys;
}

/** May this slip appear as an official Suggested Parlay? (single modeled sport) */
export function slipAllowedInOfficialSuggested(slip: SlipLike): boolean {
  return isOfficialSuggestedParlayAllowed(sportsOnSlip(slip));
}

/** May this slip appear in Build Your Own? (all sports modeled; mixed OK) */
export function slipAllowedInBuildYourOwn(slip: SlipLike): boolean {
  return isBuildYourOwnParlayAllowed(sportsOnSlip(slip));
}

/**
 * Drop any slip that is not allowed as an official Suggested Parlay
 * (mixed-sport, schedule-only, coming-soon, or unknown-sport slips). Pure;
 * never mutates the input. Wire this at the official-suggested boundary
 * (PR B) so the public surface can never carry a disallowed slip.
 */
export function filterOfficialSuggestedSlips<T extends SlipLike>(
  slips: ReadonlyArray<T>,
): T[] {
  return slips.filter((s) => slipAllowedInOfficialSuggested(s));
}

/** Drop any slip not allowed in Build Your Own. Pure; never mutates. */
export function filterBuildYourOwnSlips<T extends SlipLike>(
  slips: ReadonlyArray<T>,
): T[] {
  return slips.filter((s) => slipAllowedInBuildYourOwn(s));
}

/** True when a slip spans more than one sport (a "mixed" / "multi" slip). */
export function isMixedSportSlip(slip: SlipLike): boolean {
  return sportsOnSlip(slip).length > 1;
}

/**
 * Filter a per-section bucket map (publicRiskSections-shaped: each value an
 * array of slips) down to slips allowed as official Suggested Parlays. Drops
 * mixed-sport, unsupported-sport, and unknown-sport slips from EVERY section
 * (including an "all"/union bucket), preserving the section keys. Pure; never
 * mutates the input. This is the chokepoint PR B wires so no mixed/unsupported
 * slip can render in any official Suggested section or its count.
 */
export function filterOfficialSuggestedSections<
  K extends string,
  T extends SlipLike,
>(
  sections: Partial<Record<K, ReadonlyArray<T>>> | null | undefined,
): Partial<Record<K, T[]>> {
  const out: Partial<Record<K, T[]>> = {};
  if (!sections) return out;
  for (const key of Object.keys(sections) as K[]) {
    out[key] = filterOfficialSuggestedSlips(sections[key] ?? []);
  }
  return out;
}

/**
 * Detector for tests/guards: given a publicRiskSections-shaped object (each
 * value an array of slips), return the distinct sport keys that appear but
 * are NOT allowed in official suggested parlays (i.e. any leak of a
 * mixed/unsupported sport into the official surface). Empty array == clean.
 */
export function unsupportedSportsInOfficialSections(
  sections:
    | Partial<Record<string, ReadonlyArray<SlipLike>>>
    | null
    | undefined,
): string[] {
  if (!sections) return [];
  const offenders = new Set<string>();
  for (const arr of Object.values(sections)) {
    for (const slip of arr ?? []) {
      if (!slip) continue;
      if (!slipAllowedInOfficialSuggested(slip)) {
        for (const k of sportsOnSlip(slip)) {
          if (!canShowSuggestedParlays(k)) offenders.add(k);
        }
        // A multi-sport slip of two modeled sports is also disallowed; flag
        // it under a synthetic "multi" marker so callers see the violation.
        if (sportsOnSlip(slip).length > 1) offenders.add("multi");
      }
    }
  }
  return [...offenders];
}

/**
 * Detector for tests/guards: given a list of slips, return the distinct sport
 * keys that appear but are NOT eligible for Build Your Own (schedule-only,
 * coming-soon, unknown, or missing). Mixed-of-modeled is allowed in BYO, so it
 * is NOT flagged here. Empty array == clean.
 */
export function unsupportedSportsInBuildYourOwn(
  slips: ReadonlyArray<SlipLike> | null | undefined,
): string[] {
  if (!slips) return [];
  const offenders = new Set<string>();
  for (const slip of slips) {
    if (!slip) continue;
    for (const k of sportsOnSlip(slip)) {
      if (!canUseInBuildYourOwn(k)) offenders.add(k);
    }
  }
  return [...offenders];
}
