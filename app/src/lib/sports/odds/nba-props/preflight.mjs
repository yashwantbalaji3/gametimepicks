/**
 * NBA PROP CAPTURE · PREFLIGHT AND WINDOW BOOKKEEPING for the local runner (receipt
 * docs/receipts/ODDS_AUTHORIZATION_NBA_PROPS_PRIVATE_2026-11-11.md, founder 2026-11-11, terms 2, 3, 5 and 7). PURE: the
 * caller passes the provider's free `/v4/sports` reply, the receipt text, the ledger, the schedule and a clock.
 *
 *   tickTargets         the games this tick may price: tip more than 20 and at most 75 minutes away (captureWindow), not
 *                       already captured in the ledger (one per game), earliest first.
 *   missedWindows       games of the receipt period whose tip has passed with no successful capture and no record yet:
 *                       MISSED_WINDOW (no spend, never retried after tip).
 *   nbaPropsPreflight   before ANY paid call: receipt parses at `now` (present, unexpired, under its ceiling with the
 *                       tick's worst case); the free reply is 200 with a readable balance and `x-requests-last` 0; the
 *                       expected cost is certain (a plan exists for every target); remaining − worst case ≥ the floor;
 *                       usage since the period baseline + worst case ≤ the receipt's shared weekly cap. Any failure
 *                       refuses with its reason and `paidCallAllowed: false`.
 * The weekly cap is read from the receipt's own row ("Shared weekly cap | 3,500 credits per week"); the floor is
 * ODDS_API_MIN_CREDITS_REMAINING (passed in). No constant of its own.
 */
import { parseNbaPropsReceipt, planNbaPropCapture } from "./credits.mjs";
import { captureWindow } from "./capture.mjs";

export const PREFLIGHT_VERSION = "nba-props-preflight@1";
export const LEAD_WINDOW_MINUTES = Object.freeze([20, 75]); // the receipt's cadence row (founder term 3)

/** The receipt's shared weekly cap, or null when it has no such row. */
export function weeklyCapOf(receiptText) {
  const m = String(receiptText ?? "").match(/^\|\s*Shared weekly cap\s*\|\s*([\d,]+)\s*credits per week/mi);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

/**
 * ESPN event ids this ledger already holds a successful (200) PREGAME event-odds capture for. capture.mjs books each
 * paid call with purpose "nba props · <espnEventId>" and a pregame fingerprint "nba|<oddsEventId>|…" (early: "nba-early|").
 */
export function capturedEspnIds(ledger) {
  const out = new Set();
  for (const r of ledger?.requests ?? []) {
    const m = /^nba props · (\S+)$/.exec(String(r?.purpose ?? ""));
    if (m && r.status === 200 && /^nba\|/.test(String(r.fingerprint ?? ""))) out.add(m[1]);
  }
  return out;
}

/** Games this tick may price, earliest first. */
export function tickTargets(scheduleRows, nowMs, ledger) {
  const [minLeadMinutes, maxLeadMinutes] = LEAD_WINDOW_MINUTES;
  const done = capturedEspnIds(ledger);
  return captureWindow(scheduleRows, nowMs, { minLeadMinutes, maxLeadMinutes }).filter((r) => !done.has(String(r.providerEventId)));
}

/**
 * Games of the period whose window has passed uncaptured. `periodStartMs`/`periodEndMs` bound the receipt period;
 * `recorded` is the set already written as missed (the runner's private state), so each is recorded once.
 */
export function missedWindows(scheduleRows, nowMs, ledger, { periodStartMs, periodEndMs, recorded = new Set() }) {
  const done = capturedEspnIds(ledger);
  return (scheduleRows ?? [])
    .filter((r) => r?.statusRaw !== "STATUS_POSTPONED" && Number.isFinite(Date.parse(r?.dateUtc)))
    .filter((r) => { const t = Date.parse(r.dateUtc); return t <= nowMs && t > periodStartMs && t <= periodEndMs; })
    .filter((r) => !done.has(String(r.providerEventId)) && !recorded.has(String(r.providerEventId)))
    .map((r) => ({ providerEventId: String(r.providerEventId), tipUtc: r.dateUtc, state: "MISSED_WINDOW", reason: "no successful capture 20–75 min before tip (runner down or asleep); no spend, no retry after tip" }));
}

const num = (v) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * @param p.now, p.receiptText, p.ledger, p.targets (tickTargets), p.markets, p.bookmakers
 * @param p.reply              the free /v4/sports reply: { status, headers: { "x-requests-used", "x-requests-remaining", "x-requests-last" } }
 * @param p.baselineUsed       x-requests-used at the period's first preflight (null on the first tick: this reading becomes it)
 * @param p.minCreditsRemaining ODDS_API_MIN_CREDITS_REMAINING
 */
export function nbaPropsPreflight({ now, receiptText, ledger, targets, markets, bookmakers, reply, baselineUsed = null, minCreditsRemaining }) {
  const reasons = [];
  const refuse = (extra = {}) => ({ version: PREFLIGHT_VERSION, paidCallAllowed: false, reasons, ...extra });
  const auth = parseNbaPropsReceipt(receiptText, { now });
  if (!auth.ok) { reasons.push(...auth.errors.map((e) => `receipt: ${e}`)); return refuse(); }
  if (!Array.isArray(targets) || !targets.length) { reasons.push("NOTHING_TO_PRICE: no game 20–75 min before tip"); return refuse(); }
  const unknown = (markets ?? []).filter((m) => !auth.markets.includes(m));
  if (!markets?.length || unknown.length) { reasons.push(`markets not on the receipt: ${unknown.join(", ") || "(none given)"}`); return refuse(); }
  const plan = planNbaPropCapture({ eventIds: targets.map((t) => t.providerEventId), markets, bookmakers });
  const paid = plan.ok ? plan.calls.filter((c) => c.eventId != null) : [];
  if (!plan.ok || paid.length !== targets.length || !paid.every((c) => Number.isInteger(c.worstCaseCredits) && c.worstCaseCredits > 0)) {
    reasons.push(`COST_UNCERTAIN: ${plan.ok ? "a target has no certain worst case" : plan.reason}`);
    return refuse();
  }
  const worstCase = paid.reduce((a, c) => a + c.worstCaseCredits, 0);
  const cap = weeklyCapOf(receiptText);
  if (!(cap > 0)) { reasons.push("receipt: no 'Shared weekly cap | N credits per week' row"); return refuse({ worstCase }); }
  if (!Number.isInteger(minCreditsRemaining) || minCreditsRemaining < 0) { reasons.push("ODDS_API_MIN_CREDITS_REMAINING is not a non-negative integer"); return refuse({ worstCase }); }
  if (reply?.status !== 200) { reasons.push(`PROVIDER_UNAVAILABLE: plan check returned ${reply?.status ?? "no reply"}`); return refuse({ worstCase, actionable: reply?.status === 401 || reply?.status === 429 }); }
  const used = num(reply.headers?.["x-requests-used"]), remaining = num(reply.headers?.["x-requests-remaining"]), last = num(reply.headers?.["x-requests-last"]);
  if (used == null || remaining == null) { reasons.push("PLAN_UNREADABLE: x-requests-used / x-requests-remaining missing"); return refuse({ worstCase }); }
  if (last !== 0) { reasons.push(`PLAN_CHECK_NOT_FREE: x-requests-last ${last}`); return refuse({ worstCase, actionable: true }); }
  const booked = Number(ledger?.cumulativeCredits ?? 0);
  if (booked + worstCase > auth.ceiling) { reasons.push(`CEILING: ${booked} booked + ${worstCase} worst case > ${auth.ceiling}`); return refuse({ worstCase, budgetExhausted: true }); }
  if (remaining - worstCase < minCreditsRemaining) { reasons.push(`FLOOR: ${remaining} remaining − ${worstCase} < ${minCreditsRemaining}`); return refuse({ worstCase, budgetExhausted: true, actionable: true }); }
  const baseline = baselineUsed ?? used;
  const weekSpend = used - baseline;
  if (weekSpend + worstCase > cap) { reasons.push(`WEEKLY_CAP: ${weekSpend} used since the period baseline + ${worstCase} > ${cap}`); return refuse({ worstCase, budgetExhausted: true, actionable: true }); }
  return { version: PREFLIGHT_VERSION, paidCallAllowed: true, reasons: [], worstCase, ceiling: auth.ceiling, booked, remaining, used, baselineUsed: baseline, weekSpend, weeklyCap: cap, minCreditsRemaining };
}
