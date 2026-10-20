/**
 * NBA × CROSS-SPORT HANDLING — INERT, PURE. The small rules an NBA leg needs to sit on a card beside MLB / NFL / UFC /
 * EPL legs, and the field mapping into PR #1141's `gtp.parlay.candidate@1` input shape. Design and activation order:
 * docs/nba/NBA_PRODUCT_INTEGRATION_PLAN_2026-10-21.md.
 *
 *   WINDOWS     An NBA leg locks at tip − the one 30-minute activation cutoff (LEG_BOUNDS.activationCutoffMs), exactly
 *               like an NFL kickoff or an MLB first pitch. A card may be activated only before its EARLIEST leg lock.
 *   EXPIRY      A leg's price expires at min(capturedAt + 12 h, eventLockAt). A card expires at its earliest leg expiry.
 *   PRODUCT DAY Legs belong to the ET calendar date of their start (a 00:30Z tip is the previous ET evening's slate),
 *               the same rule build-product-eligible-legs applies. A card never mixes product days.
 *   SAME GAME   D5: one leg per event. Two NBA props in one game (even different players, or PTS + PRA of one player)
 *               never share a card — no validated same-game joint price exists.
 *   DUPLICATES  The same market (event, athlete, family, line, side) quoted by two books is ONE market. Leans that
 *               disagree across books refuse the market; when they agree, one representative is kept by a rule that
 *               never reads the price: newest capture, then book key ascending. Every alternate is recorded.
 *
 * Nothing here imports #1141 (it is not on this branch). PARLAY_CANDIDATE_V1_INPUT_FIELDS records the fields #1141's
 * `toCandidate` reads at head 499a30d29f; the mapping test pins it.
 */
import { LEG_BOUNDS } from "../eligible-leg/contract.mjs";

export const NBA_CROSS_SPORT_VERSION = "nba-cross-sport@0";

/** Our family keys → the provider's player-prop market keys (the names a captured NBA price would carry). */
export const NBA_FAMILY_MARKET_KEY = Object.freeze({
  pts: "player_points",
  reb: "player_rebounds",
  ast: "player_assists",
  threePm: "player_threes",
  pra: "player_points_rebounds_assists",
  ptsReb: "player_points_rebounds",
  ptsAst: "player_points_assists",
});

/** The leg fields #1141's toCandidate (app/src/lib/parlays/v2/candidate.mjs @ 499a30d29f) reads. */
export const PARLAY_CANDIDATE_V1_INPUT_FIELDS = Object.freeze([
  "sport", "eventId", "eventLabel", "startUtc", "participant", "team", "market", "marketLabel", "side", "line",
  "selection", "book", "price", "capturedAt", "modelId", "modelProbability", "uncertainty", "forecastClass",
  "participantStatus", "marketStatus", "priceMismatch", "receipts",
]);

export const CROSS_REASON = Object.freeze({
  SAME_EVENT: "SAME_EVENT",
  MIXED_PRODUCT_DAYS: "MIXED_PRODUCT_DAYS",
  EXPIRED: "EXPIRED",
  DUPLICATE_MARKET: "DUPLICATE_MARKET",
  DUPLICATE_MARKET_LEAN_CONFLICT: "DUPLICATE_MARKET_LEAN_CONFLICT",
  TOO_FEW_LEGS: "TOO_FEW_LEGS",
});

const ms = (iso) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) ? t : null; };
const iso = (t) => (t == null ? null : new Date(t).toISOString());

/** ET calendar date of an instant (product dates are ET dates). */
export function etProductDate(instant) {
  const t = ms(instant);
  if (t == null) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}

/**
 * The windows of any leg that carries { lockAt (start), capturedAt } — NBA tip and other sports' kickoff alike.
 * @returns {{ startAt: string|null, eventLockAt: string|null, priceExpiresAt: string|null, expiresAt: string|null, productDate: string|null }}
 */
export function legWindow(leg) {
  const start = ms(leg?.lockAt ?? leg?.startUtc);
  const cap = ms(leg?.capturedAt);
  const lock = start == null ? null : start - LEG_BOUNDS.activationCutoffMs;
  const priceExp = cap == null ? null : cap + LEG_BOUNDS.maxPriceAgeMs;
  const exp = lock == null || priceExp == null ? null : Math.min(lock, priceExp);
  return { startAt: iso(start), eventLockAt: iso(lock), priceExpiresAt: iso(priceExp), expiresAt: iso(exp), productDate: start == null ? null : etProductDate(iso(start)) };
}

/** A card's activation window: open until its earliest leg expiry; unknown windows fail closed (null). */
export function cardWindow(legs) {
  const ws = (legs ?? []).map(legWindow);
  if (!ws.length || ws.some((w) => w.expiresAt == null)) return { activateBy: null, firstStartAt: null, lastStartAt: null, productDates: [] };
  const exp = Math.min(...ws.map((w) => ms(w.expiresAt)));
  const starts = ws.map((w) => ms(w.startAt));
  return { activateBy: iso(exp), firstStartAt: iso(Math.min(...starts)), lastStartAt: iso(Math.max(...starts)), productDates: [...new Set(ws.map((w) => w.productDate))].sort() };
}

const sportOf = (l) => String(l?.sport ?? "").toLowerCase();
const marketKeyOf = (l) => [sportOf(l), String(l?.eventId ?? ""), String(l?.providerAthleteId ?? l?.team ?? ""), l?.family ?? l?.market ?? "", l?.line ?? ""].join("|");

/**
 * Collapse the same market quoted by several books. Never chooses by price.
 * @returns {{ kept: object[], refused: Array<{ marketKey: string, reason: string, legs: object[] }>, alternates: Array<{ marketKey: string, kept: string, alternates: string[] }> }}
 */
export function dedupeMarkets(legs) {
  const groups = new Map();
  for (const l of legs ?? []) {
    const k = marketKeyOf(l);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(l);
  }
  const kept = [], refused = [], alternates = [];
  for (const [k, g] of groups) {
    if (new Set(g.map((l) => l.side)).size > 1) { refused.push({ marketKey: k, reason: CROSS_REASON.DUPLICATE_MARKET_LEAN_CONFLICT, legs: g }); continue; }
    const sorted = g.slice().sort((a, b) => (ms(b.capturedAt) ?? -Infinity) - (ms(a.capturedAt) ?? -Infinity) || String(a.book ?? "").localeCompare(String(b.book ?? "")));
    kept.push(sorted[0]);
    if (sorted.length > 1) alternates.push({ marketKey: k, kept: String(sorted[0].book ?? ""), alternates: sorted.slice(1).map((l) => String(l.book ?? "")) });
  }
  return { kept, refused, alternates };
}

/**
 * May these legs (any sports) share one card? Reasons only — never re-prices or re-qualifies a leg.
 * @param {object[]} legs
 * @param {{ now: string }} ctx
 */
export function checkCrossSportCard(legs, { now }) {
  const nowMs = ms(now);
  if (nowMs == null) throw new TypeError("checkCrossSportCard: `now` must be an ISO instant");
  const list = legs ?? [];
  const reasons = [];
  if (list.length < 2) reasons.push({ code: CROSS_REASON.TOO_FEW_LEGS, legs: [] });
  const byEvent = new Map();
  const byMarket = new Map();
  list.forEach((l, i) => {
    const ek = `${sportOf(l)}:${l?.eventId ?? ""}`;
    if (byEvent.has(ek)) reasons.push({ code: CROSS_REASON.SAME_EVENT, legs: [byEvent.get(ek), i] }); else byEvent.set(ek, i);
    const mk = marketKeyOf(l);
    if (byMarket.has(mk)) reasons.push({ code: CROSS_REASON.DUPLICATE_MARKET, legs: [byMarket.get(mk), i] }); else byMarket.set(mk, i);
  });
  const w = cardWindow(list);
  if (w.activateBy == null || nowMs >= ms(w.activateBy)) reasons.push({ code: CROSS_REASON.EXPIRED, legs: [] });
  if (w.productDates.length > 1) reasons.push({ code: CROSS_REASON.MIXED_PRODUCT_DAYS, legs: [], detail: w.productDates });
  return { ok: reasons.length === 0, reasons, window: w };
}

/**
 * Map a produced NBA leg onto the input #1141's toCandidate reads. Numbers are the leg's (= the evaluator's) own;
 * `modelProbability` is the side's probability as the evaluator returned it (pOver for OVER, pUnder for UNDER).
 * candidate@1 has no pPush / EV field — `receipts` carries the snapshot and evaluator identity so neither is lost.
 */
export function toParlayCandidateInput(leg) {
  const over = leg.side === "OVER";
  return {
    sport: "nba",
    eventId: leg.eventId,
    eventLabel: null,
    startUtc: leg.lockAt,
    participant: leg.providerAthleteId,
    team: leg.team,
    market: NBA_FAMILY_MARKET_KEY[leg.family] ?? null,
    marketLabel: null,
    side: over ? "over" : "under",
    line: leg.line,
    selection: `${over ? "Over" : "Under"} ${leg.line}`,
    book: leg.book,
    price: leg.price.sideAmerican,
    capturedAt: leg.capturedAt,
    modelId: leg.modelVersion,
    modelProbability: over ? leg.pOver : leg.pUnder,
    uncertainty: null,
    forecastClass: "OFFICIAL_SNAPSHOT",
    participantStatus: null,
    marketStatus: null,
    priceMismatch: false,
    receipts: [`snapshot:${leg.snapshotId}`, `evaluation:${leg.evaluator.identityKey}`, `authorization:${leg.verification.authorizationReceiptRef}`, ...(leg.verification.priceReceiptRef ? [`price:${leg.verification.priceReceiptRef}`] : [])],
  };
}

/** The Smart Betslip (compare-only) row for a leg: operator name, price, capture time — no link, no prefill. */
export function toSmartSlipRow(leg) {
  const over = leg.side === "OVER";
  return {
    sport: "nba",
    eventId: leg.eventId,
    market: NBA_FAMILY_MARKET_KEY[leg.family] ?? null,
    selection: `${over ? "Over" : "Under"} ${leg.line}`,
    line: leg.line,
    book: leg.operatorName,
    price: leg.price.sideAmerican,
    capturedAt: leg.capturedAt,
    handoff: { status: leg.handoff.status, link: null, prefill: leg.handoff.prefill },
  };
}
