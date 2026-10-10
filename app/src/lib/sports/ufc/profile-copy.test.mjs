/**
 * Fighter-profile, basis and record-summary wording must match the counts behind it (UFC-001, 2026-10-10).
 * Fixtures are the tracked records of fighters on UFC Fight Night: Allen vs. Duncan (2026-10-10), read from the corpus
 * the card was built on, plus synthetic records for splits that card did not contain.
 *
 * Run: npx tsx --test src/lib/sports/ufc/profile-copy.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { profileCopy, basisNoteFor, recordSummary, RECORD_SUMMARY_LABEL } from "./profile-copy.mjs";

const rec = (o) => ({ n: 0, w: 0, koW: 0, subW: 0, decW: 0, koL: 0, subL: 0, decL: 0, dist: 0, ...o });
const R = {
  meerschaert: rec({ n: 26, w: 12, koW: 1, subW: 11, decW: 0, koL: 5, subL: 3, decL: 6, dist: 6 }),
  fili: rec({ n: 26, w: 13, koW: 4, subW: 0, decW: 9, koL: 4, subL: 3, decL: 6, dist: 15 }),
  prado: rec({ n: 6, w: 1, koW: 1, decL: 5, dist: 5 }),
  godinez: rec({ n: 15, w: 9, subW: 2, decW: 7, subL: 1, decL: 5, dist: 12 }),
  duncan: rec({ n: 10, w: 8, koW: 5, decW: 3, decL: 2, dist: 5 }),
  allen: rec({ n: 19, w: 15, koW: 2, subW: 7, decW: 6, koL: 2, decL: 2, dist: 8 }),
  camilo: rec({ n: 3, w: 2, koW: 1, decW: 1, subL: 1, dist: 1 }),
  herbert: rec({ n: 9, w: 4, koW: 2, decW: 2, koL: 2, subL: 1, decL: 2, dist: 4 }),
  shahbazyan: rec({ n: 1, koL: 1 }),
  walker: rec({ n: 4, w: 1, decW: 1, koL: 2, decL: 1, dist: 2 }),
  bonfim: rec({ n: 6, w: 2, koW: 2, koL: 3, subL: 1 }),
  harris: rec({ n: 1, w: 1, koW: 1 }),
};
const last = (...rs) => rs.map((result) => ({ result }));

// ── (a) the weakness fallback ────────────────────────────────────────────────────────────────────
test("(a) 'too few tracked losses' is never said of a fighter with 2+ tracked losses — Meerschaert (14) and Fili (13)", () => {
  for (const [who, r, L] of [["Meerschaert", R.meerschaert, 14], ["Fili", R.fili, 13]]) {
    const { weaknesses } = profileCopy(r, last("L", "L", "W", "L", "W"));
    assert.equal(weaknesses.length, 1, `${who}: only the fallback fires`);
    assert.doesNotMatch(weaknesses[0], /too few/i, `${who} has ${L} tracked losses`);
    assert.match(weaknesses[0], new RegExp(`^No loss pattern clears our thresholds across ${L} tracked losses`));
  }
  const m = profileCopy(R.meerschaert, []).weaknesses[0];
  assert.match(m, /\(5 KO\/TKO, 3 submission, 6 decision\)/, "the loss split is printed, and sums to the loss count");
});

test("(a) 'too few' IS said below the 2-loss floor, with the count", () => {
  assert.match(profileCopy(R.duncan, []).weaknesses[0], /Losses|No loss pattern/, "Duncan has exactly 2 losses: not 'too few'");
  assert.doesNotMatch(profileCopy(R.duncan, []).weaknesses[0], /too few/i);
  assert.match(profileCopy(R.harris, last("W")).weaknesses[0], /^No tracked losses — too few to name a pattern/);
  assert.match(profileCopy(R.camilo, []).weaknesses[0], /^Only 1 tracked loss — too few to name a pattern/);
});

test("the strengths fallback says 'too few' only when no strength rule could have fired", () => {
  assert.match(profileCopy(R.shahbazyan, last("L")).strengths[0], /^Only 1 tracked bout — too few/, "singular, and too few is true");
  assert.match(profileCopy(R.herbert, []).strengths[0], /^No strength pattern clears our thresholds across 9 tracked bouts$/);
});

// ── (b) distance rate is not durability ──────────────────────────────────────────────────────────
test("(b) a 1-5 fighter whose losses all went to the cards is not called durable — the line says what it measures", () => {
  const s = profileCopy(R.prado, []).strengths;
  assert.ok(s.every((x) => !/durable/i.test(x)), s.join(" | "));
  assert.ok(s.includes("Often goes the distance — 5 of 6 tracked fights reached the judges"), s.join(" | "));
  assert.ok(profileCopy(R.godinez, []).strengths.includes("Often goes the distance — 12 of 15 tracked fights reached the judges"));
});

// ── (c) the KO / submission split ────────────────────────────────────────────────────────────────
test("(c) an even KO/submission split is not 'mostly by submission'", () => {
  const even = rec({ n: 8, w: 6, koW: 3, subW: 3, decL: 2, dist: 2 });
  const f = profileCopy(even, []).strengths[0];
  assert.doesNotMatch(f, /mostly/);
  assert.equal(f, "Finishes fights — 6 of 6 wins inside the distance, by KO/TKO and submission alike (3 KO/TKO, 3 submission)");
  const fiftyfive = rec({ n: 12, w: 9, koW: 5, subW: 4, decL: 3, dist: 3 });   // KO share 0.56
  assert.match(profileCopy(fiftyfive, []).strengths[0], /alike \(5 KO\/TKO, 4 submission\)/);
});

test("(c) a lopsided split still says which way, with counts that agree", () => {
  assert.match(profileCopy(R.allen, []).strengths[0], /9 of 15 wins inside the distance, mostly by submission \(2 KO\/TKO, 7 submission\)/);
  assert.match(profileCopy(R.duncan, []).strengths[0], /5 of 8 wins inside the distance, mostly by KO\/TKO \(5 KO\/TKO, 0 submission\)/);
});

test("summary: a winless fighter is not '0% of wins by finish', and counts sit beside every percentage", () => {
  const s = profileCopy(R.shahbazyan, last("L")).summary;
  assert.equal(s, "0-1 in the last 1 tracked bout. No tracked wins; 0 of 1 tracked fight reached the judges (0%).");
  assert.match(profileCopy(R.allen, last("W", "W", "L", "W", "W")).summary, /^4-1 in the last 5 tracked bouts\. 9 of 15 wins came by finish \(60%\); 8 of 19 tracked fights reached the judges \(42%\)\.$/);
});

test("weakness lines carry the counts their percentages rest on", () => {
  const w = profileCopy(R.bonfim, []).weaknesses;
  assert.ok(w.includes("Losses tend to come by finish — 4 of 4 tracked losses (3 KO/TKO, 1 submission)"), w.join(" | "));
  assert.ok(w.includes("67% of tracked bouts are losses (4 of 6)"), w.join(" | "));
});

test("second mentions use the surname, never a generational suffix", async () => {
  const { lastName } = await import("./profile-copy.mjs");
  assert.equal(lastName("Kai Kamaka III"), "Kamaka");
  assert.equal(lastName("Allen Frye Jr."), "Frye");
  assert.equal(lastName("Loopy Godínez"), "Godínez");
  const s = recordSummary({ pick: "Andre Fili", other: "Kai Kamaka III", A: R.fili, B: rec({ n: 2, w: 1, decW: 1, decL: 1, dist: 2 }), pWin: 0.52, method: null });
  assert.match(s, /Andre Fili has 26 tracked bouts to Kamaka's 2\./);
  assert.match(profileCopy(rec({ n: 2, w: 1, decW: 1, decL: 1, dist: 2 }), []).summary, /0 of 1 win came by finish/);
});

// ── 2. basis note ────────────────────────────────────────────────────────────────────────────────
test("2. a fighter with 1 tracked bout is not said to have 'no UFC history'", () => {
  const n = basisNoteFor({ a: 1, b: 19 }, "Leon Shahbazyan", "Niko Price");
  assert.doesNotMatch(n, /no (UFC )?history|no tracked/i);
  assert.match(n, /^Leon Shahbazyan has only 1 tracked UFC bout in our corpus \(fewer than the 2 we count as known\)/);
  assert.match(n, /leans on Niko Price's 19 tracked bouts/);
  const flipped = basisNoteFor({ a: 4, b: 1 }, "Malcolm Wellmaker", "Otari Tanzilovi");
  assert.match(flipped, /^Otari Tanzilovi has only 1 tracked UFC bout/, "the thin side is found in either corner");
});

test("2. 'no tracked UFC bouts' is said only at zero", () => {
  assert.match(basisNoteFor({ a: 0, b: 7 }, "A Debutant", "B Veteran"), /^A Debutant has no tracked UFC bouts in our corpus, so this read leans on B Veteran's 7 tracked bouts/);
});

// ── 3. the per-bout line is a record summary, not the model's reason ─────────────────────────────
const CAMILO = { pick: "Matheus Camilo", other: "Jai Herbert", A: R.camilo, B: R.herbert, pWin: 0.7396,
  method: { most: "DEC", probabilities: { ko: 0.3783, submission: 0.1457, decision: 0.476 } } };

test("3. the line labels itself a tracked-record summary and carries counts", () => {
  const s = recordSummary(CAMILO);
  assert.ok(s.startsWith(RECORD_SUMMARY_LABEL), s);
  assert.match(RECORD_SUMMARY_LABEL, /not the model's reasoning/);
  assert.match(s, /Matheus Camilo has won 2 of 3 tracked bouts \(67%\) to Herbert's 4 of 9 \(44%\)/);
});

test("3. a decision under 50% is 'the most likely of three endings', never 'reaches the judges'", () => {
  const s = recordSummary(CAMILO);
  assert.doesNotMatch(s, /reaches the judges|profiles as one/);
  assert.match(s, /The model's method read has a decision as the most likely of three endings \(48%\), short of a majority\.$/);
  const majority = recordSummary({ ...CAMILO, method: { most: "DEC", probabilities: { ko: 0.1, submission: 0.17, decision: 0.73 } } });
  assert.match(majority, /makes a decision more likely than not \(73%\)\.$/);
  const sub = recordSummary({ pick: "Julius Walker", other: "Gerald Meerschaert", A: R.walker, B: R.meerschaert, pWin: 0.61,
    method: { most: "SUB", probabilities: { ko: 0.2969, submission: 0.415, decision: 0.288 } } });
  assert.doesNotMatch(sub, /points to/);
  assert.match(sub, /a submission as the most likely of three endings \(42%\)/);
});

test("3. no method sentence when the method head is not published (it used to default to 'reaches the judges')", () => {
  const s = recordSummary({ ...CAMILO, method: null });
  assert.doesNotMatch(s, /decision|judges|method/i);
  assert.ok(s.endsWith("(44%)."), s);
});

test("3. the shorter-record clause is a grammatical fact, not a claim about what the model leans on", () => {
  const s = recordSummary({ pick: "Leon Shahbazyan", other: "Niko Price", A: R.shahbazyan, B: rec({ n: 19, w: 8, koL: 6, subL: 3, decL: 2 }), pWin: 0.52, method: null });
  assert.equal(s, `${RECORD_SUMMARY_LABEL} Leon Shahbazyan has the shorter tracked record (1 bout to Price's 19).`);
  assert.doesNotMatch(s, /leans on/);
});

test("3. a 1-of-1 finish rate prints its count", () => {
  const s = recordSummary({ pick: "Francisco Prado", other: "Ismael Bonfim", A: R.prado, B: R.bonfim, pWin: 0.6256, method: null });
  assert.match(s, /Francisco Prado has finished 1 of 1 win \(100%\), and Bonfim has been finished in 4 of 4 losses \(100%\)/);
});

test("3. the no-clause fallback keeps its coin-flip discipline (P213 R-C3)", () => {
  const even = rec({ n: 6, w: 3, decW: 3, decL: 3, dist: 6 });
  assert.match(recordSummary({ pick: "A B", other: "C D", A: even, B: even, pWin: 0.52, method: null }), /close to a coin flip/);
  assert.doesNotMatch(recordSummary({ pick: "A B", other: "C D", A: even, B: even, pWin: 0.7, method: null }), /coin flip/);
});

// ── the builder carries none of the old copy ─────────────────────────────────────────────────────
test("SOURCE PIN · the builder imports the copy rules and no longer carries the misleading strings or comment", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/ufc/build-ufc-card.mjs"), "utf8");
  assert.match(src, /from "\.\.\/\.\.\/src\/lib\/sports\/ufc\/profile-copy\.mjs"/);
  for (const bad of [
    /Too few tracked losses to name a pattern/,
    /Durable — /,
    /"Finishes fights — mostly by submission"/,
    /has no UFC history in our corpus/,
    /features that (actually )?moved the prediction/i,
    /profiles as one that reaches the judges/,
    /finish profile points to/,
    /method\?\.most \?\? "DEC"/,
  ]) assert.doesNotMatch(src, bad, `builder still carries ${bad}`);
  const ui = fs.readFileSync(path.join(process.cwd(), "src/components/sports/ufc-card.tsx"), "utf8");
  assert.doesNotMatch(ui, /features that (actually )?moved the prediction/i, "the UI type still documents the line as the model's why");
});
