/**
 * SLIP READING — the contract between a screenshot and a saved bet (P263).
 *
 * A picture of a betslip is a CLAIM, not a record. What a vision model reads from it is a claim about
 * a picture. Nothing here is saved as fact until the person who uploaded it confirms the reading, and
 * every doubt this module can compute is put in front of them before they do.
 *
 * WHAT IT REFUSES TO DO:
 *   · guess a value that is not legible — a null reaches the confirmation screen as an empty field a
 *     person can fill, and an invented number would be indistinguishable from a read one;
 *   · derive odds from a payout, or a payout from odds, and present the result as read. Arithmetic we
 *     perform is labelled as ours (`computed*`), never merged into what the image said;
 *   · treat a price mismatch as an error on a same-game parlay, where books legitimately reprice for
 *     correlation. That is disclosed, not flagged as wrong.
 */

/**
 * The image rules, in ONE place: the browser refuses the same files the endpoint refuses, so a person
 * never uploads something that is rejected only after it has been stored.
 */
export const ALLOWED_IMAGE_TYPES = Object.freeze(["image/png", "image/jpeg", "image/webp", "image/gif"]);
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** The exact JSON we ask for. Kept beside the validator so the two can never drift apart. */
export const SLIP_READING_SCHEMA = Object.freeze({
  book: "string | null — the sportsbook's name if it is visible",
  placedAt: "ISO 8601 string | null — when the bet was placed, if shown",
  stake: "number | null — the amount risked, in the slip's own currency",
  priceAmerican: "number | null — the TICKET's combined American odds, if shown",
  payout: "number | null — the total return shown for a win (stake included)",
  legs: "array of { player, market, side, line, odds, event, startsAt } — one per selection",
  currency: "string | null — ISO code if visible, else null",
});

/**
 * The instruction given to the vision model. Written as rules about EVIDENCE, because the failure that
 * matters is a plausible invention: a wrong stake typed confidently is worse than an empty field.
 */
export const READING_PROMPT = [
  "You are reading a photograph or screenshot of a sports betting slip.",
  "Return ONLY JSON matching the given schema. No prose, no markdown fence.",
  "Read only what is visible. If a value is cut off, blurred, or absent, return null for it — never guess.",
  "Never calculate a missing value from the others: if the stake is not shown, it is null even when the payout and odds are.",
  "Copy odds exactly as printed, including the sign. American (+150 / -110) and decimal (2.50) are both possible; if decimal, return the decimal number.",
  "One entry in `legs` per selection on the ticket, in the order shown.",
  "If the image is not a betting slip, return {\"legs\": [], \"notASlip\": true}.",
].join(" ");

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
/** American odds are ≥ +100 or ≤ −100; anything between is a decimal price or a misread. */
const validAmerican = (v) => isNum(v) && Math.abs(v) >= 100;
const decimalFromAmerican = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));

/** Decimal prices (1.91) sometimes come back where American was expected; convert, never discard. */
function normaliseOdds(v) {
  if (!isNum(v)) return { odds: null, note: "no price read" };
  if (validAmerican(v)) return { odds: Math.round(v), note: null };
  if (v > 1 && v < 100) {
    const american = v >= 2 ? Math.round((v - 1) * 100) : -Math.round(100 / (v - 1));
    return { odds: american, note: `read as decimal ${v}, converted to ${american > 0 ? "+" : ""}${american}` };
  }
  return { odds: null, note: `price ${v} is not a usable odds value` };
}

/**
 * Check a reading and say what a person must look at. Never throws: a malformed reading is a result
 * with errors, because the upload still needs to show them something.
 *
 * @returns {{ ok: boolean, notASlip: boolean, errors: string[], review: string[], normalised: object|null }}
 */
export function validateReading(raw) {
  const errors = [];
  const review = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, notASlip: false, errors: ["the reading was not a JSON object"], review, normalised: null };
  }
  if (raw.notASlip === true) {
    return { ok: false, notASlip: true, errors: ["this image does not look like a betting slip"], review, normalised: null };
  }
  const legsIn = Array.isArray(raw.legs) ? raw.legs : null;
  if (!legsIn) errors.push("no legs were read from the image");
  if (legsIn && legsIn.length === 0) errors.push("no legs were read from the image");

  const legs = (legsIn ?? []).map((l, i) => {
    const { odds, note } = normaliseOdds(l?.odds);
    if (odds == null) review.push(`leg ${i + 1}: ${note}`);
    else if (note) review.push(`leg ${i + 1}: ${note}`);
    const player = typeof l?.player === "string" && l.player.trim() ? l.player.trim() : null;
    const market = typeof l?.market === "string" && l.market.trim() ? l.market.trim() : null;
    if (!player && !market) review.push(`leg ${i + 1}: neither a selection nor a market was legible`);
    return {
      player, market,
      side: typeof l?.side === "string" ? l.side.trim() || null : null,
      line: isNum(l?.line) ? l.line : null,
      odds,
      event: typeof l?.event === "string" ? l.event.trim() || null : null,
      startsAt: typeof l?.startsAt === "string" ? l.startsAt : null,
    };
  });

  const stake = isNum(raw.stake) && raw.stake >= 0 ? raw.stake : null;
  if (stake == null) review.push("the stake was not legible — enter it before saving");
  const priceAmerican = validAmerican(raw.priceAmerican) ? Math.round(raw.priceAmerican) : null;

  // OUR arithmetic, labelled as ours and never merged into what the image said.
  const pricedLegs = legs.filter((l) => l.odds != null);
  const computedDecimal = pricedLegs.length === legs.length && legs.length > 0
    ? legs.reduce((d, l) => d * decimalFromAmerican(l.odds), 1)
    : null;
  const computedPayout = computedDecimal != null && stake != null ? Math.round(stake * computedDecimal * 100) / 100 : null;

  /*
   * A ticket price that disagrees with its legs is NORMAL on a same-game parlay: books reprice
   * correlated selections, and the product of the legs is then the wrong number, not the ticket. It is
   * disclosed either way, and described differently so nobody "fixes" a correctly repriced slip.
   */
  const sameEvent = legs.length > 1 && new Set(legs.map((l) => l.event).filter(Boolean)).size === 1 && legs.every((l) => l.event);
  if (priceAmerican != null && computedDecimal != null) {
    const statedDecimal = decimalFromAmerican(priceAmerican);
    if (Math.abs(statedDecimal - computedDecimal) / statedDecimal > 0.02) {
      review.push(sameEvent
        ? "the ticket's price differs from its legs multiplied together — expected on a same-game parlay, which books reprice for correlation"
        : "the ticket's price differs from its legs multiplied together — check the odds read from each leg");
    }
  }
  if (isNum(raw.payout) && computedPayout != null && Math.abs(raw.payout - computedPayout) / Math.max(1, raw.payout) > 0.02) {
    review.push("the payout shown does not match stake × price — check the stake");
  }

  return {
    ok: errors.length === 0,
    notASlip: false,
    errors,
    review,
    normalised: errors.length ? null : {
      book: typeof raw.book === "string" ? raw.book.trim() || null : null,
      placedAt: typeof raw.placedAt === "string" ? raw.placedAt : null,
      currency: typeof raw.currency === "string" ? raw.currency.trim().toUpperCase() || null : null,
      stake, priceAmerican, legs,
      statedPayout: isNum(raw.payout) ? raw.payout : null,
      computedDecimal, computedPayout,
      /** ALWAYS true. A reading is a claim about a picture until its owner says otherwise. */
      confirmationRequired: true,
    },
  };
}

/**
 * The row a CONFIRMED reading becomes. Refuses anything unconfirmed — the database's `confirmed_at`
 * is what separates a record from a guess, and it may only be set by the person who uploaded it.
 *
 * @param {Record<string, any> | null} normalised
 * @param {{ userId: string, source: "screenshot" | "manual" | "book_sync", imagePath?: string | null, confirmedAt: string }} opts
 */
export function toBetSlipRow(normalised, { userId, source, imagePath = null, confirmedAt }) {
  if (!normalised) throw new Error("no reading to save");
  if (!userId) throw new Error("a slip belongs to exactly one account");
  if (!confirmedAt) throw new Error("a reading is saved only after its owner confirms it");
  if (!["screenshot", "manual", "book_sync"].includes(source)) throw new Error(`unknown slip source "${source}"`);
  return {
    user_id: userId,
    source,
    book: normalised.book,
    placed_at: normalised.placedAt,
    stake: normalised.stake,
    price_american: normalised.priceAmerican,
    legs: normalised.legs,
    status: "pending",
    image_path: imagePath,
    confirmed_at: confirmedAt,
  };
}
