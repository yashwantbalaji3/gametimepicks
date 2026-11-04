/**
 * BANK BUILDER & MOONSHOT CHALLENGE LANES V2, the social side's reader (contract: ~/gtp-evidence/bbm-v2/SPEC.md §1-§4,
 * Program Director 2026-11-04). PURE: no I/O, no clock, no network.
 *
 * A lane run is an append-only, hash-chained event log written by the engine. This module replays one log into the state
 * a graphic prints for one ET posting date: STEP k OF N, the ladder rungs, start / tracked / goal bankroll, the day's
 * frozen card, the tracked wager, and a payout only from a PAYOUT_COMPUTED event that matches a PRICE_VERIFIED event for
 * exactly the frozen legs. Anything the log cannot prove is refused or left as "awaiting"; nothing is derived here.
 *
 * Until the engine publishes its schema this follows SPEC §2 literally:
 *   header   { laneId, runId, product, base, target, steps, startedAt, approvedBy }  (first line, or { header, events })
 *   event    { type, date, step, at, source, prevSha256, sha256, ... }
 *   sha256   sha256(JSON.stringify(event without sha256)), keys in written order (the same rule as suggested-cards B);
 *            the first event's prevSha256 is the header's sha256, computed the same way.
 */
import { createHash } from "node:crypto";

export const BBM_LANES = Object.freeze({
  "bb-a": Object.freeze({ laneId: "bb-a", product: "bank-builder", letter: "A", base: 100, target: 10000, steps: 3, packageId: (d) => `bb-${d}` }),
  "bb-b": Object.freeze({ laneId: "bb-b", product: "bank-builder", letter: "B", base: 100, target: 10000, steps: 3, packageId: (d) => `bb-${d}` }),
  "ms-a": Object.freeze({ laneId: "ms-a", product: "moonshot", letter: "A", base: 25, target: 1000, steps: 5, packageId: (d) => `ms-a-${d}` }),
  "ms-b": Object.freeze({ laneId: "ms-b", product: "moonshot", letter: "B", base: 25, target: 1000, steps: 5, packageId: (d) => `ms-b-${d}` }),
});
export const EVENT = Object.freeze({
  CARD_FROZEN: "CARD_FROZEN", PRICE_VERIFIED: "PRICE_VERIFIED", STAKE_SET: "STAKE_SET", PAYOUT_COMPUTED: "PAYOUT_COMPUTED",
  GRAPHIC_RENDERED: "GRAPHIC_RENDERED", APPROVED: "APPROVED", POSTED: "POSTED", LEG_SETTLED: "LEG_SETTLED",
  STEP_SETTLED: "STEP_SETTLED", STATUS: "STATUS", WAGER_DOCUMENTED: "WAGER_DOCUMENTED",
});
/** What the graphic draws for the day. CARD = a frozen card for the current step; the rest are status graphics. */
export const VIEW = Object.freeze({ CARD: "CARD", NO_ELIGIBLE_CARD: "NO_ELIGIBLE_CARD", BUSTED: "BUSTED", COMPLETE: "COMPLETE", IN_PLAY: "IN_PLAY", PAUSED: "PAUSED", AWAITING_RESTART_APPROVAL: "AWAITING_RESTART_APPROVAL" });
/** Rung states on the ladder meter. */
export const RUNG = Object.freeze({ COMPLETED: "completed", ACTIVE: "active", FAILED: "failed", UPCOMING: "upcoming" });
/**
 * Founder blocker P1 (SPEC §6): no permitted price source yet, so no price-derived number may reach an exported graphic.
 * A payout is drawn only on a labelled sample; packages refuse it.
 */
export const P1_PRICE_SOURCE_DECIDED = false;

const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const shaOf = (o) => createHash("sha256").update(JSON.stringify(o)).digest("hex");
/** sha256 of an event or header without its own sha256 field, keys in written order. */
export const eventSha = (e) => { const { sha256: _, ...rest } = e; return shaOf(rest); };
/** Append an event to a log (fixtures and tests): sets prevSha256 and sha256. */
export function appendEvent(log, event) {
  const prev = log.events.length ? log.events.at(-1).sha256 : log.header.sha256;
  const e = { ...event, prevSha256: prev };
  log.events.push({ ...e, sha256: eventSha(e) });
  return log;
}
/** A new run log (fixtures and tests). */
export function newLaneLog(header) { const h = { ...header }; return { header: { ...h, sha256: eventSha(h) }, events: [] }; }

/** Parse a lane log: JSONL (header line, then events) or a { header, events } object / JSON text. */
export function parseLaneLog(input) {
  if (input && typeof input === "object") return { header: input.header, events: input.events ?? [] };
  const text = String(input).trim();
  if (text.startsWith("{") && !text.includes("\n")) { const o = JSON.parse(text); if (o.header) return { header: o.header, events: o.events ?? [] }; }
  const rows = text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  return { header: rows[0], events: rows.slice(1) };
}

/** [] when the log is a valid, unbroken chain for a known lane. */
export function laneLogViolations(log) {
  const v = [];
  const h = log?.header;
  const lane = BBM_LANES[h?.laneId];
  if (!lane) return [`unknown lane ${h?.laneId}`];
  for (const k of ["product", "base", "target", "steps"]) if (h[k] !== lane[k]) v.push(`header ${k} ${h[k]} is not ${lane[k]} for ${lane.laneId}`);
  if (!/^run-\d+$/.test(String(h.runId ?? ""))) v.push(`runId ${h.runId}`);
  if (h.sha256 !== eventSha(h)) v.push("header sha256 does not match its body");
  let prev = h.sha256;
  log.events.forEach((e, i) => {
    if (e.prevSha256 !== prev) v.push(`event ${i + 1} (${e.type}): hash chain broken`);
    if (e.sha256 !== eventSha(e)) v.push(`event ${i + 1} (${e.type}): sha256 does not match its body`);
    if (!(e.type in EVENT)) v.push(`event ${i + 1}: unknown type ${e.type}`);
    if (!Number.isInteger(e.step) || e.step < 1 || e.step > lane.steps) v.push(`event ${i + 1} (${e.type}): step ${e.step}`);
    prev = e.sha256;
  });
  return v;
}

const sameLegs = (a, b) => { const x = (a ?? []).map((l) => String(l.legId)).sort(); const y = (b ?? []).map((l) => String(l.legId)).sort(); return x.length > 0 && x.length === y.length && x.every((id, i) => id === y[i]); };

/**
 * The verified payout for one frozen card, or null. A PAYOUT_COMPUTED counts only when a PRICE_VERIFIED for the same
 * date and step covers exactly the frozen legs, its stake is the step's tracked stake, and its arithmetic holds.
 */
export function verifiedPayout(events, card, stake) {
  const pc = events.filter((e) => e.type === EVENT.PAYOUT_COMPUTED && e.date === card.date && e.step === card.step).at(-1);
  if (!pc) return { payout: null, reason: "no PAYOUT_COMPUTED for this card" };
  const pv = events.filter((e) => e.type === EVENT.PRICE_VERIFIED && e.date === card.date && e.step === card.step).at(-1);
  if (!pv || !sameLegs(pv.legs, card.legs)) return { payout: null, reason: "PAYOUT_COMPUTED without a PRICE_VERIFIED for exactly these legs" };
  if (pc.priceSnapshotSha && pv.priceSnapshotSha && pc.priceSnapshotSha !== pv.priceSnapshotSha) return { payout: null, reason: "PAYOUT_COMPUTED reads another price snapshot" };
  if (!isNum(pc.stake) || pc.stake !== stake) return { payout: null, reason: `PAYOUT_COMPUTED stake ${pc.stake} is not the tracked stake ${stake}` };
  if (!isNum(pc.grossPayout) || !isNum(pc.profit) || Math.abs(pc.grossPayout - pc.profit - pc.stake) > 0.005) return { payout: null, reason: "PAYOUT_COMPUTED arithmetic does not hold (profit = gross - stake)" };
  if (isNum(pc.decimalPrice) && Math.abs(pc.stake * pc.decimalPrice - pc.grossPayout) > 0.005) return { payout: null, reason: "PAYOUT_COMPUTED gross is not stake x price" };
  return { payout: { stake: pc.stake, grossPayout: pc.grossPayout, profit: pc.profit, fixture: pc.fixture === true || pv.fixture === true, eventSha256: pc.sha256 }, reason: null };
}

/**
 * Replay a lane log up to and including `date` (ET posting date) into what that day's graphic prints. Throws on a broken
 * log. `view` is one of VIEW; `card` is the day's CARD_FROZEN (or the busting card for BUSTED, with leg outcomes).
 */
export function laneView(log, date) {
  const bad = laneLogViolations(log);
  if (bad.length) throw new Error(`lane log refused:\n  - ${bad.join("\n  - ")}`);
  const h = log.header; const lane = BBM_LANES[h.laneId];
  const events = log.events.filter((e) => e.date <= date);
  let bankroll = h.base; let step = 1; let status = null; let busted = null; let settledSha256 = null;
  const settled = new Map(); // step -> { outcome, bankrollAfter, date }
  const outcomes = new Map(); // legId -> outcome
  for (const e of events) {
    if (e.type === EVENT.LEG_SETTLED) outcomes.set(String(e.legId), e.outcome);
    if (e.type === EVENT.STEP_SETTLED) {
      settledSha256 = e.sha256;
      if (e.step !== step) throw new Error(`STEP_SETTLED for step ${e.step} while the lane is on step ${step}`);
      if (e.outcome === "WIN") {
        if (!isNum(e.bankrollAfter) || !(e.bankrollAfter > bankroll)) throw new Error(`STEP_SETTLED WIN without a larger bankrollAfter (${e.bankrollAfter})`);
        settled.set(step, { outcome: "WIN", bankrollAfter: e.bankrollAfter, date: e.date });
        bankroll = e.bankrollAfter;
        if (bankroll >= h.target) status = VIEW.COMPLETE; else step += 1;
      } else if (e.outcome === "LOSS") {
        settled.set(step, { outcome: "LOSS", date: e.date });
        const lost = events.filter((x) => x.type === EVENT.STAKE_SET && x.step === step && x.date <= e.date).at(-1);
        busted = { step, date: e.date, stake: lost?.stake ?? null, bankrollBefore: bankroll };
        bankroll = 0; // all-in ladder: the tracked stake was the whole tracked bankroll
        status = VIEW.BUSTED;
      } else throw new Error(`STEP_SETTLED outcome ${e.outcome}`);
    }
    if (e.type === EVENT.STATUS && ["PAUSED", "AWAITING_RESTART_APPROVAL", "COMPLETE", "BUSTED"].includes(e.status) && !busted) status = e.status;
  }
  const cards = events.filter((e) => e.type === EVENT.CARD_FROZEN);
  const stepCard = cards.filter((c) => c.step === (busted ? busted.step : step)).at(-1) ?? null;
  const todayStatus = events.filter((e) => e.type === EVENT.STATUS && e.date === date).at(-1) ?? null;
  const placed = events.some((e) => e.type === EVENT.WAGER_DOCUMENTED);
  const rungs = Array.from({ length: h.steps }, (_, i) => {
    const k = i + 1; const s = settled.get(k);
    if (s?.outcome === "WIN") return { step: k, state: RUNG.COMPLETED, bankrollAfter: s.bankrollAfter };
    if (s?.outcome === "LOSS") return { step: k, state: RUNG.FAILED };
    return { step: k, state: !status && k === step ? RUNG.ACTIVE : RUNG.UPCOMING };
  });
  const base = { laneId: h.laneId, runId: h.runId, product: h.product, letter: lane.letter, date, base: h.base, target: h.target, steps: h.steps, step: busted ? busted.step : Math.min(step, h.steps), bankroll, rungs, placedWager: placed, settledSha256, cleared: [...settled.values()].filter((s) => s.outcome === "WIN").length };
  if (status === VIEW.BUSTED) return { ...base, view: VIEW.BUSTED, bustedAt: busted, card: stepCard && { ...stepCard, outcomes: Object.fromEntries(stepCard.legs.map((l) => [l.legId, outcomes.get(String(l.legId)) ?? null])) }, stake: null, payout: null };
  if (status) return { ...base, view: status, card: null, stake: null, payout: null };
  if (stepCard && stepCard.date < date) return { ...base, view: VIEW.IN_PLAY, card: stepCard, stake: null, payout: null };
  if (stepCard && stepCard.date === date) {
    const ss = events.filter((e) => e.type === EVENT.STAKE_SET && e.date === date && e.step === step).at(-1);
    if (!ss || !isNum(ss.stake)) throw new Error(`${h.laneId} ${date}: CARD_FROZEN without a STAKE_SET`);
    if (ss.stake !== bankroll) throw new Error(`${h.laneId} ${date}: tracked stake ${ss.stake} is not the tracked bankroll ${bankroll} (all-in ladder)`);
    if (ss.placedWager === true && !placed) throw new Error(`${h.laneId} ${date}: placedWager without a WAGER_DOCUMENTED event`);
    const { payout, reason } = verifiedPayout(events, stepCard, ss.stake);
    return { ...base, view: VIEW.CARD, card: stepCard, stake: ss.stake, payout, unpricedReason: payout ? null : reason };
  }
  if (todayStatus?.status === "NO_ELIGIBLE_CARD" || todayStatus?.status === "UNPRICED") return { ...base, view: VIEW.NO_ELIGIBLE_CARD, reason: todayStatus.reason ?? todayStatus.status, statusEventSha256: todayStatus.sha256, card: null, stake: null, payout: null };
  return { ...base, view: null, card: null, stake: null, payout: null, reason: `no CARD_FROZEN or STATUS for ${date}` };
}
