/**
 * Homer Nukes said two contradictory things about its own record, and both were false.
 *
 * Run: npx tsx --test src/lib/mlb/homer-nukes-honesty.test.mjs
 *
 *   "This board has no settled track record yet"      — typed into the generator before any slate
 *                                                       had settled, still published after fourteen
 *   "0 of 70 picks homered across 14 slates"          — the page counted `p.homered`, a field the
 *                                                       settlement artifact has never written
 *
 * The truth in the committed artifacts is 11 hits on 60 GRADED picks against 14.7 expected. The
 * second sentence was not a rounding problem: its numerator was structurally zero and would have
 * stayed zero for any results whatsoever, while its denominator counted ten picks that have no
 * official result yet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { homerNukesHonestLimit } from "./homer-nukes-honesty.mjs";

const DIR = path.join(process.cwd(), "public", "data", "mlb", "homer-nukes");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

test("a graded record is STATED, never denied", () => {
  const s = homerNukesHonestLimit({ gradedPicks: 60, actual: 11, predicted: 14.7331 });
  assert.match(s, /11 of 60 graded picks homered against 14\.7 expected/);
  assert.doesNotMatch(s, /no settled track record/i, "the sentence that expired must not come back");
  assert.match(s, /no home-run market price is fetched/, "the half that is still true is kept");
});

test("no rate is quoted at any sample size", () => {
  // A board of ~25% picks is supposed to miss most of the time; a percentage over sixty picks is
  // noise with a percent sign on it.
  for (const rec of [{ gradedPicks: 60, actual: 11, predicted: 14.7 }, { gradedPicks: 6000, actual: 1500, predicted: 1490 }]) {
    assert.doesNotMatch(homerNukesHonestLimit(rec), /%|per ?cent|accuracy of|hit rate/i);
  }
});

test("an empty or unreadable record keeps the no-record wording", () => {
  for (const rec of [null, undefined, {}, { gradedPicks: 0 }]) {
    assert.match(homerNukesHonestLimit(rec), /no settled track record yet/i);
  }
});

test("a record without the counts still refuses to invent them", () => {
  const s = homerNukesHonestLimit({ gradedPicks: 60 });
  assert.match(s, /60 picks have been graded/);
  assert.doesNotMatch(s, /against .* expected/, "an absent expectation is not printed as one");
});

/* ── AGAINST THE COMMITTED ARTIFACTS ───────────────────────────────────────────────────────────── */

test("LIVE · the settled receipts, the record artifact and the sentence all agree", () => {
  const record = readJson(path.join(DIR, "record.json"));
  if (!record) return;

  const files = fs.readdirSync(DIR).filter((f) => /^settled-\d{4}-\d{2}-\d{2}\.json$/.test(f));
  let graded = 0;
  let hits = 0;
  let published = 0;
  for (const f of files) {
    const day = readJson(path.join(DIR, f));
    const picks = day?.picks ?? [];
    published += picks.length;
    graded += picks.filter((p) => p.result === "hit" || p.result === "miss").length;
    hits += picks.filter((p) => p.result === "hit").length;
  }

  assert.equal(record.gradedPicks, graded, "the record's denominator is the GRADED picks");
  assert.equal(record.actual, hits, "and its numerator is the hits the receipts actually record");
  assert.ok(published >= graded, "some published picks may still be awaiting an official result");

  const sentence = homerNukesHonestLimit(record);
  assert.match(sentence, new RegExp(`${hits} of ${graded} graded picks`));
  // The exact shape of the old defect: the published total used as a denominator with zero hits.
  assert.doesNotMatch(sentence, new RegExp(`0 of ${published}`));
});

test("LIVE · no settlement receipt writes the field the page used to read", () => {
  /*
   * The page filtered on `p.homered`. If a future settler ever emits that name, this guard should
   * fail so the two spellings are reconciled deliberately rather than one silently winning.
   */
  const files = fs.readdirSync(DIR).filter((f) => /^settled-/.test(f));
  for (const f of files) {
    for (const p of readJson(path.join(DIR, f))?.picks ?? []) {
      assert.ok(!("homered" in p), `${f}: a pick carries "homered" — reconcile it with "result"`);
      assert.ok(["hit", "miss", "pending", undefined].includes(p.result), `${f}: unexpected result ${p.result}`);
    }
  }
});

test("LIVE · the generator and the page share ONE rule for this sentence", () => {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/.*$/gm, blank);
  for (const rel of ["scripts/mlb/build-homer-nukes.mjs", "src/components/mlb/homer-nukes-board.tsx"]) {
    const code = strip(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
    assert.match(code, /homerNukesHonestLimit\(/, `${rel} must derive the sentence, not carry its own copy`);
    assert.ok(
      !/no settled track record yet/.test(code),
      `${rel} must not hardcode the no-record claim — that is the sentence that expired`,
    );
  }
});
