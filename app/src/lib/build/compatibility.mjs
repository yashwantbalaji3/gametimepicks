/**
 * Build leg compatibility — versioned, deterministic, provable-only (Program 144 · Release F).
 *
 * THE RULE SET IS DELIBERATELY CONSERVATIVE. The founder's brief: hard-disable only combinations
 * that are PROVABLY incompatible from the leg data itself; anything merely suspicious is
 * deprioritised with an honest label, never silently blocked and never assigned an invented
 * correlation coefficient. The repository has no validated correlation matrix (checked — nothing
 * under lib/ computes joint outcomes across markets), so "correlation not validated" is the
 * truthful ceiling for same-game pairs.
 *
 * WHY THERE IS NO GRADE IN THIS MODULE. A defensible model-quality grade needs model probability,
 * market-implied probability, freshness and data completeness ON THE LEG. `BuildLeg` carries only
 * American odds (`riskTier` is already derived from them) — grading from odds alone is grading by
 * payout attractiveness, which the brief explicitly forbids. The blocker is precise: thread
 * modelProbability/freshness from the board artifacts through `buildEngineLegs` first. Until then
 * Build shows tiers and honest compatibility, not a letter grade it cannot defend.
 */

export const COMPAT_RULES_VERSION = 1;

/** Pair relations, ordered most→least severe. */
export const RELATIONS = Object.freeze({
  DUPLICATE: "DUPLICATE",                    // the same leg twice
  OPPOSITE_SIDES: "OPPOSITE_SIDES",          // provably mutually exclusive outcomes
  SAME_GAME_SAME_MARKET: "SAME_GAME_SAME_MARKET", // two picks in one market of one game
  SAME_GAME: "SAME_GAME",                    // same game, different markets — unknown correlation
  INDEPENDENT: "INDEPENDENT",
});

const norm = (s) => String(s ?? "").toLowerCase().trim();

/** Extract an over/under side + line from a label like "Over 8.5" / "Under 8.5 runs". */
function ouSide(label) {
  const m = norm(label).match(/\b(over|under)\b\s*([0-9]+(?:\.[0-9])?)?/);
  return m ? { side: m[1], line: m[2] ?? null } : null;
}

/** A market family key: game + normalised market. Legs in the same family compete. */
function familyKey(leg) {
  if (leg.gameId == null) return null;
  return `${leg.sport}:${leg.gameId}:${norm(leg.market)}`;
}

/**
 * Classify one pair of legs. Deterministic; order-insensitive.
 * @returns {{relation: string, hardDisable: boolean, reason: string|null}}
 */
export function classifyPair(a, b) {
  if (a.id === b.id) {
    return { relation: RELATIONS.DUPLICATE, hardDisable: true, reason: "Already on the card — the same pick cannot be added twice." };
  }

  const sameGame = a.gameId != null && b.gameId != null && a.sport === b.sport && String(a.gameId) === String(b.gameId);
  if (!sameGame) return { relation: RELATIONS.INDEPENDENT, hardDisable: false, reason: null };

  const sameMarket = familyKey(a) === familyKey(b) && familyKey(a) != null;
  if (sameMarket) {
    // Over vs Under on the same line is the one opposite-side case PROVABLE from these fields.
    const oa = ouSide(a.label), ob = ouSide(b.label);
    if (oa && ob && oa.side !== ob.side && (oa.line == null || ob.line == null || oa.line === ob.line)) {
      return {
        relation: RELATIONS.OPPOSITE_SIDES, hardDisable: true,
        reason: "Opposite sides of the same total — at most one of these can win, so combining them guarantees a lost leg.",
      };
    }
    // Two selections in one market of one game (e.g. two moneyline sides, two lines of one total):
    // mutually exclusive or redundant either way.
    return {
      relation: RELATIONS.SAME_GAME_SAME_MARKET, hardDisable: true,
      reason: "Two picks in the same market of the same game — these compete for one outcome rather than combining.",
    };
  }

  // Same game, different markets. Plausibly correlated (a blowout moves totals AND moneylines),
  // but NOT quantified by anything in this repository — so it is disclosed, never blocked and
  // never scored.
  return {
    relation: RELATIONS.SAME_GAME, hardDisable: false,
    reason: "Same game as a pick already on the card — outcomes in one game can move together, and that correlation is not validated here. Concentrated cards carry concentrated risk.",
  };
}

/**
 * Classify a candidate against the whole selection. The MOST severe relation wins, so a candidate
 * that duplicates one leg and merely shares a game with another reports the duplicate.
 */
export function classifyAgainstSelection(candidate, selection) {
  let worst = { relation: RELATIONS.INDEPENDENT, hardDisable: false, reason: null };
  const rank = [RELATIONS.DUPLICATE, RELATIONS.OPPOSITE_SIDES, RELATIONS.SAME_GAME_SAME_MARKET, RELATIONS.SAME_GAME, RELATIONS.INDEPENDENT];
  for (const s of selection) {
    const r = classifyPair(candidate, s);
    if (rank.indexOf(r.relation) < rank.indexOf(worst.relation)) worst = r;
  }
  return worst;
}

/**
 * Card health — structural facts about the current selection, from fields that exist. No invented
 * scores: game concentration, provable conflicts, unvalidated-correlation pairs, and the tier mix.
 */
export function cardHealth(selection) {
  const byGame = new Map();
  for (const l of selection) {
    const k = l.gameId != null ? `${l.sport}:${l.gameId}` : `nogame:${l.id}`;
    byGame.set(k, (byGame.get(k) ?? 0) + 1);
  }
  const maxPerGame = Math.max(0, ...byGame.values());

  let hardConflicts = 0, unknownCorrelationPairs = 0;
  for (let i = 0; i < selection.length; i++) {
    for (let j = i + 1; j < selection.length; j++) {
      const r = classifyPair(selection[i], selection[j]);
      if (r.hardDisable) hardConflicts += 1;
      else if (r.relation === RELATIONS.SAME_GAME) unknownCorrelationPairs += 1;
    }
  }

  const tierMix = {};
  for (const l of selection) tierMix[l.riskTier] = (tierMix[l.riskTier] ?? 0) + 1;

  return {
    rulesVersion: COMPAT_RULES_VERSION,
    legs: selection.length,
    games: byGame.size,
    maxLegsInOneGame: maxPerGame,
    concentrated: maxPerGame >= 2,
    hardConflicts,
    unknownCorrelationPairs,
    tierMix,
  };
}
