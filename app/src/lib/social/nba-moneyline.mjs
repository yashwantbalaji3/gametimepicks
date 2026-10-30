/**
 * OBSERVED NBA GAME PRICES for the private review cards. PURE: no I/O, no clock, no network. Joins one saved capture to the
 * canonical schedule by team names and reads the American price of the model's predicted team from one book. Nothing is
 * inferred: a game with no clean quote has no price. The price never enters a model number, and no gap to the estimate is
 * computed. Provider start times run minutes after ours, so the start only confirms the join (a guard, never displayed).
 */
import { LINE_MAX_AGE_HOURS, REFERENCE_BOOK_ORDER } from "../sports/nba/line-comparison.mjs";
import { etDate, instant } from "./social-package.mjs";

export const MONEYLINE_MARKET = "h2h";
export const MAX_START_DELTA_MINUTES = 20;
export const BOOK_RULE = "first book in REFERENCE_BOOK_ORDER with a clean quote for both teams in this capture";
/** Provider name → canonical schedule name, exact strings only. */
export const PROVIDER_TEAM_NAME = Object.freeze({ "Los Angeles Clippers": "LA Clippers" });
const canonical = (n) => PROVIDER_TEAM_NAME[n] ?? n;
const validPrice = (p) => Number.isInteger(p) && Math.abs(p) >= 100;
export const americanText = (p) => (p > 0 ? `+${p}` : String(p));

/**
 * @param {{ games: Array<{eventId:string, awayName:string, homeName:string, tipUtc:string}>, events: Array<any>, date: string }} o
 * @returns {{ matched: Map<string, {event:any, startDeltaMinutes:number}>, unmatched: Array<{eventId:string, reason:string}>, ignored: Array<{id:string, commence:string}>, unused: Array<string> }}
 */
export function matchMoneylineEvents({ games, events, date }) {
  const today = []; const ignored = [];
  for (const e of events) (etDate(instant(e.commence_time)) === date ? today : ignored).push(e);
  const matched = new Map(); const unmatched = []; const used = new Set();
  for (const g of games) {
    const same = today.filter((e) => canonical(e.away_team) === g.awayName && canonical(e.home_team) === g.homeName);
    if (same.length !== 1) { unmatched.push({ eventId: g.eventId, reason: same.length ? "MORE_THAN_ONE_PROVIDER_EVENT" : "NO_PROVIDER_EVENT" }); continue; }
    const delta = Math.round((instant(same[0].commence_time) - instant(g.tipUtc)) / 60000);
    if (Math.abs(delta) > MAX_START_DELTA_MINUTES) { unmatched.push({ eventId: g.eventId, reason: `START_DIFFERS_${delta}_MINUTES` }); continue; }
    matched.set(g.eventId, { event: same[0], startDeltaMinutes: delta }); used.add(same[0]);
  }
  return { matched, unmatched, ignored: ignored.map((e) => ({ id: e.id, commence: e.commence_time })), unused: today.filter((e) => !used.has(e)).map((e) => `${e.away_team} @ ${e.home_team}`) };
}

/**
 * One book's price for `sideName`, or null. A book counts only with exactly the two teams, valid prices and its own quote time.
 * @param {any} event
 * @param {{ awayName:string, homeName:string, sideName:string, fetchedAt:string, tipUtc:string, asOf:string }} o
 */
export function observedPrice(event, { awayName, homeName, sideName, fetchedAt, tipUtc, asOf }) {
  const tip = instant(tipUtc); const asOfMs = Date.parse(asOf);
  if (!(Date.parse(fetchedAt) <= asOfMs) || !(Date.parse(fetchedAt) < tip)) return null;
  for (const book of REFERENCE_BOOK_ORDER) {
    const b = event.bookmakers?.find((x) => x.key === book);
    const m = b?.markets?.find((x) => x.key === MONEYLINE_MARKET);
    const out = m?.outcomes ?? [];
    const of = (n) => out.filter((o) => canonical(o.name) === n);
    if (out.length !== 2 || of(awayName).length !== 1 || of(homeName).length !== 1 || !validPrice(of(awayName)[0].price) || !validPrice(of(homeName)[0].price)) continue;
    const quotedAt = m.last_update;
    const q = Date.parse(quotedAt);
    if (!Number.isFinite(q) || q > Date.parse(fetchedAt) || q >= tip || asOfMs - q > LINE_MAX_AGE_HOURS * 3600000) continue;
    return { book, price: of(sideName)[0].price, quotedAt };
  }
  return null;
}
