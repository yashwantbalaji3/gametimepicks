/**
 * FEATURED-PLAYER ELIGIBILITY FOR SOCIAL PACKAGES (Wave 1, PD for the founder 2026-11-09; INC-2026-11-08-01, Achane). PURE.
 * Every featured player is resolved under eligibility@1 and recorded in the package (state, contractVersion, sources) so
 * the Command Center can re-resolve at approval and send. A package featuring anyone not ELIGIBLE + featurable is refused
 * with the reason: never a silent substitution (the next player down is not promoted in their place).
 *   R5 an NFL game forecast that is blind to a starting QB's absence makes no game package.
 *   R7 a featured player with no market where a peer on the same card has one ⇒ MARKET_ABSENT, a fresh check is required.
 */
import { resolveEligibility, ELIGIBILITY_STATE, SEND_MAX_AGE_MINUTES } from "../availability/eligibility.mjs";

export const QB_BLIND_STATE = "BLIND_TO_STARTING_QB_ABSENCE";

/** R5: the reason a game forecast cannot back a social post, or null. */
export const qbBlindProblem = (forecast) => (forecast?.teamInputs?.state === QB_BLIND_STATE
  ? `R5_QB_BLIND: the forecast is ${QB_BLIND_STATE} (${(forecast.teamInputs.absences ?? []).map((a) => `${a.name} ${a.team} ${a.status ?? ""}`.trim()).join(", ") || "starting QB absent"})`
  : null);

/**
 * @param {{ sport:string, asOf:string, players:{playerId:string, name:string, team:string, hasMarket:boolean}[], injuries:any, roster:any, history?:Record<string, any[]> }} o
 * @returns {{ ok:boolean, claims:any[], refusals:string[], warnings:any[], freshCheckRequired:boolean }}
 */
export function featuredEligibility({ sport, asOf, players, injuries, roster, history = {} }) {
  const anyMarket = players.some((p) => p.hasMarket);
  const claims = []; const refusals = []; const warnings = [];
  for (const p of players) {
    const e = resolveEligibility({ sport, playerId: p.playerId, teamId: p.team, asOf, injuries, roster, history: history[p.playerId] ?? [] });
    claims.push({ key: `eligibility.${p.playerId}`, playerId: p.playerId, name: p.name, team: p.team, state: e.state, featurable: e.featurable, reasons: e.reasons, contractVersion: e.contractVersion, sources: e.sources });
    if (e.state !== ELIGIBILITY_STATE.ELIGIBLE) refusals.push(`${p.name} (${p.team}) is ${e.state}: ${e.reasons.join(", ")}`);
    else if (!e.featurable) refusals.push(`${p.name} (${p.team}) cannot be featured: ${e.reasons.join(", ")}`);
    if (anyMarket && !p.hasMarket) warnings.push({ code: "MARKET_ABSENT", playerId: p.playerId, name: p.name, rule: `R7: no market where a peer has one; re-resolve within ${SEND_MAX_AGE_MINUTES} min before approval and send` });
  }
  return { ok: refusals.length === 0, claims, refusals, warnings, freshCheckRequired: warnings.length > 0 };
}
