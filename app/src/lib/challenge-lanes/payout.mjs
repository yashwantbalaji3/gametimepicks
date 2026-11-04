/**
 * CHALLENGE LANES · PAYOUT CALCULATION. PURE. Money is integer cents.
 *
 *   grossPayout = stake × decimal parlay price      (floored to the cent: a tracked amount is never overstated)
 *   profit      = grossPayout − stake
 * American ↔ decimal: +A → 1 + A/100; −A → 1 + 100/A. The gross is computed from the exact ratio, never from a rounded
 * decimal, so +364 on $100.00 is exactly $464.00.
 *
 * A payout is REFUSED (never estimated) unless every check below passes; `refusals` lists each failed code:
 *   CHAIN_BROKEN                 the lane log does not verify
 *   CARD_SHA_UNVERIFIED          the card's suggested-cards file is missing, altered, or not the file the card names
 *   LEG_INELIGIBLE_RULE_A        a card leg carries a flag rule A excludes from this product
 *   NO_PRICE_VERIFIED            no PRICE_VERIFIED event for this card
 *   PROVIDER_NOT_PERMITTED       the provider is not in the permitted list (the-odds-api: founder decision 2026-11-04)
 *   BOOK_NOT_ELIGIBLE            a leg's book is not an eligible operator (eligible-operators@1)
 *   CROSS_BOOK_MIX               the legs are not all from ONE book
 *   PRICE_LEGS_MISMATCH          the price covers different legs or sides than the frozen card
 *   PRICE_AFTER_FIRST_START      a price was fetched at or after the earliest leg's start
 *   PRICE_TOO_EARLY              fetched more than PRICE_WINDOW_MS before the post's scheduled time (proposed window)
 *   MODEL_PROBABILITY_AS_PRICE   the "price" is a model number: a probability, a model provider, or 1/model chance
 *   BAD_PRICE                    not a valid American or decimal price, or the parlay price does not match its method
 *   STAKE_NOT_BANKROLL           the stake is not the current tracked bankroll (all-in ladder, D1 proposed)
 *   LEG_COUNT_EXCEEDED           more legs than the product allows (Bank Builder: 2, hard)
 *   SAME_GAME_NEEDS_PARLAY_PRICE two legs from one game without the book's own whole-parlay price (correlation is never
 *                                assumed). With `allowSameGameEstimate` the leg product is allowed but labelled ESTIMATE
 *                                (method LEG_PRODUCT_ESTIMATE, `estimate: true`): never a book's offer; lanes never pass it.
 *   PROP_LINE_UNVERIFIED         a prop leg has no line, or the priced line is not the line the leg was evaluated against
 *   BELOW_PACE                   only with `strictPace` (off: SPEC rev 2 allows a below-pace card and discloses the shortfall)
 */
import { verifyChain } from "./chain.mjs";
import { verifySuggestedCards } from "../products/leg-pool/daily-cards.mjs";
import { RULE_A_FOR_PRODUCT, MAX_LEGS } from "./lanes.mjs";
import { ELIGIBLE_OPERATOR_KEYS } from "../sports/odds/eligible-operators.mjs";

/** Founder decision P1 (2026-11-04): the existing paid The Odds API subscription; odds and payouts may be displayed. */
export const PERMITTED_PRICE_PROVIDERS = Object.freeze(["the-odds-api"]);
/** Proposed (SPEC §2): fetched at most 90 minutes before the post's scheduled time. */
export const PRICE_WINDOW_MS = 90 * 60 * 1000;
const MODEL_PROVIDERS = /^(gtp|gametimepicks|model|elo|engine|level-a)/i;

/** Exact price as a ratio n/d (decimal = n/d), from an American or decimal quote; null when invalid. */
export function priceRatio(format, price) {
  if (format === "american") {
    if (!Number.isInteger(price) || Math.abs(price) < 100) return null;
    return price > 0 ? { n: price + 100, d: 100 } : { n: -price + 100, d: -price };
  }
  if (format === "decimal") {
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 1) return null;
    const d = 10000; const n = Math.round(price * d);
    return Math.abs(n / d - price) < 1e-9 ? { n, d } : null; // at most 4 dp, as books quote
  }
  return null;
}
export const americanToDecimal = (a) => { const r = priceRatio("american", a); return r ? r.n / r.d : null; };
export function decimalToAmerican(dec) {
  if (!(typeof dec === "number" && dec > 1)) return null;
  return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
}
const gcd = (a, b) => (b === 0n ? a : gcd(b, a % b));
const mul = (x, y) => { const n = BigInt(x.n) * BigInt(y.n); const d = BigInt(x.d) * BigInt(y.d); const g = gcd(n, d); return { n: n / g, d: d / g }; };

/** grossPayout and profit in cents from a stake in cents and an exact ratio. */
export function payoutCents(stakeCents, ratio) {
  const n = BigInt(ratio.n); const d = BigInt(ratio.d);
  const gross = Number((BigInt(stakeCents) * n) / d);
  return { grossPayoutCents: gross, profitCents: gross - stakeCents };
}

/** Pace rule (D1 proposed): the price a step needs, (target ÷ bankroll)^(1 ÷ steps remaining). */
export const paceFor = ({ targetCents, bankrollCents, stepsRemaining }) => (targetCents / bankrollCents) ** (1 / stepsRemaining);

const legKey = (l) => `${l.legId}|${l.selection?.code ?? l.selectionCode}`;

/**
 * @param {object} p
 * @param {object[]} p.events          the lane run's chain (verified here)
 * @param {object} p.cardEvent         the CARD_FROZEN event being priced
 * @param {object|null} p.suggestedCards  the frozen suggested-cards file the card came from
 * @param {object|null} p.priceEvent   the PRICE_VERIFIED event for this card
 * @param {number} p.stakeCents
 * @param {number} p.bankrollCents     the current tracked bankroll
 * @param {{ targetCents: number, stepsRemaining: number }} p.ladder
 * @param {string|null} [p.postScheduledAt]
 * @param {readonly string[]} [p.permittedProviders]
 * @param {boolean} [p.strictPace]   refuse below pace (rev 1 behaviour); default: allow and disclose
 */
export function computePayout({ events, cardEvent, suggestedCards, priceEvent, stakeCents, bankrollCents, ladder, postScheduledAt = null, permittedProviders = PERMITTED_PRICE_PROVIDERS, eligibleBooks = ELIGIBLE_OPERATOR_KEYS, strictPace = false, allowSameGameEstimate = false }) {
  const refusals = [];
  const add = (code, detail) => refusals.push(detail ? { code, detail } : { code });
  if (!verifyChain(events).ok) add("CHAIN_BROKEN");
  const card = cardEvent?.card;
  if (!card || !verifySuggestedCards(suggestedCards) || suggestedCards.contentSha256 !== card.suggestedCardsSha256) add("CARD_SHA_UNVERIFIED");
  const excluded = RULE_A_FOR_PRODUCT[cardEvent?.product] ?? [];
  for (const l of card?.legs ?? []) for (const f of l.guard?.flags ?? []) if (excluded.includes(f)) add("LEG_INELIGIBLE_RULE_A", `${l.legId} ${f}`);
  const max = MAX_LEGS[cardEvent?.product];
  if (max != null && (card?.legs?.length ?? 0) > max) add("LEG_COUNT_EXCEEDED", `${card.legs.length} > ${max}`);
  for (const l of card?.legs ?? []) if (l.market !== "winner" && typeof l.prop?.line !== "number") add("PROP_LINE_UNVERIFIED", `${l.legId} has no evaluated line`);
  const games = (card?.legs ?? []).map((l) => l.gameId);
  const sameGame = new Set(games).size !== games.length;

  let ratio = null;
  if (!priceEvent || priceEvent.type !== "PRICE_VERIFIED") add("NO_PRICE_VERIFIED");
  else {
    const pv = priceEvent.price ?? {};
    const legs = pv.legs ?? [];
    const providers = [...new Set(legs.map((l) => l.provider).concat(pv.parlay?.provider ?? []))];
    if (providers.some((x) => MODEL_PROVIDERS.test(String(x)))) add("MODEL_PROBABILITY_AS_PRICE", "model provider");
    else if (!providers.length || providers.some((x) => !permittedProviders.includes(x))) add("PROVIDER_NOT_PERMITTED", providers.join(",") || "none");
    const want = (card?.legs ?? []).map(legKey).sort().join(";");
    if (legs.map(legKey).sort().join(";") !== want || priceEvent.cardEventSha256 !== cardEvent?.sha256) add("PRICE_LEGS_MISMATCH");
    const firstStart = Math.min(...(card?.legs ?? []).map((l) => Date.parse(l.startUtc)));
    const fetched = [...legs.map((l) => l.fetchedAt), pv.parlay?.fetchedAt].filter(Boolean).map((t) => Date.parse(t));
    if (!fetched.length || fetched.some((t) => !Number.isFinite(t) || !(t < firstStart))) add("PRICE_AFTER_FIRST_START");
    if (postScheduledAt && fetched.some((t) => t < Date.parse(postScheduledAt) - PRICE_WINDOW_MS)) add("PRICE_TOO_EARLY");
    const byLeg = new Map((card?.legs ?? []).map((l) => [l.legId, l]));
    for (const l of legs) { const c = byLeg.get(l.legId); if (c && c.market !== "winner" && typeof c.prop?.line === "number" && l.line !== c.prop.line) add("PROP_LINE_UNVERIFIED", `${l.legId} priced at another line`); }
    if (sameGame && pv.parlay?.method !== "BOOK_QUOTED_PARLAY" && !allowSameGameEstimate) add("SAME_GAME_NEEDS_PARLAY_PRICE");
    const books = [...new Set(legs.map((l) => l.book).concat(pv.parlay?.book ?? []))];
    for (const b of books) if (!eligibleBooks.includes(b)) add("BOOK_NOT_ELIGIBLE", String(b));
    if (books.length !== 1) add("CROSS_BOOK_MIX", books.join(",") || "no book");
    const ratios = legs.map((l) => {
      const r = priceRatio(l.oddsFormat, l.price);
      if (l.oddsFormat === "probability" || (typeof l.price === "number" && l.price > 0 && l.price < 1)) { add("MODEL_PROBABILITY_AS_PRICE", l.legId); return null; }
      if (!r) add("BAD_PRICE", l.legId);
      return r;
    });
    /* A "price" that is the model's own chance inverted on EVERY leg is the model, not a book. One leg can match by chance
       (−110 is 1/0.5238), so a single coincidence is not refused. */
    const fair = legs.map((l, i) => { const p = byLeg.get(l.legId)?.probability; return ratios[i] && typeof p === "number" && Math.abs(ratios[i].n / ratios[i].d - 1 / p) < 5e-4; });
    if (fair.length && fair.every(Boolean)) add("MODEL_PROBABILITY_AS_PRICE", "every leg equals 1 / its model chance");
    const parlay = pv.parlay ?? {};
    const quoted = priceRatio(parlay.oddsFormat, parlay.price);
    if (ratios.every(Boolean) && ratios.length) {
      const product = ratios.reduce((a, r) => mul(a, r), { n: 1n, d: 1n });
      if (parlay.method === "LEG_PRODUCT") {
        if (quoted && Math.abs(Number(product.n) / Number(product.d) - quoted.n / quoted.d) > 0.005) add("BAD_PRICE", "parlay price is not the product of its legs");
        ratio = product;
      } else if (parlay.method === "BOOK_QUOTED_PARLAY") {
        if (!quoted) add("BAD_PRICE", "no quoted parlay price");
        ratio = quoted;
      } else add("BAD_PRICE", "parlay method must be BOOK_QUOTED_PARLAY or LEG_PRODUCT");
    }
  }
  if (!(Number.isInteger(stakeCents) && stakeCents > 0 && stakeCents === bankrollCents)) add("STAKE_NOT_BANKROLL");
  const decimal = ratio ? Number(ratio.n) / Number(ratio.d) : null;
  const pace = ladder ? paceFor({ targetCents: ladder.targetCents, bankrollCents, stepsRemaining: ladder.stepsRemaining }) : null;
  const belowPace = decimal != null && pace != null && decimal + 1e-12 < pace;
  if (strictPace && belowPace) add("BELOW_PACE", `${decimal.toFixed(4)} < ${pace.toFixed(4)}`);

  const estimate = sameGame && priceEvent?.price?.parlay?.method === "LEG_PRODUCT";
  const inputs = { estimate, label: estimate ? "ESTIMATE — same-game leg product, not a book's offer" : null, book: priceEvent?.price?.legs?.[0]?.book ?? null, cardEventSha256: cardEvent?.sha256 ?? null, priceEventSha256: priceEvent?.sha256 ?? null, priceSnapshotSha256: priceEvent?.price?.priceSnapshotSha256 ?? null, stakeCents, bankrollCents, decimalPrice: decimal, method: estimate ? "LEG_PRODUCT_ESTIMATE" : priceEvent?.price?.parlay?.method ?? null, pace, belowPace, strictPace };
  if (refusals.length) return { ok: false, refusals, inputs };
  return { ok: true, inputs, ...payoutCents(stakeCents, ratio) };
}
