/**
 * THE DISPLAYED PROP PRICE: which sportsbook a reader sees, and why (founder decision, 2026-09-24).
 *
 * ⚠ THIS LIVED INSIDE `scripts/nfl/capture-nfl-odds.mjs`, WHERE NOTHING COULD RUN IT. The only
 * guard over the most consequential rule in the NFL prop lane — whose number appears on screen and
 * under whose name — was a REGEX OVER THE SCRIPT'S SOURCE TEXT. That guard passed while the policy
 * was a single book and went red the moment the founder authorized a ladder, because it was pinned
 * to the shape of the code rather than to what the code must do; and it could never have caught a
 * genuine mis-attribution, only a rename.
 *
 * Extracted here so the policy can be EXECUTED against constructed evidence: a book that posts one
 * side, two books posting different points, DraftKings missing a family that FanDuel has. Nothing
 * about the behaviour changes — the capture imports exactly what it used to declare.
 *
 * Run: npx tsx --test src/lib/sports/odds/prop-display-selection.test.mjs
 */

/*
 * THE REFERENCE SPORTSBOOK for displayed prop prices (founder decision, 2026-09-24). One named
 * book, attributed by name. Not a "best odds" rule and not a consensus — both would be policies
 * this repo has never agreed, and a blended number has no book to attribute it to.
 */
export const REFERENCE_BOOK = "draftkings";
/*
 * THE FALLBACK LADDER (founder decision, 2026-09-24). Coverage beats an empty row, but never at the
 * cost of attribution: whichever book is chosen is the book NAMED on screen.
 *
 *   1. DraftKings — if it has a complete valid market for that player/event/family
 *   2. FanDuel    — if DraftKings does not
 *   3. deterministic — among the books that actually returned a complete market for that
 *      event+family, the one with the most complete markets; ties broken by provider key, ascending
 *
 * ⚠ NOT LINE SHOPPING. The ordering never looks at the PRICE, so it cannot drift into "best odds"
 * — a policy nobody has agreed and which would make the displayed number a recommendation. It looks
 * only at coverage and, failing that, at a stable alphabetical key.
 *
 * ⚠ NEVER CROSS-BOOK. A two-sided market is taken whole from ONE book: an Over from DraftKings and
 * an Under from FanDuel is not a market, it is two halves of different markets wearing one label.
 * `lineProps` rows are already complete pairs from a single book, so choosing a row IS choosing a
 * book — the pair can never be split by construction.
 */
export const FALLBACK_ORDER = [REFERENCE_BOOK, "fanduel"];

/** Books that returned a complete market for this event+family, ranked by coverage then key. */
export function rankBooks(rows) {
  const byBook = new Map();
  for (const r of rows) byBook.set(r.bookmaker, (byBook.get(r.bookmaker) ?? 0) + 1);
  return [...byBook.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))
    .map(([b]) => b);
}

/**
 * Pick ONE book per (event, player, family) and emit the display row. Returns [] rather than
 * guessing when nothing complete exists — an absent price is a state, never a gap to be filled.
 */
export function selectPropPrices(probe) {
  const out = [];
  const pick = (candidates) => {
    if (!candidates.length) return null;
    const ranked = rankBooks(candidates);
    const book = FALLBACK_ORDER.find((b) => candidates.some((c) => c.bookmaker === b)) ?? ranked[0];
    /*
     * ⚠ `find` TOOK WHATEVER THE PROVIDER LISTED FIRST. One book can post more than one point for
     * the same player and family, and then the displayed line depended on response ordering rather
     * than on any rule — the same capture could name a different number on a re-run, with nothing
     * on screen to say a choice had been made at all. Only the main keys are requested, so this
     * should be rare; "should be rare" is not a reason to leave it undefined.
     *
     * Lowest point first, then the earliest capture instant: a total order over the rows of ONE
     * book, so it is reproducible and still never looks at the price. `linesOffered` carries the
     * count, so a row where the choice actually mattered is visible instead of silent.
     */
    const ownRows = candidates
      .filter((c) => c.bookmaker === book)
      .sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity) || String(a.capturedAt).localeCompare(String(b.capturedAt)));
    return ownRows.length ? { ...ownRows[0], linesOffered: ownRows.length } : null;
  };
  /* Group by the triple the UI keys on, so a choice is made per row and not per event. */
  const group = (rows, family) => {
    const g = new Map();
    for (const r of rows) {
      const k = `${r.canonicalEventId}|${r.playerId}|${family ?? r.market}`;
      (g.get(k) ?? g.set(k, []).get(k)).push(r);
    }
    return g;
  };
  for (const [, cands] of group(probe.anytimeTd?.rows ?? [], "anytime_td")) {
    const c = pick(cands);
    if (c) out.push({ canonicalEventId: c.canonicalEventId, playerId: c.playerId, family: "anytime_td", shape: "YES_ONLY", yesOdds: c.price, sportsbook: c.bookmaker, capturedAt: c.capturedAt, booksAvailable: rankBooks(cands).length });
  }
  for (const [, cands] of group(probe.lineProps?.rows ?? [], null)) {
    const c = pick(cands);
    if (c) out.push({ canonicalEventId: c.canonicalEventId, playerId: c.playerId, family: c.market, shape: "OVER_UNDER", line: c.line, overOdds: c.overPrice, underOdds: c.underPrice, sportsbook: c.bookmaker, capturedAt: c.capturedAt, booksAvailable: rankBooks(cands).length, linesOffered: c.linesOffered ?? 1 });
  }
  return out;
}
