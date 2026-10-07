/**
 * The second-chance fighter match, against the five real bouts it was written for.
 *
 * Every case here is a spelling the book actually used on the 2026-08-29 Shanghai card, against the
 * spelling our card carried. All five had prices we had already bought and were discarding.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { looseForms, looselySameFighter, findLooseMatch } from "./fighter-alias.mjs";

/** The same fold nameKey applies, inlined so this suite does not reach into the model's lib. */
const fold = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

test("REVERSED NAME ORDER · the card's 'Ding Meng' is the book's 'meng ding'", () => {
  assert.ok(looselySameFighter(fold("Ding Meng"), fold("Meng Ding")));
  assert.ok(looselySameFighter(fold("Xiao Long"), fold("Long Xiao")));
});

test("DROPPED SUFFIX · 'Levi Rodrigues Jr.' is 'levi rodrigues'", () => {
  assert.ok(looselySameFighter(fold("Levi Rodrigues Jr."), fold("Levi Rodrigues")));
  assert.ok(looselySameFighter(fold("Someone Sr"), fold("Someone")));
  assert.ok(looselySameFighter(fold("Someone III"), fold("Someone")));
});

test("ONE NAME WRITTEN AS TWO · 'Sumudaerji' is 'su mudaerji'", () => {
  assert.ok(looselySameFighter(fold("Sumudaerji"), fold("Su Mudaerji")));
  assert.ok(looselySameFighter(fold("Aoriqileng"), fold("Aori Qileng")));
});

test("the exact-match case still matches, and diacritics still fold", () => {
  assert.ok(looselySameFighter(fold("Kauê Fernandes"), fold("Kaue Fernandes")));
  assert.ok(looselySameFighter(fold("Song Yadong"), fold("Song Yadong")));
});

test("DIFFERENT FIGHTERS DO NOT MATCH — the loosening has a floor", () => {
  assert.equal(looselySameFighter(fold("Song Yadong"), fold("Umar Nurmagomedov")), false);
  assert.equal(looselySameFighter(fold("Alex Perez"), fold("Alex Pereira")), false);
  assert.equal(looselySameFighter(fold("Kai Asakura"), fold("Kai Kara-France")), false);
  assert.equal(looselySameFighter(fold("Liu Ce"), fold("Liu Pingyuan")), false);
});

test("an empty or unusable name never matches anything", () => {
  assert.equal(looselySameFighter("", "anything"), false);
  assert.equal(looselySameFighter(null, "anything"), false);
  assert.equal(looseForms(""), null);
  assert.equal(looseForms("  "), null);
});

/* ── THE PAIR MATCH ───────────────────────────────────────────────────────────────────────────── */

test("THE FIVE REAL BOUTS · every one of them joins on the second pass", () => {
  // Left: the card's spelling. Right: the provider key the book actually published.
  const cases = [
    [["Ding Meng", "Cameron Nelson"], "cameron nelson|meng ding"],
    [["Xiao Long", "Francesco Nuzzi"], "francesco nuzzi|long xiao"],
    [["Liu Ce", "Levi Rodrigues Jr."], "levi rodrigues|liu ce"],
    [["Alex Perez", "Sumudaerji"], "alex perez|su mudaerji"],
    [["Kai Asakura", "Aoriqileng"], "aori qileng|kai asakura"],
  ];
  const keys = cases.map(([, k]) => k);
  for (const [sides, expected] of cases) {
    assert.equal(findLooseMatch(sides.map(fold), keys), expected, sides.join(" vs "));
  }
});

test("a bout with no counterpart in the payload finds nothing", () => {
  const keys = ["cameron nelson|meng ding", "francesco nuzzi|long xiao"];
  assert.equal(findLooseMatch([fold("Song Yadong"), fold("Umar Nurmagomedov")], keys), null);
});

test("BOTH sides must agree — one matching fighter is not a matching bout", () => {
  // "Ding Meng" is on this key, but the opponent is somebody else entirely.
  const keys = ["meng ding|somebody else"];
  assert.equal(findLooseMatch([fold("Ding Meng"), fold("Cameron Nelson")], keys), null);
});

test("REFUSAL · two loose matches is ambiguity, and ambiguity attaches no price", () => {
  /*
   * Guessing here would put a real price on the wrong fight, which is worse than the missing price
   * it was trying to fix. A duplicated provider listing must end the search, not win it.
   */
  const keys = ["cameron nelson|meng ding", "meng ding|cameron nelson"];
  assert.equal(findLooseMatch([fold("Ding Meng"), fold("Cameron Nelson")], keys), null);
});

test("a malformed provider key is skipped, never parsed into a match", () => {
  const keys = ["justonename", "a|b|c", "cameron nelson|meng ding"];
  assert.equal(findLooseMatch([fold("Ding Meng"), fold("Cameron Nelson")], keys), "cameron nelson|meng ding");
});

/* ── SHORT AND LONG GIVEN NAMES (UFC 332, 2026-10-03) ─────────────────────────────────────────── */

test("UFC 332 · the two bouts the book listed under a different first name now join", async () => {
  const { sameFighterByGivenName } = await import("./fighter-alias.mjs");
  assert.equal(sameFighterByGivenName(fold("Alexander Hernandez"), "alex hernandez"), true, "prefix");
  assert.equal(sameFighterByGivenName(fold("Mick Parkin"), "michael parkin"), true, "nickname table");
  // The real UFC 332 payload's two unmatched keys, against the card's spellings.
  const keys = ["alex hernandez|rafael dos anjos", "johnny walker|michael parkin"];
  assert.equal(findLooseMatch([fold("Rafael Dos Anjos"), fold("Alexander Hernandez")], keys), "alex hernandez|rafael dos anjos");
  assert.equal(findLooseMatch([fold("Johnny Walker"), fold("Mick Parkin")], keys), "johnny walker|michael parkin");
});

test("GIVEN-NAME FLOOR · the family name must be identical, and the first names a real pair", async () => {
  const { sameFighterByGivenName, sameGivenName } = await import("./fighter-alias.mjs");
  assert.equal(sameFighterByGivenName("alex perez", "alexander pereira"), false, "different family name");
  assert.equal(sameFighterByGivenName("mick parkin", "mark parkin"), false, "mark is not a form of mick");
  assert.equal(sameFighterByGivenName("jo smith", "joseph smith"), false, "two-letter prefix is too short to mean anything");
  assert.equal(sameFighterByGivenName("parkin", "michael parkin"), false, "a single token has no given name to compare");
  assert.equal(sameGivenName("mike", "mick"), true, "same row of the table");
  assert.equal(sameGivenName("tony", "michael"), false);
});

test("GIVEN-NAME REFUSAL · two brothers on one payload is ambiguity, never a pick", () => {
  // The card's "Alex Hernandez" is a short form of both listed names, so neither may be chosen.
  const keys = ["alexander hernandez|rafael dos anjos", "alexandre hernandez|rafael dos anjos"];
  assert.equal(findLooseMatch([fold("Rafael Dos Anjos"), fold("Alex Hernandez")], keys), null);
});

test("BOTH sides must still agree under the given-name rule", () => {
  const keys = ["alex hernandez|somebody else"];
  assert.equal(findLooseMatch([fold("Rafael Dos Anjos"), fold("Alexander Hernandez")], keys), null);
});

/* ── OCT 10 FIGHT NIGHT (2026-10-06 capture): a nickname and a second romanisation ────────────── */

test("Oct 10 · the two bouts the 2026-10-06 capture could not join now join", () => {
  // The real unmatched provider keys from that capture, against the card's spellings.
  const keys = ["alice pereira|darya zheleznyakova", "ketlen souza|lupita godinez"];
  assert.equal(findLooseMatch([fold("Daria Zhelezniakova"), fold("Alice Pereira")], keys), "alice pereira|darya zheleznyakova");
  assert.equal(findLooseMatch([fold("Ketlen Souza"), fold("Loopy Godínez")], keys), "ketlen souza|lupita godinez");
});

test("ROMANISATION FLOOR · only i→y before a or u, and the rest of the name must match exactly", async () => {
  const { romanisedForm } = await import("./fighter-alias.mjs");
  assert.equal(romanisedForm("daria zhelezniakova"), romanisedForm("darya zheleznyakova"));
  assert.equal(looselySameFighter("yulia ivanova", "iulia ivanova"), true);
  assert.equal(looselySameFighter("daria ivanova", "darya petrova"), false, "different family name");
  assert.equal(looselySameFighter("maria silva", "mario silva"), false, "a different vowel is a different name");
  assert.equal(looselySameFighter("ilia topuria", "ilya topuria"), true);
  assert.equal(looselySameFighter("luis pena", "luys pena"), false, "i before s is never folded");
});

test("PRICE SIDES · a rescued join prices both fighters under the book's own spelling", async () => {
  const { resolveOutcomeNames } = await import("./fighter-alias.mjs");
  // Oct 10: the card's "Kai Kamaka III" was posted by the book as "Kai Kamaka"; before this, that side
  // published with no price even though seven books had one.
  assert.deepEqual(resolveOutcomeNames([fold("Andre Fili"), fold("Kai Kamaka III")], ["andre fili", "kai kamaka"]), ["andre fili", "kai kamaka"]);
  assert.deepEqual(resolveOutcomeNames([fold("Ketlen Souza"), fold("Loopy Godínez")], ["ketlen souza", "lupita godinez"]), ["ketlen souza", "lupita godinez"]);
  // An exact spelling always wins and is untouched.
  assert.deepEqual(resolveOutcomeNames(["a b", "c d"], ["c d", "a b"]), ["a b", "c d"]);
  // Missing stays missing: a fighter the book did not post gets null, never the other fighter's price.
  assert.deepEqual(resolveOutcomeNames(["andre fili", "kai kamaka iii"], ["andre fili"]), ["andre fili", null]);
});

test("PRICE SIDES REFUSE · two card fighters may never share one price", async () => {
  const { resolveOutcomeNames } = await import("./fighter-alias.mjs");
  // Both card names loosely match the single outcome: neither side may take it.
  assert.deepEqual(resolveOutcomeNames(["alex hernandez", "alexander hernandez"], ["alexander hernandez jr"]), [null, null]);
  // One card name loosely matches two outcomes: ambiguity, no price.
  assert.deepEqual(resolveOutcomeNames(["alex hernandez", "rafael dos anjos"], ["alexander hernandez", "alexandre hernandez", "rafael dos anjos"]), [null, "rafael dos anjos"]);
});
