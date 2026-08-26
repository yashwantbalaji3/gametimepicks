/**
 * Odds → risk tier, THE one banding used by the build pool and the draft (P208).
 *
 * Pure and dependency-free so both server code (build-legs) and client code (the builder's
 * stale-leg stubs) share the same bands without dragging server modules into the browser bundle.
 */

/** @returns {"Low"|"Medium"|"High"|"Longshot"} */
export function tierFromOdds(o) {
  if (o <= -150) return "Low";
  if (o <= 120) return "Medium";
  if (o <= 300) return "High";
  return "Longshot";
}
