/**
 * UFC CARD POST RULES. PURE: no I/O, no clock. Reads the official pregame card through buildPredictionBoard, so the fighter,
 * the forecast and the prelims/main split are the site's own. A bout with no forecast stays on the card with a null pick; a
 * forecast is never made up. A price needs one provider event naming BOTH fighters, from the card spelling or an alias the
 * committed odds artifact already recorded for that bout. Anything else is a neutral row, listed as unmatched.
 */
import { buildPredictionBoard } from "../sports/ufc/prediction-board.mjs";
import { REFERENCE_BOOK_ORDER } from "../sports/nba/line-comparison.mjs";
import { etDate, instant } from "./social-package.mjs";

export const UFC_MAX_IMAGES = 1;
export const UFC_MARKET = "h2h";
export const UFC_LINE_MAX_AGE_HOURS = 6;
export const SEGMENT_TYPE = Object.freeze({ "Prelims": "UFC_PRELIMS", "Main card": "UFC_MAIN_CARD" });

export const foldName = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
const pairKey = (a, b) => [foldName(a), foldName(b)].sort().join("|");
const validPrice = (p) => Number.isInteger(p) && Math.abs(p) >= 100;

/** Exactly one provider event on the card's ET date for both fighters. */
export function matchBout(row, events, { date, aliasJoins = [] }) {
  const names = pairKey(row.red.name, row.blue.name);
  const alias = aliasJoins.find((a) => String(a.boutId) === row.boutId)?.providerKey ?? null;
  const today = events.filter((e) => etDate(instant(e.commence_time)) === date);
  const exact = today.filter((e) => pairKey(e.home_team, e.away_team) === names);
  const hits = exact.length ? exact : today.filter((e) => alias && pairKey(e.home_team, e.away_team) === alias);
  if (hits.length !== 1) return { event: null, method: null, reason: hits.length ? "MORE_THAN_ONE_PROVIDER_EVENT" : "NO_PROVIDER_EVENT" };
  return { event: hits[0], method: exact.length ? "NAMES" : "RECORDED_ALIAS", reason: null };
}

/** First reference book with a clean two-fighter quote, DraftKings first; the pick's own price; null when there is none. */
export function pickQuote(event, pickName, { fetchedAt, startMs, asOf }) {
  if (!(Date.parse(fetchedAt) <= Date.parse(asOf)) || !(Date.parse(fetchedAt) < startMs)) return null;
  const home = foldName(event.home_team); const away = foldName(event.away_team); const pick = foldName(pickName);
  const side = pick === home ? event.home_team : pick === away ? event.away_team : null;
  // A recorded alias spells the pick differently: the pick is then found by surname inside this already-matched event.
  const last = pick.split(" ").at(-1);
  const bySurname = [event.home_team, event.away_team].filter((n) => foldName(n).split(" ").at(-1) === last);
  const pickSide = side ?? (bySurname.length === 1 ? bySurname[0] : null);
  if (!pickSide) return null;
  for (const key of REFERENCE_BOOK_ORDER) {
    const m = event.bookmakers?.find((b) => b.key === key)?.markets?.find((x) => x.key === UFC_MARKET);
    const out = m?.outcomes ?? [];
    const of = (n) => out.filter((o) => o.name === n);
    if (out.length !== 2 || of(event.home_team).length !== 1 || of(event.away_team).length !== 1 || !out.every((o) => validPrice(o.price)) || !m.last_update) continue;
    return { price: of(pickSide)[0].price, book: key, quotedAt: m.last_update };
  }
  return null;
}

const surname = (n) => foldName(n).split(" ").at(-1);
/**
 * Second reading of a price against the raw capture, independent of the quote pick: the same event, both fighters by surname,
 * the forecast winner's own outcome in that book, the same signed number. Returns what was read, or the reason it was refused.
 */
export function verifyBoutPrice(bout, rawEvents) {
  const hits = rawEvents.filter((e) => e.id === bout.providerEventId);
  if (hits.length !== 1) return { ok: false, reason: "EVENT_NOT_UNIQUE" };
  const [e] = hits;
  const opponent = bout.pick === bout.fighterA ? bout.fighterB : bout.fighterA;
  const sides = [e.home_team, e.away_team];
  const find = (name) => { const exact = sides.filter((n) => foldName(n) === foldName(name)); return exact.length === 1 ? exact : sides.filter((n) => surname(n) === surname(name)); };
  const [win, opp] = [find(bout.pick), find(opponent)];
  if (win.length !== 1 || opp.length !== 1 || win[0] === opp[0]) return { ok: false, reason: "FIGHTER_IDENTITY" };
  const m = e.bookmakers?.filter((b) => b.key === bout.book).flatMap((b) => b.markets ?? []).filter((x) => x.key === UFC_MARKET) ?? [];
  const of = (n) => m[0]?.outcomes?.filter((o) => o.name === n) ?? [];
  if (m.length !== 1 || of(win[0]).length !== 1 || of(opp[0]).length !== 1) return { ok: false, reason: "OUTCOME_NOT_UNIQUE" };
  if (of(win[0])[0].price !== bout.price) return { ok: false, reason: "PRICE_DIFFERS" };
  return { ok: true, reason: null, providerFighter: win[0], providerOpponent: opp[0], opponentPrice: of(opp[0])[0].price };
}

const NO_PRICE = { price: null, book: null, quotedAt: null };
/** Every bout of the card, in card order, with its forecast and price. */
/** Documented spelling aliases: same opponent, same event date, only provider event naming that opponent (2026-10-31). */
export const UFC_DOCUMENTED_ALIASES = Object.freeze([{ boutId: "401928109", providerKey: pairKey("Jeongyoung Lee", "Julian Erosa") }]);

export function ufcBouts({ card, odds, asOf, aliasJoins: joins0 = [] }) {
  const aliasJoins = [...joins0, ...UFC_DOCUMENTED_ALIASES];
  const date = card.event.slateDate;
  return buildPredictionBoard(card).rows.map((r) => {
    const hit = matchBout(r, odds.events, { date, aliasJoins });
    const startMs = instant(r.startUtc);
    const quote = hit.event && r.pick ? pickQuote(hit.event, r.pick.name, { fetchedAt: odds.fetchedAt, startMs, asOf }) : null;
    const source = card.bouts[r.index];
    const priceCheck = quote ? verifyBoutPrice({ providerEventId: hit.event.id, fighterA: r.red.name, fighterB: r.blue.name, pick: r.pick.name, book: quote.book, price: quote.price }, odds.events) : null;
    const q = priceCheck?.ok ? quote : null;
    return {
      boutId: r.boutId, eventId: String(card.event.providerEventId), fighterA: r.red.name, fighterB: r.blue.name, pick: r.pick?.name ?? null, probability: r.pick?.probability ?? null, ...(q ?? NO_PRICE),
      weightClass: r.weightClass, scheduledRounds: r.scheduledRounds, segment: r.segment, startUtc: r.startUtc, position: r.position, basis: source.prediction?.basis ?? null,
      providerEventId: hit.event?.id ?? null, providerCommenceUtc: hit.event?.commence_time ?? null, matchMethod: hit.method,
      unmatchedReason: hit.reason, noForecastReason: r.pick ? null : r.unmodelledReason,
      priceCheck, noPriceReason: q ? null : !r.pick ? "NO_FORECAST" : quote ? priceCheck.reason : hit.reason ?? "NO_CLEAN_QUOTE",
    };
  });
}

/** Instant the post must be gone by: the first start, any bout the provider opens earlier, or the oldest quote's age limit. */
export function ufcClose(bouts) {
  const quotes = bouts.filter((b) => b.quotedAt).map((b) => Date.parse(b.quotedAt) + UFC_LINE_MAX_AGE_HOURS * 3600000);
  const starts = bouts.flatMap((b) => [instant(b.startUtc), b.price != null ? instant(b.providerCommenceUtc) : Infinity]);
  return Math.min(...starts, ...quotes);
}

/** Bouts the provider times before the repo's section start: the repo section stands, the difference is flagged for review. */
export function sectionFlags(bouts, segment) {
  return bouts.filter((b) => b.providerCommenceUtc && instant(b.providerCommenceUtc) < instant(b.startUtc)).map((b) => ({ boutId: b.boutId, fighterA: b.fighterA, fighterB: b.fighterB, repoSegment: segment, repoStartUtc: b.startUtc, providerCommenceUtc: b.providerCommenceUtc }));
}
export const pctText = (p) => `${Math.round(p * 100)}%`;
export const priceText = (p) => (p > 0 ? `+${p}` : String(p));
/** One image per section: every bout with a forecast, once. A bout with no forecast is not shown. */
export function ufcPages(bouts) {
  const shown = bouts.filter((b) => b.pick);
  if (new Set(shown.map((b) => b.boutId)).size !== shown.length) throw new Error("a bout appears twice");
  return shown.length ? [shown] : [];
}
const blocks = (...b) => b.join("\n\n");
/** Digits only from the claims it is passed; no percentages, as every pregame caption. Ends on the hashtag. */
export function ufcCaption({ type, headline, modelled, startText }) {
  return type === "UFC_MAIN_CARD"
    ? blocks("🥊 UFC FIGHT NIGHT!", `${headline} headlines the main card at ${startText}.`, `Our model's forecast on ${modelled} main card bouts below 👇`, "#UFC")
    : blocks("🥊 Fight night starts early!", `UFC prelims from ${startText} before ${headline}.`, `Our model's forecast on ${modelled} bouts below 👇`, "#UFC");
}
