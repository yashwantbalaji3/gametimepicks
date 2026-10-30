/**
 * NBA LINE BOARD — the official frozen projections of one slate beside verified sportsbook lines (launch program
 * 2026-10-28, founder P0). Pure and import-light: the lane snapshot (exactly as published) + price records from the
 * existing adapter (lib/sports/odds/nba-props/parse.mjs, `gtp.nba.prop-price@1`, already identity- and freshness-checked)
 * → one row per published player × official family, each with the comparison rule's verdict (line-comparison.mjs).
 *
 * No second prediction engine: the projection is the lane's median, read, never recomputed. One line per player and
 * family: the most recent pre-tip capture across eligible books (chooseOffer), never an average. Coverage is counted so a
 * page or a graphic can say how many players actually have a line instead of implying every player does.
 *
 * DISPLAY: whether any of this may be shown publicly or exported is NOT decided here — see NBA_LINE_DISPLAY (site display
 * authorized by the founder 2026-10-29 after the provider-terms review; the social surface is not).
 */
import { compareToLine, chooseOffer, DIRECTION, MARKET_KEYS, LINE_COMPARISON_RULE } from "./line-comparison.mjs";
import { displayAuthorization, NOT_AUTHORIZED_REASON } from "../../odds/display-authorization.mjs";

/**
 * Derive the display switch from an authorization record (exported so tests can prove the derivation on any record).
 * `public` is the "site" surface, `social` the "social" surface; each is true only when the record authorizes it.
 */
export function nbaLineDisplayFrom(record) {
  const site = displayAuthorization("nba", "site", record), social = displayAuthorization("nba", "social", record);
  return Object.freeze({
    public: site.ok,
    social: social.ok,
    // prices and book names in the public social JSON feed: a separate switch (provider written confirmation)
    socialPrices: displayAuthorization("nba", "socialPrices", record).ok,
    reason: site.ok && social.ok ? null : NOT_AUTHORIZED_REASON.nba,
  });
}

/**
 * THE DISPLAY SWITCH (founder decision D3 / NBA odds rights). Every surface and export reads it. Committed (2026-10-29): site on, social off.
 * `public`  lines, prices, books and differences on site pages;  `social`  side, difference, line and capture time in the
 * social-data feed and graphics;  `socialPrices`  prices and book names in that feed as well.
 * DERIVED — never edited here: it is the committed display authorization record (lib/odds/display-authorization.mjs)
 * read through displayAuthorization, so there is one switch, not two.
 */
export const NBA_LINE_DISPLAY = nbaLineDisplayFrom(undefined);

const COMBO = new Set(["pra", "ptsReb", "ptsAst"]);
const medianOf = (p, family) => (COMBO.has(family) ? p.comboMedians?.[family] : p.medians?.[family]);

/**
 * The ONE pairing of the slate's published players × official families with their chosen offer (chooseOffer: the most
 * recent pre-tip capture, never an average). Shared by the board below and the display adapter
 * (prop-line-adapter.mjs), so the page and the private board can never pick different lines.
 * @param {{ lane: any, priceRecords: any[] }} input
 */
export function nbaLineCandidates({ lane, priceRecords = [] }) {
  const slateDate = lane?.date ?? null;
  const games = lane?.games ?? [];
  const laneEvents = new Set(games.map((g) => String(g.providerEventId)));
  // Price records for THIS slate's events only (a record for another day's event can never reach a comparison).
  const byKey = new Map();
  for (const r of priceRecords ?? []) {
    if (!laneEvents.has(String(r.eventId))) continue;
    const k = `${r.eventId}|${r.providerAthleteId}|${r.family}`;
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  const out = [];
  for (const g of games) {
    const eventId = String(g.providerEventId);
    for (const side of ["away", "home"]) {
      for (const p of g.players?.[side] ?? []) {
        const athleteId = String(p.providerAthleteId);
        for (const family of Object.keys(MARKET_KEYS)) {
          const offers = (byKey.get(`${eventId}|${athleteId}|${family}`) ?? []).map((r) => ({ ...r, line: r.line }));
          const pick = chooseOffer(offers, g.tipUtc);
          const line = pick ? {
            marketKey: pick.providerMarketKey, line: pick.line, overPrice: pick.overAmerican ?? null, underPrice: pick.underAmerican ?? null,
            book: pick.book, capturedAt: pick.capturedAt, eventId, athleteId, slateDate,
          } : null;
          out.push({ eventId, athleteId, name: p.name ?? null, team: g[side]?.abbr ?? null, family, median: medianOf(p, family) ?? null, tipUtc: g.tipUtc, slateDate, booksOffering: new Set(offers.map((o) => o.book)).size, line });
        }
      }
    }
  }
  return out;
}

/**
 * @param {{ lane: any, priceRecords: any[], asOf: string }} input
 */
export function buildNbaLineBoard({ lane, priceRecords = [], asOf }) {
  const slateDate = lane?.date ?? null;
  const games = lane?.games ?? [];
  const rows = nbaLineCandidates({ lane, priceRecords }).map(({ eventId, athleteId, name, team, family, median, tipUtc, booksOffering, line }) => {
    const c = compareToLine({ family, median }, line, { eventId, athleteId, slateDate, tipUtc, asOf });
    return { eventId, athleteId, name, team, family, booksOffering, ...c };
  });
  const compared = rows.filter((r) => r.direction !== DIRECTION.UNAVAILABLE);
  const byReason = {};
  for (const r of rows) if (r.direction === DIRECTION.UNAVAILABLE) byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
  return {
    rule: LINE_COMPARISON_RULE,
    slateDate,
    laneGeneratedAt: lane?.generatedAt ?? null,
    asOf,
    display: NBA_LINE_DISPLAY,
    coverage: {
      playerFamilies: rows.length,
      compared: compared.length,
      above: compared.filter((r) => r.direction === DIRECTION.ABOVE).length,
      below: compared.filter((r) => r.direction === DIRECTION.BELOW).length,
      equal: compared.filter((r) => r.direction === DIRECTION.EQUAL).length,
      unavailableByReason: byReason,
      gamesWithAnyLine: new Set(compared.map((r) => r.eventId)).size,
      games: games.length,
    },
    rows,
  };
}

/** Re-exported for the NBA hub summaries: the hub page and its direct imports stay free of market-vocabulary paths (public-route-inventory). */
export { publicDirectionGate } from "../../odds/display-authorization.mjs";
