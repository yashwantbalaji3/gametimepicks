/**
 * PARLAY LAB · CARD SETTLEMENT ARITHMETIC (pure — no fs, no clock).
 *
 * scripts/parlays/settle-lab-cards.mjs grades each leg from official results and hands the per-leg outcomes here.
 * This module owns the two numbers a receipt card carries and the one rule that keeps published receipts
 * append-only.
 *
 * THE DEFECT THIS EXISTS TO FIX (found in PR #1141, 2026-10-19)
 *   The settler multiplied EVERY leg's price into `combinedDecimal` before voided legs were removed, and the ledger
 *   (build-lab-ledger.mjs) counted `combinedDecimal` as the return of a winning card. A card that won on its
 *   remaining legs after a void was therefore credited at the full card's price:
 *     slip_2026-08-18_conservative_9cbc273e3512 · legs −198 (win) and −159 (void) · recorded 2.451623 · correct 1.505051.
 *
 * THE FORMULA (PAYOUT_POLICY, per 1 unit staked)
 *   · a void or push leg drops out of the card (it contributes decimal 1.0);
 *   · any losing leg ⇒ the card loses ⇒ payout 0;
 *   · every remaining decided leg won ⇒ the card wins ⇒ payout = the product of the decimals of the WINNING legs;
 *   · every leg void or push ⇒ the card is void / push ⇒ payout 1 (the stake is returned);
 *   · otherwise the card is pending ⇒ payout null (not yet known).
 *
 * TWO FIELDS, NOT ONE REDEFINED
 *   `combinedDecimal` keeps its meaning on every receipt ever written: the card's FULL published price (every
 *   priced leg multiplied in). It is outcome-independent, so it never moves when a pending card completes — which
 *   the completion rule (receipt-completion.mjs) depends on. The payout is a NEW field, `payoutDecimal`, written
 *   only on receipts stamped `payoutPolicy: PAYOUT_POLICY`.
 *
 * FORWARD-ONLY (APPEND-ONLY) — the guard
 *   A receipt keeps the payout policy it was FIRST written under, forever. The settler re-runs historical days (the
 *   completion sweep, complete-pending-days.mjs, revisits any day with a pending card), so "use the new formula from
 *   now on" must not mean "rewrite every receipt the next time its day is touched". payoutPolicyForRun(prior)
 *   answers: an existing receipt → its own policy (legacy receipts stay legacy: no payoutDecimal, combinedDecimal
 *   exactly as computed before); no receipt yet → PAYOUT_POLICY. The classifier independently refuses any run that
 *   adds, removes or changes a decided card's payout, so even a mis-wired settler cannot restate history.
 *
 * Restating the historical receipts is a founder decision and is NOT done here; docs/PARLAY_LAB_V2.md lists every
 * historical card whose recorded return differs from this formula.
 */

export const LEG_RESULT = Object.freeze({ WIN: "win", LOSS: "loss", PUSH: "push", VOID: "void", PENDING: "pending" });

/** The policy every NEW receipt is written under. */
export const PAYOUT_POLICY = "decided-winning-legs@1";
/** What a receipt with no `payoutPolicy` field is: no `payoutDecimal`; the ledger reads `combinedDecimal` as before. */
export const LEGACY_PAYOUT_POLICY = "legacy-full-card-price@0";

export const decimalFromAmerican = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const round6 = (x) => Number(x.toFixed(6));
const priced = (o) => typeof o === "number" && Number.isFinite(o) && o !== 0;

/**
 * The card's outcome from its legs' outcomes — the settler's rule, moved here verbatim:
 *   pending while any leg is pending and none has lost; loss on any loss; win when every decided (non-void,
 *   non-push) leg won; push when every leg pushed; void when every leg pushed or voided with at least one void.
 * @param {ReadonlyArray<string>} results
 */
export function cardResult(results) {
  const r = results ?? [];
  const decisive = r.filter((x) => x !== "push" && x !== "void");
  return r.includes("pending") && !r.includes("loss") ? "pending"
    : decisive.includes("loss") ? "loss"
    : decisive.length && decisive.every((x) => x === "win") ? "win"
    : r.length && r.every((x) => x === "push") ? "push"
    : r.length && r.every((x) => x === "push" || x === "void") ? "void"
    : "pending";
}

/**
 * `combinedDecimal`: the card's FULL published price — every priced leg multiplied in, whatever it settled as.
 * Byte-for-byte the settler's historical arithmetic (pinned against every published receipt by settlement.test.mjs).
 * It is a price, not a payout.
 * @param {ReadonlyArray<number|null|undefined>} legOdds  American odds, one per leg
 */
export function fullCardDecimal(legOdds) {
  let combined = 1;
  for (const o of legOdds ?? []) if (o != null) combined *= decimalFromAmerican(o);
  return round6(combined);
}

/**
 * Return per 1 unit staked for a card whose outcome is `result`, under PAYOUT_POLICY. A winning card with an
 * unpriced winning leg has no honest payout and returns null rather than a guess.
 * @param {string} result  the card outcome (normally cardResult(results))
 * @param {ReadonlyArray<string>} results
 * @param {ReadonlyArray<number|null|undefined>} legOdds
 * @returns {number|null}
 */
export function payoutFor(result, results, legOdds) {
  if (result === "loss") return 0;
  if (result === "push" || result === "void") return 1;
  if (result !== "win") return null;
  let p = 1;
  for (let i = 0; i < (results ?? []).length; i += 1) {
    if (results[i] !== "win") continue;
    const o = legOdds?.[i];
    if (!priced(o)) return null;
    p *= decimalFromAmerican(o);
  }
  return round6(p);
}

/**
 * Settle one card: outcome, full price and payout.
 * @param {ReadonlyArray<{ result: string, odds: number|null|undefined }>} legs
 */
export function settleCard(legs) {
  const results = (legs ?? []).map((l) => l.result);
  const odds = (legs ?? []).map((l) => l.odds);
  const result = cardResult(results);
  return { result, combinedDecimal: fullCardDecimal(odds), payoutDecimal: payoutFor(result, results, odds) };
}

/** The payout policy a receipt was written under. Absent or unrecognised ⇒ legacy. */
export function receiptPayoutPolicy(receipt) {
  return receipt?.payoutPolicy === PAYOUT_POLICY ? PAYOUT_POLICY : LEGACY_PAYOUT_POLICY;
}

/** The policy a settle run must write: an existing receipt keeps its own (append-only); only a NEW receipt is current. */
export function payoutPolicyForRun(priorReceipt) {
  return priorReceipt ? receiptPayoutPolicy(priorReceipt) : PAYOUT_POLICY;
}

/**
 * One receipt card in the exact key order the settler writes. Legacy policy reproduces the historical shape
 * exactly ({sport, sports, tier, slipId, result, combinedDecimal, legs}); PAYOUT_POLICY adds `payoutDecimal`
 * after `combinedDecimal`.
 * The settler derives `sport` / `sports` itself (from the legs it graded) and passes them in.
 * @param {{ sport: string, sports: string[], tier: unknown, slipId: unknown, results: string[],
 *           legOdds: ReadonlyArray<number|null|undefined>, policy: string, result?: string }} input
 *   `result` overrides the derived outcome (the settler's carry-forward of a recorded outcome).
 */
export function receiptCard({ sport, sports, tier, slipId, results, legOdds, policy, result: override }) {
  const result = override ?? cardResult(results);
  const card = { sport, sports, tier, slipId, result, combinedDecimal: fullCardDecimal(legOdds) };
  if (policy === PAYOUT_POLICY) card.payoutDecimal = payoutFor(result, results, legOdds);
  card.legs = results;
  return card;
}

/**
 * What the ledger credits a settled WINNING card per unit staked: its `payoutDecimal` when the receipt carries
 * one (PAYOUT_POLICY), else the legacy recorded `combinedDecimal` — historical receipts are read exactly as
 * published until the founder decides on a restatement.
 */
export function recordedReturn(card) {
  return card && Object.prototype.hasOwnProperty.call(card, "payoutDecimal") ? card.payoutDecimal : card?.combinedDecimal;
}
