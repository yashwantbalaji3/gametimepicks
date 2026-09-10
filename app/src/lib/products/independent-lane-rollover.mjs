/** Prospective per-lane accounting approved by founder 2026-09-08 ET.
 * No protected bankroll write; immutable integer-cent state. Existing cards are not migrated
 * implicitly. A caller must supply the verified opening position and existing seed explicitly.
 */
import { CARD, nextPosition } from "./lifecycle.mjs";
const cents = (value, label, allowZero = false) => {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) throw new Error(`invalid ${label} cents`);
  return value;
};
const positiveInteger = (x, label) => { if (!Number.isSafeInteger(x) || x < 1) throw new Error(`invalid ${label}`); return x; };
export function initializeLane({ product, lane, seedCents, nextStakeCents, cycle, step, maxStep, effectiveAt, openingEvidence }) {
  if (!["bank-builder", "moonshot"].includes(product) || typeof lane !== "string" || !lane.trim()) throw new Error("invalid product/lane");
  if (!Number.isFinite(Date.parse(effectiveAt)) || typeof openingEvidence !== "string" || !openingEvidence.trim()) throw new Error("explicit opening evidence and date required");
  cents(seedCents, "seed"); cents(nextStakeCents, "opening stake");
  positiveInteger(cycle, "cycle"); positiveInteger(step, "step"); positiveInteger(maxStep, "maxStep");
  if (step > maxStep) throw new Error("opening step exceeds ladder");
  return { policy: "INDEPENDENT_PROCEEDS_ROLLOVER_V1", product, lane, seedCents, nextStakeCents, cycle, step, maxStep,
    effectiveAt, openingEvidence, state: "AWAITING_QUALIFIED_CARD", openCard: null, settlements: {} };
}

export function openLaneCard(lane, { cardId, generatedAt, lockAt, stakeCents }) {
  if (typeof cardId !== "string" || !cardId) throw new Error("card identity required");
  const generated = Date.parse(generatedAt), lock = Date.parse(lockAt);
  if (!Number.isFinite(generated) || !Number.isFinite(lock) || generated < Date.parse(lane.effectiveAt) || generated >= lock) throw new Error("card must be generated prospectively before lock");
  cents(stakeCents, "card stake");
  const card = { cardId, generatedAt, lockAt, stakeCents, cycle: lane.cycle, step: lane.step };
  if (lane.openCard) {
    if (JSON.stringify(lane.openCard) === JSON.stringify(card)) return lane;
    throw new Error("lane already has a different open card");
  }
  if (lane.settlements[cardId]) throw new Error("cannot reopen a settled card");
  if (Object.values(lane.settlements).some(r => generated < Date.parse(r.settledAt))) throw new Error("new card cannot precede the settlement funding it");
  if (stakeCents !== lane.nextStakeCents) throw new Error("stake must equal this lane's own available proceeds");
  return { ...lane, state: "OPEN", openCard: card };
}

export function settleLaneCard(lane, { cardId, result, returnedCents, settledAt, sourceReceipt }) {
  if (![CARD.WON, CARD.LOST, CARD.VOID].includes(result)) throw new Error("only a decided card may settle; pending holds");
  cents(returnedCents, "return", true);
  if (!Number.isFinite(Date.parse(settledAt)) || typeof sourceReceipt !== "string" || !sourceReceipt.trim()) throw new Error("official settlement receipt required");
  const prior = lane.settlements[cardId];
  if (prior) {
    if (prior.result !== result || prior.returnedCents !== returnedCents || prior.sourceReceipt !== sourceReceipt) throw new Error("conflicting settlement cannot rewrite history");
    return lane;
  }
  const card = lane.openCard;
  if (!card || card.cardId !== cardId) throw new Error("settlement does not identify this lane's open card");
  if (Date.parse(settledAt) < Date.parse(card.generatedAt)) throw new Error("cannot settle before card generation");
  if (result !== CARD.VOID && Date.parse(settledAt) < Date.parse(card.lockAt)) throw new Error("cannot settle a win/loss before first event starts");
  if (result === CARD.LOST && returnedCents !== 0) throw new Error("losing card cannot return proceeds");
  if (result === CARD.VOID && returnedCents !== card.stakeCents) throw new Error("void must return the actual stake, not the seed");
  if (result === CARD.WON && returnedCents <= card.stakeCents) throw new Error("win must carry a verified gross return above stake");
  const position = nextPosition({ cycle: card.cycle, step: card.step, maxStep: lane.maxStep }, result);
  const nextStakeCents = result === CARD.LOST ? lane.seedCents : returnedCents;
  const record = { ...card, result, returnedCents, settledAt, sourceReceipt, nextStakeCents,
    nextCycle: position.cycle, nextStep: position.step, transition: position.transition };
  return { ...lane, cycle: position.cycle, step: position.step, nextStakeCents,
    state: "AWAITING_QUALIFIED_CARD", openCard: null, settlements: { ...lane.settlements, [cardId]: record } };
}
