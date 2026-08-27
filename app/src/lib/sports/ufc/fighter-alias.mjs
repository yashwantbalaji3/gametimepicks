/**
 * SECOND-CHANCE FIGHTER MATCHING — for the three ways a book writes a name differently from a card.
 *
 * WHAT THIS RECOVERED. On the Aug-29 Shanghai card, five of thirteen bouts published unpriced. The
 * coverage classifier's fighter-identity test proved the book HAD all five, and reading the five
 * unmatched provider keys against the card showed exactly three fold defects, none of them exotic:
 *
 *   card "Ding Meng"          ↔ provider "meng ding"        — CJK given/family name order
 *   card "Xiao Long"          ↔ provider "long xiao"        — same
 *   card "Levi Rodrigues Jr." ↔ provider "levi rodrigues"   — generational suffix dropped
 *   card "Sumudaerji"         ↔ provider "su mudaerji"      — one name written as two
 *   card "Aoriqileng"         ↔ provider "aori qileng"      — same
 *
 * Five bouts of market data we had bought and thrown away, on a card two days out, because two
 * strings for the same fighter did not fold to the same key.
 *
 * WHY IT IS NOT IN `nameKey`. That fold is shared with the fight model, where it joins fighters to
 * an 8,642-bout historical corpus. Loosening it there changes which fights the model believes it has
 * history for — a much larger blast radius than a market join, and not a change to make in passing.
 * So this is a SECOND pass, tried only after the exact fold has failed, and every rescue it makes is
 * recorded on the bout as `joinMethod` so an exact match and a salvaged one are never confused.
 *
 * WHY IT IS SAFE. Both fighters in a bout must agree, so a false pair needs two independent
 * collisions at once. And the loose forms are only ever compared to loose forms — the exact key is
 * still the first and preferred answer.
 */

/** Generational suffixes a book drops and a card keeps (or the reverse). */
const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b/g;

/** The already-folded key, minus suffixes: "levi rodrigues jr" → "levi rodrigues". */
function base(foldedName) {
  return String(foldedName ?? "").replace(SUFFIX, " ").replace(/\s+/g, " ").trim();
}

/**
 * The two loose forms of one folded fighter name.
 *
 *   `joined`  — all whitespace removed. Catches a single name written as two:
 *               "sumudaerji" and "su mudaerji" both become "sumudaerji".
 *   `ordered` — tokens sorted, then joined. Catches reversed name order:
 *               "ding meng" and "meng ding" both become "dingmeng".
 *
 * Two forms rather than one because neither covers the other: sorting tokens does not help
 * "su mudaerji" (one token vs two), and removing spaces does not help "meng ding".
 */
export function looseForms(foldedName) {
  const b = base(foldedName);
  if (!b) return null;
  const tokens = b.split(" ").filter(Boolean);
  return {
    joined: tokens.join(""),
    ordered: [...tokens].sort().join(""),
  };
}

/** True when two folded names are the same fighter under either loose form. */
export function looselySameFighter(a, b) {
  const x = looseForms(a);
  const y = looseForms(b);
  if (!x || !y) return false;
  return x.joined === y.joined || x.ordered === y.ordered;
}

/**
 * Find the provider key naming the same two fighters as `boutSides`, ignoring name order, spacing
 * and generational suffixes.
 *
 * @param {string[]} boutSides      the bout's two ALREADY-FOLDED fighter names
 * @param {Iterable} candidateKeys  unconsumed provider keys, each "foldedA|foldedB"
 * @returns {string|null} the single matching key, or null. AMBIGUITY IS A REFUSAL: if two provider
 *   events both loosely match, we cannot say which is the bout, and guessing would attach a price
 *   to the wrong fight — which is worse than the missing price it was trying to fix.
 */
export function findLooseMatch(boutSides, candidateKeys) {
  const [a, b] = boutSides ?? [];
  if (!a || !b) return null;
  const hits = [];
  for (const key of candidateKeys) {
    const sides = String(key).split("|");
    if (sides.length !== 2) continue;
    const [p, q] = sides;
    const straight = looselySameFighter(a, p) && looselySameFighter(b, q);
    const crossed = looselySameFighter(a, q) && looselySameFighter(b, p);
    if (straight || crossed) hits.push(key);
    if (hits.length > 1) return null;
  }
  return hits.length === 1 ? hits[0] : null;
}
