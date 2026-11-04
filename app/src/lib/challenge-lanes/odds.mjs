/**
 * CHALLENGE LANES · REAL PRICES (founder decision 2026-11-04: the existing paid The Odds API subscription prices Bank
 * Builder & Moonshot V2). The network path, behind a committed receipt, and nothing without one.
 *
 * No I/O of its own, like nba-props/capture.mjs: the caller passes the receipt text, the BBM ledger, the candidate
 * legs, `fetchImpl`, the key and a clock, so every spend rule is unit-tested with a fake fetch.
 *
 * ON DEMAND ONLY. One run = the free /events listing (0 credits) + ONE bulk h2h call for exactly the events that hold a
 * candidate leg (`eventIds=`; cost = 1 market × region-units of the nine eligible operators = 1 credit). No poller, no
 * schedule. Before the paid call:
 *   - the receipt parses at `now` (NBA, `basketball_nba`, dated expiry, do-not-retry, approval) and names `h2h`;
 *   - BBM day (ET) spend + worst case ≤ the receipt's daily ceiling; BBM cumulative + worst case ≤ its weekly ceiling;
 *   - provider usage since the receipt's shared baseline + worst case ≤ the shared weekly ceiling (all jobs);
 *   - the provider balance − worst case ≥ the credit floor; an unreadable balance stops before any paid call.
 * Any failure stops; nothing is retried blindly; a transport error is booked as charged. The key is never in a result.
 * Prices leave this module only as a PRIVATE snapshot (caller writes it under GTP_PRIVATE_DATA_DIR); the ledger keeps
 * credits and status only.
 *
 * PROP LEGS are not captured here: no lane can hold one until the frozen file carries an approved prop probability
 * (METHODOLOGY_DEPENDENCIES nba-player-prop-probability). A prop leg in a request is refused (PROP_CAPTURE_NOT_APPROVED).
 */
import { assertNoSecretLeak, classifyProviderResult, emptyLedger, expiryTerm, parseSportAuthorizationReceipt, recordRequest } from "../sports/odds/p171-authorization.mjs";
import { joinOddsEventToSchedule } from "../sports/odds/event-join.mjs";
import { canonicalTeamId } from "../nba/identity-contract.ts";
import { ELIGIBLE_OPERATOR_KEYS } from "../sports/odds/eligible-operators.mjs";
import { regionUnits } from "../sports/odds/nba-props/credits.mjs";
import { etDateOf } from "../sports/nba/finals-record.mjs";
import { canonical, sha256 } from "./chain.mjs";

export const BBM_ODDS_VERSION = "bbm-odds@1";
export const BBM_LEDGER_RELPATH = "data/internal/research/odds/nba/bbm-ledger.json";
export const PROVIDER = "the-odds-api";
const BASE = "https://api.the-odds-api.com/v4";
const SPORT = "basketball_nba";
const teamKey = (n) => canonicalTeamId(String(n ?? "")) ?? "";
const num = (v) => { if (v == null || String(v).trim() === "") return null; const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };

/** The BBM receipt: the shared NBA terms plus its own daily / weekly / shared-weekly ceilings and baseline. */
export function parseBbmOddsReceipt(markdown, { now = null } = {}) {
  const text = String(markdown ?? "").replace(/^>\s?/gm, "");
  const errors = [];
  const shared = parseSportAuthorizationReceipt(text, "nba", { now });
  if (!shared.ok) errors.push(...shared.errors);
  if (!/Bank Builder (?:&|and) Moonshot/i.test(text)) errors.push("scope: the receipt must name Bank Builder & Moonshot");
  const marketsRow = text.match(/^Markets authorized:(.+)$/mi);
  const markets = marketsRow ? [...marketsRow[1].matchAll(/`([a-z0-9_]+)`/g)].map((m) => m[1]) : [];
  if (!markets.includes("h2h")) errors.push("markets: no `h2h` on a 'Markets authorized:' line");
  const grab = (re) => { const m = text.match(re); return m ? num(m[1]) : null; };
  const daily = grab(/BBM daily ceiling[^0-9]*?([\d,]+)\s*credits/i);
  const weekly = grab(/BBM weekly ceiling[^0-9]*?([\d,]+)\s*credits/i);
  const sharedWeekly = grab(/Shared weekly ceiling[^0-9]*?([\d,]+)\s*credits/i);
  const base = text.match(/Shared weekly baseline[^0-9]*?([\d,]+)\s*used at\s*(\d{4}-\d{2}-\d{2}T[\d:]+Z)/i);
  const floor = grab(/Credit floor[^0-9]*?([\d,]+)/i);
  if (!(daily > 0)) errors.push("ceiling: no 'BBM daily ceiling: N credits' line");
  if (!(weekly > 0)) errors.push("ceiling: no 'BBM weekly ceiling: N credits' line");
  if (!(sharedWeekly > 0)) errors.push("ceiling: no 'Shared weekly ceiling: N credits' line");
  if (!base) errors.push("ceiling: no 'Shared weekly baseline: N used at <ISO>' line");
  if (!(typeof floor === "number" && floor >= 0)) errors.push("floor: no 'Credit floor: N' line");
  if (!/Approved by:\s*\S+.*\b\d{4}-\d{2}-\d{2}\b/i.test(text)) errors.push("approval: no 'Approved by: <name> <YYYY-MM-DD>' line");
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };
  return { ok: true, markets, ceiling: shared.ceiling, daily, weekly, sharedWeekly, baseline: { used: num(base[1]), at: base[2] }, floor, expiry: expiryTerm(text) };
}

/** Credits this BBM ledger has spent on one ET day. */
export const spentOnEtDay = (ledger, day) => (ledger?.requests ?? []).filter((r) => etDateOf(r.at) === day).reduce((s, r) => s + (r.creditsUsed ?? 0), 0);

/** Worst case and the checks for one bulk h2h call over `eventCount` events. */
export function planBbmCapture({ eventCount, bookmakers = ELIGIBLE_OPERATOR_KEYS }) {
  const units = regionUnits({ bookmakers: [...bookmakers] });
  return { calls: [{ endpoint: `/v4/sports/${SPORT}/events`, credits: 0 }, ...(eventCount ? [{ endpoint: `/v4/sports/${SPORT}/odds?markets=h2h&eventIds=…`, events: eventCount, credits: units }] : [])], worstCaseCredits: eventCount ? units : 0, regionUnits: units, bookmakers: [...bookmakers] };
}

/** Why a paid call of `worst` credits may not be made now, or null. */
export function spendRefusal({ auth, ledger, worst, now, providerUsed, providerRemaining }) {
  const day = etDateOf(now);
  if (spentOnEtDay(ledger, day) + worst > auth.daily) return `BBM_DAILY_CEILING: ${spentOnEtDay(ledger, day)} + ${worst} > ${auth.daily} on ${day}`;
  if ((ledger?.cumulativeCredits ?? 0) + worst > Math.min(auth.weekly, auth.ceiling)) return `BBM_WEEKLY_CEILING: ${ledger?.cumulativeCredits ?? 0} + ${worst} > ${Math.min(auth.weekly, auth.ceiling)}`;
  if (providerUsed == null || providerRemaining == null) return "PROVIDER_BALANCE_UNREADABLE: the provider's usage headers could not be read; no paid call made";
  if (providerUsed - auth.baseline.used + worst > auth.sharedWeekly) return `SHARED_WEEKLY_CEILING: ${providerUsed - auth.baseline.used} used since ${auth.baseline.at} + ${worst} > ${auth.sharedWeekly}`;
  if (providerRemaining - worst < auth.floor) return `CREDIT_FLOOR: ${providerRemaining} − ${worst} < ${auth.floor}`;
  return null;
}

const headersOf = (res) => ({ "x-requests-last": res.headers?.get?.("x-requests-last") ?? null, "x-requests-used": res.headers?.get?.("x-requests-used") ?? null, "x-requests-remaining": res.headers?.get?.("x-requests-remaining") ?? null });

/**
 * @param {object} p
 * @param {string} p.now
 * @param {string|null} p.receiptText
 * @param {string|null} [p.receiptRel]
 * @param {object|null} [p.ledger]  the BBM ledger
 * @param {Array<{ gameId: string, home: string, away: string, startUtc: string, market: string }>} p.legs  candidate legs
 * @param {boolean} [p.apply]
 * @param {string} [p.apiKey]
 * @param {typeof fetch} [p.fetchImpl]
 * @param {() => string} [p.clock]
 */
export async function captureBbmPrices({ now, receiptText, receiptRel = null, ledger = null, legs = [], apply = false, apiKey = "", fetchImpl = globalThis.fetch, clock = () => new Date().toISOString(), bookmakers = ELIGIBLE_OPERATOR_KEYS }) {
  const nowMs = Date.parse(now ?? "");
  const refused = (reasons) => ({ version: BBM_ODDS_VERSION, state: "REFUSED", reasons, calls: [], ledger });
  if (!Number.isFinite(nowMs)) return refused(["`now` must be an ISO instant"]);
  if (!receiptText) return refused(["no committed BBM odds receipt; zero credits may be spent"]);
  const auth = parseBbmOddsReceipt(receiptText, { now });
  if (!auth.ok) return refused(auth.errors.map((e) => `receipt: ${e}`));
  const props = legs.filter((l) => l.market !== "winner");
  if (props.length) return refused([`PROP_CAPTURE_NOT_APPROVED: ${props.length} prop leg(s); no lane holds a prop until an official prop probability is approved`]);
  const started = legs.filter((l) => !(Date.parse(l.startUtc) > nowMs));
  if (started.length) return refused([`STARTED: ${started.map((l) => l.gameId).join(", ")} already tipped; a started game is never priced`]);
  const games = [...new Map(legs.map((l) => [l.gameId, l])).values()].sort((a, b) => a.startUtc.localeCompare(b.startUtc) || a.gameId.localeCompare(b.gameId));
  const plan = planBbmCapture({ eventCount: games.length, bookmakers });
  let book = ledger ?? { ...emptyLedger(receiptRel, { sport: "nba", program: "BBM" }), artifact: "nba-bbm-odds-ledger" };
  const base = { version: BBM_ODDS_VERSION, plan, ceilings: { daily: auth.daily, weekly: auth.weekly, sharedWeekly: auth.sharedWeekly, floor: auth.floor }, spentToday: spentOnEtDay(book, etDateOf(now)), cumulative: book.cumulativeCredits ?? 0 };
  if (!games.length) return { ...base, state: "NOTHING_TO_PRICE", calls: [], ledger: book };
  if (!apply) return { ...base, state: "DRY_RUN", calls: [], ledger: book, reasons: ["dry run: nothing was spent"] };
  if (!apiKey) return refused(["no API key in this environment"]);

  const calls = [];
  const call = async (url) => {
    try { const res = await fetchImpl(`${url}&apiKey=${apiKey}`, { signal: AbortSignal.timeout(25_000), headers: { accept: "application/json" } }); return { status: res.status, headers: headersOf(res), body: await res.json().catch(() => null) }; }
    catch (e) { return { status: 0, headers: {}, body: null, transportError: e?.name ?? "Error" }; }
  };
  const finish = (state, extra = {}) => {
    const result = { ...base, state, calls, ledger: book, ...extra };
    const leak = assertNoSecretLeak(JSON.stringify(result), [apiKey]);
    return leak.ok ? result : { version: BBM_ODDS_VERSION, state: "REFUSED", reasons: [leak.reason], calls: calls.map(({ endpoint, status }) => ({ endpoint, status })), ledger: book };
  };

  const list = await call(`${BASE}/sports/${SPORT}/events?dateFormat=iso`);
  const listClass = list.transportError ? "TRANSPORT_ERROR" : classifyProviderResult({ status: list.status, body: list.body }).class;
  book = recordRequest(book, { at: now, purpose: "bbm · events listing (free)", endpoint: `/sports/${SPORT}/events`, status: list.status, headers: list.headers, charged: false, resultClass: listClass });
  calls.push({ endpoint: "events", status: list.status, resultClass: listClass });
  if (listClass !== "OK") return finish("STOPPED", { stoppedBecause: `events listing: ${listClass}` });

  const rows = games.map((g) => ({ canonicalEventId: g.gameId, home: g.home, away: g.away, startTimeUtc: g.startUtc }));
  const joined = new Map(); const unjoined = [];
  for (const ev of Array.isArray(list.body) ? list.body : []) {
    const j = joinOddsEventToSchedule({ providerEventId: ev.id, home: ev.home_team, away: ev.away_team, scheduledStartUtc: ev.commence_time }, rows, { normalizeName: teamKey });
    if (j.state === "JOINED" && j.orientation === "ALIGNED") joined.set(String(j.canonicalEventId), { oddsEventId: ev.id, home_team: ev.home_team, away_team: ev.away_team, commence_time: ev.commence_time });
  }
  for (const g of games) if (!joined.has(g.gameId)) unjoined.push(g.gameId);
  if (!joined.size) return finish("STOPPED", { stoppedBecause: `NO_EVENT_JOINED: ${unjoined.join(", ")}`, unjoined });

  const worst = planBbmCapture({ eventCount: joined.size, bookmakers }).worstCaseCredits;
  const why = spendRefusal({ auth, ledger: book, worst, now, providerUsed: num(list.headers["x-requests-used"]), providerRemaining: num(list.headers["x-requests-remaining"]) });
  if (why) return finish("CEILING_REACHED", { stoppedBecause: why, unjoined });

  const ids = [...joined.values()].map((x) => x.oddsEventId);
  const r = await call(`${BASE}/sports/${SPORT}/odds?bookmakers=${[...bookmakers].join(",")}&markets=h2h&oddsFormat=american&dateFormat=iso&eventIds=${ids.map(encodeURIComponent).join(",")}`);
  const fetchedAt = clock();
  if (r.transportError) {
    book = recordRequest(book, { at: now, purpose: "bbm · h2h (transport error)", endpoint: `/sports/${SPORT}/odds`, events: ids.length, markets: ["h2h"], status: 0, headers: {}, charged: true, resultClass: "TRANSPORT_ERROR" });
    calls.push({ endpoint: "odds", status: 0, resultClass: "TRANSPORT_ERROR" });
    return finish("STOPPED", { stoppedBecause: `transport error (${r.transportError}); not retried`, unjoined });
  }
  const cls = classifyProviderResult({ status: r.status, body: r.body }).class;
  book = recordRequest(book, { at: now, purpose: "bbm · h2h", endpoint: `/sports/${SPORT}/odds`, events: ids.length, markets: ["h2h"], status: r.status, headers: r.headers, charged: r.status === 200, resultClass: cls });
  calls.push({ endpoint: "odds", events: ids.length, status: r.status, resultClass: cls, providerLast: r.headers["x-requests-last"] });
  if (cls !== "OK" && cls !== "NO_MARKET") return finish("STOPPED", { stoppedBecause: `${cls} on the h2h call`, unjoined });
  const snapshot = snapshotOf({ body: r.body, joined, fetchedAt, bookmakers });
  return finish("CAPTURED", { snapshot, unjoined });
}

/** The PRIVATE price snapshot: per ESPN game, per eligible book, the h2h prices by side. Content-addressed. */
export function snapshotOf({ body, joined, fetchedAt, bookmakers = ELIGIBLE_OPERATOR_KEYS }) {
  const byOdds = new Map([...joined.entries()].map(([gameId, j]) => [String(j.oddsEventId), { gameId, ...j }]));
  const games = {};
  for (const ev of Array.isArray(body) ? body : []) {
    const j = byOdds.get(String(ev.id));
    if (!j) continue;
    const books = {};
    for (const bk of ev.bookmakers ?? []) {
      if (!bookmakers.includes(bk.key)) continue;
      const m = (bk.markets ?? []).find((x) => x.key === "h2h");
      const home = m?.outcomes?.find((o) => o.name === ev.home_team);
      const away = m?.outcomes?.find((o) => o.name === ev.away_team);
      if (!Number.isInteger(home?.price) || !Number.isInteger(away?.price)) continue;
      books[bk.key] = { home: { name: home.name, price: home.price }, away: { name: away.name, price: away.price }, lastUpdate: m.last_update ?? bk.last_update ?? null };
    }
    games[j.gameId] = { oddsEventId: String(ev.id), homeTeam: ev.home_team, awayTeam: ev.away_team, commenceTime: ev.commence_time, books };
  }
  const doc = { schema: "gtp.bbm.price-snapshot@1", dataClass: "PRIVATE_PRICES", provider: PROVIDER, market: "h2h", fetchedAt, games };
  return { ...doc, snapshotSha256: sha256(canonical(doc)) };
}

/**
 * The PRICE_VERIFIED payload for one frozen card from one snapshot. EXACT match: the card's game must be the joined
 * event, the market h2h, the outcome the selected side's team; ALL legs from ONE book, the first eligible operator (in
 * the allowlist's fixed order) that prices every leg — never the best price shopped across books.
 * @returns {{ ok: true, price } | { ok: false, refusals: string[] }}
 */
export function priceForCard(card, snapshot, { bookmakers = ELIGIBLE_OPERATOR_KEYS } = {}) {
  const refusals = [];
  if (snapshot?.schema !== "gtp.bbm.price-snapshot@1" || snapshot.snapshotSha256 !== sha256(canonical((({ snapshotSha256: _s, ...r }) => r)(snapshot)))) return { ok: false, refusals: ["SNAPSHOT_UNVERIFIED"] };
  for (const l of card.legs) {
    if (l.market !== "winner") refusals.push(`PROP_CAPTURE_NOT_APPROVED ${l.legId}`);
    const g = snapshot.games[l.gameId];
    if (!g) { refusals.push(`NO_PRICE_FOR_GAME ${l.gameId}`); continue; }
    const [away, home] = String(l.eventLabel).split(" @ ");
    if (teamKey(g.homeTeam) !== teamKey(home) || teamKey(g.awayTeam) !== teamKey(away)) refusals.push(`EVENT_MISMATCH ${l.gameId}`);
  }
  if (refusals.length) return { ok: false, refusals };
  const book = bookmakers.find((b) => card.legs.every((l) => snapshot.games[l.gameId].books[b]?.[l.selection.code]));
  if (!book) return { ok: false, refusals: ["NO_SINGLE_BOOK_PRICES_EVERY_LEG"] };
  return {
    ok: true,
    price: {
      legs: card.legs.map((l) => {
        const g = snapshot.games[l.gameId]; const o = g.books[book][l.selection.code];
        return { legId: l.legId, selectionCode: l.selection.code, provider: PROVIDER, book, market: "h2h", oddsFormat: "american", price: o.price, outcomeName: o.name, line: null, providerEventId: g.oddsEventId, eventId: l.gameId, playerId: null, fetchedAt: snapshot.fetchedAt, bookLastUpdate: g.books[book].lastUpdate };
      }),
      parlay: { method: "LEG_PRODUCT", provider: PROVIDER, book, fetchedAt: snapshot.fetchedAt },
      priceSnapshotSha256: snapshot.snapshotSha256,
    },
  };
}
