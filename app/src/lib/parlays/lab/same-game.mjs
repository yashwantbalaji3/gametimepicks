/**
 * SAME-GAME SPLIT (P272) — PRIVATE RESEARCH. Nothing here reaches a public surface.
 *
 * The builder discloses that two legs from one game are linked and says the link is "not validated".
 * Our own graded cards can validate or refute it, and this is the machinery that will — under a
 * preregistration, scored forward, once.
 *
 * ── WHY FORWARD ONLY ────────────────────────────────────────────────────────────────────────────
 * The historical split has already been looked at (2026-09-12): shared-game cards were much worse at
 * three and five legs and identical at four. That inconsistency is exactly why it is not a finding —
 * and having looked, the historical corpus can no longer score the question. `since` exists to make
 * that impossible to forget: the scorer passes the preregistration's own frozen date and cards
 * graded before it are not counted.
 *
 * ── DERIVED FROM THE LEGS, NEVER FROM THE FLAG ──────────────────────────────────────────────────
 * Cards carry a `sameGame` field, and on the risk-band producer it means something else: "every leg
 * is from one game". Measured, it disagrees with "two legs share a game" on 532 of 2,700 cards. The
 * leg `gameId`s are unambiguous, so the split is derived from them and the flag is ignored.
 *
 * Size is the confounder that matters — shared-game cards are not evenly spread across sizes — so
 * every comparison here is WITHIN a size, and the combined figure is a size-stratified average of
 * the per-size differences, never a pooled rate.
 */

const DECIDED = new Set(["win", "loss"]);
const decimalFromAmerican = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));

/** Two legs from one game. Derived from the legs that settled, like the size and the price. */
export const sharesAGame = (legs) => new Set(legs.map((l) => l.gameId)).size < legs.length;

export function cardsOf(doc) {
  const out = [];
  for (const slip of doc?.slips ?? []) out.push(slip);
  const sections = doc?.publicRiskSections ?? {};
  for (const tier of Object.keys(sections)) for (const slip of sections[tier]?.all ?? []) out.push(slip);
  return out;
}

/**
 * @param {Array<Record<string, any>>} docs graded card files
 * @param {{since?: string|null, sport?: string, minPerArm?: number}} [opts]
 *   `since` is an inclusive YYYY-MM-DD floor on the card's DATE. Null means "everything", which is
 *   only ever correct for describing the past — never for scoring the preregistration.
 */
export function buildSameGameSplit(docs, { since = null, sport = "mlb", minPerArm = 100 } = {}) {
  const seen = new Set();
  const bySize = new Map();
  let cards = 0, beforeSince = 0;

  for (const doc of docs ?? []) {
    const date = String(doc?.date ?? "");
    if (since && date < since) { beforeSince += cardsOf(doc).length; continue; }
    for (const slip of cardsOf(doc)) {
      if (!DECIDED.has(slip?.status)) continue;
      const id = slip.slipId;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const legs = (slip.legs ?? []).filter((l) => DECIDED.has(l?.result) && (!sport || !l?.sport || l.sport === sport));
      if (legs.length < 2) continue;
      let price = 1, priced = true;
      for (const l of legs) {
        const odds = Number(l?.oddsForSide);
        if (!Number.isFinite(odds) || odds === 0) { priced = false; break; }
        price *= decimalFromAmerican(odds);
      }
      if (!priced) continue;
      const size = legs.length;
      let row = bySize.get(size);
      if (!row) {
        row = { legs: size, shared: { cards: 0, wins: 0, returnSum: 0 }, apart: { cards: 0, wins: 0, returnSum: 0 } };
        bySize.set(size, row);
      }
      const arm = sharesAGame(legs) ? row.shared : row.apart;
      arm.cards += 1;
      cards += 1;
      if (slip.status === "win") { arm.wins += 1; arm.returnSum += price - 1; }
      else { arm.returnSum -= 1; }
    }
  }

  const finish = (a) => ({
    cards: a.cards, wins: a.wins,
    hitRate: a.cards ? a.wins / a.cards : null,
    flatReturn: a.cards ? a.returnSum / a.cards : null,
  });

  const sizes = [...bySize.values()]
    .map((r) => {
      const shared = finish(r.shared);
      const apart = finish(r.apart);
      /* A size counts toward the combined figure only when BOTH arms have a real sample: a
         difference against four cards is not a difference. */
      const comparable = shared.cards >= minPerArm && apart.cards >= minPerArm;
      return {
        legs: r.legs, shared, apart, comparable,
        hitRateGap: comparable ? shared.hitRate - apart.hitRate : null,
        flatReturnGap: comparable ? shared.flatReturn - apart.flatReturn : null,
      };
    })
    .sort((a, b) => a.legs - b.legs);

  /* Size-stratified, weighted by how many cards each comparable size contributed. Never a pooled
     rate: shared-game cards are not evenly spread across sizes, so pooling would report the size
     mix as if it were the effect. */
  const comparable = sizes.filter((s) => s.comparable);
  const weight = comparable.reduce((w, s) => w + s.shared.cards + s.apart.cards, 0);
  const combined = weight === 0 ? null : {
    sizes: comparable.map((s) => s.legs),
    cards: weight,
    hitRateGap: comparable.reduce((t, s) => t + s.hitRateGap * (s.shared.cards + s.apart.cards), 0) / weight,
    flatReturnGap: comparable.reduce((t, s) => t + s.flatReturnGap * (s.shared.cards + s.apart.cards), 0) / weight,
    /* Do every comparable size point the same way? A combined average over sizes that disagree is
       an average of a contradiction, and the caller must be able to see that. */
    agree: comparable.length > 0 && comparable.every((s) => Math.sign(s.flatReturnGap) === Math.sign(comparable[0].flatReturnGap)),
  };

  return { sport, since, cards, beforeSince, sizes, combined };
}
