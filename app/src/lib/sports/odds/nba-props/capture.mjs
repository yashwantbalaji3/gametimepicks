/**
 * NBA PROP PRICES · THE AUTHORIZED CAPTURE. The network path behind a committed NBA receipt, and nothing without one.
 *
 * No I/O of its own: the caller passes the receipt text, the ledger, the schedule rows, the rosters, `fetchImpl`, the API
 * key and a clock. So every spend rule below is unit-tested with a fake fetch, and the script
 * (scripts/nba/capture-nba-props-odds.mjs) only reads and writes files around it.
 *
 * SPEND DISCIPLINE (the UFC / EPL / NFL pattern, p171-authorization.mjs):
 *   1. The receipt must parse for NBA player props AT `now` (parseNbaPropsReceipt: scope, ceiling, DATED expiry,
 *      do-not-retry, approval line). Every requested market must be on the receipt's own authorization row.
 *   2. Default is a DRY RUN: the plan and its worst case, zero calls. Spending needs `apply: true` and a key.
 *   3. The free /events listing first. Only provider events that join an in-window, not-yet-started ESPN event
 *      (both teams, ±45 min, home/away ALIGNED) are priced. A started game is never priced.
 *   4. Before EACH event-odds call: worst case = unique markets × region-units (credits.mjs). If it could cross the
 *      ceiling, the capture STOPS before the call (CEILING_REACHED); the unpriced events are listed.
 *   5. Each call is recorded in the NBA ledger at the provider's own x-requests-last figure.
 *   6. Authorization failure, rate/credit limit, provider incident or a transport error STOP the run. Nothing is
 *      retried blindly. NO_MARKET (empty data, which costs 0) is evidence and the run continues.
 *   7. A purchase repeated within 30 minutes is skipped (isDuplicateRequest).
 *   8. Every response goes through parseNbaPropResponses: identity, eligible operators, two-way, freshness, before-tip.
 *      The result must not contain the key (assertNoSecretLeak), or it is refused.
 */
import {
  assertCallAllowed, assertNoSecretLeak, classifyProviderResult, emptyLedger, isDuplicateRequest, recordRequest,
} from "../p171-authorization.mjs";
import { joinOddsEventToSchedule } from "../event-join.mjs";
import { canonicalTeamId } from "../../../nba/identity-contract.ts";
import { ELIGIBLE_OPERATOR_KEYS } from "../eligible-operators.mjs";
import { PROVIDER_SPORT_KEY, POINTS_FIRST_SCOPE } from "./contract.mjs";
import { eventOddsWorstCase, parseNbaPropsReceipt, planNbaPropCapture, regionUnits } from "./credits.mjs";
import { parseNbaPropResponses, scheduleJoinRows } from "./parse.mjs";

export const NBA_PROP_CAPTURE_VERSION = "nba-prop-capture@1";
export const CAPTURE_STATE = Object.freeze({
  REFUSED: "REFUSED",
  DRY_RUN: "DRY_RUN",
  CAPTURED: "CAPTURED",
  CEILING_REACHED: "CEILING_REACHED",
  STOPPED: "STOPPED",
  NOTHING_TO_PRICE: "NOTHING_TO_PRICE",
});
const BASE = "https://api.the-odds-api.com/v4";
const STOP_CLASSES = new Set(["AUTHORIZATION_FAILED", "RATE_OR_CREDIT_LIMITED", "PROVIDER_INCIDENT", "QUARANTINED"]);
const teamKey = (n) => canonicalTeamId(String(n ?? "")) ?? "";

const headersOf = (res) => ({
  "x-requests-last": res.headers?.get?.("x-requests-last") ?? null,
  "x-requests-used": res.headers?.get?.("x-requests-used") ?? null,
  "x-requests-remaining": res.headers?.get?.("x-requests-remaining") ?? null,
});

/** In-window ESPN rows: scheduled, tip strictly after `now`, within the lookahead. */
export function captureWindow(scheduleRows, nowMs, lookaheadHours) {
  return (scheduleRows ?? []).filter((r) => {
    const t = Date.parse(r.dateUtc ?? "");
    return r.statusRaw === "STATUS_SCHEDULED" && Number.isFinite(t) && t > nowMs && t - nowMs <= lookaheadHours * 3_600_000;
  });
}

/**
 * @param {object} p
 * @param {string} p.now ISO instant the run is evaluated at
 * @param {string|null} p.receiptText the committed receipt's text (null ⇒ refused)
 * @param {string|null} [p.receiptRel] its repo-relative path, for the ledger
 * @param {object|null} [p.ledger] the NBA authorization ledger, or null for a new one
 * @param {object[]} p.scheduleRows ESPN schedule rows (public/data/nba/schedule/latest.json rows)
 * @param {(eventId: string) => object[]} p.rosterFor
 * @param {string[]} [p.markets] defaults to points first
 * @param {string[]} [p.bookmakers] defaults to the eligible-operator allowlist
 * @param {number} [p.lookaheadHours]
 * @param {boolean} [p.apply] spend only when true
 * @param {string} [p.apiKey]
 * @param {typeof fetch} [p.fetchImpl]
 * @param {() => string} [p.clock] the fetch instant for each response (defaults to the wall clock)
 */
export async function runNbaPropCapture({
  now, receiptText, receiptRel = null, ledger = null, scheduleRows = [], rosterFor = () => [],
  markets = [...POINTS_FIRST_SCOPE], bookmakers = [...ELIGIBLE_OPERATOR_KEYS], lookaheadHours = 30,
  apply = false, apiKey = "", fetchImpl = globalThis.fetch, clock = () => new Date().toISOString(),
}) {
  const nowMs = Date.parse(now ?? "");
  const refused = (reasons) => ({ version: NBA_PROP_CAPTURE_VERSION, state: CAPTURE_STATE.REFUSED, reasons, calls: [], ledger });
  if (!Number.isFinite(nowMs)) return refused(["`now` must be an ISO instant"]);
  if (!receiptText) return refused(["no committed NBA player-prop receipt — authorization is never inferred; zero credits may be spent"]);
  const auth = parseNbaPropsReceipt(receiptText, { now });
  if (!auth.ok) return refused(auth.errors.map((e) => `receipt: ${e}`));
  const outside = [...new Set(markets)].filter((m) => !auth.markets.includes(m));
  if (!markets.length || outside.length) return refused([`markets not on the receipt's authorization row: ${outside.join(", ") || "<none requested>"}`]);
  const authorization = { ok: true, ceiling: auth.ceiling };

  let book = ledger ?? emptyLedger(receiptRel, { sport: "nba", program: "NBA" });
  const window = captureWindow(scheduleRows, nowMs, lookaheadHours);
  const plan = planNbaPropCapture({ eventIds: window.map((r) => r.providerEventId), markets, bookmakers });
  if (!plan.ok) return refused([plan.reason]);
  const base = { version: NBA_PROP_CAPTURE_VERSION, ceiling: auth.ceiling, markets: [...markets], bookmakers: [...bookmakers], regionUnits: regionUnits({ bookmakers }), plan };
  if (!window.length) return { ...base, state: CAPTURE_STATE.NOTHING_TO_PRICE, calls: [], ledger: book, reasons: ["no scheduled NBA game tips inside the window"] };
  if (!apply) return { ...base, state: CAPTURE_STATE.DRY_RUN, calls: [], ledger: book, reasons: ["dry run: nothing was spent"] };
  if (!apiKey) return refused(["no API key in this environment"]);
  if (typeof fetchImpl !== "function") return refused(["no fetch implementation"]);

  const calls = [];
  const responses = [];
  const skipped = [];
  const call = async (url) => {
    try {
      const res = await fetchImpl(`${url}&apiKey=${apiKey}`, { signal: AbortSignal.timeout(25_000), headers: { accept: "application/json" } });
      return { status: res.status, headers: headersOf(res), body: await res.json().catch(() => null) };
    } catch (e) {
      return { status: 0, headers: {}, body: null, transportError: e?.name ?? "Error" };
    }
  };
  const finish = (state, stoppedBecause = null) => {
    const parsed = parseNbaPropResponses(responses, { schedule: scheduleRows, rosterFor, marketKeys: markets });
    const result = { ...base, state, stoppedBecause, calls, skipped, ledger: book, records: parsed.records, coverage: parsed.coverage, refusals: parsed.refusals };
    const leak = assertNoSecretLeak(JSON.stringify(result), [apiKey]);
    return leak.ok ? result : { version: NBA_PROP_CAPTURE_VERSION, state: CAPTURE_STATE.REFUSED, reasons: [leak.reason], calls: calls.map(({ endpoint, status }) => ({ endpoint, status })), ledger: book };
  };

  // 3 · the free listing
  const list = await call(`${BASE}/sports/${PROVIDER_SPORT_KEY}/events?dateFormat=iso`);
  const listClass = list.transportError ? "TRANSPORT_ERROR" : classifyProviderResult({ status: list.status, body: list.body }).class;
  book = recordRequest(book, { at: now, purpose: "nba props · events listing (free)", endpoint: `/sports/${PROVIDER_SPORT_KEY}/events`, status: list.status, headers: list.headers, charged: false, resultClass: listClass });
  calls.push({ endpoint: "events", status: list.status, resultClass: listClass });
  if (listClass !== "OK") return finish(CAPTURE_STATE.STOPPED, `events listing: ${listClass}`);

  const rows = scheduleJoinRows(window);
  const targets = [];
  for (const ev of Array.isArray(list.body) ? list.body : []) {
    const j = joinOddsEventToSchedule({ providerEventId: ev.id, home: ev.home_team, away: ev.away_team, scheduledStartUtc: ev.commence_time }, rows, { normalizeName: teamKey });
    if (j.state !== "JOINED" || j.orientation !== "ALIGNED") { skipped.push({ oddsEventId: ev.id ?? null, reason: j.state === "JOINED" ? "ORIENTATION_SWAPPED" : j.state }); continue; }
    if (!(Date.parse(ev.commence_time) > nowMs)) { skipped.push({ oddsEventId: ev.id, reason: "STARTED" }); continue; }
    targets.push({ oddsEventId: ev.id, espnEventId: j.canonicalEventId });
  }

  // 4–7 · one event-odds call per joined event, each checked before it is made
  const worst = eventOddsWorstCase({ markets, bookmakers });
  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i];
    const allowed = assertCallAllowed({ authorization, ledger: book, worstCaseCredits: worst, purpose: `nba props · ${t.espnEventId}` });
    if (!allowed.ok) {
      skipped.push(...targets.slice(i).map((x) => ({ oddsEventId: x.oddsEventId, espnEventId: x.espnEventId, reason: "CEILING_REACHED" })));
      return finish(CAPTURE_STATE.CEILING_REACHED, allowed.errors.join("; "));
    }
    const fingerprint = `nba|${t.oddsEventId}|${[...markets].sort().join(",")}|${[...bookmakers].sort().join(",")}`;
    if (isDuplicateRequest(book, { fingerprint, nowIso: now, freshnessMinutes: 30 }).duplicate) { skipped.push({ ...t, reason: "DUPLICATE_WITHIN_30_MIN" }); continue; }
    const url = `${BASE}/sports/${PROVIDER_SPORT_KEY}/events/${encodeURIComponent(t.oddsEventId)}/odds?bookmakers=${bookmakers.join(",")}&markets=${markets.join(",")}&oddsFormat=american&dateFormat=iso`;
    const r = await call(url);
    if (r.transportError) {
      /* The request may have reached the provider and been charged before the connection failed. Unaccounted spend is
         the failure mode (the 2026-09-27 Phase H lesson), so it is recorded as charged at the default cost. */
      book = recordRequest(book, {
        at: now, purpose: `nba props · ${t.espnEventId} (transport error)`, endpoint: `/sports/${PROVIDER_SPORT_KEY}/events/{id}/odds`, events: 1,
        markets, regions: null, status: 0, headers: {}, charged: true, fingerprint, resultClass: "TRANSPORT_ERROR",
      });
      calls.push({ endpoint: "event-odds", oddsEventId: t.oddsEventId, status: 0, resultClass: "TRANSPORT_ERROR" });
      return finish(CAPTURE_STATE.STOPPED, `transport error (${r.transportError}) on ${t.oddsEventId}; not retried`);
    }
    const cls = classifyProviderResult({ status: r.status, body: Array.isArray(r.body?.bookmakers) && r.body.bookmakers.length === 0 ? [] : r.body }).class;
    book = recordRequest(book, {
      at: now, purpose: `nba props · ${t.espnEventId}`, endpoint: `/sports/${PROVIDER_SPORT_KEY}/events/{id}/odds`, events: 1,
      markets, regions: null, status: r.status, headers: r.headers, charged: r.status === 200, fingerprint, resultClass: cls,
    });
    calls.push({ endpoint: "event-odds", oddsEventId: t.oddsEventId, espnEventId: t.espnEventId, status: r.status, resultClass: cls, providerLast: r.headers["x-requests-last"] });
    if (STOP_CLASSES.has(cls)) return finish(CAPTURE_STATE.STOPPED, `${cls} on ${t.oddsEventId}`);
    responses.push({ status: r.status, body: r.body, fetchedAt: clock() });
  }
  return finish(CAPTURE_STATE.CAPTURED);
}
