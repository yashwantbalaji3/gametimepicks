/**
 * THE ONE NFL-BOARD → CANDIDATE EXTRACTOR.
 *
 * ⚠ IT EXISTS BECAUSE I BRIEFLY HAD TWO. A throwaway funnel harness read the price as
 * `overOdds ?? price` while the ops runner read `overOdds ?? price ?? yesOdds` — and `anytime_td`
 * prices live under `market.yesOdds`. The harness therefore reported all 275 TD rows as UNPRICED,
 * which attributed their drop to the market stage when they are in fact priced, carry a published
 * probability, and are blocked by their family state. Two extractors for one rule is how a funnel
 * sends a reader to fix the wrong thing.
 *
 * ⚠ PER-FAMILY PRICE KEYS ARE DECLARED, NOT GUESSED. A chain of `??` fallbacks silently accepts any
 * shape and hides a renamed field as "unpriced". A family whose key is not listed REFUSES, so a new
 * market shows up as a gap rather than as a zero.
 */

/** Which board field carries the price, per family. Binary families have no line by nature. */
export const NFL_FAMILY_MARKET_SHAPE = Object.freeze({
  player_rush_yds: { binary: false, priceKey: "overOdds" },
  player_reception_yds: { binary: false, priceKey: "overOdds" },
  player_receptions: { binary: false, priceKey: "overOdds" },
  player_pass_yds: { binary: false, priceKey: "overOdds" },
  anytime_td: { binary: true, priceKey: "yesOdds" },
});

/**
 * Map one board's rows to candidate shapes. Pure: no fs, no clock.
 *
 * @param board       a published nfl-player-board artifact
 * @param familyState Map<family, publishedState> from nfl/model-status.json — the families' OWN
 *                    states, which the product path never consulted
 * @param settlementSupportFor (family) => SETTLEMENT_SUPPORT value
 * @param probabilityBasisFor  ({ projection, probability }) => PROBABILITY_BASIS value
 */
export function candidatesFromNflBoard(board, { familyState, settlementSupportFor, probabilityBasisFor, modelVersionFor }) {
  const out = [];
  const unknownFamilies = new Set();
  for (const p of board?.players ?? []) {
    for (const [fam, m] of Object.entries(p.markets ?? {})) {
      const shape = NFL_FAMILY_MARKET_SHAPE[fam];
      if (!shape) { unknownFamilies.add(fam); continue; }
      const mk = m?.market ?? null;
      const projection = m?.median ?? m?.mean ?? null;
      const probability = m?.probability ?? null;
      out.push({
        sport: "nfl",
        eventId: board.providerEventId ? `nfl-${board.providerEventId}` : null,
        eventStartUtc: board.kickoffUtc ?? null,
        matchup: board.matchup ?? null,
        participantId: p.playerId ?? null,
        participant: p.name ?? null,
        team: p.team ?? null,
        marketFamily: fam,
        familyState: familyState?.get?.(fam) ?? null,
        binary: shape.binary,
        /* A binary market genuinely has no line — recording null is the truth, not a gap. */
        line: shape.binary ? null : (mk?.line ?? null),
        price: mk?.[shape.priceKey] ?? null,
        sportsbook: mk?.sportsbook ?? null,
        marketCapturedAt: mk?.capturedAt ?? null,
        modelProjection: projection,
        modelProbability: probability,
        probabilityBasis: probabilityBasisFor({ projection, probability }),
        modelVersion: modelVersionFor?.(fam, board) ?? null,
        /* The instant the board's numbers were produced — the forecast's own timestamp, never a wall clock. */
        forecastGeneratedAt: board.generatedAt ?? null,
        participation: p.participation ?? null,
        settlementSupport: settlementSupportFor(fam),
        provenance: { sourceReceiptRefs: [`nfl/player-board/${board.providerEventId}.json`], forecastOwner: "nfl/player-board" },
        source: "nfl/player-board",
      });
    }
  }
  return { candidates: out, unknownFamilies: [...unknownFamilies] };
}
