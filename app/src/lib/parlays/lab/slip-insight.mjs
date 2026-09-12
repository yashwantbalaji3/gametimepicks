/**
 * SLIP INSIGHT (P261) — what the card a reader is building actually is, while they build it.
 *
 * Three questions the builder could not answer before, each from something already published:
 *   1. What chance does this price imply, and what does it cost to combine these legs into one
 *      ticket instead of betting them separately?
 *   2. Have cards at this price actually landed? The lab publishes a settled record per price band;
 *      a built card falls in one of those bands, so that band's record is the honest comparison.
 *   3. Which of these legs are linked, and by what rule? The compatibility engine already classifies
 *      every pair — this names the pairs instead of reporting a count.
 *
 * No model probability appears here: every modeled MLB prop market is demoted to market context, so
 * the only chance this file states is the one the price implies, labelled as such. Nothing suggests
 * a stake, and nothing here is a projection.
 */
import { classifyPair, RELATIONS } from "@/lib/build/compatibility.mjs";
import { benchFor, bandFor, repriceCard, decimalOdds, toAmerican } from "@/lib/parlays/leg-swap";
import { recordForLeg } from "@/lib/parlays/lab/leg-record.mjs";

/** Chance a price implies — 1 / decimal. It includes the sportsbook's margin wherever it is shown. */
export const impliedFromAmerican = (american) => {
  const d = decimalOdds(american);
  return d > 1 ? 1 / d : null;
};

/**
 * The card as one ticket, and the same legs bet separately.
 *
 * Each leg's own price implies a chance; multiplying them is what the parlay price is built from.
 * Stating both lets a reader see the trade they are making rather than only the bigger number.
 */
export function cardChance(legs) {
  const priced = legs.filter((l) => Number.isFinite(l.americanOdds) && l.americanOdds !== 0);
  if (priced.length === 0) return null;
  const decimal = priced.reduce((d, l) => d * decimalOdds(l.americanOdds), 1);
  const legChances = priced.map((l) => impliedFromAmerican(l.americanOdds));
  return {
    legs: priced.length,
    decimal,
    american: toAmerican(decimal),
    /** What the combined price implies — mathematically the product of the legs' implied chances. */
    impliedChance: decimal > 1 ? 1 / decimal : null,
    /** The least likely leg: the one that most often decides a card like this. */
    weakestLegChance: legChances.length ? Math.min(...legChances) : null,
    band: bandFor(toAmerican(decimal)),
  };
}

/**
 * The published record of the price band this card falls in.
 *
 * It is NOT this card's record — nobody has graded a card that does not exist. It is what the lab's
 * own published cards in the same band have done, and it is labelled that way wherever it renders.
 */
export function bandRecord(american, byTier) {
  const band = bandFor(american);
  const rec = band && byTier ? byTier[band] : null;
  if (!rec) return null;
  const decided = (rec.wins ?? 0) + (rec.losses ?? 0);
  if (decided === 0) return null;
  return { band, wins: rec.wins, losses: rec.losses, decided, hitRate: rec.wins / decided, roi: rec.roi ?? null };
}

/**
 * Every linked pair on the card, each with the engine's own reason. Hard conflicts first: those are
 * provable (a duplicate, or two sides of one total), while a shared game is disclosed as unvalidated.
 */
export function linkedPairs(selection) {
  const out = [];
  for (let i = 0; i < selection.length; i++) {
    for (let j = i + 1; j < selection.length; j++) {
      const r = classifyPair(selection[i], selection[j]);
      if (r.relation === RELATIONS.INDEPENDENT) continue;
      out.push({ a: selection[i], b: selection[j], relation: r.relation, hardDisable: r.hardDisable, reason: r.reason });
    }
  }
  return out.sort((x, y) => Number(y.hardDisable) - Number(x.hardDisable));
}

/**
 * One shorter-priced alternative for the card's longest leg, with what it does to the whole price.
 *
 * OFFERED, NEVER APPLIED, and never described as better: a shorter price is a smaller payout at a
 * higher implied chance, which is a trade, not an improvement. The bench comes from the same
 * published pool the swap panel uses, so it can only ever reach a leg the site already publishes.
 */
export function shorterAlternative(pool, draft) {
  const priced = draft.filter((l) => Number.isFinite(l.americanOdds) && l.americanOdds !== 0);
  if (priced.length < 2 || !pool?.length) return null;
  let index = 0;
  for (let i = 1; i < priced.length; i++) {
    if (decimalOdds(priced[i].americanOdds) > decimalOdds(priced[index].americanOdds)) index = i;
  }
  const target = priced[index];
  const onCard = priced.map((l) => ({ player: l.player, market: l.market, gameId: l.gameId, americanOdds: l.americanOdds }));
  const shorter = benchFor(pool, { player: target.player, market: target.market, gameId: target.gameId, americanOdds: target.americanOdds }, onCard, 12)
    .filter((c) => decimalOdds(c.americanOdds) < decimalOdds(target.americanOdds));
  if (!shorter.length) return null;
  // Closest shorter price — a neighbour, not the shortest thing on the board.
  const incoming = shorter[0];
  const after = repriceCard(priced, index, incoming.americanOdds);
  return {
    outgoing: target,
    incoming,
    beforeAmerican: toAmerican(priced.reduce((d, l) => d * decimalOdds(l.americanOdds), 1)),
    afterAmerican: after,
    beforeChance: impliedFromAmerican(toAmerican(priced.reduce((d, l) => d * decimalOdds(l.americanOdds), 1))),
    afterChance: impliedFromAmerican(after),
  };
}

/**
 * A DIFFERENT KIND OF LEG ON THE SAME PLAYER, where our own settled record separates the two (P269).
 *
 * The stand-in above trades price for implied chance. This trades KIND: the same batter, in the same
 * game, offered in two families whose legs our cards have actually settled — and one family lost
 * materially less than the other. That is the only comparison on this site that rests on results
 * rather than on a price, so it is also the only one that has to be fenced in properly:
 *
 *   · BOTH families must have a substantial sample. A row with forty legs can sit twenty points from
 *     another by chance alone, and a "better kind of leg" built on that is noise dressed as evidence.
 *   · The gap must be material. A point of flat return between two families is not a finding.
 *   · NEITHER family is presented as profitable. Most measured families lost money and one sits a
 *     point above break-even on a hundred-odd legs, which is its own noise — so the copy states both
 *     returns WITH their sample captions and asserts nothing about either. Hardcoding "both lost
 *     money" would have shipped a false sentence the first time a family crossed zero.
 *   · It is offered, never applied, and the price it moves the card to travels with it — a shorter
 *     leg is a smaller payout, and the reader decides whether that trade is one they want.
 */
export function recordTrade(pool, draft, record, { minDecided = 100, minGap = 0.05 } = {}) {
  const priced = draft.filter((l) => Number.isFinite(l.americanOdds) && l.americanOdds !== 0);
  if (!priced.length || !pool?.length || !record?.families?.length) return null;
  const onCard = new Set(priced.map((l) => `${l.player}|${l.market}|${l.side ?? ""}|${l.line ?? ""}`));

  let best = null;
  for (let i = 0; i < priced.length; i++) {
    const leg = priced[i];
    const from = recordForLeg(record, { market: leg.market, marketLabel: leg.marketLabel, side: leg.side, line: leg.line });
    if (!from || from.decided < minDecided || from.flatReturn == null) continue;
    for (const c of pool) {
      if (c.player !== leg.player || c.gameId !== leg.gameId) continue;
      if (onCard.has(`${c.player}|${c.market}|${c.side ?? ""}|${c.line ?? ""}`)) continue;
      if (!Number.isFinite(c.americanOdds) || c.americanOdds === 0) continue;
      const to = recordForLeg(record, { market: c.market, marketLabel: c.marketLabel, side: c.side, line: c.line });
      if (!to || to.decided < minDecided || to.flatReturn == null) continue;
      if (to.label === from.label) continue;
      const gap = to.flatReturn - from.flatReturn;
      if (gap < minGap) continue;
      if (!best || gap > best.gap || (gap === best.gap && to.decided > best.to.decided)) {
        best = { gap, index: i, outgoing: leg, incoming: c, from, to };
      }
    }
  }
  if (!best) return null;
  const beforeAmerican = toAmerican(priced.reduce((d, l) => d * decimalOdds(l.americanOdds), 1));
  return {
    outgoing: best.outgoing,
    incoming: best.incoming,
    from: best.from,
    to: best.to,
    gap: best.gap,
    beforeAmerican,
    afterAmerican: repriceCard(priced, best.index, best.incoming.americanOdds),
  };
}
