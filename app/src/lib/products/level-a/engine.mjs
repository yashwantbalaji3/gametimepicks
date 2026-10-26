/**
 * LEVEL A · THE SHARED SELECTION ENGINE. PURE. One way to choose a card from a pool of tierable legs, used by the NBA
 * game-winner rule (nba-game-winner-tiers@1) and the mixed-sport cards (level-a-mixed@1), so a card can never be
 * computed two ways (docs/LEVEL_A_MIXED_SPORT_DESIGN.md §6.3):
 *   - distinct events (sport + event id) and no team twice within a sport;
 *   - joint = product of the legs' published probabilities (independence assumed, and disclosed by every card);
 *   - the band is the founder-approved D2 band of the exact joint (tierForJoint), never moved to fit the text;
 *   - the highest joint wins; ties break on the sorted event-id key (deterministic);
 *   - the card's identity (data-level-a-card, matched exactly by the recorder) is policy | tier | event ids | shown joint.
 */
import { jointShownFor, tierForJoint } from "./suggestions.mjs";

export function* combos(arr, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc; return; }
  for (let i = start; i <= arr.length - (k - acc.length); i += 1) yield* combos(arr, k, i + 1, [...acc, arr[i]]);
}

/** The tie-break and identity key: sorted event ids (the format the recorder has used since Release H). */
export const keyOf = (legs) => legs.map((l) => String(l.eventId)).sort().join("|");

/** A leg's teams, from its "AWAY @ HOME" (US sports) or "HOME v AWAY" (soccer) label, scoped to its sport. */
export const teamsOf = (leg) => String(leg.eventLabel ?? "").split(/ @ | v /).map((t) => t.trim()).filter(Boolean).map((t) => `${leg.sport}:${t}`);

/** Distinct events and no team twice within a sport (only ever rejects a malformed input on a real slate). */
export const independentGames = (c) => {
  const teams = c.flatMap(teamsOf);
  return new Set(c.map((l) => `${l.sport}:${l.eventId}`)).size === c.length && new Set(teams).size === teams.length;
};

/**
 * The highest-joint combination of `sizes` legs whose band is in `tiers`, or null. `accept(c)` adds a policy's own
 * requirement (e.g. at least two sports). Combinations shorter than the Low band are collected in `shorter`.
 */
export function best(pool, sizes, tiers, shorter = null, accept = () => true) {
  let top = null;
  for (const k of sizes) {
    if (k > pool.length) continue;
    for (const c of combos(pool, k)) {
      if (!independentGames(c) || !accept(c)) continue;
      const joint = c.reduce((p, l) => p * l.probability, 1);
      const t = tierForJoint(joint);
      if (t == null) { shorter?.add(keyOf(c)); continue; }
      if (!tiers.includes(t)) continue;
      if (!top || joint > top.joint || (joint === top.joint && keyOf(c) < keyOf(top.c))) top = { c: [...c], joint, tier: t };
    }
  }
  return top;
}

/** The exact identity a page prints on each engine card and the recorder matches. */
export const levelACardKey = (card) => `${card.policy}|${card.tier}|${keyOf(card.legs)}|${jointShownFor(card.jointProbability, card.tier)}`;
