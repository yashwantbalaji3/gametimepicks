/**
 * NBA PROP PRICES · THE ADAPTER — The Odds API event-odds responses → normalised two-way price records. Pure: the
 * caller passes the responses, the ESPN schedule rows, the event rosters and the fetch instant; nothing here reads a
 * file, the network, or the clock.
 *
 * INPUT SHAPE (documented: GET /v4/sports/basketball_nba/events/{eventId}/odds, PROVIDER_DOCS.eventOdds):
 *   { id, sport_key, sport_title, commence_time, home_team, away_team,
 *     bookmakers: [ { key, title, last_update, markets: [ { key, last_update, outcomes: [ { name, description, price, point } ] } ] } ] }
 *   For player props `name` is "Over" / "Under", `description` is the player, `point` the line; `price` is American
 *   when the request sets oddsFormat=american (the plan always does — a decimal-looking price refuses, never converts).
 *
 * WHAT IS REFUSED (every refusal lands in `refusals` with its level and reason — population-exact accounting):
 *   response   non-200 / empty / unparseable (classifyProviderResult, p171-authorization.mjs) → PROVIDER_FAILURE;
 *              wrong sport_key; missing id / teams / commence_time.
 *   event      joined to ESPN by BOTH teams (canonicalTeamId) + start within ±45 min (event-join.mjs). Unmatched,
 *              ambiguous, home/away swapped, or a provider id that previously joined another event → refused.
 *   book       not on the eligible-operator allowlist (eligible-operators.mjs, PR 1130 policy) → refused, by key.
 *   market     not in the requested scope; or a family no official model covers (rebAst) → refused.
 *   player     unresolved or ambiguous identity (player-identity.mjs).
 *   outcome    not exactly one Over and one Under at one point (ONE_SIDED / NOT_TWO_WAY / MULTIPLE_MAIN_LINES);
 *              a non-American price; an implied pair outside (1, 1.25] (snapshot-contract noVigTwoWay);
 *              no provider timestamp; last_update after the fetch (+60 s), older than 12 h at fetch, or at/after tip.
 *   duplicate  the same (event, athlete, family, book) seen twice: identical numbers fold into one record
 *              (DUPLICATE_IDENTICAL, counted); different numbers refuse BOTH (DUPLICATE_CONFLICT).
 */
import { canonicalTeamId } from "../../../nba/identity-contract.ts";
import { joinOddsEventToSchedule } from "../event-join.mjs";
import { noVigTwoWay } from "../snapshot-contract.mjs";
import { classifyProviderResult } from "../p171-authorization.mjs";
import { isEligibleOperator } from "../eligible-operators.mjs";
import { resolvePlayer, REVIEWED_PLAYER_ALIASES } from "./player-identity.mjs";
import {
  NBA_PROPS_CONTRACT_VERSION, PRICE_RECORD_SCHEMA, PROVIDER, PROVIDER_SPORT_KEY, FAMILY_BY_MARKET_KEY, NBA_PROP_FAMILIES,
  REFUSAL, DUPLICATE_IDENTICAL, MAX_PRICE_AGE_MS, FUTURE_SKEW_MS, COVERAGE_STATE, MIN_BOOKS_FOR_COVERAGE,
} from "./contract.mjs";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const teamKey = (n) => canonicalTeamId(String(n ?? "")) ?? "";

function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/** Identity used for duplicate detection: one price per (event, athlete, family, book). */
export const priceIdentityKey = (r) => [r.eventId, r.providerAthleteId, r.family, r.book].join("|");
const valuesKey = (r) => [r.line, r.overAmerican, r.underAmerican].join("|");

/** ESPN schedule rows (public/data/nba/schedule/*.json `rows`) → the event-join row shape. */
export function scheduleJoinRows(scheduleRows) {
  return (scheduleRows ?? []).map((r) => ({
    canonicalEventId: String(r.providerEventId),
    home: r.home?.abbr ?? r.home?.name ?? "",
    away: r.away?.abbr ?? r.away?.name ?? "",
    startTimeUtc: r.dateUtc,
  }));
}

/** An American price: an integer at or beyond ±100. Anything else (decimal 1.91, 0, 99) is a format refusal. */
const isAmerican = (p) => Number.isInteger(p) && Math.abs(p) >= 100;

/**
 * @param {Array<{ status: number, body: any, fetchedAt: string }>} responses  one per event-odds call
 * @param {{ schedule: any[], rosterFor: (eventId: string) => Array<{providerAthleteId: string, displayName: string, team?: string}>,
 *           marketKeys?: string[], isEligibleBook?: (key: string) => boolean, aliases?: any[], lineage?: Record<string,string>,
 *           maxPriceAgeMs?: number }} ctx
 */
export function parseNbaPropResponses(responses, ctx) {
  const {
    schedule = [], rosterFor = () => [], marketKeys = NBA_PROP_FAMILIES.map((f) => f.marketKey),
    isEligibleBook = isEligibleOperator, aliases = REVIEWED_PLAYER_ALIASES, maxPriceAgeMs = MAX_PRICE_AGE_MS,
  } = ctx ?? {};
  const scope = new Set(marketKeys);
  const joinRows = scheduleJoinRows(schedule);
  const startByEvent = new Map(joinRows.map((r) => [r.canonicalEventId, Date.parse(r.startTimeUtc)]));
  const lineage = { ...(ctx?.lineage ?? {}) };

  const refusals = [];
  const refuse = (level, reason, ids, detail = null) => refusals.push({ level, reason, ...ids, detail });
  const candidates = [];
  const respStats = { input: (responses ?? []).length, ok: 0, failed: [] };
  const eventStats = { input: 0, matched: [], refused: [] };
  const booksSeen = new Set();
  const playerSeen = new Set();
  const playerMatched = new Set();
  const playerRefused = [];

  for (const resp of responses ?? []) {
    const cls = classifyProviderResult({ status: resp?.status, body: resp?.body });
    if (cls.class !== "OK") {
      respStats.failed.push({ status: resp?.status ?? null, class: cls.class });
      refuse("response", REFUSAL.PROVIDER_FAILURE, { status: resp?.status ?? null }, cls.class);
      continue;
    }
    const ev = resp.body;
    const fetchedMs = Date.parse(resp.fetchedAt ?? "");
    if (!ev || typeof ev !== "object" || Array.isArray(ev) || !ev.id || !ev.home_team || !ev.away_team || !Number.isFinite(Date.parse(ev.commence_time ?? "")) || !Array.isArray(ev.bookmakers) || !Number.isFinite(fetchedMs)) {
      respStats.failed.push({ status: resp.status, class: REFUSAL.RESPONSE_SHAPE_INVALID });
      refuse("response", REFUSAL.RESPONSE_SHAPE_INVALID, { oddsEventId: ev?.id ?? null }, "missing id / teams / commence_time / bookmakers[] / fetchedAt");
      continue;
    }
    respStats.ok += 1;
    if (ev.sport_key !== PROVIDER_SPORT_KEY) { refuse("response", REFUSAL.WRONG_SPORT, { oddsEventId: ev.id }, String(ev.sport_key)); continue; }

    eventStats.input += 1;
    const join = joinOddsEventToSchedule(
      { providerEventId: ev.id, home: ev.home_team, away: ev.away_team, scheduledStartUtc: ev.commence_time },
      joinRows, { normalizeName: teamKey, lineage },
    );
    const evReason = join.state === "UNMATCHED" ? REFUSAL.EVENT_UNMATCHED
      : join.state === "AMBIGUOUS" ? REFUSAL.EVENT_AMBIGUOUS
      : join.state === "LINEAGE_VIOLATION" ? REFUSAL.EVENT_LINEAGE_VIOLATION
      : join.orientation === "SWAPPED" ? REFUSAL.EVENT_ORIENTATION_SWAPPED : null;
    if (evReason) {
      eventStats.refused.push({ oddsEventId: ev.id, reason: evReason });
      refuse("event", evReason, { oddsEventId: ev.id }, join.reason ?? "provider home/away reversed against ESPN — corner-sensitive, refused");
      continue;
    }
    lineage[ev.id] = join.canonicalEventId;
    const eventId = join.canonicalEventId;
    if (!eventStats.matched.includes(eventId)) eventStats.matched.push(eventId);
    const startMs = startByEvent.get(eventId);
    const roster = rosterFor(eventId) ?? [];

    for (const bk of ev.bookmakers) {
      const book = String(bk?.key ?? "");
      booksSeen.add(book);
      if (!isEligibleBook(book)) { refuse("book", REFUSAL.BOOK_NOT_ELIGIBLE, { oddsEventId: ev.id, eventId, book }); continue; }
      for (const mk of bk.markets ?? []) {
        const marketKey = String(mk?.key ?? "");
        const fam = FAMILY_BY_MARKET_KEY[marketKey];
        if (!scope.has(marketKey) || !fam) { refuse("market", REFUSAL.MARKET_NOT_IN_SCOPE, { eventId, book, marketKey }); continue; }
        if (!fam.modelled) { refuse("market", REFUSAL.FAMILY_NOT_MODELLED, { eventId, book, marketKey }, `${fam.family} has no official model`); continue; }
        const stamp = mk.last_update ?? bk.last_update ?? null;

        // Group outcomes by player (provider description).
        const byPlayer = new Map();
        for (const o of mk.outcomes ?? []) {
          const who = String(o?.description ?? "").trim();
          byPlayer.set(who, [...(byPlayer.get(who) ?? []), o]);
        }
        for (const [providerName, outs] of byPlayer) {
          const ids = { eventId, book, marketKey, providerName };
          const pk = `${eventId}|${providerName}`;
          playerSeen.add(pk);
          const who = resolvePlayer(providerName, roster, { aliases });
          if (who.state !== "RESOLVED") {
            playerRefused.push({ eventId, providerName, reason: who.reason });
            refuse("player", who.reason, ids, who.detail);
            continue;
          }
          playerMatched.add(pk);
          const names = outs.map((o) => String(o?.name ?? ""));
          if (names.some((n) => n !== "Over" && n !== "Under")) { refuse("outcome", REFUSAL.NOT_TWO_WAY, ids, `outcome names ${JSON.stringify([...new Set(names)])}`); continue; }
          const points = [...new Set(outs.map((o) => o.point))];
          if (points.some((p) => !isNum(p))) { refuse("outcome", REFUSAL.NO_LINE, ids); continue; }
          if (points.length > 1) { refuse("outcome", REFUSAL.MULTIPLE_MAIN_LINES, ids, `points ${points.join(", ")}`); continue; }
          const overs = outs.filter((o) => o.name === "Over");
          const unders = outs.filter((o) => o.name === "Under");
          if (!overs.length || !unders.length) { refuse("outcome", REFUSAL.ONE_SIDED, ids, overs.length ? "no Under" : "no Over"); continue; }
          if (new Set(overs.map((o) => o.price)).size > 1 || new Set(unders.map((o) => o.price)).size > 1) {
            refuse("outcome", REFUSAL.DUPLICATE_CONFLICT, ids, "two prices for one side inside one market"); continue;
          }
          const over = overs[0].price; const under = unders[0].price;
          if (!isAmerican(over) || !isAmerican(under)) { refuse("outcome", REFUSAL.PRICE_FORMAT, ids, `expected American prices, got ${over} / ${under}`); continue; }
          if (!noVigTwoWay([{ name: "over", price: over }, { name: "under", price: under }]).ok) { refuse("outcome", REFUSAL.PRICE_IMPLAUSIBLE, ids, `${over} / ${under}`); continue; }
          const capMs = Date.parse(stamp ?? "");
          if (!Number.isFinite(capMs)) { refuse("outcome", REFUSAL.NO_PROVIDER_TIMESTAMP, ids); continue; }
          if (capMs > fetchedMs + FUTURE_SKEW_MS) { refuse("outcome", REFUSAL.PRICE_FROM_FUTURE, ids, `${stamp} after fetch ${resp.fetchedAt}`); continue; }
          if (fetchedMs - capMs > maxPriceAgeMs) { refuse("outcome", REFUSAL.PRICE_STALE, ids, `last_update ${stamp} older than ${maxPriceAgeMs / 3_600_000} h at fetch`); continue; }
          if (Number.isFinite(startMs) && capMs >= startMs) { refuse("outcome", REFUSAL.PRICE_AFTER_START, ids, `${stamp} at/after tip`); continue; }

          const rec = {
            schema: PRICE_RECORD_SCHEMA,
            provider: PROVIDER,
            eventId,
            providerEventId: String(ev.id),
            providerAthleteId: who.providerAthleteId,
            identityMethod: who.method,
            playerName: providerName,
            team: who.team,
            family: fam.family,
            providerMarketKey: marketKey,
            line: points[0],
            book,
            bookTitle: bk.title ?? null,
            overAmerican: over,
            underAmerican: under,
            capturedAt: new Date(capMs).toISOString(),
            fetchedAt: new Date(fetchedMs).toISOString(),
            raw: { oddsEventId: String(ev.id), bookmakerKey: book, marketKey, description: providerName, commenceTime: ev.commence_time },
          };
          rec.recordId = `npp_${fnv([priceIdentityKey(rec), valuesKey(rec), rec.capturedAt].join("~"))}`;
          candidates.push(rec);
        }
      }
    }
  }

  // Duplicates: identical numbers fold; a conflict refuses every copy.
  const byIdentity = new Map();
  for (const r of candidates) byIdentity.set(priceIdentityKey(r), [...(byIdentity.get(priceIdentityKey(r)) ?? []), r]);
  const records = [];
  const duplicates = [];
  for (const [key, group] of byIdentity) {
    if (group.length === 1) { records.push(group[0]); continue; }
    if (new Set(group.map(valuesKey)).size === 1) {
      // Keep the most recent provider timestamp (ties: the first seen) — same numbers, so nothing is re-priced.
      const keep = group.reduce((a, b) => (Date.parse(b.capturedAt) > Date.parse(a.capturedAt) ? b : a));
      records.push(keep);
      duplicates.push({ key, kind: DUPLICATE_IDENTICAL, copies: group.length, kept: keep.recordId });
    } else {
      duplicates.push({ key, kind: REFUSAL.DUPLICATE_CONFLICT, copies: group.length });
      refuse("duplicate", REFUSAL.DUPLICATE_CONFLICT, { identity: key }, `${group.length} copies disagree: ${group.map(valuesKey).join(" vs ")}`);
    }
  }
  records.sort((a, b) => priceIdentityKey(a).localeCompare(priceIdentityKey(b)));

  return {
    version: NBA_PROPS_CONTRACT_VERSION,
    records,
    refusals,
    duplicates,
    lineage,
    coverage: coverageReport({ respStats, eventStats, booksSeen, records, refusals, duplicates, playerSeen, playerMatched, playerRefused }),
  };
}

function coverageReport({ respStats, eventStats, booksSeen, records, refusals, duplicates, playerSeen, playerMatched, playerRefused }) {
  const booksWithRecords = [...new Set(records.map((r) => r.book))].sort();
  const refusedBooks = [...new Set(refusals.filter((r) => r.reason === REFUSAL.BOOK_NOT_ELIGIBLE).map((r) => r.book))].sort();
  const families = {};
  for (const r of records) {
    const f = (families[r.family] ??= { records: 0, books: [], players: [] });
    f.records += 1;
    if (!f.books.includes(r.book)) f.books.push(r.book);
    if (!f.players.includes(r.providerAthleteId)) f.players.push(r.providerAthleteId);
  }
  for (const f of Object.values(families)) { f.books.sort(); f.players = f.players.length; }
  const refusalsByReason = {};
  for (const r of refusals) refusalsByReason[r.reason] = (refusalsByReason[r.reason] ?? 0) + 1;

  const state = respStats.input === 0 ? COVERAGE_STATE.NO_RESPONSES
    : respStats.ok === 0 ? COVERAGE_STATE.PROVIDER_FAILURE
    : booksWithRecords.length < MIN_BOOKS_FOR_COVERAGE ? COVERAGE_STATE.INSUFFICIENT_COVERAGE
    : COVERAGE_STATE.OK;
  return {
    state,
    stateReason: state === COVERAGE_STATE.INSUFFICIENT_COVERAGE
      ? `${booksWithRecords.length} eligible book(s) with a usable price; a comparison needs at least ${MIN_BOOKS_FOR_COVERAGE}`
      : state === COVERAGE_STATE.PROVIDER_FAILURE ? "every provider response failed — last-known-good stands, nothing is overwritten"
      : state === COVERAGE_STATE.NO_RESPONSES ? "no provider response was supplied (dry run or no authorized capture)" : null,
    responses: respStats,
    events: { input: eventStats.input, matched: eventStats.matched.length, matchedEventIds: [...eventStats.matched].sort(), refused: eventStats.refused },
    books: { seen: [...booksSeen].sort(), withRecords: booksWithRecords, refusedNotEligible: refusedBooks },
    players: { seen: playerSeen.size, matched: playerMatched.size, refused: playerRefused },
    families,
    records: records.length,
    duplicatesFolded: duplicates.filter((d) => d.kind === DUPLICATE_IDENTICAL).length,
    duplicateConflicts: duplicates.filter((d) => d.kind === REFUSAL.DUPLICATE_CONFLICT).length,
    refusalsByReason,
  };
}
