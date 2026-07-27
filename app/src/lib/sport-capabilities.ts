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
 *   - Mixed-sport parlays MAY appear as official Suggested Parlays — rendered in
 *     a clearly labeled "Mixed" section — but ONLY when EVERY sport on the slip
 *     is itself modeled (real legs, never fabricated). A slip carrying any
 *     non-modeled sport is never official-suggested-eligible. (Build Your Own
 *     keeps the same all-modeled rule.)
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
import {
  canEnterPredictionProducts,
  canShowLiveProjections,
  resultsMode,
} from "./sport-capability-registry";

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

/**
 * Apply the evidence-backed capability registry on top of the coverage LEVEL.
 *
 * `level` in sports-coverage.ts is a DISPLAY/editorial field. The registry
 * (sport-capability-registry.ts) is the evidence-backed truth about what a sport can
 * actually do. So the registry may only ever NARROW a capability, never widen one — a sport
 * has to clear both to enter a product.
 *
 * Concretely: NBA is `level: "full"` but the registry has it HISTORICAL_ONLY (frozen since
 * 2026-06-13). Without this, the legacy level alone would let NBA legs into official suggested
 * parlays and Build Your Own the moment NBA data returns (~October 2026). Nothing incorrect has
 * reached a user yet only because the off-season boards are empty — the gate was wrong, not
 * fail-closed.
 *
 * Grading is deliberately NOT a blanket downgrade: a HISTORICAL_ONLY sport keeps a real settled
 * archive, so grading follows `resultsMode` (live OR archive) and /results keeps NBA's history.
 */
function applyCapabilityRegistry(c: SportCapabilities): SportCapabilities {
  const eligible = canEnterPredictionProducts(c.key);
  return {
    ...c,
    status: c.status === "modeled" && !eligible ? "schedule_only" : c.status,
    hasProjections: c.hasProjections && canShowLiveProjections(c.key),
    hasSuggestedParlays: c.hasSuggestedParlays && eligible,
    hasBuildYourOwn: c.hasBuildYourOwn && eligible,
    hasGrading: c.hasGrading && resultsMode(c.key) !== "none",
  };
}

/** Capability table for every registered sport: coverage level, narrowed by the registry. */
export const SPORT_CAPABILITIES: ReadonlyArray<SportCapabilities> =
  SPORTS_COVERAGE.map((s) =>
    applyCapabilityRegistry(
      capabilitiesForLevel(normalizeSportKey(s.key), s.level),
    ),
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
 * Predicate deciding whether ONE sport key may enter a product. Production always
 * passes the real capability gate; tests inject a fixture predicate over synthetic
 * keys so mixed-sport MECHANICS can be exercised without asserting that any
 * particular real sport is modeled. See docs/SPRINT_020_CAPABILITY_MIGRATION_RECIPE.md.
 */
export type SportEligibility = (sport: string) => boolean;

/**
 * THE RULE, separated from which sports satisfy it today: every distinct sport on
 * the slip must be eligible, and an empty slip is never a product.
 *
 * Deliberately capability-based rather than count-based. It stays correct when only
 * one sport is eligible, and a second sport becomes eligible automatically the moment
 * its capability state says so — no rule change, no new branch, no constant to edit.
 */
export function allSportsEligible(
  sports: Iterable<string | null | undefined>,
  isEligible: SportEligibility,
): boolean {
  const keys = distinctSportKeys(sports);
  if (keys.length === 0) return false; // an empty slip is never a product
  return keys.every((k) => isEligible(k));
}

/**
 * Is this set of sports allowed as an OFFICIAL Suggested Parlay?
 *
 * Rule: EVERY distinct sport on the slip must be eligible for suggested parlays. A
 * single-sport slip of an eligible sport qualifies; a mixed-sport slip qualifies too
 * as long as every sport on it is eligible (it renders in the clearly labeled "Mixed"
 * section). Empty slips, or any slip carrying an ineligible (schedule-only /
 * coming-soon / unknown) sport, are rejected. The legs are always real
 * generated/model-ranked legs — never fabricated.
 */
export function isOfficialSuggestedParlayAllowed(
  sports: Iterable<string | null | undefined>,
  isEligible: SportEligibility = canShowSuggestedParlays,
): boolean {
  return allSportsEligible(sports, isEligible);
}

/**
 * Is this set of sports allowed in Build Your Own?
 *
 * Rule: Build Your Own may be mixed-sport, but EVERY sport on the slip must itself be
 * eligible (real legs only). A single schedule-only / coming-soon sport anywhere on
 * the slip disqualifies it. Empty slips are not allowed.
 */
export function isBuildYourOwnParlayAllowed(
  sports: Iterable<string | null | undefined>,
  isEligible: SportEligibility = canUseInBuildYourOwn,
): boolean {
  return allSportsEligible(sports, isEligible);
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
export function canUseLegInBuildYourOwn(
  leg: LegLike | null | undefined,
  isEligible: SportEligibility = canUseInBuildYourOwn,
): boolean {
  const key = getLegSport(leg);
  return key ? isEligible(key) : false; // missing sport ⇒ fail closed
}

/** Drop any leg whose sport is not modeled. This is the Build Your Own
 *  candidate-pool gate: both the custom generator and the manual builder draw
 *  from the filtered pool, so a non-modeled-sport leg can never be selected.
 *  Pure; never mutates. */
export function filterBuildYourOwnLegs<T extends LegLike>(
  legs: ReadonlyArray<T>,
  isEligible: SportEligibility = canUseInBuildYourOwn,
): T[] {
  return legs.filter((l) => canUseLegInBuildYourOwn(l, isEligible));
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
export function slipAllowedInOfficialSuggested(
  slip: SlipLike,
  isEligible: SportEligibility = canShowSuggestedParlays,
): boolean {
  return isOfficialSuggestedParlayAllowed(sportsOnSlip(slip), isEligible);
}

/** May this slip appear in Build Your Own? (all sports modeled; mixed OK) */
export function slipAllowedInBuildYourOwn(
  slip: SlipLike,
  isEligible: SportEligibility = canUseInBuildYourOwn,
): boolean {
  return isBuildYourOwnParlayAllowed(sportsOnSlip(slip), isEligible);
}

/**
 * Drop any slip that is not allowed as an official Suggested Parlay
 * (schedule-only, coming-soon, or unknown-sport slips, or empty slips). Pure;
 * never mutates the input. Mixed-sport slips of modeled sports are KEPT (they
 * render in the labeled "Mixed" section). Wire this at the official-suggested
 * boundary so the public surface can never carry a disallowed slip.
 */
export function filterOfficialSuggestedSlips<T extends SlipLike>(
  slips: ReadonlyArray<T>,
  isEligible: SportEligibility = canShowSuggestedParlays,
): T[] {
  return slips.filter((s) => slipAllowedInOfficialSuggested(s, isEligible));
}

/** Drop any slip not allowed in Build Your Own. Pure; never mutates. */
export function filterBuildYourOwnSlips<T extends SlipLike>(
  slips: ReadonlyArray<T>,
  isEligible: SportEligibility = canUseInBuildYourOwn,
): T[] {
  return slips.filter((s) => slipAllowedInBuildYourOwn(s, isEligible));
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
  isEligible: SportEligibility = canShowSuggestedParlays,
): Partial<Record<K, T[]>> {
  const out: Partial<Record<K, T[]>> = {};
  if (!sections) return out;
  for (const key of Object.keys(sections) as K[]) {
    out[key] = filterOfficialSuggestedSlips(sections[key] ?? [], isEligible);
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
  isEligible: SportEligibility = canShowSuggestedParlays,
): string[] {
  if (!sections) return [];
  const offenders = new Set<string>();
  for (const arr of Object.values(sections)) {
    for (const slip of arr ?? []) {
      if (!slip) continue;
      if (!slipAllowedInOfficialSuggested(slip, isEligible)) {
        // Only genuinely ineligible sports are offenders now. Mixed-of-eligible
        // slips are allowed as official suggested (labeled "Mixed" section).
        for (const k of sportsOnSlip(slip)) {
          if (!isEligible(k)) offenders.add(k);
        }
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
  isEligible: SportEligibility = canUseInBuildYourOwn,
): string[] {
  if (!slips) return [];
  const offenders = new Set<string>();
  for (const slip of slips) {
    if (!slip) continue;
    for (const k of sportsOnSlip(slip)) {
      if (!isEligible(k)) offenders.add(k);
    }
  }
  return [...offenders];
}
