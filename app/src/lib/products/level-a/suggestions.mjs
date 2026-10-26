/**
 * LEVEL A · MODEL-SUGGESTED PICKS AND PARLAYS (founder policy 2026-10-23). PURE: inputs and the clock are arguments.
 *
 * Non-transactional by construction: a Level A leg carries NO price, NO EV and NO payout (`price: null`, `priced:
 * false`), and this module never reads a sportsbook field. It is a separate, reviewed path; it does not call or relax
 * any Level B gate (canEnterPredictionProducts, LEG_BOUNDS price rules, the Parlay Lab lane gate, selection policies
 * bank-builder@1 / moonshot@2). Every Level A card is paper-only and is recorded and graded in its OWN record.
 *
 * LEG (one per event: the official forecast's own selection, never ours)
 *   gates (each refusal is a code + sentence):
 *     SPORT_CLOSED        registry canEnterModelSuggestions(sport) is false
 *     START_UNKNOWN / EVENT_STARTED / INSIDE_CUTOFF   start known and > now + 30 min (LEG_BOUNDS.activationCutoffMs)
 *     FORECAST_NOT_FROZEN the forecast's stamp is missing or not strictly before the event start
 *     NO_SELECTION        the forecast names no selection for the market
 *     BAD_PROBABILITY     the owner publishes a probability but it is not in (0, 1)
 *     UNAVAILABLE         a participant flagged out / inactive / DNP / injured / questionable / suspended
 *     OTHER_PRODUCT_DAY   the event's ET start date is not the product day (a card never mixes product days)
 *   A leg whose owner does not publish a probability (NBA: side only, founder N2) is valid but UNTIERED.
 *
 * TIER RULE (documented; no new constant)
 *   joint probability = product of the legs' OFFICIAL probabilities, legs from DISTINCT events only (independence is
 *   assumed only across different games — same-game legs never share a card, D5). The model-fair price 1/joint is
 *   placed in the founder-approved D2 bands (risk-odds-bands.mjs getRiskBucketForCombinedOdds): Low ≥ 50% (≤ 66.7%),
 *   Medium 25–50%, High ≈14.3–25%, Longshot < 14.3%. A joint above 66.7% is outside every band and is not tiered.
 *   Leg counts are capped per tier by BAND_MAX_LEGS. Only legs with a published probability can be tiered.
 *
 * PRODUCT POLICIES (distinct, explainable; new frozen versions — nothing edits @1/@2)
 *   bank-builder-suggest@1  exactly 2 legs, tier Low or Medium, the highest joint probability.
 *   moonshot-suggest@1      exactly 3 legs, tier High or Longshot, the highest joint probability.
 *   parlay-lab-suggest@1    one card per tier (Low/Medium/High/Longshot), 2..BAND_MAX_LEGS legs, the highest joint
 *                           probability inside the tier's band.
 *   Ties break on the legs' event ids (deterministic). A tier or product with no qualifying combination says why.
 */
import { LEG_BOUNDS } from "../eligible-leg/contract.mjs";
import { PUBLIC_RISK_TIERS, PUBLIC_RISK_LABELS, getRiskBucketForCombinedOdds } from "../../parlays/risk-odds-bands.mjs";
import { BAND_MAX_LEGS } from "../../parlays/multi-sport.mjs";
import { canEnterModelSuggestions, modelSuggestionOf } from "../../sport-capability-registry.ts";

export const LEVEL_A_VERSION = "level-a-suggestions@1";
export const LEVEL_A_LEG_SCHEMA = "gtp.level-a.leg@1";
export const LEVEL_A_LABEL = "Model suggestion — paper only. No sportsbook price, no payout, not a bet.";
const SPORT_NAME = { nba: "NBA", nfl: "NFL", mlb: "MLB", ufc: "UFC" };
export const TIER_METHOD = "Joint probability = product of each leg's official forecast probability, legs from different games only (treated as independent across games). Tier = the published risk band of the model-fair price (1 ÷ joint). No sportsbook price is used.";

export const LEG_REFUSAL = Object.freeze({
  SPORT_CLOSED: "This sport is not open for model suggestions.",
  START_UNKNOWN: "The event's start time is unknown.",
  EVENT_STARTED: "The event has started.",
  INSIDE_CUTOFF: "The event starts within 30 minutes.",
  FORECAST_NOT_FROZEN: "The official forecast is not stamped before the event starts.",
  NO_SELECTION: "The official forecast names no selection for this market.",
  BAD_PROBABILITY: "The official forecast's probability is not a valid chance.",
  UNAVAILABLE: "A participant is listed out, inactive, injured, questionable or not playing.",
  OTHER_PRODUCT_DAY: "The event is not on this product day (the ET date of its start).",
});
const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
/** The product day of an instant: its America/New_York calendar date (a 00:30Z tip is the previous evening's slate). */
export const productDayOf = (iso) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) ? ET_DAY.format(new Date(t)) : null; };
const UNAVAILABLE_RE = /^(out|inactive|injured|injury|dnp|did not play|questionable|doubtful|suspended|scratch|scratched|not playing)\b/i;

const ms = (iso) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) ? t : null; };
const round = (x, n = 4) => Math.round(x * 10 ** n) / 10 ** n;

/** Model-fair American price for a probability (for banding only; never displayed as odds). */
export function fairAmerican(p) {
  if (!(p > 0 && p < 1)) return null;
  return p >= 0.5 ? -Math.round((100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
}
export const tierForJoint = (joint) => getRiskBucketForCombinedOdds(fairAmerican(joint));

/**
 * THE ONE JOINT TEXT for every Level A card: the pages (Parlay Center, Bank Builder, Moonshot), the copy text and the
 * recorder's page check all print this, so they cannot disagree. 1 dp. The tier is the exact joint's (its rounded
 * fair price, D2) and is never moved to fit the text; but just past a band edge the 1 dp text can read as the
 * neighbouring band (0.4987 is Medium at +101, yet "49.9%" bands Low), so that card alone gets the decimals that keep
 * the shown number in its own band (at most 4 dp).
 */
export function jointShownFor(joint, tier) {
  for (let d = 1; d <= 4; d += 1) {
    const text = (joint * 100).toFixed(d);
    if (tierForJoint(Number(text) / 100) === tier) return `${text}%`;
  }
  return `${(joint * 100).toFixed(4)}%`;
}

/**
 * @typedef {object} ForecastSelection   normalised by a sport source (level-a/sources.mjs)
 * @property {string} sport @property {string} eventId @property {string} eventLabel @property {string} startUtc
 * @property {string} market  "winner" | "1x2"
 * @property {{ code: string, label: string }|null} selection   the forecast's own pick
 * @property {number|null} probability   the owner's published probability for that pick (null when withheld)
 * @property {{ owner: string, modelId: string, stampedAt: string, ref: string|null }} forecast
 * @property {object|null} uncertainty   what the owner publishes beside the pick (e.g. the other outcomes)
 * @property {string[]} [participantStatuses]
 * @property {{ grader: string, market: string, side: string }} settlement
 */

/** One leg, or a refusal. */
export function levelALeg(sel, { now, productDay = null }) {
  const nowMs = ms(now);
  const reasons = [];
  if (productDay && productDayOf(sel?.startUtc) !== productDay) reasons.push("OTHER_PRODUCT_DAY");
  if (!canEnterModelSuggestions(sel?.sport)) reasons.push("SPORT_CLOSED");
  const start = ms(sel?.startUtc);
  if (start == null) reasons.push("START_UNKNOWN");
  else if (nowMs != null && start <= nowMs) reasons.push("EVENT_STARTED");
  else if (nowMs != null && start - nowMs < LEG_BOUNDS.activationCutoffMs) reasons.push("INSIDE_CUTOFF");
  const stamped = ms(sel?.forecast?.stampedAt);
  if (stamped == null || start == null || stamped >= start) reasons.push("FORECAST_NOT_FROZEN");
  if (!sel?.selection?.code) reasons.push("NO_SELECTION");
  const published = modelSuggestionOf(sel?.sport).probabilityPublished;
  if (published && !(typeof sel?.probability === "number" && sel.probability > 0 && sel.probability < 1)) reasons.push("BAD_PROBABILITY");
  if ((sel?.participantStatuses ?? []).some((s) => typeof s === "string" && UNAVAILABLE_RE.test(s.trim()))) reasons.push("UNAVAILABLE");
  const identity = { sport: sel?.sport ?? null, eventId: sel?.eventId ?? null, eventLabel: sel?.eventLabel ?? null, market: sel?.market ?? null };
  if (reasons.length) return { ok: false, refusal: { ...identity, reasons, text: reasons.map((r) => LEG_REFUSAL[r]) } };
  return {
    ok: true,
    leg: Object.freeze({
      schema: LEVEL_A_LEG_SCHEMA, levelA: true, ...identity,
      startUtc: sel.startUtc,
      selection: { ...sel.selection },
      probability: published ? sel.probability : null,
      tierable: published,
      probabilityNote: published ? null : sel.uncertainty?.kind === "elo-win-probability"
        // founder decision 2026-10-23: the Elo number is shown for information; tiering NBA legs is a separate decision
        ? "Untiered: the Elo-derived game-winner estimate is shown for information only and does not tier this leg."
        : `Untiered: no published ${SPORT_NAME[sel.sport] ?? String(sel.sport).toUpperCase()} win probability. The official forecast publishes the side only.`,
      forecast: { ...sel.forecast },
      uncertainty: sel.uncertainty ?? null,
      settlement: { ...sel.settlement },
      priced: false, price: null,
      priceNote: "No sportsbook price — model suggestion only.",
    }),
  };
}

function* combos(arr, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc; return; }
  for (let i = start; i <= arr.length - (k - acc.length); i += 1) yield* combos(arr, k, i + 1, [...acc, arr[i]]);
}
const key = (legs) => legs.map((l) => `${l.sport}:${l.eventId}`).join("|");

/** A card from distinct-event, tierable legs (caller guarantees). */
function cardOf(legs, policy) {
  const joint = legs.reduce((p, l) => p * l.probability, 1);
  const tier = tierForJoint(joint);
  const sports = [...new Set(legs.map((l) => l.sport))].sort();
  return {
    policy, tier, tierLabel: tier ? PUBLIC_RISK_LABELS[tier] : null,
    legs, sports, jointProbability: round(joint), method: TIER_METHOD,
    dependency: "Assumes the games are independent: every leg is from a different game, so no two legs share an outcome, but real outcomes can still be related and that is not modelled.",
    whySelected: `Each leg is the official forecast's own pick for its game; this is the combination with the highest joint probability in its band (${legs.length} legs).`,
    priced: false, price: null, payout: null,
    label: LEVEL_A_LABEL,
  };
}

/** The best combination of `size` legs whose joint lands in one of `tiers`, or null. */
function best(legs, sizes, tiers, policy) {
  let top = null;
  for (const k of sizes) {
    if (k > legs.length) continue;
    for (const c of combos(legs, k)) {
      if (new Set(c.map((l) => `${l.sport}:${l.eventId}`)).size !== c.length) continue; // distinct events (D5)
      const joint = c.reduce((p, l) => p * l.probability, 1);
      const tier = tierForJoint(joint);
      if (!tier || !tiers.includes(tier)) continue;
      if (!top || joint > top.joint || (joint === top.joint && key(c) < key(top.c))) top = { c, joint };
    }
  }
  return top ? cardOf([...top.c], policy) : null;
}

export const POLICIES = Object.freeze({
  bankBuilder: Object.freeze({ id: "bank-builder-suggest@1", sizes: [2], tiers: ["low", "medium"] }),
  moonshot: Object.freeze({ id: "moonshot-suggest@1", sizes: [3], tiers: ["high", "longshot"] }),
  parlayLab: Object.freeze({ id: "parlay-lab-suggest@1" }),
});

/**
 * The whole Level A answer for a slate.
 * @param {{ selections: ForecastSelection[], now: string, productDay?: string|null }} input   productDay defaults to now's ET date
 */
export function levelASuggestions({ selections = [], now, productDay = null }) {
  if (ms(now) == null) throw new TypeError("levelASuggestions: `now` must be an ISO instant");
  const day = productDay ?? productDayOf(now);
  const results = selections.map((s) => levelALeg(s, { now, productDay: day }));
  const legs = results.filter((r) => r.ok).map((r) => r.leg);
  const refused = results.filter((r) => !r.ok).map((r) => r.refusal);
  // One leg per event already (one selection per event per market); keep the first per event for safety.
  const seen = new Set();
  const perEvent = legs.filter((l) => { const k = `${l.sport}:${l.eventId}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const tierable = perEvent.filter((l) => l.tierable).sort((a, b) => b.probability - a.probability || key([a]).localeCompare(key([b])));
  const untiered = perEvent.filter((l) => !l.tierable);
  const none = (why) => ({ card: null, reason: why });
  const shortReason = tierable.length < 2 ? `only ${tierable.length} leg${tierable.length === 1 ? "" : "s"} with a published probability today — a card needs legs from 2+ games` : null;

  const parlayLab = PUBLIC_RISK_TIERS.map((tier) => {
    const sizes = []; for (let k = 2; k <= BAND_MAX_LEGS[tier]; k += 1) sizes.push(k);
    const c = best(tierable, sizes, [tier], POLICIES.parlayLab.id);
    return { tier, tierLabel: PUBLIC_RISK_LABELS[tier], ...(c ? { card: c, reason: null } : none(shortReason ?? `no combination of today's legs lands in the ${PUBLIC_RISK_LABELS[tier]} band`)) };
  });
  const bb = best(tierable, POLICIES.bankBuilder.sizes, POLICIES.bankBuilder.tiers, POLICIES.bankBuilder.id);
  const moon = best(tierable, POLICIES.moonshot.sizes, POLICIES.moonshot.tiers, POLICIES.moonshot.id);
  return {
    version: LEVEL_A_VERSION, now, productDay: day, label: LEVEL_A_LABEL, method: TIER_METHOD,
    legs: perEvent, untiered, refused,
    sports: [...new Set(perEvent.map((l) => l.sport))].sort(),
    parlayLab,
    bankBuilder: bb ? { card: bb, reason: null } : none(shortReason ?? "no two-leg combination of today's legs lands in the Low or Medium band"),
    moonshot: moon ? { card: moon, reason: null } : none(tierable.length < 3 ? `only ${tierable.length} leg${tierable.length === 1 ? "" : "s"} with a published probability today — Moonshot needs 3 games` : "no three-leg combination of today's legs lands in the High or Longshot band"),
  };
}

/** Copyable plain text for one card (Smart Betslip manual entry). No link, no price. */
export function cardCopyText(card) {
  if (!card) return "";
  const lines = [`GameTimePicks model suggestion · ${card.tierLabel ?? "untiered"} · ${card.legs.length} legs · paper only, no price`];
  /* A leg that carries its source's own shown text (the NBA display: label + whole-percent text) prints that, verbatim. */
  for (const l of card.legs) lines.push(`- ${l.eventLabel} (${l.sport.toUpperCase()}): ${l.selection.label}${l.shownPct && l.label ? ` · ${l.label}: ${l.shownPct}` : l.probability != null ? ` · model ${(l.probability * 100).toFixed(1)}%` : ""}`);
  if (card.jointProbability != null) lines.push(`Model joint probability ${jointShownFor(card.jointProbability, card.tier)} (legs from different games; assumes the games are independent).`);
  if (card.disclosure) lines.push(card.disclosure);
  lines.push("Not a bet and not a price. Check any sportsbook's own line before acting.");
  return lines.join("\n");
}
