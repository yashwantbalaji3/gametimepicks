/**
 * FORECASTS PUBLISHED CONTINUOUSLY, RESULTS PUBLISHED NOWHERE.
 *
 * Run: npx tsx --test src/lib/sports/graded-picks.test.mjs
 *
 * Every sport graded its own picks and each did it in a different shape, in a different place, and
 * published to a different degree — MLB's 32,000 graded projections appeared on no page at all, and
 * UFC's public graded artifact reported zero while its ledger held six real rows. A reader could see
 * what a model predicted and, on most sports, could not see how those predictions turned out. That
 * asymmetry always flatters.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildGradedRecord, sampleStateFor, sampleNote, SAMPLE_STATE, ASSESSABLE_MIN } from "./graded-picks.mjs";
import { PICK_SPORTS } from "./graded-picks-loader.ts";

test("A VOID IS NEVER A MISS — it leaves the denominator entirely", () => {
  /*
   * A pick whose condition never held — a fighter who did not fight, a batter who did not take the
   * field, a game that ended tied — is not evidence about the model. Counting voids as losses
   * understates and counting them as wins overstates; only excluding them is honest, and it is the
   * reason a conditional projection can be published at all.
   */
  const r = buildGradedRecord({ sport: "x", label: "X", what: "w", picks: [{ hit: true }, { hit: false }, { hit: null }, { hit: null }] });
  assert.equal(r.counts.counted, 2, "only decided picks are counted");
  assert.equal(r.counts.voided, 2);
  assert.equal(r.hitRate, 0.5, "the rate is over decided picks, not over everything");
});

test("nothing graded yields a NULL rate, never a zero", () => {
  const r = buildGradedRecord({ sport: "x", label: "X", what: "w", picks: [] });
  assert.equal(r.hitRate, null, "0% would read as a measured result rather than an absent one");
  assert.equal(r.sampleState, SAMPLE_STATE.NONE);
  assert.match(r.sampleNote, /not a record of zero/i);
});

test("THE LIST IS NOT THE RECORD — counts run over every pick, rows are a slice", () => {
  // An artifact that counted only what it displayed would silently shrink its own denominator.
  const picks = Array.from({ length: 500 }, (_, i) => ({ hit: i % 2 === 0 }));
  const r = buildGradedRecord({ sport: "x", label: "X", what: "w", picks, shown: 10 });
  assert.equal(r.counts.counted, 500);
  assert.equal(r.picks.length, 10);
  assert.equal(r.counts.shown, 10);
});

test("a small sample is NAMED as one, and the note says the figures support nothing", () => {
  assert.equal(sampleStateFor(6), SAMPLE_STATE.TOO_SMALL);
  assert.match(sampleNote(SAMPLE_STATE.TOO_SMALL, 6), /far too few/i);
  assert.equal(sampleStateFor(ASSESSABLE_MIN), SAMPLE_STATE.ASSESSABLE);
  // Even at a real sample, a hit rate is never presented as a claim about a market.
  assert.match(sampleNote(SAMPLE_STATE.ASSESSABLE, 500), /not proof a model beats a price/i);
});

test("LIVE ARTIFACTS · every sport publishes a record in the same shape", () => {
  for (const sport of PICK_SPORTS) {
    const p = path.join(process.cwd(), "public/data", sport, "graded-picks.json");
    if (!fs.existsSync(p)) continue;
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    assert.equal(j.moneyClass, "NON_MONEY", `${sport}: a model record must never carry a money class`);
    assert.ok(j.what?.length > 20, `${sport} must state what its picks actually are`);
    assert.ok(j.sampleNote?.length > 20, `${sport} must carry the sentence that travels with its numbers`);
    // The counts must agree with the rows they were computed from.
    const decided = j.picks.filter((x) => x.hit === true || x.hit === false).length;
    assert.ok(j.counts.counted >= decided, `${sport}: displayed rows cannot exceed the counted total`);
    assert.equal(j.counts.hits + j.counts.misses, j.counts.counted, `${sport}: hits + misses must be the whole denominator`);
    if (j.counts.counted === 0) assert.equal(j.hitRate, null, `${sport}: nothing graded must not report a rate`);
  }
});

test("LIVE ARTIFACTS · no small-sample record is allowed to look assessable", () => {
  for (const sport of PICK_SPORTS) {
    const p = path.join(process.cwd(), "public/data", sport, "graded-picks.json");
    if (!fs.existsSync(p)) continue;
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    assert.equal(j.sampleState, sampleStateFor(j.counts.counted),
      `${sport}: the sample state must be derived from the count, not stamped`);
  }
});

test("BUILT EXPORT · every sport's hub shows how its picks turned out", () => {
  /*
   * The section existing in a component is not the same as it reaching a reader. Scripts are
   * stripped first, because a section that lives only in the RSC payload is not on the page — the
   * exact way the MLB simulations section was first shipped behind a click.
   */
  for (const sport of PICK_SPORTS) {
    const page = path.join(process.cwd(), "out", sport, "index.html");
    if (!fs.existsSync(page)) continue;
    const rec = path.join(process.cwd(), "public/data", sport, "graded-picks.json");
    if (!fs.existsSync(rec)) continue;
    const text = fs.readFileSync(page, "utf8")
      .replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    // The window allows for the apostrophe's HTML entity (&#x27; — six characters), which a
    // three-character window silently failed on for every sport that actually had the section.
    assert.match(text, /How the model.{0,10}s picks actually turned out/,
      `/${sport} must show how its picks turned out, not only what they were`);
  }
});
