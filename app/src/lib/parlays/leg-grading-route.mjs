/**
 * PARLAY LAB SETTLEMENT · WHICH GRADER A LEG GOES TO. Pure.
 *
 * Every leg is routed by its OWN sport (a cross-sport card holds legs of several). A leg with NO sport is a legacy
 * MLB leg (cards from before multi-sport carried none) and keeps going to MLB grading. A leg whose sport is NAMED but
 * has no grader here (e.g. "nba") is REFUSED: it stays pending and the refusal is recorded on the card. It is never
 * looked up in an MLB box score — a fall-through would grade a basketball player's points against a baseball stat
 * line, or void the leg because the name is not in the box.
 */
import { SETTLEABLE_SPORTS } from "./multi-sport.mjs";

export const LEGACY_DEFAULT_SPORT = "mlb";
export const ROUTE_REFUSAL = Object.freeze({ UNSUPPORTED_SPORT: "UNSUPPORTED_SPORT" });

/** @returns {{ route: string, refusal: null } | { route: null, refusal: { code: string, sport: string } }} */
export function legGradingRoute(leg) {
  const raw = leg?.sport;
  if (raw == null || raw === "") return { route: LEGACY_DEFAULT_SPORT, refusal: null };
  const sport = String(raw).toLowerCase();
  if (SETTLEABLE_SPORTS.includes(sport)) return { route: sport, refusal: null };
  return { route: null, refusal: { code: ROUTE_REFUSAL.UNSUPPORTED_SPORT, sport } };
}
