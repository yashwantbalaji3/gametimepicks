/**
 * SMART BETSLIP · COMPARE-ONLY MVP (SB-L0, milestone M5). Pure functions; the React surface owns the clock and storage.
 *
 * A browser-local list of legs carrying the price each was RECORDED at — sport, event, selection, line, book,
 * price, capture time — plus the pricing snapshot the set was verified against. It places nothing, links to no
 * sportsbook (the Terms say the Site does not link to or partner with any sportsbook), and transmits nothing.
 *
 * RULES (each has a test)
 *   · Storage key `gtp.slip.v2`. The existing paper slip (`gtp.slip.v1`, lib/slip/slip-store.ts) is never read,
 *     written or migrated by this module; both coexist.
 *   · A slip prefilled from a card carries that card's `pricingSnapshotId`. ANY add / remove / reorder clears it, so
 *     the slip reads PRICE_CHANGED_REVERIFY until a fresh verified snapshot is taken. The snapshot id is derived from
 *     the ordered legs, so a stored slip whose legs no longer hash to its id is also PRICE_CHANGED_REVERIFY.
 *   · Freshness per leg from its capture time: FRESH ≤ 15 min · AGING ≤ 6 h · EXPIRED > 6 h. An EXPIRED or
 *     undated price is hidden and reads "Price not verified"; so is any price whose book is not a verified operator
 *     (./../parlays/v2/operators.mjs — fails closed until PR #1130), and the book name is hidden with it.
 *   · Same-game legs are detected; the combined price is then "Combined price unavailable".
 *   · No outbound links. Handoff status is the constant HANDOFF_NOT_AVAILABLE.
 */
import { isVerifiedOperator as seamPredicate, BOOK_AVAILABILITY_NOTE } from "../parlays/v2/operators.mjs";
import { combinedPrice, sameGameGroups, signedAmerican, COMBINED_PRICE_UNAVAILABLE } from "../parlays/v2/pricing.mjs";

export const SMART_SLIP_STORAGE_KEY = "gtp.slip.v2";
export const SMART_SLIP_VERSION = 2;
export const SMART_SLIP_MAX_LEGS = 12;

export const FRESHNESS = Object.freeze({ FRESH: "FRESH", AGING: "AGING", EXPIRED: "EXPIRED", UNKNOWN: "UNKNOWN" });
export const FRESH_MAX_MS = 15 * 60 * 1000;
export const AGING_MAX_MS = 6 * 60 * 60 * 1000;

export const SLIP_STATE = Object.freeze({
  EMPTY: "EMPTY",
  PRICED_AS_RECORDED: "PRICED_AS_RECORDED",
  PRICE_NOT_VERIFIED: "PRICE_NOT_VERIFIED",
  PRICE_CHANGED_REVERIFY: "PRICE_CHANGED_REVERIFY",
});
export const SLIP_STATE_TEXT = Object.freeze({
  EMPTY: "Your slip is empty. Open a card to compare its prices here.",
  PRICED_AS_RECORDED: "Every leg shows the price it was recorded at. Prices move; check the sportsbook before acting.",
  PRICE_NOT_VERIFIED: "One or more prices cannot be verified, so they are hidden.",
  PRICE_CHANGED_REVERIFY: "You changed the slip, so its recorded prices no longer describe it. Re-verify before comparing.",
});

export const PRICE_NOT_VERIFIED = "Price not verified";
export const HANDOFF_NOT_AVAILABLE = "HANDOFF_NOT_AVAILABLE";
export const HANDOFF_LABEL = "Sportsbook handoff not available";
export const HANDOFF_ROADMAP_NOTE = "SB-L2 verified operator prefill — requires operator docs, book IDs, legal/Terms review";

const norm = (v) => String(v ?? "").trim().toLowerCase();
/** Identity of a Smart Betslip leg: sport | event | market | selection | line. */
export const smartLegKey = (l) => [norm(l?.sport), norm(l?.eventId), norm(l?.market), norm(l?.selection), l?.line == null ? "" : String(l.line)].join("|");

/** FNV-1a 32-bit, hex — deterministic and dependency-free; an id, not a security boundary. */
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/** The pricing snapshot id of an ORDERED set of legs (identity + book + price + capture time). */
export function snapshotIdFor(legs) {
  if (!legs?.length) return null;
  return `ps_${fnv(legs.map((l) => [smartLegKey(l), norm(l.book), l.price ?? "", l.capturedAt ?? ""].join("~")).join("^"))}`;
}

const toLeg = (l) => ({
  key: smartLegKey(l),
  eventId: l?.eventId == null ? null : String(l.eventId),
  sport: norm(l?.sport),
  game: l?.game ?? l?.eventLabel ?? null,
  market: l?.market ?? null,
  selection: l?.selection ?? null,
  line: typeof l?.line === "number" && Number.isFinite(l.line) ? l.line : null,
  book: l?.book ?? null,
  price: typeof l?.price === "number" && Number.isFinite(l.price) ? l.price : null,
  capturedAt: l?.capturedAt ?? null,
});

export const emptySlip = () => ({ version: SMART_SLIP_VERSION, legs: [], pricingSnapshotId: null, sourceCardId: null, invalidatedBy: null });

/** Prefill from a qualified card view (recommend.mjs). The snapshot is the card's own recorded prices. */
export function slipFromCard(card) {
  const legs = dedupe((card?.legs ?? []).map(toLeg)).slice(0, SMART_SLIP_MAX_LEGS);
  return { version: SMART_SLIP_VERSION, legs, pricingSnapshotId: snapshotIdFor(legs), sourceCardId: card?.cardId ?? null, invalidatedBy: null };
}

function dedupe(legs) {
  const seen = new Set();
  return legs.filter((l) => (seen.has(l.key) ? false : (seen.add(l.key), true)));
}

const invalidate = (slip, legs, by) => ({ ...slip, legs, pricingSnapshotId: null, invalidatedBy: by });

export function addLeg(slip, leg) {
  const l = toLeg(leg);
  if (slip.legs.some((x) => x.key === l.key) || slip.legs.length >= SMART_SLIP_MAX_LEGS) return slip;
  return invalidate(slip, [...slip.legs, l], "add");
}

export function removeLeg(slip, key) {
  if (!slip.legs.some((x) => x.key === key)) return slip;
  return invalidate(slip, slip.legs.filter((x) => x.key !== key), "remove");
}

/** Move one leg from index `from` to index `to` (clamped). A no-op move changes nothing. */
export function reorderLeg(slip, from, to) {
  const n = slip.legs.length;
  const t = Math.max(0, Math.min(n - 1, to));
  if (from < 0 || from >= n || from === t) return slip;
  const legs = [...slip.legs];
  const [m] = legs.splice(from, 1);
  legs.splice(t, 0, m);
  return invalidate(slip, legs, "reorder");
}

/** FRESH / AGING / EXPIRED from capture time; an unreadable time (or one in the future) is UNKNOWN. */
export function freshnessBand(capturedAt, nowMs) {
  const t = Date.parse(capturedAt ?? "");
  if (!Number.isFinite(t) || !Number.isFinite(nowMs) || t > nowMs + 60_000) return FRESHNESS.UNKNOWN;
  const age = nowMs - t;
  return age <= FRESH_MAX_MS ? FRESHNESS.FRESH : age <= AGING_MAX_MS ? FRESHNESS.AGING : FRESHNESS.EXPIRED;
}

const FRESH_TEXT = { FRESH: "Recorded within 15 minutes", AGING: "Recorded within 6 hours", EXPIRED: "Recorded more than 6 hours ago", UNKNOWN: "Recording time unknown" };

/** What one leg may show. A hidden price hides its book too. */
export function legView(leg, { nowMs, isVerifiedOperator = seamPredicate }) {
  const freshness = freshnessBand(leg.capturedAt, nowMs);
  const operatorOk = isVerifiedOperator(leg.book);
  const priceVisible = operatorOk && leg.price != null && (freshness === FRESHNESS.FRESH || freshness === FRESHNESS.AGING);
  return {
    key: leg.key, sport: leg.sport, game: leg.game, selection: leg.selection, line: leg.line,
    freshness, freshnessText: FRESH_TEXT[freshness],
    priceVisible,
    priceText: priceVisible ? signedAmerican(leg.price) : PRICE_NOT_VERIFIED,
    bookText: priceVisible ? leg.book : null,
    hiddenBecause: priceVisible ? null : !operatorOk ? "operator" : leg.price == null ? "price" : "freshness",
  };
}

/** The whole slip as the surface renders it. */
export function slipView(slip, { nowMs, isVerifiedOperator = seamPredicate }) {
  const legs = slip?.legs ?? [];
  const views = legs.map((l) => legView(l, { nowMs, isVerifiedOperator }));
  const sg = sameGameGroups(legs);
  const snapshotCurrent = slip?.pricingSnapshotId != null && slip.pricingSnapshotId === snapshotIdFor(legs);
  const allVisible = views.every((v) => v.priceVisible);
  const state = !legs.length ? SLIP_STATE.EMPTY
    : !snapshotCurrent ? SLIP_STATE.PRICE_CHANGED_REVERIFY
    : !allVisible ? SLIP_STATE.PRICE_NOT_VERIFIED
    : SLIP_STATE.PRICED_AS_RECORDED;
  const priced = state === SLIP_STATE.PRICED_AS_RECORDED ? combinedPrice(legs) : null;
  return {
    state, stateText: SLIP_STATE_TEXT[state],
    legs: views,
    sameGame: sg.sameGame,
    sameGameNote: sg.sameGame ? "Some legs are from the same game. Their outcomes move together, so no combined price is shown." : null,
    combinedPriceText: priced?.available ? priced.text : COMBINED_PRICE_UNAVAILABLE,
    combinedAmerican: priced?.available ? priced.american : null,
    marketImpliedProbability: priced?.available ? priced.marketImpliedProbability : null,
    handoff: { status: HANDOFF_NOT_AVAILABLE, label: HANDOFF_LABEL, roadmap: HANDOFF_ROADMAP_NOTE },
    availabilityNote: BOOK_AVAILABILITY_NOTE,
  };
}

/* ── STORAGE (the caller passes `window.localStorage`; every access is guarded) ─────────────────────────────── */

/** Parse a stored v2 slip; anything malformed is an empty slip, never a throw. */
export function parseSlip(raw) {
  try {
    const d = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!d || d.version !== SMART_SLIP_VERSION || !Array.isArray(d.legs)) return emptySlip();
    const legs = dedupe(d.legs.map(toLeg)).slice(0, SMART_SLIP_MAX_LEGS);
    return { version: SMART_SLIP_VERSION, legs, pricingSnapshotId: typeof d.pricingSnapshotId === "string" ? d.pricingSnapshotId : null, sourceCardId: d.sourceCardId ?? null, invalidatedBy: d.invalidatedBy ?? null };
  } catch { return emptySlip(); }
}

export const serializeSlip = (slip) => JSON.stringify(slip);

export function readSlip(storage) {
  try { return parseSlip(storage?.getItem(SMART_SLIP_STORAGE_KEY) ?? null); } catch { return emptySlip(); }
}

export function writeSlip(storage, slip) {
  try { storage?.setItem(SMART_SLIP_STORAGE_KEY, serializeSlip(slip)); return true; } catch { return false; }
}
