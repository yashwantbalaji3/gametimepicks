/**
 * CHALLENGE LANES · DAILY OPERATIONS. PURE: each takes a run's events and returns the events to append, never writes.
 * The CLIs (scripts/challenge-lanes/) do the I/O through store.mjs.
 *
 *   prepareLane    after the frozen suggested-cards file is sealed: CARD_FROZEN, or STATUS NO_ELIGIBLE_CARD /
 *                  AWAITING_RESTART_APPROVAL, or nothing (in play, complete, already prepared, refused).
 *   unpricedLane   the price step while no provider is permitted (P1): STATUS UNPRICED. Calls nothing.
 *   priceLane      the price step once one is: PRICE_VERIFIED + STAKE_SET + PAYOUT_COMPUTED, or the refusals.
 *   reconcileLane  next morning: LEG_SETTLED from the official finals record, then STEP_SETTLED + STATUS.
 *   ingestReceipts GRAPHIC_RENDERED / APPROVED / POSTED receipts from a writer's own chained inbox.
 */
import { LANES, STATUS, laneState, inPlay, append, stepOutcome, runStarted } from "./lanes.mjs";
import { verifyChain } from "./chain.mjs";
import { computePayout } from "./payout.mjs";

export const FINALS_RECORD = "app/public/data/nba/results/finals-2026-27.json";
const dollars = (c) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const stepText = (s) => `STEP ${s.step} OF ${s.steps}`;

/**
 * @param {object[]} events  the lane's current run
 * @param {{ date: string, at: string, selection: object|null, file: string|null, docSha256: string|null }} p
 *   `selection` is selectLaneCards(doc, product) for this lane's product, or null when no sealed file exists.
 */
export function prepareLane(events, { date, at, selection, file = null, docSha256 = null }) {
  if (!verifyChain(events).ok) return { events: [], action: "REFUSED", reason: "CHAIN_BROKEN" };
  const s = laneState(events);
  const L = LANES[s.laneId];
  if (s.days.some((d) => d.date === date && (d.card || d.status))) return { events: [], action: "SKIP", reason: "ALREADY_PREPARED" };
  if (s.status === STATUS.COMPLETE || s.status === STATUS.FINISHED_SHORT) return { events: [], action: "SKIP", reason: s.status };
  if (s.status === STATUS.AWAITING_RESTART_APPROVAL) return { events: [], action: "SKIP", reason: "AWAITING_RESTART_APPROVAL" };
  if (s.status === STATUS.PAUSED) return { events: [], action: "SKIP", reason: `PAUSED: ${s.statusReason}` };
  const base = { date, step: s.step, at, source: "lanes-prepare" };
  if (s.status === STATUS.BUSTED) {
    const bust = s.days.findLast((d) => d.outcome === "LOSS");
    const reason = `Busted at step ${bust?.step ?? s.step} of ${s.steps} on ${bust?.date ?? "?"}. A new run starts at ${dollars(s.baseCents)} only after the founder approves a restart.`;
    return { events: append(events, { ...base, type: "STATUS", status: STATUS.AWAITING_RESTART_APPROVAL, reason }).slice(events.length), action: STATUS.AWAITING_RESTART_APPROVAL, reason };
  }
  if (inPlay(s)) return { events: [], action: "SKIP", reason: `IN_PLAY: ${stepText(s)} from ${s.open?.date ?? s.days.at(-1)?.date} is unsettled` };
  if (!selection) {
    const reason = `NO_FROZEN_CARD_FILE: no sealed suggested-cards file for ${date}; ${stepText(s)} is unchanged.`;
    return { events: append(events, { ...base, type: "STATUS", status: STATUS.NO_ELIGIBLE_CARD, reason }).slice(events.length), action: STATUS.NO_ELIGIBLE_CARD, reason };
  }
  if (!selection.ok) return { events: [], action: "REFUSED", reason: selection.refusal };
  const pick = selection[L.slot];
  if (!pick.card) {
    const reason = `${pick.reason} ${stepText(s)} is unchanged.`;
    return { events: append(events, { ...base, type: "STATUS", status: STATUS.NO_ELIGIBLE_CARD, reason }).slice(events.length), action: STATUS.NO_ELIGIBLE_CARD, reason };
  }
  const body = { ...base, type: "CARD_FROZEN", product: s.product, packageId: L.packageId(date), mediaIndex: L.mediaIndex, suggestedCards: { file, contentSha256: docSha256 }, card: pick.card };
  return { events: append(events, body).slice(events.length), action: "CARD_FROZEN", reason: null };
}

export const P1_UNPRICED = "UNPRICED: no verified price was recorded for this card before it was closed, so it is not staked and the step is unchanged.";

/** The price step today: every lane holding an unpriced card for `date` gets STATUS UNPRICED. No provider exists here. */
export function unpricedLane(events, { date, at, reason = P1_UNPRICED }) {
  const s = laneState(events);
  if (s.open?.date !== date || s.open.payoutEvent) return { events: [], action: "SKIP" };
  return { events: append(events, { type: "STATUS", status: STATUS.UNPRICED, reason, date, step: s.step, at, source: "lanes-price" }).slice(events.length), action: STATUS.UNPRICED };
}

/**
 * The price step once P1 permits a provider (and in tests, with a FIXTURE provider): the verified price, the all-in
 * stake and the payout — or, on any refusal, PAYOUT_COMPUTED(REFUSED) + STATUS UNPRICED with every refusal code.
 * @param {{ date, at, price, suggestedCards, postScheduledAt?, permittedProviders?, strictPace? }} p
 *   price: { legs: [{ legId, selectionCode, provider, book, oddsFormat, price, fetchedAt }], parlay: { method, oddsFormat, price, provider?, fetchedAt? }, priceSnapshotSha256 }
 */
/**
 * PRELIMINARY (founder P0 2026-11-04): an early build from an early snapshot, before the post window. Every check runs
 * except the post-window freshness (no postScheduledAt is passed), and the result is PAYOUT_COMPUTED `result:
 * "PRELIMINARY"`, never VERIFIED: it stakes nothing and can never settle a step. The near-window refresh is a normal
 * priceLane call (with postScheduledAt) that appends the VERIFIED payout and names the legs whose price changed.
 */
export function priceLane(events, { date, at, price, suggestedCards, postScheduledAt = null, permittedProviders, eligibleBooks, strictPace, preliminary = false }) {
  const s = laneState(events);
  if (s.open?.date !== date || s.open.payoutEvent) return { events: [], action: "SKIP" };
  if (preliminary && postScheduledAt) throw new Error("priceLane: a preliminary price is checked without a post time; the post window gates the final price");
  const card = s.open.cardEvent;
  const earlier = events.filter((e) => e.type === "PRICE_VERIFIED" && e.cardEventSha256 === card.sha256).at(-1)?.price ?? null;
  const changed = earlier ? price.legs.filter((l) => { const o = earlier.legs.find((x) => x.legId === l.legId); return !o || o.price !== l.price || o.book !== l.book || o.line !== l.line; }).map((l) => l.legId) : null;
  price = { ...price, preliminary: preliminary === true };
  let ev = append(events, { type: "PRICE_VERIFIED", date, step: s.step, at, source: "lanes-price", cardEventSha256: card.sha256, price });
  const priceEvent = ev.at(-1);
  ev = append(ev, { type: "STAKE_SET", date, step: s.step, at, source: "lanes-price", stakeCents: s.bankrollCents, placedWager: false, basis: "all-in tracked bankroll (D1 proposed)", postScheduledAt });
  const r = computePayout({ events: ev, cardEvent: card, suggestedCards, priceEvent, stakeCents: s.bankrollCents, bankrollCents: s.bankrollCents, ladder: { targetCents: s.targetCents, stepsRemaining: s.steps - s.step + 1 }, postScheduledAt, permittedProviders, eligibleBooks, strictPace });
  const inputs = { ...r.inputs, preliminary: preliminary === true, verification: r.ok ? (preliminary ? "PRELIMINARY" : "VERIFIED") : "REFUSED", changedFromEarlier: changed };
  if (r.ok) {
    ev = append(ev, { type: "PAYOUT_COMPUTED", result: preliminary ? "PRELIMINARY" : "VERIFIED", date, step: s.step, at, source: "lanes-price", inputs, grossPayoutCents: r.grossPayoutCents, profitCents: r.profitCents });
    return { events: ev.slice(events.length), action: preliminary ? "PRELIMINARY" : "PAYOUT_COMPUTED", payout: { ...r, inputs } };
  }
  if (preliminary) { // an early refusal leaves the card open for the near-window price; it closes nothing
    ev = append(ev, { type: "PAYOUT_COMPUTED", result: "REFUSED", date, step: s.step, at, source: "lanes-price", inputs, refusals: r.refusals });
    return { events: ev.slice(events.length), action: "REFUSED", payout: { ...r, inputs } };
  }
  ev = append(ev, { type: "PAYOUT_COMPUTED", result: "REFUSED", date, step: s.step, at, source: "lanes-price", inputs, refusals: r.refusals });
  const pace = r.refusals.every((x) => x.code === "BELOW_PACE");
  ev = append(ev, { type: "STATUS", status: pace ? STATUS.NO_ELIGIBLE_CARD : STATUS.UNPRICED, reason: `REFUSED: ${r.refusals.map((x) => x.code).join(", ")}`, date, step: s.step, at, source: "lanes-price" });
  return { events: ev.slice(events.length), action: "REFUSED", payout: r };
}

/**
 * Settle every frozen card that has a recorded official final. `finalsRecord` is the write-once NBA finals record
 * (ESPN STATUS_FINAL rows). A game not in it is PENDING, and one under review is held: neither is ever a loss.
 */
export function reconcileLane(events, { finalsRecord, recordFile = FINALS_RECORD }) {
  let ev = events;
  const held = [];
  const rows = new Map((finalsRecord?.finals ?? []).map((r) => [String(r.providerEventId), r]));
  const review = new Set((finalsRecord?.conflicts ?? []).map((c) => String(c.providerEventId)));
  for (const d of laneState(events).days.filter((x) => x.card)) {
    for (const leg of d.card.legs) {
      if (laneState(ev).days.find((x) => x.date === d.date).legs[leg.legId]) continue;
      const row = rows.get(leg.gameId);
      if (!row) { held.push({ date: d.date, legId: leg.legId, state: "PENDING" }); continue; }
      if (review.has(leg.gameId)) { held.push({ date: d.date, legId: leg.legId, state: "FINAL_UNDER_REVIEW" }); continue; }
      const outcome = row.winnerSide === leg.selection.code ? "WIN" : "LOSS";
      ev = append(ev, { type: "LEG_SETTLED", date: d.date, step: d.step, at: row.firstRecordedAt, legId: leg.legId, gameId: leg.gameId, outcome,
        final: { home: row.home?.tricode ?? null, away: row.away?.tricode ?? null, ftHome: row.ftHome, ftAway: row.ftAway, winnerSide: row.winnerSide, statusRaw: row.statusRaw },
        source: { kind: "official-final", provider: row.source ?? "espn_scoreboard", record: recordFile, providerEventId: leg.gameId, recordedAt: row.firstRecordedAt } });
    }
    const s = laneState(ev);
    const day = s.days.find((x) => x.date === d.date);
    const settled = d.card.legs.every((l) => day.legs[l.legId]);
    if (!settled || !day.staked || day.outcome || s.open?.date !== d.date) continue;
    const payout = s.open.payoutEvent;
    const firstStart = Math.min(...d.card.legs.map((l) => Date.parse(l.startUtc)));
    const at = ev.filter((e) => e.type === "LEG_SETTLED" && e.date === d.date).map((e) => e.at).sort().at(-1);
    const base = { date: d.date, step: s.step, at, source: "lanes-reconcile" };
    if (!(Date.parse(payout.at) < firstStart)) { ev = append(ev, { ...base, type: "STATUS", status: STATUS.PAUSED, reason: "PAYOUT_AFTER_FIRST_START: the verified payout was recorded at or after the first leg started; the step cannot settle." }); continue; }
    const outcome = stepOutcome(day.legs);
    if (outcome === "VOID_REVIEW") { ev = append(ev, { ...base, type: "STATUS", status: STATUS.PENDING_VOID_REVIEW, reason: "A leg was voided or pushed. The step settles on the remaining legs only at the book's own void price, verified by the founder. Legs are never substituted." }); continue; }
    if (outcome === "LOSS") {
      ev = append(ev, { ...base, type: "STEP_SETTLED", outcome: "LOSS", payoutEventSha256: payout.sha256, bankrollBeforeCents: s.bankrollCents, bankrollAfterCents: 0 });
      ev = append(ev, { ...base, type: "STATUS", status: STATUS.BUSTED, reason: `LANE ${LANES[s.laneId].slot} — BUSTED AT STEP ${s.step} OF ${s.steps}` });
      continue;
    }
    ev = append(ev, { ...base, type: "STEP_SETTLED", outcome: "WIN", payoutEventSha256: payout.sha256, bankrollBeforeCents: s.bankrollCents, bankrollAfterCents: payout.grossPayoutCents });
    if (payout.grossPayoutCents >= s.targetCents) ev = append(ev, { ...base, step: s.step + 1, type: "STATUS", status: STATUS.COMPLETE, reason: `Tracked bankroll reached the ${dollars(s.targetCents)} target.` });
    else if (s.step >= s.steps) ev = append(ev, { ...base, step: s.step + 1, type: "STATUS", status: STATUS.FINISHED_SHORT, reason: `All ${s.steps} steps won, below the ${dollars(s.targetCents)} target. The founder decides whether a sixth step or a new run follows.` });
  }
  return { events: ev.slice(events.length), held };
}

/* ───────────────────────────── receipts from other writers ───────────────────────────── */

export const RECEIPT_TYPES = Object.freeze(["GRAPHIC_RENDERED", "APPROVED", "POSTED", "RESTART_APPROVED", "WAGER_DOCUMENTED"]);
const runNumber = (runId) => Number(/^run-(\d+)$/.exec(String(runId))?.[1] ?? NaN);

/** Why a RESTART_APPROVED receipt cannot apply to this run, or null (§4.4: only after LOST, once per run, to run-N+1). */
function restartRefusal(events, s, r) {
  if (![STATUS.BUSTED, STATUS.AWAITING_RESTART_APPROVAL].includes(s.status)) return "RESTART_NOT_AWAITED";
  if (events.some((e) => e.type === "RESTART_APPROVED")) return "RESTART_ALREADY_APPROVED";
  if (r.nextRunId !== `run-${runNumber(s.runId) + 1}`) return "RESTART_BAD_NEXT_RUN";
  const ref = events.find((e) => e.sha256 === r.refEventSha256);
  const ok = ref && ((ref.type === "STATUS" && [STATUS.BUSTED, STATUS.AWAITING_RESTART_APPROVAL].includes(ref.status)) || (ref.type === "STEP_SETTLED" && ref.outcome === "LOSS"));
  if (!ok) return "RESTART_BAD_REF";
  if (!r.approvedBy) return "RESTART_NO_APPROVER";
  return null;
}

/** The next run's header when the current run holds an ingested RESTART_APPROVED, else null. Starts at base. */
export function restartRun(events) {
  const r = events.find((e) => e.type === "RESTART_APPROVED");
  if (!r) return null;
  const s = laneState(events);
  return runStarted({ laneId: s.laneId, runId: r.nextRunId, startedAt: r.at, approvedBy: `${r.approvedBy} via ${r.source} RESTART_APPROVED ${r.receiptSha256}` });
}

/**
 * A writer (the console, the renderer) keeps its own append-only chained inbox per lane, same hashing rule as the lane
 * log. Each receipt names the lane, run, date and the CARD_FROZEN (or STATUS) event it refers to (`refEventSha256`).
 * Valid receipts not yet ingested are appended as lane events carrying `receiptSha256`; anything else is reported.
 */
export function ingestReceipts(events, receipts) {
  const chain = verifyChain(receipts);
  if (!chain.ok) return { events: [], refused: [{ reason: `INBOX_CHAIN_BROKEN at ${chain.seq}: ${chain.reason}` }] };
  const s = laneState(events);
  const known = new Set(events.map((e) => e.receiptSha256).filter(Boolean));
  const refs = new Set(events.map((e) => e.sha256));
  let ev = events; const refused = [];
  for (const r of receipts) {
    if (known.has(r.sha256)) continue;
    if (r.laneId === s.laneId && runNumber(r.runId) < runNumber(s.runId)) continue; // an earlier run's receipt: that run's own
    const bad = !RECEIPT_TYPES.includes(r.type) ? "TYPE_NOT_ALLOWED" : r.laneId !== s.laneId || r.runId !== s.runId ? "OTHER_LANE_OR_RUN" : !refs.has(r.refEventSha256) ? "UNKNOWN_REF_EVENT" : r.type === "WAGER_DOCUMENTED" ? "WAGER_NEEDS_FOUNDER_PROOF" : r.type === "RESTART_APPROVED" ? restartRefusal(ev, s, r) : null;
    if (bad) { refused.push({ receiptSha256: r.sha256, type: r.type, reason: bad }); continue; }
    const { schema: _s, seq: _q, prevSha256: _p, sha256: rs, laneId: _l, runId: _r, ...body } = r;
    ev = append(ev, { ...body, receiptSha256: rs });
  }
  return { events: ev.slice(events.length), refused };
}
