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
