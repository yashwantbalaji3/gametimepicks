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
import { LANES, STATUS, laneState, inPlay, append, stepOutcome } from "./lanes.mjs";
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
  if (s.status === STATUS.COMPLETE) return { events: [], action: "SKIP", reason: "COMPLETE" };
  if (s.status === STATUS.AWAITING_RESTART_APPROVAL) return { events: [], action: "SKIP", reason: "AWAITING_RESTART_APPROVAL" };
  if (s.status === STATUS.PAUSED) return { events: [], action: "SKIP", reason: `PAUSED: ${s.statusReason}` };
  const base = { date, step: s.step, at, source: "lanes-prepare" };
  if (s.status === STATUS.BUSTED) {
    const bust = s.days.findLast((d) => d.outcome === "LOSS");
    const reason = `BUSTED AT STEP ${bust?.step ?? s.step} OF ${s.steps} on ${bust?.date ?? "?"}; a new run starts at ${dollars(s.baseCents)} only after a founder-approved restart (D2).`;
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
  const body = { ...base, type: "CARD_FROZEN", product: s.product, packageId: L.packageId(date), suggestedCards: { file, contentSha256: docSha256 }, card: pick.card };
  return { events: append(events, body).slice(events.length), action: "CARD_FROZEN", reason: null };
}

export const P1_UNPRICED = "P1_PRICE_SOURCE_UNDECIDED: no price provider is permitted (founder decision P1), so no price was requested from anyone; the card is not staked and the step is unchanged.";

/** The price step today: every lane holding an unpriced card for `date` gets STATUS UNPRICED. No provider exists here. */
export function unpricedLane(events, { date, at }) {
  const s = laneState(events);
  if (s.open?.date !== date || s.open.payoutEvent) return { events: [], action: "SKIP" };
  return { events: append(events, { type: "STATUS", status: STATUS.UNPRICED, reason: P1_UNPRICED, date, step: s.step, at, source: "lanes-price" }).slice(events.length), action: STATUS.UNPRICED };
}

/**
 * The price step once P1 permits a provider (and in tests, with a FIXTURE provider): the verified price, the all-in
 * stake and the payout — or, on any refusal, PAYOUT_COMPUTED(REFUSED) + STATUS UNPRICED with every refusal code.
 * @param {{ date, at, price, suggestedCards, postScheduledAt?, permittedProviders?, paceRule? }} p
 *   price: { legs: [{ legId, selectionCode, provider, book, oddsFormat, price, fetchedAt }], parlay: { method, oddsFormat, price, provider?, fetchedAt? }, priceSnapshotSha256 }
 */
export function priceLane(events, { date, at, price, suggestedCards, postScheduledAt = null, permittedProviders, paceRule }) {
  const s = laneState(events);
  if (s.open?.date !== date || s.open.payoutEvent) return { events: [], action: "SKIP" };
  const card = s.open.cardEvent;
  let ev = append(events, { type: "PRICE_VERIFIED", date, step: s.step, at, source: "lanes-price", cardEventSha256: card.sha256, price });
  const priceEvent = ev.at(-1);
  ev = append(ev, { type: "STAKE_SET", date, step: s.step, at, source: "lanes-price", stakeCents: s.bankrollCents, placedWager: false, basis: "all-in tracked bankroll (D1 proposed)" });
  const r = computePayout({ events: ev, cardEvent: card, suggestedCards, priceEvent, stakeCents: s.bankrollCents, bankrollCents: s.bankrollCents, ladder: { targetCents: s.targetCents, stepsRemaining: s.steps - s.step + 1 }, postScheduledAt, permittedProviders, paceRule });
  if (r.ok) {
    ev = append(ev, { type: "PAYOUT_COMPUTED", result: "VERIFIED", date, step: s.step, at, source: "lanes-price", inputs: r.inputs, grossPayoutCents: r.grossPayoutCents, profitCents: r.profitCents });
    return { events: ev.slice(events.length), action: "PAYOUT_COMPUTED", payout: r };
  }
  ev = append(ev, { type: "PAYOUT_COMPUTED", result: "REFUSED", date, step: s.step, at, source: "lanes-price", inputs: r.inputs, refusals: r.refusals });
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
    if (outcome === "VOID_REVIEW") { ev = append(ev, { ...base, type: "STATUS", status: STATUS.PENDING_VOID_REVIEW, reason: "A leg was voided or pushed. The step settles on the remaining legs only with the book's own void price, verified by the founder (D4); legs are never substituted." }); continue; }
    if (outcome === "LOSS") {
      ev = append(ev, { ...base, type: "STEP_SETTLED", outcome: "LOSS", payoutEventSha256: payout.sha256, bankrollBeforeCents: s.bankrollCents, bankrollAfterCents: 0 });
      ev = append(ev, { ...base, type: "STATUS", status: STATUS.BUSTED, reason: `LANE ${LANES[s.laneId].slot} — BUSTED AT STEP ${s.step} OF ${s.steps}` });
      continue;
    }
    ev = append(ev, { ...base, type: "STEP_SETTLED", outcome: "WIN", payoutEventSha256: payout.sha256, bankrollBeforeCents: s.bankrollCents, bankrollAfterCents: payout.grossPayoutCents });
    if (payout.grossPayoutCents >= s.targetCents) ev = append(ev, { ...base, step: s.step + 1, type: "STATUS", status: STATUS.COMPLETE, reason: `Tracked bankroll reached the ${dollars(s.targetCents)} target.` });
  }
  return { events: ev.slice(events.length), held };
}

/* ───────────────────────────── receipts from other writers ───────────────────────────── */

export const RECEIPT_TYPES = Object.freeze(["GRAPHIC_RENDERED", "APPROVED", "POSTED", "WAGER_DOCUMENTED"]);

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
    const bad = !RECEIPT_TYPES.includes(r.type) ? "TYPE_NOT_ALLOWED" : r.laneId !== s.laneId || r.runId !== s.runId ? "OTHER_LANE_OR_RUN" : !refs.has(r.refEventSha256) ? "UNKNOWN_REF_EVENT" : r.type === "WAGER_DOCUMENTED" ? "WAGER_NEEDS_FOUNDER_PROOF" : null;
    if (bad) { refused.push({ receiptSha256: r.sha256, type: r.type, reason: bad }); continue; }
    const { schema: _s, seq: _q, prevSha256: _p, sha256: rs, laneId: _l, runId: _r, ...body } = r;
    ev = append(ev, { ...body, receiptSha256: rs });
  }
  return { events: ev.slice(events.length), refused };
}
