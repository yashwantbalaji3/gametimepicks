/**
 * SMART BETSLIP · "COMPARE SPORTSBOOK ODDS" FOR THE EXACT SAME LEGS. Pure; the caller passes the legs, the price
 * records and the reader's clock.
 *
 * Given a suggested card's legs and normalised price records (lib/sports/odds/nba-props `gtp.nba.prop-price@1`), it
 * answers, per eligible operator: which legs that book prices at the SAME line, which it does not and why, and — only
 * when every leg is matched, fresh, and no correlation rule forbids it — the combined decimal price.
 *
 * RULES (each has a test)
 *   · Same leg means same event id, same athlete id, same family, same side, same line. A book quoting a different
 *     line is LINE_DIFFERS, never "close enough"; its line is shown so the reader can see why.
 *   · Freshness from the record's provider capture time and the reader's clock, with the slip's own bands
 *     (smart-slip.mjs freshnessBand): EXPIRED or UNKNOWN → PRICE_STALE (missing). Prices move; every matched leg
 *     carries its capture time.
 *   · Only eligible operators (eligible-operators.mjs, PR 1130 policy). An ineligible book never appears, even when
 *     its records are passed in.
 *   · Combined price: all legs matched AND no two legs from one game (pricing.mjs sameGameGroups) AND no player in
 *     two legs. Otherwise "Combined price unavailable" with the reason. It is the product of the book's own recorded
 *     single-leg prices — a market fact, not a model estimate, and NOT that book's same-game or parlay price.
 *   · Handoff per operator comes ONLY from the capability matrix (handoff-capability.mjs) — MANUAL_ENTRY today.
 *   · The copyable slip text names event, player, market, line, side, price, book and capture time, and holds no
 *     link: any URL-like token in provider strings is removed before it is printed.
 *
 * CONTRACT FOR CARD PRODUCERS (Parlay Lab tiers, Bank Builder, Moonshot): a leg is comparable when it carries
 *   { sport: "nba", eventId: <ESPN providerEventId>, playerId: <ESPN athlete id>, family | market, side: "over"|"under",
 *     line } plus display fields { game, player, marketLabel }. A leg without these reads LEG_IDENTITY_INCOMPLETE.
 */
import { isEligibleOperator } from "../sports/odds/eligible-operators.mjs";
import { FAMILY_BY_MARKET_KEY, FAMILY_BY_KEY } from "../sports/odds/nba-props/contract.mjs";
import { combinedPrice, sameGameGroups, COMBINED_PRICE_UNAVAILABLE, signedAmerican } from "../parlays/v2/pricing.mjs";
import { freshnessBand, FRESHNESS } from "./smart-slip.mjs";
import { handoffFor } from "./handoff-capability.mjs";
import { BOOK_AVAILABILITY_NOTE } from "../sports/odds/eligible-operators.mjs";

export const ODDS_COMPARISON_VERSION = "smart-slip-odds-comparison@1";

export const MISSING = Object.freeze({
  LEG_IDENTITY_INCOMPLETE: "LEG_IDENTITY_INCOMPLETE",
  NO_PRICE_RECORDED: "NO_PRICE_RECORDED",
  LINE_DIFFERS: "LINE_DIFFERS",
  PRICE_STALE: "PRICE_STALE",
});
export const MISSING_TEXT = Object.freeze({
  LEG_IDENTITY_INCOMPLETE: "This leg is missing the ids needed to match it",
  NO_PRICE_RECORDED: "No recorded price from this sportsbook",
  LINE_DIFFERS: "This sportsbook's line is different",
  PRICE_STALE: "Recorded price is too old to show",
});
export const COMBINED_BLOCK = Object.freeze({
  NOT_ALL_LEGS: "NOT_ALL_LEGS",
  SAME_GAME: "SAME_GAME",
  SAME_PLAYER: "SAME_PLAYER",
  TOO_FEW_LEGS: "TOO_FEW_LEGS",
});
export const COMBINED_BLOCK_TEXT = Object.freeze({
  NOT_ALL_LEGS: "Not every leg is priced here, so there is no combined price.",
  SAME_GAME: "Two legs are from the same game. Their outcomes move together, so no combined price is shown.",
  SAME_PLAYER: "Two legs are about the same player. Their outcomes move together, so no combined price is shown.",
  TOO_FEW_LEGS: "A combined price needs at least two legs.",
});
export const OPERATOR_STATUS = Object.freeze({ ALL_MATCHED: "ALL_MATCHED", PARTIAL: "PARTIAL", NONE: "NONE" });

const norm = (v) => String(v ?? "").trim().toLowerCase();
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function sideOf(leg) {
  const s = norm(leg?.side);
  if (s === "over" || s === "under") return s;
  const m = norm(leg?.selection).match(/\b(over|under)\b/);
  return m ? m[1] : null;
}

/** The comparable identity of a card leg, or null fields where it cannot be read. */
export function legIdentity(leg) {
  const family = leg?.family && FAMILY_BY_KEY[leg.family] ? leg.family : FAMILY_BY_MARKET_KEY[leg?.market]?.family ?? null;
  const playerId = leg?.playerId ?? leg?.providerAthleteId ?? null;
  const id = {
    sport: norm(leg?.sport),
    eventId: leg?.eventId == null ? null : String(leg.eventId),
    playerId: playerId == null ? null : String(playerId),
    family,
    side: sideOf(leg),
    line: isNum(leg?.line) ? leg.line : null,
  };
  id.complete = id.sport === "nba" && !!id.eventId && !!id.playerId && !!id.family && !!id.side && id.line != null;
  return id;
}

const bookTitle = (key, records) => records.find((r) => r.book === key && r.bookTitle)?.bookTitle ?? key;

/**
 * @param {{ legs: any[], priceRecords: any[], nowMs: number, operators?: string[], isEligible?: (k: string) => boolean }} input
 */
export function compareSlipOdds({ legs = [], priceRecords = [], nowMs, operators = null, isEligible = isEligibleOperator } = {}) {
  const ids = legs.map(legIdentity);
  const records = (priceRecords ?? []).filter((r) => r && isEligible(r.book));
  const books = [...new Set([...(operators ?? []), ...records.map((r) => r.book)])].filter((k) => isEligible(k)).sort();

  const sg = sameGameGroups(ids.map((i) => ({ sport: i.sport, eventId: i.eventId })));
  const playerCounts = new Map();
  for (const i of ids) if (i.playerId) playerCounts.set(i.playerId, (playerCounts.get(i.playerId) ?? 0) + 1);
  const samePlayer = [...playerCounts.values()].some((n) => n > 1);
  const correlation = legs.length < 2 ? COMBINED_BLOCK.TOO_FEW_LEGS : sg.sameGame || sg.unknownEvent ? COMBINED_BLOCK.SAME_GAME : samePlayer ? COMBINED_BLOCK.SAME_PLAYER : null;

  const perOperator = books.map((book) => {
    const matched = [];
    const missing = [];
    ids.forEach((id, legIndex) => {
      if (!id.complete) { missing.push({ legIndex, reason: MISSING.LEG_IDENTITY_INCOMPLETE, text: MISSING_TEXT.LEG_IDENTITY_INCOMPLETE }); return; }
      const rows = records.filter((r) => r.book === book && String(r.eventId) === id.eventId && String(r.providerAthleteId) === id.playerId && r.family === id.family);
      if (!rows.length) { missing.push({ legIndex, reason: MISSING.NO_PRICE_RECORDED, text: MISSING_TEXT.NO_PRICE_RECORDED }); return; }
      const atLine = rows.filter((r) => r.line === id.line);
      if (!atLine.length) { missing.push({ legIndex, reason: MISSING.LINE_DIFFERS, text: MISSING_TEXT.LINE_DIFFERS, bookLines: [...new Set(rows.map((r) => r.line))].sort((a, b) => a - b) }); return; }
      const r = atLine.reduce((a, b) => (Date.parse(b.capturedAt) > Date.parse(a.capturedAt) ? b : a));
      const freshness = freshnessBand(r.capturedAt, nowMs);
      if (freshness !== FRESHNESS.FRESH && freshness !== FRESHNESS.AGING) { missing.push({ legIndex, reason: MISSING.PRICE_STALE, text: MISSING_TEXT.PRICE_STALE, capturedAt: r.capturedAt }); return; }
      const price = id.side === "over" ? r.overAmerican : r.underAmerican;
      matched.push({ legIndex, price, priceText: signedAmerican(price), line: r.line, side: id.side, capturedAt: r.capturedAt, freshness, recordId: r.recordId ?? null });
    });
    const status = matched.length === legs.length && legs.length > 0 ? OPERATOR_STATUS.ALL_MATCHED : matched.length ? OPERATOR_STATUS.PARTIAL : OPERATOR_STATUS.NONE;
    const block = status !== OPERATOR_STATUS.ALL_MATCHED ? COMBINED_BLOCK.NOT_ALL_LEGS : correlation;
    const priced = block ? null : combinedPrice(matched.map((m) => ({ price: m.price, sport: ids[m.legIndex].sport, eventId: ids[m.legIndex].eventId })));
    const available = !!priced?.available;
    const caps = matched.map((m) => Date.parse(m.capturedAt));
    return {
      book,
      title: bookTitle(book, records),
      status,
      matched,
      missing,
      combined: {
        available,
        decimal: available ? priced.decimal : null,
        american: available ? priced.american : null,
        text: available ? priced.text : COMBINED_PRICE_UNAVAILABLE,
        blockedBy: available ? null : block ?? COMBINED_BLOCK.NOT_ALL_LEGS,
        blockedText: available ? null : COMBINED_BLOCK_TEXT[block ?? COMBINED_BLOCK.NOT_ALL_LEGS],
        label: available ? "Product of this sportsbook's recorded single-leg prices — not its parlay price" : null,
      },
      oldestCapturedAt: caps.length ? new Date(Math.min(...caps)).toISOString() : null,
      handoff: handoffFor(book),
    };
  });

  const rank = { ALL_MATCHED: 0, PARTIAL: 1, NONE: 2 };
  perOperator.sort((a, b) => rank[a.status] - rank[b.status] || b.matched.length - a.matched.length || a.title.localeCompare(b.title));
  return {
    version: ODDS_COMPARISON_VERSION,
    legs: legs.map((l, i) => ({ legIndex: i, identity: ids[i], game: l?.game ?? l?.eventLabel ?? null, player: l?.player ?? l?.participant ?? null, marketLabel: l?.marketLabel ?? FAMILY_BY_KEY[ids[i].family]?.label ?? l?.market ?? null })),
    correlation: { blockedBy: correlation, text: correlation ? COMBINED_BLOCK_TEXT[correlation] : null },
    operators: perOperator,
    anyPriced: perOperator.some((o) => o.matched.length > 0),
    availabilityNote: BOOK_AVAILABILITY_NOTE,
  };
}

/* ── COPYABLE SLIP TEXT ───────────────────────────────────────────────────────────────────────────────────── */

const URLISH = /\b(?:https?:\/\/|www\.)\S*|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|bet|io|app|us|ag)\b\S*/gi;
/** Strip anything that reads as a link or domain from a provider-supplied string. */
export const stripLinks = (s) => String(s ?? "").replace(URLISH, "").replace(/\s{2,}/g, " ").trim();

const utc = (iso) => {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? `${new Date(t).toISOString().slice(0, 16).replace("T", " ")} UTC` : "time unknown";
};
const sideWord = (s) => (s === "over" ? "Over" : s === "under" ? "Under" : "Side unknown");

/**
 * The leg-by-leg summary for ONE operator, for the reader to copy and enter themselves. No link of any kind.
 * @param {ReturnType<typeof compareSlipOdds>} comparison
 */
export function slipSummaryText(comparison, book) {
  const op = comparison?.operators?.find((o) => o.book === book);
  if (!op) return "";
  const lines = [`Compare slip · ${stripLinks(op.title)} · prices as recorded, not live`];
  for (const leg of comparison.legs) {
    const m = op.matched.find((x) => x.legIndex === leg.legIndex);
    const miss = op.missing.find((x) => x.legIndex === leg.legIndex);
    const id = leg.identity;
    const parts = [
      `${leg.legIndex + 1}. ${stripLinks(leg.game ?? `Event ${id.eventId ?? "unknown"}`)}`,
      stripLinks(leg.player ?? `Player ${id.playerId ?? "unknown"}`),
      stripLinks(leg.marketLabel ?? "Market unknown"),
      `${sideWord(id.side)} ${id.line ?? "?"}`,
      m ? m.priceText : miss?.text ?? MISSING_TEXT.NO_PRICE_RECORDED,
      stripLinks(op.title),
      m ? `recorded ${utc(m.capturedAt)}` : miss?.reason === MISSING.LINE_DIFFERS ? `book line ${miss.bookLines.join(" / ")}` : "not recorded",
    ];
    lines.push(parts.join(" · "));
  }
  lines.push(op.combined.available ? `Combined (product of recorded leg prices): ${op.combined.text}` : `Combined: ${op.combined.text}. ${op.combined.blockedText}`);
  lines.push(`${op.handoff.label}. Check every price at the sportsbook before acting — prices move. Paper-only: nothing here places a wager. ${comparison.availabilityNote}`);
  return lines.join("\n");
}
