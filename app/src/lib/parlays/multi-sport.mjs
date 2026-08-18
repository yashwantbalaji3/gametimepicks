/**
 * CROSS-SPORT CARDS — legs drawn from more than one sport onto a single ticket.
 *
 * ══ WHAT IS ACTUALLY DIFFERENT ABOUT A CROSS-SPORT CARD ═════════════════════════════════════════
 *
 * One thing, and it is structural rather than promotional: the legs are genuinely independent. A
 * same-game parlay's legs are correlated by construction — a pitcher going deep and the same game
 * staying under are the same event twice — and this stream measured that correlation doing real
 * damage, with outcome agreement above independence in all six band pairs. Legs from a baseball
 * game and a fight card have no such channel between them.
 *
 * ══ WHAT INDEPENDENCE DOES NOT BUY ══════════════════════════════════════════════════════════════
 *
 * It does not make the card profitable, and saying so is the point of this paragraph. Every leg is
 * priced with the book's margin inside it, and combining legs MULTIPLIES that margin: four legs at
 * roughly 4.5% hold each compound to about 17% against the ticket. Independence removes a source of
 * correlated failure; it adds nothing to expected value, and a longer card is still worse than a
 * shorter one. The measured leg-count results hold here exactly as they do within a sport.
 *
 * So a cross-sport card is offered as what it is — a way to build a ticket whose legs do not all
 * die together — and never as a way to win more.
 *
 * ══ THE FLOOR ══════════════════════════════════════════════════════════════════════════════════
 *
 * Two live sports. A "multi-sport" card whose legs all came from one sport is a single-sport card
 * with a misleading label, so the builder refuses rather than degrading to one. Every leg must also
 * clear its own sport's eligibility — a sport whose prices are stale does not become publishable by
 * being combined with one whose prices are not.
 */

/** Fewest distinct sports on a card before it may be called cross-sport. */
export const MIN_SPORTS = 2;

import { getRiskBucketForCombinedOdds } from "./risk-odds-bands.mjs";

/**
 * Build cross-sport cards for one band.
 *
 * Legs arrive already priced and already qualified by their own sport. This function only decides
 * which combinations may go on a ticket together; it never invents, re-prices or re-ranks a leg.
 *
 * @param {object} o
 * @param {readonly {sport: string, eventId: string, player?: string, market: string, side: string, line?: number, decimal: number, score?: number}[]} o.legs
 * @param {number} o.maxLegs      the band's leg cap — set by the band, never by the bankroll
 * @param {Set<string>} [o.usedLegKeys]  legs already on another card this reader will be shown
 * @returns {{card: object|null, refused: string|null}}
 */
export function buildCrossSportCard({ legs, maxLegs, usedLegKeys = new Set() }) {
  const key = (l) => `${l.sport}|${l.player ?? l.eventId}|${l.market}|${l.side}|${l.line ?? ""}`;

  const usable = legs
    .filter((l) => Number.isFinite(l.decimal) && l.decimal > 1)
    .filter((l) => !usedLegKeys.has(key(l)));

  const sports = new Set(usable.map((l) => l.sport));
  if (sports.size < MIN_SPORTS) {
    return { card: null, refused: `a cross-sport card needs legs from at least ${MIN_SPORTS} sports; these come from ${sports.size}` };
  }

  /*
   * Take the strongest leg from each sport in turn, round-robin, until the cap is reached. This is
   * what makes the card cross-sport by CONSTRUCTION rather than by luck: filling purely by score
   * would let the deepest sport supply every leg and quietly produce a single-sport ticket.
   *
   * One event never appears twice — two legs from one fight or one game are correlated in exactly
   * the way this card exists to avoid.
   */
  const bySport = new Map();
  for (const l of usable) {
    const arr = bySport.get(l.sport) ?? [];
    arr.push(l);
    bySport.set(l.sport, arr);
  }
  for (const arr of bySport.values()) arr.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const picked = [];
  const usedEvents = new Set();
  const order = [...bySport.keys()].sort();
  let exhausted = false;
  while (picked.length < maxLegs && !exhausted) {
    exhausted = true;
    for (const sport of order) {
      if (picked.length >= maxLegs) break;
      const next = (bySport.get(sport) ?? []).find((l) => !usedEvents.has(`${l.sport}:${l.eventId}`) && !picked.includes(l));
      if (!next) continue;
      picked.push(next);
      usedEvents.add(`${next.sport}:${next.eventId}`);
      exhausted = false;
    }
  }

  const onCard = new Set(picked.map((l) => l.sport));
  if (onCard.size < MIN_SPORTS) {
    return { card: null, refused: `only ${onCard.size} sport survived the one-event-per-card rule; a cross-sport card needs ${MIN_SPORTS}` };
  }

  const decimal = picked.reduce((p, l) => p * l.decimal, 1);
  return {
    card: {
      legs: picked,
      sports: [...onCard].sort(),
      combinedDecimal: Math.round(decimal * 1000) / 1000,
      combinedAmerican: decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1)),
    },
    refused: null,
  };
}

/** Per-band leg caps. Set by the BAND from the backtest — identical in every sport, and for multi. */
export const BAND_MAX_LEGS = { low: 2, medium: 3, high: 4, longshot: 5 };

/** Fewest legs a parlay can have. A one-leg "parlay" is a single bet wearing the wrong label. */
const MIN_LEGS = 2;

/**
 * SPORTS THE LAB SETTLER CAN ACTUALLY GRADE.
 *
 * The Parlay Lab's entire claim is that it quotes real posted prices AND grades them. A card it
 * cannot grade is not a weaker version of that claim, it is a different one — the card sits pending
 * forever and quietly never enters the record, so the published hit rate is computed over only the
 * cards that happened to be settleable. That is how a record flatters itself without anyone lying.
 *
 * settle-lab-cards.mjs grades from the MLB Stats API via each leg's gamePk. A UFC leg has no
 * gamePk; boxFor(null) returns "not final" and the leg never resolves. So a cross-sport card built
 * today would be published and never graded.
 *
 * This list is therefore a PRECONDITION, not a preference, and a guard asserts it against what the
 * settler actually implements — adding a sport here without teaching the settler re-opens exactly
 * the hole it closes.
 *
 * UFC was added once settle-lab-cards could grade a fight leg from the official results capture
 * (1,545 bouts, decisive-only, folded names on both sides of the join). The guard checks the
 * settler for evidence of each declared sport, so this line cannot run ahead of the capability.
 */
export const SETTLEABLE_SPORTS = ["mlb", "ufc"];

/**
 * Build the multi-sport ladder: one cross-sport card per band, from every live sport's own cards.
 *
 * Takes `ladderFor` rather than reading disk, so the path that first runs on the day a second sport
 * goes live can be exercised now instead of on that day.
 *
 * Legs come from cards those sports ALREADY published, so nothing here re-prices or re-qualifies a
 * selection — it only decides what may share a ticket.
 *
 * @param {object} o
 * @param {readonly string[]} o.liveSports  sports that cleared their own eligibility gate
 * @param {readonly string[]} o.riskOrder
 * @param {string} o.date
 * @param {(sport: string, date: string) => {cards?: object[]}|null} o.ladderFor
 */
export function buildMultiLadder({ liveSports, riskOrder, date, ladderFor, settleableSports = SETTLEABLE_SPORTS }) {
  const legs = [];
  for (const sport of liveSports) {
    for (const card of ladderFor(sport, date)?.cards ?? []) {
      for (const leg of card.legs ?? []) {
        const american = Number(leg.odds);
        if (!Number.isFinite(american) || american === 0) continue;   // an unpriced leg is not a leg
        legs.push({
          sport,
          eventId: String(leg.gameId ?? leg.eventId ?? ""),
          player: leg.player ?? null,
          market: leg.market, side: leg.side, line: leg.line ?? null,
          /* Carry the POSTED price, not only the decimal used for arithmetic. Without it every
             published leg read "odds: undefined" — a card quoting no prices, on a lane whose whole
             claim is that it quotes real posted prices. The combined number was right, which is
             what made it look complete. */
          odds: american,
          decimal: american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american),
          score: 0,
          team: leg.team ?? null, opponent: leg.opponent ?? null, marketLabel: leg.marketLabel ?? null,
        });
      }
    }
  }

  const cards = [], skipped = [], used = new Set();
  const legKey = (l) => `${l.sport}|${l.player ?? l.eventId}|${l.market}|${l.side}|${l.line ?? ""}`;

  /*
   * ══ A BAND IS A PRICE RANGE, NOT A LEG COUNT ══════════════════════════════════════════════════
   *
   * The first version of this loop built one card per band using that band's leg CAP and then
   * labelled the result with the band's name. Nothing ever checked the price. Against a real
   * two-sport slate it published a +203 card as "Low risk" — low ends at +100 — and three of its
   * four cards were mislabelled, every one of them understating the risk.
   *
   * The worst case landed exactly where it does most harm: bronze is shown ONE card, and it is the
   * low-risk one precisely because that band is meant to be the calmest thing on the board.
   *
   * So a card is assigned to a band by its COMBINED PRICE, through the same canonical function the
   * single-sport ladder and the grader use. The leg cap stays a cap — the backtest is unambiguous
   * that longer is worse within every band — but it no longer decides the label. Where no leg count
   * lands a card inside a band, that band is SKIPPED with the prices it did reach, rather than
   * filled with a card that does not belong in it.
   */
  for (const band of riskOrder) {
    const cap = BAND_MAX_LEGS[band] ?? 5;
    let card = null, refused = null;
    const reached = [];

    // Shortest first: within a band the shorter card wins on every measured axis, so the first
    // card that lands in the band is also the best one available for it.
    for (let n = MIN_LEGS; n <= cap; n++) {
      const attempt = buildCrossSportCard({ legs, maxLegs: n, usedLegKeys: used });
      if (!attempt.card) { refused = attempt.refused; continue; }
      if (attempt.card.legs.length < MIN_LEGS) continue;
      /* Refuse before pricing: an ungradeable leg disqualifies the card whatever it costs. */
      const ungradeable = [...new Set(attempt.card.legs.map((l) => l.sport))].filter((sp) => !settleableSports.includes(sp));
      if (ungradeable.length) {
        refused = `the lab settler cannot grade ${ungradeable.join(" or ")} legs yet, and a card that cannot be graded must not be published`;
        continue;
      }
      const bucket = getRiskBucketForCombinedOdds(attempt.card.combinedAmerican);
      reached.push(`${attempt.card.legs.length} legs → ${attempt.card.combinedAmerican > 0 ? "+" : ""}${attempt.card.combinedAmerican} (${bucket ?? "shorter than the low floor"})`);
      if (bucket === band) { card = attempt.card; break; }
    }

    if (!card) {
      skipped.push({
        tier: band,
        reason: reached.length
          ? `no cross-sport card priced into this band today — ${reached.join("; ")}`
          : (refused ?? "no cross-sport card could be built"),
      });
      continue;
    }
    for (const l of card.legs) used.add(legKey(l));
    cards.push({
      tier: band, slipId: `multi-${band}-${date}`,
      combinedAmerican: card.combinedAmerican, combinedDecimal: card.combinedDecimal,
      legs: card.legs, sports: card.sports, status: "pending",
      /* Null, not 0-0: a stream that has never settled a card has no hit rate, and a zeroed record
         reads like a measured result rather than an absent one. */
      tierRecord: null,
    });
  }
  return { cards, skipped };
}
