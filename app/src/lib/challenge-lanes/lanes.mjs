/**
 * BANK BUILDER & MOONSHOT CHALLENGE LANES V2 (~/gtp-evidence/bbm-v2/SPEC.md §1–3). PURE.
 *
 * Four lanes: bb-a, bb-b (3 steps, $100 → $10,000) and ms-a, ms-b (5 steps, $25 → $1,000). Each run is a hash-chained,
 * append-only event log (chain.mjs); its state is a fold over the log and is never stored anywhere else.
 *
 * SELECTION (D3, proposed): both cards come from the frozen Rule B file (`gtp.suggested-cards@1`, contentSha256
 * verified), NBA scope. A is that file's own product card. B is the shared Level A engine's best card (engine.mjs
 * `best`, the same function and product rule that picked A) over the file's own frozen legs, eligible under rule A for
 * the product, sharing no game with A. The same engine over the same legs must reproduce A first, or nothing is
 * selected (SELECTION_MISMATCH). Nothing is re-forecast and no rule is relaxed: no card → NO_ELIGIBLE_CARD.
 *
 * PROGRESSION (§3). Only STEP_SETTLED(WIN) advances a step, and only when every leg settled on the official final and a
 * verified payout was recorded before the first leg started. A card with no verified payout is never staked: the day
 * ends UNPRICED, its legs are still settled for the record, and the lane stays on the same step. LOSS → BUSTED (a new
 * run needs a founder-approved restart). VOID or PUSH → PENDING_VOID_REVIEW, never an automatic advance.
 */
import { best } from "../products/level-a/engine.mjs";
import { tierForJoint, jointShownFor } from "../products/level-a/suggestions.mjs";
import { verifySuggestedCards, RULE_A } from "../products/leg-pool/daily-cards.mjs";
import { NBA_GW_PRODUCT_RULES } from "../products/level-a/nba-game-winner-tiers.mjs";
import { chainEvent, sha256, canonical } from "./chain.mjs";

export const LANES = Object.freeze({
  "bb-a": Object.freeze({ laneId: "bb-a", product: "bank-builder", slot: "A", baseCents: 10000, targetCents: 1000000, steps: 3, packageId: (d) => `bb-${d}` }),
  "bb-b": Object.freeze({ laneId: "bb-b", product: "bank-builder", slot: "B", baseCents: 10000, targetCents: 1000000, steps: 3, packageId: (d) => `bb-${d}` }),
  "ms-a": Object.freeze({ laneId: "ms-a", product: "moonshot", slot: "A", baseCents: 2500, targetCents: 100000, steps: 5, packageId: (d) => `ms-a-${d}` }),
  "ms-b": Object.freeze({ laneId: "ms-b", product: "moonshot", slot: "B", baseCents: 2500, targetCents: 100000, steps: 5, packageId: (d) => `ms-b-${d}` }),
});
export const LANE_IDS = Object.freeze(Object.keys(LANES));

/** Rule A, as the engine already applies it on 827bdc1ded: OUT nowhere; R1 never in Bank Builder (shown in Moonshot). */
export const RULE_A_FOR_PRODUCT = Object.freeze({
  "bank-builder": Object.freeze([...RULE_A.excludeEverywhere, ...RULE_A.excludeConservative]),
  moonshot: RULE_A.excludeEverywhere,
});
const PRODUCT_RULE = { "bank-builder": NBA_GW_PRODUCT_RULES.bankBuilder, moonshot: NBA_GW_PRODUCT_RULES.moonshot };
const FILE_SECTION = { "bank-builder": "bankBuilder", moonshot: "moonshot" };

export const STATUS = Object.freeze({
  IN_PLAY: "IN_PLAY", READY: "READY", NO_ELIGIBLE_CARD: "NO_ELIGIBLE_CARD", UNPRICED: "UNPRICED", PAUSED: "PAUSED",
  PENDING_VOID_REVIEW: "PENDING_VOID_REVIEW", BUSTED: "BUSTED", COMPLETE: "COMPLETE", AWAITING_RESTART_APPROVAL: "AWAITING_RESTART_APPROVAL",
});
const TERMINAL = new Set([STATUS.BUSTED, STATUS.COMPLETE, STATUS.AWAITING_RESTART_APPROVAL]);

const eligible = (leg, product) => ["pass", "review"].includes(leg.guard?.state) && !(leg.guard?.flags ?? []).some((f) => RULE_A_FOR_PRODUCT[product].includes(f));
const eventsKey = (legs) => legs.map((l) => String(l.eventId)).sort().join("|");

/** The CARD_FROZEN payload for one lane card: each leg's frozen projection and its provenance, verbatim from the file. */
function laneCard(legs, { doc, product, slot, sourceCardId, method }) {
  const joint = legs.reduce((p, l) => p * l.probability, 1);
  const tier = tierForJoint(joint);
  const sorted = [...legs].sort((a, b) => String(a.startUtc).localeCompare(String(b.startUtc)) || String(a.eventId).localeCompare(String(b.eventId)));
  return {
    cardId: sourceCardId ?? `lane-${slot.toLowerCase()}-${sha256(`${product}|${eventsKey(legs)}`).slice(0, 16)}`,
    sourceCardId: sourceCardId ?? null, slot, product, scope: "nba", method,
    suggestedCardsSchema: doc.schema, suggestedCardsSha256: doc.contentSha256, productDay: doc.productDay, evaluatedAt: doc.evaluatedAt,
    tier, jointProbability: Math.round(joint * 1e4) / 1e4, jointShown: jointShownFor(joint, tier),
    legs: sorted.map((l) => ({
      legId: l.legId, gameId: String(l.eventId), eventLabel: l.eventLabel, startUtc: l.startUtc, market: l.market,
      selection: l.selection, probability: l.probability, probabilityShown: l.probabilityShown,
      projection: { owner: l.forecast?.owner ?? null, modelId: l.forecast?.modelId ?? null, snapshotId: l.forecast?.ref ?? null, stampedAt: l.forecast?.stampedAt ?? null, contentSha256: l.forecast?.receiptSha256 ?? null },
      guard: { state: l.guard?.state ?? null, flags: l.guard?.flags ?? [], flagText: l.guard?.flagText ?? [] },
      settlement: l.settlement ?? null,
    })),
  };
}

/**
 * Lane A and lane B cards of one product from one frozen file.
 * @returns {{ ok: false, refusal: string } | { ok: true, A: {card, reason}, B: {card, reason} }}
 */
export function selectLaneCards(doc, product) {
  if (!verifySuggestedCards(doc)) return { ok: false, refusal: "CARD_SHA_UNVERIFIED" };
  if (doc.options?.ruleA !== true) return { ok: false, refusal: "RULE_A_OFF_IN_FILE" };
  const sec = doc[FILE_SECTION[product]]?.nba;
  const rule = PRODUCT_RULE[product];
  const pool = (doc.legs ?? []).filter((l) => l.sport === "nba" && l.market === "winner" && typeof l.probability === "number" && eligible(l, product));
  if (!sec?.card) {
    const reason = sec?.reason ?? "no card in the frozen file";
    return { ok: true, A: { card: null, reason }, B: { card: null, reason: `no lane A card, so no lane B card: ${reason}` } };
  }
  const fileCard = sec.card;
  const again = best(pool, rule.sizes, rule.tiers, null);
  if (!again || eventsKey(again.c) !== eventsKey(fileCard.legs)) return { ok: false, refusal: "SELECTION_MISMATCH" };
  if (fileCard.legs.some((l) => !eligible(l, product))) return { ok: false, refusal: "LEG_INELIGIBLE_RULE_A" };
  const A = laneCard(fileCard.legs, { doc, product, slot: "A", sourceCardId: fileCard.id, method: `${fileCard.policy} (the frozen file's own card)` });
  const used = new Set(fileCard.legs.map((l) => String(l.eventId)));
  const rest = pool.filter((l) => !used.has(String(l.eventId)));
  const b = best(rest, rule.sizes, rule.tiers, null);
  const B = b
    ? { card: laneCard(b.c, { doc, product, slot: "B", sourceCardId: null, method: `${fileCard.policy} engine best over the file's frozen legs, game-disjoint from lane A (D3 proposed)` }), reason: null }
    : { card: null, reason: `Insufficient eligible legs: no ${rule.sizes.join("/")}-leg card in the ${rule.tiers.join("/")} band from the ${rest.length} eligible games not in lane A.` };
  return { ok: true, A: { card: A, reason: null }, B };
}

/* ───────────────────────────── state: a fold over one run's log ───────────────────────────── */

/**
 * @returns {{ laneId, runId, product, baseCents, targetCents, steps, approvedBy, step, bankrollCents, status, open,
 *   days: object[], lastSettledStep: number }}
 * `open` is the current day's card: { date, step, cardEvent, payoutEvent|null, stakeEvent|null, legs: Map legId→outcome }.
 */
export function laneState(events) {
  const head = events[0];
  if (head?.type !== "RUN_STARTED") throw new Error("laneState: a run log starts with RUN_STARTED");
  const s = { laneId: head.laneId, runId: head.runId, product: head.product, baseCents: head.baseCents, targetCents: head.targetCents, steps: head.steps, approvedBy: head.approvedBy, startedAt: head.startedAt, step: 1, bankrollCents: head.baseCents, status: STATUS.READY, statusReason: null, open: null, days: [] };
  const day = (date) => { let d = s.days.find((x) => x.date === date); if (!d) { d = { date, step: s.step, card: null, status: null, reason: null, legs: {}, staked: false, outcome: null }; s.days.push(d); } return d; };
  for (const e of events.slice(1)) {
    switch (e.type) {
      case "CARD_FROZEN": { const d = day(e.date); d.card = e.card; d.cardEventSha256 = e.sha256; s.open = { date: e.date, step: e.step, cardEvent: e, payoutEvent: null, stakeEvent: null, priceEvent: null }; s.status = STATUS.READY; break; }
      case "PRICE_VERIFIED": if (s.open?.date === e.date) s.open.priceEvent = e; break;
      case "STAKE_SET": if (s.open?.date === e.date) s.open.stakeEvent = e; break;
      case "PAYOUT_COMPUTED": if (s.open?.date === e.date && e.result === "VERIFIED") { s.open.payoutEvent = e; day(e.date).staked = true; s.status = STATUS.IN_PLAY; } break;
      case "LEG_SETTLED": day(e.date).legs[e.legId] = e.outcome; break;
      case "STEP_SETTLED": {
        const d = day(e.date); d.outcome = e.outcome;
        if (e.outcome === "WIN") { s.bankrollCents = e.bankrollAfterCents; s.step += 1; s.status = STATUS.READY; }
        if (e.outcome === "LOSS") s.status = STATUS.BUSTED;
        if (s.open?.date === e.date) s.open = null;
        break;
      }
      case "STATUS": {
        const d = e.date ? day(e.date) : null;
        if (d) { d.status = e.status; d.reason = e.reason ?? null; }
        s.status = e.status; s.statusReason = e.reason ?? null;
        /* UNPRICED / NO_ELIGIBLE_CARD: the day's card (if any) is never staked; same step, and the lane is free tomorrow. */
        if ([STATUS.UNPRICED, STATUS.NO_ELIGIBLE_CARD].includes(e.status) && s.open?.date === e.date) s.open = null;
        break;
      }
      default: break; // GRAPHIC_RENDERED, APPROVED, POSTED, WAGER_DOCUMENTED: receipts, no state change
    }
  }
  return s;
}

export const isTerminal = (s) => TERMINAL.has(s.status);
/** IN PLAY: a staked step not yet settled (§3.2), or one held for void review. */
export const inPlay = (s) => s.status === STATUS.IN_PLAY || s.status === STATUS.PENDING_VOID_REVIEW;

/* ───────────────────────────── event builders ───────────────────────────── */

export function runStarted({ laneId, runId, startedAt, approvedBy }) {
  const L = LANES[laneId];
  if (!L) throw new Error(`unknown lane ${laneId}`);
  if (!approvedBy) throw new Error("a run starts only with a founder approval reference (approvedBy)");
  return chainEvent([], { type: "RUN_STARTED", laneId, runId, product: L.product, slot: L.slot, baseCents: L.baseCents, targetCents: L.targetCents, steps: L.steps, startedAt, approvedBy, at: startedAt, source: "lanes-prepare" });
}
export const append = (events, body) => [...events, chainEvent(events, body)];

/** The outcome of a fully settled step, from its legs (§3.3–3.4). */
export function stepOutcome(legOutcomes) {
  const o = Object.values(legOutcomes);
  if (o.includes("LOSS")) return "LOSS";
  if (o.some((x) => x === "VOID" || x === "PUSH")) return "VOID_REVIEW";
  return "WIN";
}

export const cardDigest = (card) => sha256(canonical(card));
