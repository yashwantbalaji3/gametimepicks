/**
 * THE CORRELATION TAXONOMY (§15, step 3) — what a multi-leg card may NOT assume is independent.
 *
 * §15's sequence is explicit: freeze the receipts, define ProductEligibleLeg V2, define the
 * correlation taxonomy, preregister a hypothesis, replay, evaluate joint calibration, promote. The
 * first two exist. This is the third, and it is the last step that is pure definition — everything
 * after it is research with a preregistered bar, which is a founder gate.
 *
 * ── THE SENTENCE THIS MODULE IS BUILT AROUND ───────────────────────────────────────────────────
 *
 * §15: "If exact correlation cannot be measured, constrain/refuse rather than invent precise joint
 * probability."
 *
 * So there is no `jointProbability` export, and there is no correlation COEFFICIENT anywhere. This
 * product has never measured one. What it can state honestly is whether two legs SHARE something
 * that makes them dependent, and how strongly that dependence is believed to run — a label, not a
 * number. A label cannot be multiplied, which is the point: the moment a ρ exists, some caller
 * multiplies by it and the card acquires a joint probability nobody measured.
 *
 * ⚠ THE PRODUCT OF MARGINALS IS NOT A JOINT PROBABILITY, and this matters more here than anywhere.
 * §12 measured three Cleveland quarterbacks holding 243% of one team's pass attempts and 38 of 78
 * team pools above 1.0. Legs drawn from an over-allocated pool are not merely correlated; they are
 * describing incompatible worlds. Multiplying their marginals produces a number that is wrong in a
 * direction nobody can bound.
 *
 * SHADOW. Nothing consumes this. It defines and it constrains; it never selects and never scores.
 */
import { correlationTagsFor } from "./product-eligible-leg.mjs";

export const CORRELATION_SCHEMA_VERSION = 1;

/**
 * §15's taxonomy, in the order it lists them, each with the evidence this repository actually has
 * for detecting it. A kind with no detector is DECLARED and reported as UNDETECTABLE rather than
 * quietly omitted — an absent check that looks like a passing one is the defect class this product
 * keeps rediscovering.
 */
export const CORRELATION_KIND = Object.freeze({
  SAME_PARTICIPANT: "SAME_PARTICIPANT",
  SAME_TEAM: "SAME_TEAM",
  SAME_EVENT: "SAME_EVENT",
  OPPOSING_PARTICIPANTS: "OPPOSING_PARTICIPANTS",
  GAME_SCRIPT: "GAME_SCRIPT",
  ENVIRONMENT: "ENVIRONMENT",
  AVAILABILITY: "AVAILABILITY",
  CROSS_EVENT: "CROSS_EVENT",
  CROSS_SPORT: "CROSS_SPORT",
});

/**
 * How strongly dependence is believed to run. A LABEL, never a coefficient.
 *
 * ⚠ `UNQUANTIFIED` is a first-class member and is the honest answer for most of this taxonomy. It
 * is not a weak STRONG; it means the direction and the magnitude are both unmeasured here.
 */
export const DEPENDENCE = Object.freeze({
  DETERMINISTIC: "DETERMINISTIC", // the same underlying event decides both legs
  STRONG: "STRONG",
  UNQUANTIFIED: "UNQUANTIFIED",
  NONE_OBSERVED: "NONE_OBSERVED", // no shared evidence found — NOT "independent"
});

/** What this repository can actually detect from a receipt, and what it cannot. */
export const DETECTABLE = Object.freeze({
  [CORRELATION_KIND.SAME_PARTICIPANT]: true,
  [CORRELATION_KIND.SAME_EVENT]: true,
  [CORRELATION_KIND.SAME_TEAM]: true,
  [CORRELATION_KIND.CROSS_SPORT]: true,
  [CORRELATION_KIND.CROSS_EVENT]: true,
  /* Detectable ONLY because the receipt now records `team` and `opponent`. It did not, and this
     entry said `true` while the detector could never fire — a claim about a check that did not
     exist. Both fields were already in every optimizer leg; the receipt was dropping them. */
  [CORRELATION_KIND.OPPOSING_PARTICIPANTS]: true,
  /* Game script, weather and lineup dependence are all real and none is in the receipt. */
  [CORRELATION_KIND.GAME_SCRIPT]: false,
  [CORRELATION_KIND.ENVIRONMENT]: false,
  [CORRELATION_KIND.AVAILABILITY]: false,
});

const tagValue = (tags, prefix) => (tags.find((t) => t.startsWith(prefix)) ?? "").slice(prefix.length) || null;

/**
 * The correlations between two receipts that this repository can actually SEE.
 *
 * Returns `{ kinds, dependence, undetectable }` — and `undetectable` is always populated, because
 * a pair reported as NONE_OBSERVED has not been shown to be independent. It has been shown that
 * nothing we can measure links them, which is a much weaker statement and must read as one.
 */
export function correlationBetween(a, b) {
  const ta = correlationTagsFor(a ?? {});
  const tb = correlationTagsFor(b ?? {});
  const kinds = [];

  const [pa, pb] = [tagValue(ta, "participant:"), tagValue(tb, "participant:")];
  const [ea, eb] = [tagValue(ta, "event:"), tagValue(tb, "event:")];
  const [sa, sb] = [tagValue(ta, "sport:"), tagValue(tb, "sport:")];

  if (pa && pb && pa === pb) kinds.push(CORRELATION_KIND.SAME_PARTICIPANT);
  if (ea && eb && ea === eb) kinds.push(CORRELATION_KIND.SAME_EVENT);
  const [ma, mb] = [tagValue(ta, "team:"), tagValue(tb, "team:")];
  const [oa, ob] = [tagValue(ta, "opponent:"), tagValue(tb, "opponent:")];
  if (ma && mb && ma === mb) kinds.push(CORRELATION_KIND.SAME_TEAM);
  /* Two participants on opposite sides of the SAME event. Both conditions are required: two
     players who merely happen to face each other's clubs in different fixtures are not opposed. */
  if (ea && eb && ea === eb && ma && mb && ma !== mb
      && ((oa && oa === mb) || (ob && ob === ma))) kinds.push(CORRELATION_KIND.OPPOSING_PARTICIPANTS);
  if (sa && sb && sa !== sb) kinds.push(CORRELATION_KIND.CROSS_SPORT);
  if (ea && eb && ea !== eb) kinds.push(CORRELATION_KIND.CROSS_EVENT);

  /*
   * ⚠ THE SAME PARTICIPANT IN TWO MARKETS IS NOT MERELY CORRELATED. "Over 60 receiving yards" and
   * "over 4 receptions" for one player are two readings of one afternoon. Calling that STRONG
   * invites a caller to shade a joint downward a little; DETERMINISTIC says the shared cause IS the
   * outcome.
   */
  const dependence = kinds.includes(CORRELATION_KIND.SAME_PARTICIPANT)
    ? DEPENDENCE.DETERMINISTIC
    : kinds.includes(CORRELATION_KIND.SAME_EVENT) || kinds.includes(CORRELATION_KIND.SAME_TEAM)
      ? DEPENDENCE.UNQUANTIFIED
      : kinds.length
        ? DEPENDENCE.UNQUANTIFIED
        : DEPENDENCE.NONE_OBSERVED;

  return {
    schemaVersion: CORRELATION_SCHEMA_VERSION,
    kinds,
    dependence,
    /* Always present. NONE_OBSERVED is not independence. */
    undetectable: Object.entries(DETECTABLE).filter(([, v]) => !v).map(([k]) => k),
  };
}

/**
 * Whether a card may be built from these receipts, under a product's own constraints.
 *
 * §15: "Support NO QUALIFYING PARLAY TODAY. Do not manufacture a suggestion to fill a card." So the
 * refusal is a first-class return value, with every reason, and there is no "closest acceptable
 * card" fallback — an empty answer is an answer.
 *
 * @param {object[]} receipts
 * @param {object} limits  `{ maxPerParticipant, maxPerEvent, maxPerTeam, allowCrossSport }`
 */
export function constrainCard(receipts, limits = {}) {
  const {
    maxPerParticipant = 1, maxPerEvent = 2, maxPerTeam = 2, allowCrossSport = true,
  } = limits;
  const violations = [];
  const count = (get) => {
    const m = new Map();
    for (const r of receipts ?? []) { const k = get(r); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  };

  for (const [id, n] of count((r) => r.participantId)) {
    if (n > maxPerParticipant) violations.push({ kind: CORRELATION_KIND.SAME_PARTICIPANT, key: id, count: n, limit: maxPerParticipant });
  }
  for (const [id, n] of count((r) => r.eventId)) {
    if (n > maxPerEvent) violations.push({ kind: CORRELATION_KIND.SAME_EVENT, key: id, count: n, limit: maxPerEvent });
  }
  for (const [id, n] of count((r) => r.team)) {
    if (n > maxPerTeam) violations.push({ kind: CORRELATION_KIND.SAME_TEAM, key: id, count: n, limit: maxPerTeam });
  }
  if (!allowCrossSport && new Set((receipts ?? []).map((r) => r.sport).filter(Boolean)).size > 1) {
    violations.push({ kind: CORRELATION_KIND.CROSS_SPORT, key: "mixed", count: null, limit: null });
  }

  return {
    schemaVersion: CORRELATION_SCHEMA_VERSION,
    allowed: violations.length === 0,
    violations,
    /* ⚠ STATED ON EVERY ANSWER, INCLUDING THE ALLOWED ONE. A card that passes these constraints has
       not been shown to be free of game-script, weather or lineup dependence — none of which this
       repository can detect from a receipt. A silent pass would read as one. */
    unconstrained: Object.entries(DETECTABLE).filter(([, v]) => !v).map(([k]) => k),
  };
}
