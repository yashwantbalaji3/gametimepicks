/**
 * PLAIN SETTLEMENT NOTES (overnight 2026-10-28). /mr-dub printed the protected fold's ledger note verbatim
 * ("Rule S: 1 Bank Builder step(s) lost ($100 seed each), 2 Moonshot lane(s) lost ($25 each); 1 win(s) rolled …")
 * 33 times. The ledger is never edited; plainSettlementNote says the same counts in words at render time.
 *
 * Run: npx tsx --test src/lib/mr-dub/plain-notes.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { plainSettlementNote, plainEventLabel } from "./plain-notes.mjs";

test("the fold note keeps every non-zero count, in words, with no rule name or (s) plurals", () => {
  assert.equal(
    plainSettlementNote("Rule S: 1 Bank Builder step(s) lost ($100 seed each), 2 Moonshot lane(s) lost ($25 each); 1 win(s) rolled without touching the bankroll"),
    "1 Bank Builder step lost ($100 seed) · 2 Moonshot runs lost ($25 seed each) · 1 win rolled on, bankroll unchanged",
  );
  assert.equal(
    plainSettlementNote("Rule S: 0 Bank Builder step(s) lost ($100 seed each), 1 Moonshot lane(s) lost ($25 each); 2 win(s) rolled without touching the bankroll"),
    "1 Moonshot run lost ($25 seed) · 2 wins rolled on, bankroll unchanged",
  );
});

test("an unrecognised note is never rewritten beyond dropping the rule name; non-strings pass through", () => {
  assert.equal(plainSettlementNote("Rule S: something new"), "something new");
  assert.equal(plainSettlementNote("Shohei Ohtani Over 0.5"), "Shohei Ohtani Over 0.5");
  assert.equal(plainSettlementNote(null), null);
  assert.equal(plainEventLabel("folded_day"), "Day settled");
  assert.equal(plainEventLabel("lane_advanced"), "lane advanced");
});

test("REAL DATA: every committed fold note parses, and its counts survive exactly", () => {
  const days = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "public/data/mr-dub/daily-summary.json"), "utf8"));
  const notes = JSON.stringify(days).match(/Rule S: [^"]*/g) ?? [];
  assert.ok(notes.length >= 30, `premise: the summary carries the fold notes (${notes.length})`);
  for (const raw of notes) {
    const note = raw.replace(/\\u0024/g, "$");
    const plain = plainSettlementNote(note);
    assert.doesNotMatch(plain, /Rule S|\(s\)|lane/, plain);
    const m = note.match(/(\d+) Bank Builder step\(s\) lost \(\$\d+ seed each\),\s*(\d+) Moonshot lane\(s\) lost \(\$\d+ each\);\s*(\d+) win/);
    const [b, s, r] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (b) assert.ok(plain.includes(`${b} Bank Builder step`), plain);
    if (s) assert.ok(plain.includes(`${s} Moonshot run`), plain);
    if (r) assert.ok(plain.includes(`${r} win`), plain);
  }
});
