/**
 * NFL LEG SCREEN + SCENARIO BUILDER (founder directive 2026-11-15, P3/P4) — the evidence-first selection core that the
 * Bank Builder and Moonshot redesigns will call. PURE; no I/O, no wall-clock.
 *
 * A leg passes only when ALL of these hold (each failure is a named reason, counted, never silent):
 *   0. the projection is the game page's OFFICIAL one (PUBLISHED family, not an estimate)   (PROJECTION_NOT_OFFICIAL)
 *   1. OBSERVED line + a valid American price (|price| ≥ 100) for the side, from an eligible book, captured before kickoff — the line the game page's line section
 *      shows (leg-candidates.mjs)                                                 (no line ⇒ NO_OBSERVED_LINE; a line
 *      the section does not compare ⇒ LINE_NOT_COMPARED)
 *   2. the player is ELIGIBLE under eligibility@1                                   (UNKNOWN/INELIGIBLE refused)
 *   3. the family is qualified for official products (family-eligibility.json)      (FAMILY_NOT_QUALIFIED)
 *   4. a COMPLETE 5-game record against TODAY's line on the chosen side: 5/5 first, 4/5 only to fill; 3/5 never; a
 *      record with a push (a result equal to the line) has no tier (PUSH_IN_RECORD); 2 or fewer of 5 ⇒ TREND_BELOW_4_OF_5
 * Order: 5/5 before 4/5; within a tier by kickoff, then playerId, then family.
 * A 5/5 streak is a historical screen, not a probability: the leg's probability is the qualified model's, or absent.
 *
 * Scenario rules:
 *   - one leg per player; no contradictory legs; at most `maxPerGame` legs per game and `maxPerTeam` per team
 *   - payout = stake × product of the legs' decimal prices (that is the arithmetic of a parlay price, not a forecast)
 *   - joint probability: only when every leg has a qualified model probability AND no two legs share a game. Same-game
 *     legs are correlated and no validated joint model exists ⇒ JOINT_PROBABILITY_UNAVAILABLE (never a product)
 *   - legs are never added to reach a payout target: fewer legs, or NO_QUALIFYING_BUILD
 */
import { lineRecord, trendTier } from "./player-evidence.mjs";
import { isAmerican } from "./american-price.mjs";

export const AMOUNTS = Object.freeze({ bankBuilder: [50, 100, 250, 500], moonshot: [10, 20, 25, 50] });
export const GOAL_CAP = Object.freeze({ bankBuilder: 5000, moonshot: 1000 });

/** a non-OBSERVED line state (evidence-line.mjs) → the refusal code */
const LINE_REASON = Object.freeze({ NO_LINE: "NO_OBSERVED_LINE", WITHHELD: "INELIGIBLE_BOOK", NOT_BEFORE_KICKOFF: "LINE_NOT_CAPTURED_BEFORE_KICKOFF", UNUSABLE: "LINE_NOT_COMPARED" });

export const decimalOf = (american) => (american > 0 ? 1 + american / 100 : american < 0 ? 1 + 100 / -american : null);

/**
 * @param {Array<{ playerId: string, name?: string, team: string, eventId: string, kickoffUtc?: string, family: string, side?: "over"|"under",
 *   line?: { line: number, price?: number|null, sportsbook?: string, capturedAt?: string } | null,
 *   eligibility?: string, modelProbability?: number|null, log: any[] }>} candidates
 * @param {{ families: Record<string, { eligibleForOfficialProducts?: boolean, gtpProbability?: boolean }>, isEligibleBook?: ((sportsbook: any) => boolean) | null }} ctx
 *   `isEligibleBook` is REQUIRED in practice and is the shared rule (eligible-operators.mjs isEligibleProvider): one
 *   matching rule for every surface. Without it every candidate is refused (NO_ELIGIBLE_BOOK_LIST).
 */
export function screenLegs(candidates, { families, isEligibleBook = null }) {
  const passed = [], rejected = [];
  const reasons = {};
  const reject = (c, code) => { reasons[code] = (reasons[code] ?? 0) + 1; rejected.push({ playerId: c.playerId, family: c.family, eventId: c.eventId, code }); };
  /* fail closed: no allowlist means no leg (never "every book is fine") */
  const allowed = typeof isEligibleBook === "function" ? isEligibleBook : null;
  for (const c of candidates) {
    const side = c.side ?? "over";
    if (!allowed) { reject(c, "NO_ELIGIBLE_BOOK_LIST"); continue; }
    if (c.official !== true) { reject(c, "PROJECTION_NOT_OFFICIAL"); continue; }
    if (!c.line || !Number.isFinite(c.line.line)) { reject(c, LINE_REASON[c.lineState] ?? "NO_OBSERVED_LINE"); continue; }
    /* the side's price must be a valid American price (the adapter's rule): +50, −99, 1.91, 0, NaN are not prices */
    if (!isAmerican(c.line.price) || decimalOf(c.line.price) == null) { reject(c, "NO_OBSERVED_PRICE"); continue; }
    if (allowed(c.line.sportsbook) !== true) { reject(c, "INELIGIBLE_BOOK"); continue; }
    /* rule 1: captured BEFORE kickoff — a missing or unreadable instant on either side fails closed */
    const cap = Date.parse(c.line.capturedAt ?? ""), kick = Date.parse(c.kickoffUtc ?? "");
    if (!Number.isFinite(cap) || !Number.isFinite(kick) || !(cap < kick)) { reject(c, "LINE_NOT_CAPTURED_BEFORE_KICKOFF"); continue; }
    if (c.eligibility !== "ELIGIBLE") { reject(c, "PLAYER_NOT_ELIGIBLE"); continue; }
    if (!families?.[c.family]?.eligibleForOfficialProducts) { reject(c, "FAMILY_NOT_QUALIFIED"); continue; }
    const rec = lineRecord(c.log, c.family, 5, { line: c.line, side });
    if (rec.state !== "COMPLETE") { reject(c, rec.state === "SHORT_SAMPLE" ? "SHORT_SAMPLE" : "INCOMPLETE_HISTORY"); continue; }
    if (rec.pushes > 0) { reject(c, "PUSH_IN_RECORD"); continue; }
    const tier = trendTier(rec);
    if (tier !== "5/5" && tier !== "4/5") { reject(c, tier === "3/5" ? "TIER_3_OF_5_NEVER_USED" : "TREND_BELOW_4_OF_5"); continue; }
    const prob = families[c.family].gtpProbability && Number.isFinite(c.modelProbability) ? c.modelProbability : null;
    passed.push({ ...c, side, tier, record: rec, decimal: decimalOf(c.line.price), probability: prob });
  }
  const kick = (l) => { const t = Date.parse(l.kickoffUtc ?? ""); return Number.isFinite(t) ? t : Infinity; };
  const order = (a, b) => (a.tier === b.tier ? 0 : a.tier === "5/5" ? -1 : 1) || (kick(a) - kick(b) || 0) || String(a.playerId).localeCompare(String(b.playerId)) || a.family.localeCompare(b.family) || String(a.side).localeCompare(String(b.side));
  return { passed: passed.sort(order), rejected, reasons };
}

/**
 * Build at most one scenario from screened legs for a stake and a payout goal. 5/5 legs first; 4/5 legs only when the
 * 5/5 legs cannot reach `minLegs`. Stops at the first leg count whose payout reaches the goal, or at `maxLegs`.
 * Returns { state: "BUILT" | "NO_QUALIFYING_BUILD", ... } — never a partial pretending to meet the goal.
 */
export function buildScenario(passed, { stake, goal, minLegs = 2, maxLegs = 4, maxPerGame = 2, maxPerTeam = 1 }) {
  /* every 5/5 leg is considered before any 4/5 leg; a 4/5 leg is reached only while the build is still short of
     `minLegs` or of the goal (the loop stops as soon as both are met) */
  const pool = passed.filter((l) => l.tier === "5/5").concat(passed.filter((l) => l.tier === "4/5"));
  const legs = [], perGame = {}, perTeam = {}, players = new Set(), skipped = [];
  for (const l of pool) {
    if (legs.length === maxLegs) break;
    if (players.has(l.playerId)) { skipped.push({ ...ref(l), code: "ONE_LEG_PER_PLAYER" }); continue; }
    if ((perGame[l.eventId] ?? 0) >= maxPerGame) { skipped.push({ ...ref(l), code: "GAME_CONCENTRATION" }); continue; }
    if ((perTeam[l.team] ?? 0) >= maxPerTeam) { skipped.push({ ...ref(l), code: "TEAM_CONCENTRATION" }); continue; }
    legs.push(l); players.add(l.playerId); perGame[l.eventId] = (perGame[l.eventId] ?? 0) + 1; perTeam[l.team] = (perTeam[l.team] ?? 0) + 1;
    if (legs.length >= minLegs && payoutOf(stake, legs) >= goal) break;
  }
  if (legs.length < minLegs) return { state: "NO_QUALIFYING_BUILD", reason: passed.length ? "TOO_FEW_LEGS_AFTER_RISK_LIMITS" : "NO_LEG_PASSED_THE_SCREEN", qualifyingLegs: passed.length, skipped };
  const payout = payoutOf(stake, legs);
  const sameGame = Object.values(perGame).some((n) => n > 1);
  const allProb = legs.every((l) => l.probability != null);
  const joint = !allProb ? { state: "NO_QUALIFIED_LEG_PROBABILITY" } : sameGame ? { state: "JOINT_PROBABILITY_UNAVAILABLE", why: "two or more legs share a game; their outcomes are correlated and no validated joint model exists" } : { state: "INDEPENDENT_GAMES", probability: legs.reduce((p, l) => p * l.probability, 1), assumption: "legs are in different games and treated as independent" };
  return { state: "BUILT", stake, goal, goalReached: payout >= goal, grossReturn: round2(payout), multiple: round2(payout / stake), legs: legs.map(ref), joint, skipped, warnings: [sameGame ? "SAME_GAME_LEGS" : null, legs.some((l) => l.tier === "4/5") ? "INCLUDES_4_OF_5" : null].filter(Boolean) };
}

const ref = (l) => ({ playerId: l.playerId, name: l.name ?? null, team: l.team, eventId: l.eventId, kickoffUtc: l.kickoffUtc ?? null, family: l.family, side: l.side, line: l.line?.line ?? null, lineText: l.line?.lineText ?? null, price: l.line?.price ?? null, sportsbook: l.line?.sportsbook ?? null, bookLabel: l.line?.label ?? null, capturedAt: l.line?.capturedAt ?? null, captured: l.line?.captured ?? null, tier: l.tier ?? null, probability: l.probability ?? null });
const payoutOf = (stake, legs) => stake * legs.reduce((d, l) => d * l.decimal, 1);
const round2 = (v) => Math.round(v * 100) / 100;
