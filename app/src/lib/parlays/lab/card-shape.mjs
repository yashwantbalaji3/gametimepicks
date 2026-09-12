/**
 * CARD SHAPE (P271) — how our published cards did, by how many legs they carried.
 *
 * The question every person building a parlay asks and no page here answered: does adding another
 * leg change anything? Our own graded receipts answer it for our own cards, and the answer is not
 * subtle — the win rate falls from a third at two legs to one card in twenty at five, and the flat
 * return falls with it.
 *
 * ── A VOID LEG LEAVES THE CARD ──────────────────────────────────────────────────────────────────
 * 17% of decided cards carry a scratched leg. A scratch is removed from a parlay and the card pays
 * on what is left, so BOTH the size and the price here are taken from the surviving legs. Counting
 * the voided leg in the size while pricing without it would file a card under a shape it never had;
 * pricing WITH it inflates every winner's payout, which is what a first pass here did — it reported
 * two-leg cards at −1.5% when they were −10.8%.
 *
 * That rule is not assumed. Across 2,839 decided cards the published status agrees with "every
 * surviving leg won" in every single case, which is the same rule stated from the other side; the
 * test below re-checks it against the corpus rather than trusting this comment.
 *
 * ── WHAT IT IS NOT ──────────────────────────────────────────────────────────────────────────────
 * Not a claim about parlays in general, and not a forecast. It is the record of the cards WE
 * published, priced as they were published, and every surface says so.
 */

const DECIDED = new Set(["win", "loss"]);
const decimalFromAmerican = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));

/** Every card in a graded file, whichever of the two shapes it uses. */
export function cardsOf(doc) {
  const out = [];
  for (const slip of doc?.slips ?? []) out.push(slip);
  const sections = doc?.publicRiskSections ?? {};
  for (const tier of Object.keys(sections)) for (const slip of sections[tier]?.all ?? []) out.push(slip);
  return out;
}

export function sampleClass(cards) {
  if (cards < 100) return { id: "thin", text: "far too few to separate from chance" };
  if (cards < 250) return { id: "accumulating", text: "accumulating — read it as a direction, not a verdict" };
  return { id: "substantial", text: "a substantial sample" };
}

/**
 * @param {Array<Record<string, any>>} docs graded card files, either shape
 * @param {{sport?: string, minCards?: number}} [opts]
 */
export function buildShapeRecord(docs, { sport = "mlb", minCards = 30 } = {}) {
  const seen = new Set();
  const bySize = new Map();
  let cards = 0, unpriced = 0;

  for (const doc of docs ?? []) {
    for (const slip of cardsOf(doc)) {
      if (!DECIDED.has(slip?.status)) continue;
      const id = slip.slipId;
      if (!id || seen.has(id)) continue;
      /* The two streams publish different cards under different id prefixes, but a file re-read or a
         re-graded day must not count a card twice. */
      seen.add(id);
      const legs = (slip.legs ?? []).filter((l) => DECIDED.has(l?.result) && (!sport || !l?.sport || l.sport === sport));
      if (!legs.length) continue;
      let price = 1;
      let priced = true;
      for (const l of legs) {
        const odds = Number(l?.oddsForSide);
        if (!Number.isFinite(odds) || odds === 0) { priced = false; break; }
        price *= decimalFromAmerican(odds);
      }
      if (!priced) { unpriced += 1; continue; }
      const size = legs.length;
      let row = bySize.get(size);
      if (!row) { row = { legs: size, wins: 0, losses: 0, returnSum: 0 }; bySize.set(size, row); }
      cards += 1;
      if (slip.status === "win") { row.wins += 1; row.returnSum += price - 1; }
      else { row.losses += 1; row.returnSum -= 1; }
    }
  }

  const rows = [...bySize.values()]
    .map((r) => {
      const decided = r.wins + r.losses;
      return {
        legs: r.legs, cards: decided, wins: r.wins, losses: r.losses,
        hitRate: decided ? r.wins / decided : null,
        /** One unit on every card of this size: a completed past, never a projection. */
        flatReturn: decided ? r.returnSum / decided : null,
        sample: sampleClass(decided),
      };
    })
    .filter((r) => r.cards >= minCards)
    .sort((a, b) => a.legs - b.legs);

  return { sport, cards, unpriced, sizes: rows };
}

/** The row for the card someone is building, or null when we have too few of that size. */
export const shapeFor = (record, legCount) =>
  record?.sizes?.find((r) => r.legs === legCount) ?? null;
