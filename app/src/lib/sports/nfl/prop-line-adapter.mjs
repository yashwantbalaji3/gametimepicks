/**
 * NFL ADAPTER for the sport-agnostic player-prop view (lib/odds/prop-line-view.mjs — the contract is documented there).
 * Server-only by convention: nothing "use client" may import this (nfl-prop-lines-switch-off.test.mjs).
 *
 * PROJECTION — the OFFICIAL per-game player board (app/public/data/nfl/player-board/<event>.json), read verbatim, never
 * recomputed: the board's `median` for an over/under family, its `probability` for anytime touchdown. Only a family the
 * board marks PUBLISHED is an official forecast. A family in any other state (ESTIMATE / WITHHELD — week 8: passing and
 * rushing yards) gets projection null and state NOT_PUBLISHED ("Official projection not published"): its figure is never
 * printed beside a line and NEVER produces a direction. A team the board withholds for a family (withheldTeams) is the same.
 *
 * MARKETS (The Odds API player keys → board family → adapter family):
 *   player_receptions     → player_receptions     → receptions      over/under
 *   player_reception_yds  → player_reception_yds  → reception_yds   over/under
 *   player_pass_yds       → player_pass_yds       → pass_yds        over/under (withheld in week 8 → NOT_PUBLISHED)
 *   player_rush_yds       → player_rush_yds       → rush_yds        over/under (withheld in week 8 → NOT_PUBLISHED)
 *   player_anytime_td     → anytime_td            → anytime_td      YES/NO — one price, no line. NEVER an OVER/UNDER badge:
 *                           a matched, fresh, eligible, pre-kickoff quote is state YES_NO ("Not an over/under market") and
 *                           carries the book's Yes price only. Model probability vs the book's implied probability is NOT
 *                           computed or displayed here (out of scope).
 *
 * IDENTITY — exact, never fuzzy: an offer belongs to a row only when its `canonicalEventId` is `nfl-<board event id>` AND
 * its `playerId` equals the board's `playerId` (both minted by the capture's own roster-registry join,
 * scripts/nfl/capture-nfl-odds.mjs; a prop label that did not resolve was quarantined there and never reaches here).
 *
 * REFERENCE-BOOK SELECTION — one rule, shared with NBA: chooseOffer (lib/sports/nba/line-comparison.mjs): the latest
 * capture strictly before kickoff, ties broken by book name; never an average, never the "best" number. Restricted
 * first to the eligible-operators allowlist (lib/sports/odds/eligible-operators.mjs). A book that posted MORE THAN ONE
 * line for the same player and market in the same capture (alternate lines) is ambiguous for that capture and is never
 * picked — we do not guess which is the main line.
 *
 * FRESHNESS (NFL_LINE_MAX_AGE_HOURS = 12) — a line is compared only when captured strictly before kickoff and no more than
 * 12 hours before the comparison instant (min(asOf, kickoff): a started game keeps its pregame comparison as of kickoff).
 * Twelve, not NBA's six: NFL prop markets post days ahead and move slowly between injury reports; the capture cadence is
 * one sweep per kickoff cluster (Thursday night, Sunday early/late, Monday), so 12 h covers "same-day capture" without
 * letting a Thursday line stand for a Sunday game.
 */
import { chooseOffer, DIRECTION, USER_SIDE } from "../nba/line-comparison.mjs";
import { isEligibleOperator } from "../odds/eligible-operators.mjs";
import { bookmakerLabel } from "../../sportsbook-comparison.ts";

export const NFL_LINE_COMPARISON_RULE = "nfl-line-comparison@1";
export const NFL_LINE_MAX_AGE_HOURS = 12;

/** Adapter family → { provider market key, board family key, label, kind }. */
export const NFL_FAMILIES = Object.freeze({
  receptions: Object.freeze({ market: "player_receptions", board: "player_receptions", label: "Receptions", kind: "OU" }),
  reception_yds: Object.freeze({ market: "player_reception_yds", board: "player_reception_yds", label: "Receiving yards", kind: "OU" }),
  pass_yds: Object.freeze({ market: "player_pass_yds", board: "player_pass_yds", label: "Passing yards", kind: "OU" }),
  rush_yds: Object.freeze({ market: "player_rush_yds", board: "player_rush_yds", label: "Rushing yards", kind: "OU" }),
  anytime_td: Object.freeze({ market: "player_anytime_td", board: "anytime_td", label: "Anytime touchdown", kind: "YES_NO" }),
});
export const NFL_FAMILY_BY_MARKET = Object.freeze(Object.fromEntries(Object.entries(NFL_FAMILIES).map(([f, d]) => [d.market, f])));
export const NFL_MARKET_LABEL = Object.freeze(Object.fromEntries(Object.entries(NFL_FAMILIES).map(([f, d]) => [f, d.label])));

/** Every refusal reason → the reader-facing state. */
export const NFL_STATE_OF_REASON = Object.freeze({
  NOT_PUBLISHED: "NOT_PUBLISHED",
  YES_NO_MARKET: "YES_NO",
  NO_PROJECTION: "UNAVAILABLE",
  NO_LINE: "UNAVAILABLE",
  UNMATCHED: "MISMATCH",
  MARKET_MISMATCH: "UNSUPPORTED",
  UNSUPPORTED_MARKET: "UNSUPPORTED",
  STALE: "STALE",
  CAPTURED_AFTER_KICKOFF: "AFTER_CUTOFF",
  INVALID_LINE: "SUSPENDED",
  SUSPENDED: "SUSPENDED",
  INELIGIBLE: "SUSPENDED",
  AMBIGUOUS_LINE: "SUSPENDED",
});

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r1 = (v) => Math.round(v * 10) / 10;
const isAmerican = (v) => isNum(v) && Number.isInteger(v) && Math.abs(v) >= 100;

/**
 * THE NFL comparison rule (nba-line-comparison@1 result shape). Order: official? → projection → line → identity →
 * market → validity → kickoff → freshness → (yes/no: refuse as YES_NO_MARKET | over/under: direction).
 * @param {any} i an adapter input (nflPropLineInputs)
 */
export function nflCompareToLine(i) {
  const fam = NFL_FAMILIES[i?.marketKey];
  const out = (direction, extra = {}) => ({ rule: NFL_LINE_COMPARISON_RULE, family: i?.marketKey ?? null, direction, ...extra });
  const no = (reason) => out(DIRECTION.UNAVAILABLE, { reason });
  if (!fam) return no("UNSUPPORTED_MARKET");
  if (i.familyState !== "PUBLISHED") return no("NOT_PUBLISHED");
  if (!isNum(i.projection)) return no("NO_PROJECTION");
  const o = i.offer;
  if (!o) return no("NO_LINE");
  if (o.suspended === true) return no("SUSPENDED");
  if (o.eligible === false || !isEligibleOperator(o.book)) return no("INELIGIBLE");
  if (o.ambiguous === true) return no("AMBIGUOUS_LINE");
  if (String(o.canonicalEventId) !== `nfl-${i.eventId}` || String(o.playerId) !== String(i.player?.id)) return no("UNMATCHED");
  if (o.market !== fam.market) return no("MARKET_MISMATCH");
  if (fam.kind === "YES_NO" ? !isAmerican(o.price) : !isNum(o.line) || o.line < 0) return no("INVALID_LINE");
  const cap = Date.parse(o.capturedAt), ko = Date.parse(i.tip), asOf = Date.parse(i.asOf);
  if (!Number.isFinite(cap) || !Number.isFinite(ko)) return no("STALE");
  if (cap >= ko) return no("CAPTURED_AFTER_KICKOFF");
  const at = Number.isFinite(asOf) ? Math.min(asOf, ko) : ko;
  if (at - cap > NFL_LINE_MAX_AGE_HOURS * 3600_000 || cap > at) return no("STALE");
  if (fam.kind === "YES_NO") return no("YES_NO_MARKET");
  const differenceExact = i.projection - o.line;
  const direction = differenceExact > 0 ? DIRECTION.ABOVE : differenceExact < 0 ? DIRECTION.BELOW : DIRECTION.EQUAL;
  return out(direction, {
    side: USER_SIDE[direction], median: i.projection, line: o.line, difference: r1(differenceExact), differenceExact,
    overPrice: isNum(o.overPrice) ? o.overPrice : null, underPrice: isNum(o.underPrice) ? o.underPrice : null,
    book: o.book, marketKey: o.market, capturedAt: o.capturedAt,
  });
}

/** Eligible-operator keys the shared label table (sportsbook-comparison.ts) does not name; local so no other surface's
    HTML changes. */
const NFL_BOOK_LABEL = Object.freeze({ betrivers: "BetRivers", williamhill_us: "Caesars", betparx: "betPARX" });

export const NFL_PROP_LINE_ADAPTER = Object.freeze({
  sport: "nfl",
  maxAgeHours: NFL_LINE_MAX_AGE_HOURS,
  marketLabel: (family) => (Object.prototype.hasOwnProperty.call(NFL_FAMILIES, family) ? NFL_MARKET_LABEL[family] : null),
  bookLabel: (book) => NFL_BOOK_LABEL[String(book ?? "").toLowerCase()] ?? bookmakerLabel(book),
  stateOfReason: NFL_STATE_OF_REASON,
  compare: nflCompareToLine,
});

/**
 * Flat offer rows from a private capture (`nfl-odds-capture`, propProbe.lineProps / propProbe.anytimeTd) or from an
 * already-flat array of the same row shape. Each row: { canonicalEventId, playerId, market, book, line?, overPrice?,
 * underPrice?, price?, capturedAt }. Rows are copied field by field (nothing else from the capture travels).
 * @param {any} capture
 */
export function nflOffersFromCapture(capture) {
  if (Array.isArray(capture)) return capture.map((r) => ({ ...r }));
  const p = capture?.propProbe;
  const line = (p?.lineProps?.rows ?? []).map((r) => ({
    canonicalEventId: r.canonicalEventId, playerId: r.playerId, market: r.market, book: r.bookmaker,
    line: r.line, overPrice: r.overPrice ?? null, underPrice: r.underPrice ?? null, capturedAt: r.capturedAt,
  }));
  const atd = (p?.anytimeTd?.rows ?? []).map((r) => ({
    canonicalEventId: r.canonicalEventId, playerId: r.playerId, market: "player_anytime_td", book: r.bookmaker, price: r.price, capturedAt: r.capturedAt,
  }));
  return [...line, ...atd];
}

/**
 * The ONE offer for one (event, player, market) from every capture: eligible books only; a (capture, book) that posted
 * more than one line is ambiguous and skipped; then chooseOffer (latest pre-kickoff, ties by book). When nothing
 * qualifies, the most informative refusal travels instead (so the row says why): a post-kickoff quote (AFTER_CUTOFF),
 * an ambiguous one, or an ineligible one — each marked, never compared.
 * @param {any[]} offers rows for ONE event × player × market
 * @param {string} kickoffUtc
 */
export function nflChooseOffer(offers, kickoffUtc) {
  const all = (offers ?? []).filter((o) => o && Number.isFinite(Date.parse(o.capturedAt)));
  if (!all.length) return null;
  const latest = (xs) => [...xs].sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt) || String(a.book).localeCompare(String(b.book)))[0] ?? null;
  const eligible = all.filter((o) => isEligibleOperator(o.book));
  if (!eligible.length) return { ...latest(all), eligible: false };
  const lines = new Map();
  for (const o of eligible) {
    const k = `${o.capturedAt}|${o.book}`;
    lines.set(k, new Set([...(lines.get(k) ?? []), o.market === "player_anytime_td" ? `p${o.price}` : `l${o.line}`]));
  }
  const clean = eligible.filter((o) => lines.get(`${o.capturedAt}|${o.book}`).size === 1);
  if (!clean.length) return { ...latest(eligible), ambiguous: true };
  // chooseOffer filters on a numeric `line`; a yes/no offer has none, so its validity travels as a 0/null stand-in.
  const shaped = clean.map((o) => ({ book: o.book, capturedAt: o.capturedAt, line: o.market === "player_anytime_td" ? (isAmerican(o.price) ? 0 : null) : o.line, _o: o }));
  const pick = chooseOffer(shaped, kickoffUtc);
  if (pick) return pick._o;
  return latest(clean); // only post-kickoff (or invalid) quotes: the rule reports CAPTURED_AFTER_KICKOFF / INVALID_LINE
}

/**
 * Adapter inputs for one game from its OFFICIAL player board + offer rows.
 * @param {{ board: any, offers: any[], asOf: string, withLineOnly?: boolean, families?: string[] }} input
 *   withLineOnly (default true): only player × family pairs that have an offer (a projection without a line stays
 *   projection-only and is counted in `withoutLine`). families: restrict (e.g. the page passes the PUBLISHED ones).
 * @returns {{ inputs: any[], withoutLine: number, total: number, projections: number, yesNoProjections: number }}
 *   projections = the coverage denominator: every PUBLISHED over/under projection on the board (numeric median), with or
 *   without a line. Anytime-TD projections are counted separately (they can never be "compared").
 */
export function nflPropLineInputs({ board, offers = [], asOf, withLineOnly = true, families = Object.keys(NFL_FAMILIES) }) {
  const eventId = String(board?.providerEventId ?? "");
  const kickoff = board?.kickoffUtc ?? null;
  const byKey = new Map();
  for (const o of offers ?? []) {
    if (String(o?.canonicalEventId) !== `nfl-${eventId}`) continue;
    const k = `${o.playerId}|${o.market}`;
    byKey.set(k, [...(byKey.get(k) ?? []), o]);
  }
  const all = [];
  for (const p of board?.players ?? []) {
    for (const family of families) {
      const d = NFL_FAMILIES[family];
      if (!d) continue;
      const m = p.markets?.[d.board];
      if (!m) continue; // the board does not model this player for this family: not a projection, not a row
      const fstate = board.families?.[d.board]?.state ?? null;
      const teamWithheld = (board.families?.[d.board]?.withheldTeams ?? []).some((w) => w?.team === p.team);
      const published = fstate === "PUBLISHED" && !teamWithheld;
      const raw = d.kind === "YES_NO" ? m.probability : m.median;
      const offer = nflChooseOffer(byKey.get(`${p.playerId}|${d.market}`) ?? [], kickoff);
      all.push({
        key: `${eventId}|${p.playerId}|${family}`, eventId, tip: kickoff, asOf,
        player: { id: p.playerId, name: p.name ?? null, team: p.team ?? null }, marketKey: family,
        familyState: published ? "PUBLISHED" : teamWithheld ? "WITHHELD_TEAM" : fstate ?? "ABSENT",
        // NEVER the unofficial figure: a non-published family's number does not leave the board.
        projection: published && isNum(raw) ? raw : null,
        ...(d.kind === "YES_NO" ? { projectionFormat: "probability" } : {}),
        offer,
      });
    }
  }
  const inputs = all.filter((x) => !withLineOnly || x.offer);
  const pub = (x) => x.familyState === "PUBLISHED" && isNum(x.projection);
  return {
    inputs,
    withoutLine: all.filter((x) => !x.offer && pub(x)).length,
    total: all.length,
    projections: all.filter((x) => pub(x) && NFL_FAMILIES[x.marketKey].kind === "OU").length,
    yesNoProjections: all.filter((x) => pub(x) && NFL_FAMILIES[x.marketKey].kind === "YES_NO").length,
  };
}
