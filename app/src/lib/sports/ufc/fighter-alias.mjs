/**
 * SECOND-CHANCE FIGHTER MATCHING — for the ways a book writes a name differently from a card.
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

/*
 * SHORT AND LONG FORMS OF ONE GIVEN NAME (2026-10-05).
 *
 * UFC 332 (2026-10-03) priced 12 of 14 bouts. The two it missed were on the book under a different
 * FIRST name, same family name:
 *
 *   card "Alexander Hernandez" ↔ provider "alex hernandez"   — short form is a prefix of the long
 *   card "Mick Parkin"         ↔ provider "michael parkin"   — a nickname no prefix rule reaches
 *
 * The rule is narrow on purpose: the family name (every token after the first, suffixes dropped)
 * must be IDENTICAL, and the first names must be a known short/long pair — either one is a prefix of
 * the other (three letters at least), or both sit in the same row of the short table below. The
 * table is a list of pairs we have seen or that are unambiguous in English; it is not a guess at what
 * a name "might" be short for. "Alex Perez" and "Alex Pereira" still never meet: the family names
 * differ.
 */
const GIVEN_NAME_FORMS = [
  ["michael", "mick", "mike", "mikey", "mickey"],
  ["william", "will", "bill", "billy", "liam"],
  ["robert", "rob", "bob", "bobby", "robbie"],
  ["richard", "rick", "rich", "dick", "ricky"],
  ["joseph", "joe", "joey"],
  ["james", "jim", "jimmy", "jamie"],
  ["anthony", "tony"],
  ["nicholas", "nick", "nicky"],
  ["christopher", "chris"],
  ["matthew", "matt"],
  ["benjamin", "ben"],
  ["daniel", "dan", "danny"],
  ["jonathan", "jon", "jonny"],
  ["thomas", "tom", "tommy"],
  ["edward", "ed", "eddie"],
  ["charles", "charlie", "chuck"],
  ["steven", "steve"],
  ["stephen", "steve"],
  // Seen 2026-10-06: card "Loopy Godínez" ↔ provider "lupita godinez" (the Oct 10 Fight Night).
  ["lupita", "loopy"],
];
const SAME_GIVEN = new Map();
for (const row of GIVEN_NAME_FORMS) for (const n of row) {
  const set = SAME_GIVEN.get(n) ?? new Set();
  for (const m of row) set.add(m);
  SAME_GIVEN.set(n, set);
}

/** True when two folded given names are the short and long form of one name. */
export function sameGivenName(x, y) {
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 3 && long.startsWith(short)) return true;
  return SAME_GIVEN.get(x)?.has(y) ?? false;
}

/** Same family name, given names a known short/long pair: "alex hernandez" ↔ "alexander hernandez". */
export function sameFighterByGivenName(a, b) {
  const x = base(a).split(" ").filter(Boolean);
  const y = base(b).split(" ").filter(Boolean);
  if (x.length < 2 || y.length < 2) return false;
  if (x.slice(1).join(" ") !== y.slice(1).join(" ")) return false;
  return sameGivenName(x[0], y[0]);
}

/*
 * ONE NAME, TWO ROMANISATIONS (2026-10-07).
 *
 * The Oct 10 Fight Night priced 10 of 12 bouts. One of the two misses was the same fighter written
 * from Russian two ways:
 *
 *   card "Daria Zhelezniakova" ↔ provider "darya zheleznyakova"
 *
 * Cyrillic "я" and "ю" are written "ia"/"iu" by one source and "ya"/"yu" by another. The fold
 * below turns an "i" in front of "a" or "u" into "y" on BOTH names, then compares the whole name.
 * Nothing else changes: the family name still has to agree letter for letter after the fold, both
 * fighters in the bout still have to agree, and ambiguity still refuses.
 */
export function romanisedForm(foldedName) {
  const b = base(foldedName);
  return b ? b.replace(/i(?=[au])/g, "y").replace(/\s+/g, "") : null;
}

/** True when two folded names are the same fighter under either loose form, or a given-name pair. */
export function looselySameFighter(a, b) {
  const x = looseForms(a);
  const y = looseForms(b);
  if (!x || !y) return false;
  return x.joined === y.joined || x.ordered === y.ordered || sameFighterByGivenName(a, b) ||
    romanisedForm(a) === romanisedForm(b);
}

/**
 * Which provider outcome name is each card fighter's price, once a bout is joined.
 *
 * The join above matches the BOUT; the prices inside it are still keyed by the book's own spelling.
 * Looking a price up by the card's spelling found nothing for every rescued fighter, so an alias
 * join published one side with no price (Oct 10: "Kai Kamaka III" vs the book's "kai kamaka"). This
 * maps each card fighter to exactly one outcome: the exact fold first, otherwise the single outcome
 * that loosely matches. Two card fighters may never claim the same outcome; ambiguity returns null.
 *
 * @param {string[]} cardSides     the bout's two ALREADY-FOLDED card names
 * @param {Iterable} outcomeKeys   the folded outcome names the book posted for this bout
 * @returns {(string|null)[]} the outcome key for each card side, or null where it cannot be said
 */
export function resolveOutcomeNames(cardSides, outcomeKeys) {
  const keys = [...new Set(outcomeKeys)];
  const pick = (name) => {
    if (!name) return null;
    if (keys.includes(name)) return name;
    const hits = keys.filter((k) => looselySameFighter(name, k));
    return hits.length === 1 ? hits[0] : null;
  };
  const out = (cardSides ?? []).map(pick);
  if (out.length === 2 && out[0] && out[0] === out[1]) return [null, null];
  return out;
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
