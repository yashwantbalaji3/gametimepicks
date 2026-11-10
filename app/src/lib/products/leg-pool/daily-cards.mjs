/**
 * DAILY SUGGESTED CARDS (`gtp.suggested-cards@1`). PURE over a leg pool (leg-pool.mjs). One output that the Bank Builder
 * and Moonshot pages, the parlay tiers, results tracking and the social graphics all read, so they cannot disagree.
 *
 * SELECTION IS THE EXISTING LEVEL A ENGINE, never a second computation:
 *   NBA-only   nba-game-winner-tiers@1 (nbaGameWinnerTiers): Bank Builder = 2 legs in Low/Medium; Moonshot = Longshot,
 *              3–5 legs; parlay tiers Low (2) / Medium (≤3) / High (≤4) / Longshot (≤5), the D2 bands of the joint.
 *   Cross      level-a-mixed@1 (levelAMixed): the same rules, legs from two or more sports.
 * The pool decides WHICH legs enter; RULE_A (below) then keeps definitely-absent favourites out of every card and
 * unresolved ones out of Bank Builder and Low; any other flag rides the leg, shown.
 *
 * STATES. model-only (a card, no price) · insufficient (not enough eligible legs: the reason, never a forced card) ·
 * blocked (the sport's input failed freshness or is closed) · qualified (priced with fresh permitted odds — reserved,
 * never emitted: no such odds exist today).
 * No price, payout, line, book or link is ever written. Deterministic: no wall-clock field.
 */
import { createHash } from "node:crypto";
import { nbaGameWinnerTiers, NBA_GW_POLICY } from "../level-a/nba-game-winner-tiers.mjs";
import { levelAMixed, LEVEL_A_MIXED_POLICY } from "../level-a/mixed.mjs";
import { LEVEL_A_LABEL, TIER_METHOD } from "../level-a/suggestions.mjs";
import { PUBLIC_RISK_TIERS, PUBLIC_RISK_LABELS, PARLAY_ODDS_BANDS } from "../../parlays/risk-odds-bands.mjs";

export const SUGGESTED_CARDS_SCHEMA = "gtp.suggested-cards@1";
export const CARD_STATE = Object.freeze({ QUALIFIED: "qualified", MODEL_ONLY: "model-only", BLOCKED: "blocked", INSUFFICIENT: "insufficient" });
/* What is NOT in these cards, and what it waits on. Stated in every file so the pages and social can say it plainly. */
export const METHODOLOGY_DEPENDENCIES = Object.freeze([
  Object.freeze({
    key: "nba-player-prop-probability",
    state: "NOT_APPROVED",
    effect: "NBA legs are game winners only. Player props are not legs: the official lane publishes medians only, and no over/under probability or threshold is derived from a median.",
    proposedMethod: "Publish a per-player, per-stat P(stat >= threshold) from the frozen v0.1 simulation draws (the same 10,000 runs the medians come from), for thresholds set by a rule fixed in advance, only after the band-80 coverage of those draws passes a preregistered check on graded 2026-27 games. Needs founder approval before any build reads it.",
  }),
  Object.freeze({
    key: "priced-cards",
    state: "NOT_AUTHORIZED",
    effect: "No card is qualified (bettable): no fresh, permitted sportsbook odds exist, and provider terms bar public price JSON.",
    proposedMethod: "An authorized NBA price feed with terms that permit display, then the established Level B gates.",
  }),
]);

export const PRICING = Object.freeze({
  state: "MODEL_ONLY",
  note: "No fresh, permitted sportsbook odds are available, so every card is a model suggestion: no price, no payout, not a bet. Settles on the official final.",
});

/* A tier's threshold as a joint-probability range (the D2 band of the model-fair price, restated as a chance so no
   number on the page reads like a sportsbook price). */
const pOfAmerican = (a) => (a >= 0 ? 100 / (a + 100) : -a / (100 - a));
const pct = (p) => `${(p * 100).toFixed(1)}%`;
export const TIER_THRESHOLD = Object.freeze(Object.fromEntries(PUBLIC_RISK_TIERS.map((t) => {
  const b = PARLAY_ODDS_BANDS[t];
  const hi = pOfAmerican(b.minAmerican); const lo = b.maxAmerican == null ? null : pOfAmerican(b.maxAmerican);
  return [t, lo == null ? `model joint chance below ${pct(hi)}` : `model joint chance ${pct(lo)} to ${pct(hi)}`];
})));

/**
 * FOUNDER RULE B (approved 2026-11-03): one frozen, versioned daily card file read by the website, the results grader
 * and social graphics alike. Version = `schema` + `contentSha256` (sha256 of the canonical JSON of the file without that
 * field). Every reader verifies it and refuses a file that does not match.
 */
const digestOf = (doc) => { const { contentSha256: _d, ...rest } = doc; return createHash("sha256").update(JSON.stringify(rest)).digest("hex"); };
export function sealSuggestedCards(doc) {
  const { contentSha256: _d, ...rest } = doc;
  return { ...rest, contentSha256: digestOf(rest) };
}
export const verifySuggestedCards = (doc) => doc?.schema === SUGGESTED_CARDS_SCHEMA && typeof doc.contentSha256 === "string" && digestOf(doc) === doc.contentSha256;

const idOf = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** A pool leg in the public contract (the Level A leg's own fields plus the pool's guard). */
function publicLeg(poolLeg) {
  const { leg, ...rest } = poolLeg;
  return { ...rest, settlement: leg?.settlement ?? null };
}

/* OUR OWN WORDS on every card (founder rule, relayed by the Program Director 2026-11-03: MODEL PROJECTION wording, never
   "estimate", "est." or "projected median"). The engine's `whySelected` is the live page's text and is not reused here.
   `disclosure` is the shared NBA Elo display's own text and is passed through verbatim (owned by that display). */
const SPORT_NAME = { nba: "NBA", mlb: "MLB", epl: "Premier League", "ligue-1": "Ligue 1" };
export const ACCURACY_NOTE = "MODEL PROJECTION accuracy is not yet established over a large forward sample.";
function rationaleFor(card, n) {
  const band = `${card.tierLabel} band (${n} legs)`;
  if (card.sports.length === 1 && card.sports[0] === "nba") return `Each leg is the official NBA side with its MODEL PROJECTION win chance from the frozen Elo team rating; this is the combination with the highest joint chance in the ${band}.`;
  return `Each leg is its sport's official pick with its published MODEL PROJECTION chance; this is the combination with the highest joint chance in the ${band}, from ${card.sports.map((x) => SPORT_NAME[x] ?? x).join(", ")}.`;
}

function publicCard(card, byKey, scope) {
  const legs = card.legs.map((l) => publicLeg(byKey.get(`${l.sport}:${l.eventId}:${l.market}`)));
  const flagged = legs.filter((l) => l.guard?.state === "review");
  return {
    id: idOf(`${card.policy}|${card.tier}|${legs.map((l) => l.legId).sort().join("|")}`),
    policy: card.policy, scope, tier: card.tier, tierLabel: card.tierLabel, sports: card.sports,
    legs, jointProbability: Math.round(card.jointProbability * 1e4) / 1e4, jointShown: card.jointShown,
    band: { tier: card.tier, rule: TIER_THRESHOLD[card.tier] ?? null, method: card.method ?? TIER_METHOD },
    rationale: rationaleFor(card, legs.length),
    confidence: flagged.length
      ? `${flagged.length} leg${flagged.length === 1 ? " carries" : "s carry"} an availability flag (shown on the leg). ${ACCURACY_NOTE}`
      : ACCURACY_NOTE,
    dependency: card.dependency, disclosure: card.disclosure ?? null,
    status: "MODEL_ONLY", priced: false, price: null, payout: null,
  };
}

const section = (r, policy, byKey, scope, blockedReason) => {
  if (blockedReason) return { policy, state: CARD_STATE.BLOCKED, card: null, reason: blockedReason };
  return r?.card
    ? { policy, state: CARD_STATE.MODEL_ONLY, card: publicCard(r.card, byKey, scope), reason: null }
    : { policy, state: CARD_STATE.INSUFFICIENT, card: null, reason: `Insufficient eligible legs: ${r?.reason ?? "no eligible legs"}.` };
};

/**
 * FOUNDER RULE A (approved 2026-11-03): "Exclude favorites with material, unresolved injury or rotation flags from
 * recommended Bank Builder legs. Do not simply display a warning while continuing to recommend a misleading selection.
 * Re-evaluate the eligible alternatives using the frozen canonical forecast." Applied by the Program Director
 * (2026-11-03) to every card, as below; the founder may overrule it:
 *   EVERYWHERE      a flag meaning a top player is definitely absent (FAVOURED_ROTATION_OUT; NFL_QB_ABSENCE) — the stated
 *                   chance ignores it, so it is overstated in every tier. Never in Bank Builder, Low, Medium, High,
 *                   Longshot or Moonshot.
 *   CONSERVATIVE    an unresolved status (FAVOURED_ROTATION_R1: Day-To-Day / Questionable / Doubtful; NFL_AVAILABILITY_
 *                   UNKNOWN) — never in Bank Builder or Low; allowed with the flag shown in Medium, High, Longshot, Moonshot.
 * The shared engine then re-picks among the remaining frozen official sides. Nothing is replaced, re-forecast or relaxed:
 * a card that cannot be filled reads "Insufficient eligible legs".
 * `ruleA: false` reproduces the live page's selection (tests only).
 */
export const RULE_A = Object.freeze({
  excludeEverywhere: Object.freeze(["FAVOURED_ROTATION_OUT", "NFL_QB_ABSENCE"]),
  excludeConservative: Object.freeze(["FAVOURED_ROTATION_R1", "NFL_AVAILABILITY_UNKNOWN"]),
  conservative: Object.freeze(["bank-builder", "low"]),
});
export const RULE_A_ON = true;

/**
 * @param {ReturnType<import("./leg-pool.mjs").buildLegPool>} pool
 * @param {{ ruleA?: boolean }} [options]
 */
export function dailySuggestedCards(pool, { ruleA = RULE_A_ON } = {}) {
  const byKey = new Map([...pool.nbaLegs, ...pool.crossLegs].map((l) => [l.legId, l]));
  const has = (l, list) => (l.guard?.flags ?? []).some((f) => list.includes(f));
  const nbaUsable = pool.nbaLegs.filter((l) => ["pass", "review"].includes(l.guard.state));
  const nbaOpen = (ruleA ? nbaUsable.filter((l) => !has(l, RULE_A.excludeEverywhere)) : nbaUsable).map((l) => l.leg);
  const nbaClean = (ruleA ? nbaUsable.filter((l) => !has(l, RULE_A.excludeEverywhere) && !has(l, RULE_A.excludeConservative)) : nbaUsable).map((l) => l.leg);
  const gw = (legs) => nbaGameWinnerTiers({ legs, accessor: pool.accessor, receiptOf: pool.receiptOf, disclosure: pool.display.disclosure, enabled: true });
  const nbaWide = gw(nbaOpen);
  const nbaSafe = gw(nbaClean);
  const cross = pool.crossLegs.map((l) => l.leg);
  const mixWide = levelAMixed({ crossSportLegs: cross, nbaLegs: nbaWide.legs, disclosure: pool.display.disclosure, enabled: true });
  const mixSafe = levelAMixed({ crossSportLegs: cross, nbaLegs: nbaSafe.legs, disclosure: pool.display.disclosure, enabled: true });

  const nbaState = pool.sports.nba?.state;
  const nbaBlocked = nbaState === "blocked" ? `NBA input blocked: ${pool.sports.nba.reason}` : nbaState === "no-games" ? "No NBA games with an official forecast on this date." : null;
  const excludedNote = (n, where) => (n ? ` ${n} favoured side${n === 1 ? " was" : "s were"} kept out of ${where} by an availability flag (rule A).` : "");
  const withNote = (sec, n, where) => (sec.state === CARD_STATE.INSUFFICIENT && n ? { ...sec, reason: sec.reason + excludedNote(n, where) } : sec);
  const outNba = nbaUsable.length - nbaOpen.length;
  const cleanOutNba = nbaUsable.length - nbaClean.length;

  /* Low reads the conservative pool; Medium / High / Longshot the open one (rule A). */
  const tiers = (wide, safe, policy, scope, blocked, nOpen, nClean) => PUBLIC_RISK_TIERS.map((tier) => {
    const conservative = RULE_A.conservative.includes(tier);
    const t = (conservative ? safe : wide).find((x) => x.tier === tier);
    return { tier, tierLabel: PUBLIC_RISK_LABELS[tier], threshold: TIER_THRESHOLD[tier] ?? null, ...withNote(section(t, policy, byKey, scope, blocked), conservative ? nClean : nOpen, `the ${PUBLIC_RISK_LABELS[tier]} card`) };
  });

  return {
    schema: SUGGESTED_CARDS_SCHEMA,
    productDay: pool.productDay, evaluatedAt: pool.evaluatedAt, legPool: pool.version,
    label: LEVEL_A_LABEL, pricing: PRICING, options: { ruleA },
    ruleA: ruleA ? { excludeEverywhere: RULE_A.excludeEverywhere, excludeConservative: RULE_A.excludeConservative, conservative: RULE_A.conservative } : null,
    nbaLegKinds: ["game-winner"], methodologyDependencies: METHODOLOGY_DEPENDENCIES,
    inputs: pool.inputs,
    sports: pool.sports,
    bankBuilder: {
      nba: withNote(section(nbaSafe.bankBuilder, `${NBA_GW_POLICY}/bank-builder`, byKey, "nba", nbaBlocked), cleanOutNba, "Bank Builder"),
      cross: section(mixSafe.bankBuilder, `${LEVEL_A_MIXED_POLICY}/bank-builder`, byKey, "cross", null),
    },
    moonshot: {
      nba: withNote(section(nbaWide.moonshot, `${NBA_GW_POLICY}/moonshot`, byKey, "nba", nbaBlocked), outNba, "Moonshot"),
      cross: section(mixWide.moonshot, `${LEVEL_A_MIXED_POLICY}/moonshot`, byKey, "cross", null),
    },
    parlays: {
      nba: tiers(nbaWide.tiers, nbaSafe.tiers, `${NBA_GW_POLICY}/parlay-lab`, "nba", nbaBlocked, outNba, cleanOutNba),
      cross: tiers(mixWide.parlayLab, mixSafe.parlayLab, `${LEVEL_A_MIXED_POLICY}/parlay-lab`, "cross", null, outNba, cleanOutNba),
    },
    legs: [...pool.nbaLegs, ...pool.crossLegs].map(publicLeg),
    refused: pool.refused,
    playerProjections: { nba: pool.playerProjections },
  };
}
