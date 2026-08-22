/**
 * SCORING THE MODEL AND THE MARKET ON THE SAME BOUTS.
 *
 * Run: npx tsx --test src/lib/sports/ufc/model-vs-market.test.mjs
 *
 * The gate recorded UFC calibration as UNPROVEN because the model had "never been compared against a
 * no-vig line". That was true and it was not the whole story: the model's winner probability, both
 * sides' posted prices and the official result had all been on disk the whole time, and nothing
 * joined them. The question calibration exists to answer had no instrument, which is a different and
 * more fixable problem than a small sample.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { boutKey, buildPreFightRows, deVigTwoWay, foldName, impliedFromAmerican, scorePreFightRows } from "./model-vs-market.mjs";

const APP = process.cwd();

test("de-vig removes the vig and refuses a book that is not one", () => {
  const d = deVigTwoWay(-205, 169);
  assert.ok(d.impliedSum > 1 && d.impliedSum < 1.15, "a real two-way book carries a few points of vig");
  assert.ok(Math.abs(d.a + d.b - 1) < 1e-9, "de-vigged probabilities sum to one");
  assert.ok(d.a > d.b, "the shorter price is the likelier side");
  // Two-way only, and a malformed pair is refused rather than rescaled into something plausible.
  assert.equal(deVigTwoWay(-1000, -1000), null, "an impossible 1.8-sum book is not de-vigged");
  assert.equal(deVigTwoWay(NaN, 100), null);
});

test("implied probability is the standard conversion, both signs", () => {
  assert.ok(Math.abs(impliedFromAmerican(100) - 0.5) < 1e-9);
  assert.ok(Math.abs(impliedFromAmerican(-200) - 2 / 3) < 1e-9);
  assert.ok(Math.abs(impliedFromAmerican(200) - 1 / 3) < 1e-9);
});

test("the bout key is DATE-QUALIFIED — a rematch is not its original", () => {
  const a = boutKey("2026-05-16", "Arnold Allen", "Melquizael Costa");
  const b = boutKey("2026-11-02", "Arnold Allen", "Melquizael Costa");
  assert.notEqual(a, b, "the same two fighters meeting twice are two bouts");
  // Participants sort, so corner order cannot produce two keys for one fight.
  assert.equal(a, boutKey("2026-05-16", "Melquizael Costa", "Arnold Allen"));
  assert.equal(a, "2026-05-16:arnold allen|melquizael costa", "matches the corpus's own key format");
  // Diacritics fold: the capture writes "Kaue" where a card may carry "Kauê".
  assert.equal(foldName("Kauê Fernandes"), foldName("Kaue Fernandes"));
});

test("LEAKAGE · a snapshot taken at or after the first bout is refused", () => {
  const card = { event: { slateDate: "2026-08-22", startUtc: "2026-08-22T21:00Z", name: "X" }, bouts: [] };
  const out = buildPreFightRows({ card, odds: { bouts: [] }, capturedAt: "2026-08-22T21:00:00Z" });
  assert.equal(out.rows.length, 0);
  assert.match(out.skipped[0].reason, /at or after the card started/);
});

test("a bout is scored only when BOTH sides have something to say", () => {
  const card = {
    event: { slateDate: "2026-08-22", startUtc: "2026-08-22T21:00Z" },
    bouts: [
      { boutId: "1", red: { name: "A" }, blue: { name: "B" }, prediction: { winner: { name: "A", probability: 0.6 } } },
      { boutId: "2", red: { name: "C" }, blue: { name: "D" } },                                   // model declined
      { boutId: "3", red: { name: "E" }, blue: { name: "F" }, prediction: { winner: { name: "E", probability: 0.7 } } },
    ],
  };
  const odds = { bouts: [{ boutId: "1", red: { price: { american: -150 } }, blue: { price: { american: 130 } } }] };
  const out = buildPreFightRows({ card, odds, capturedAt: "2026-08-22T12:00:00Z" });
  assert.equal(out.rows.length, 1, "only the bout with a read AND a price");
  // A missing price is a gap in our capture; a missing read is the model declining. Neither is
  // evidence about the other, and scoring one with the other absent puts a number where there is none.
  assert.equal(out.skipped.length, 2);
});

test("the market probability describes the SIDE THE MODEL PICKED", () => {
  // The inversion that would make every comparison meaningless: scoring the model's pick against the
  // opponent's price. Model picks the BLUE corner here, so the market figure must be blue's.
  const card = {
    event: { slateDate: "2026-08-22", startUtc: "2026-08-22T21:00Z" },
    bouts: [{ boutId: "1", red: { name: "Fav" }, blue: { name: "Dog" }, prediction: { winner: { name: "Dog", probability: 0.53 } } }],
  };
  const odds = { bouts: [{ boutId: "1", red: { price: { american: -205 } }, blue: { price: { american: 169 } } }] };
  const [row] = buildPreFightRows({ card, odds, capturedAt: "2026-08-22T12:00:00Z" }).rows;
  assert.equal(row.pick, "Dog");
  assert.ok(row.marketProbability < 0.5, `the underdog's de-vigged price must be under 50%, got ${row.marketProbability}`);
});

test("HISTORICAL BOUT · the join and the scoring both work against the real corpus", () => {
  const results = JSON.parse(fs.readFileSync(path.join(APP, "public/data/ufc/results-latest.json"), "utf8"));
  const decisive = (results.results ?? []).find((r) => r.winner && r.loser);
  if (!decisive) return;
  const byBout = new Map([[decisive.boutId, decisive]]);
  /*
   * Two synthetic rows on one real, settled bout: one picking the actual winner, one the loser.
   * The point is the JOIN and the arithmetic — that a hit scores the pick's probability and a miss
   * scores its complement — not any claim about this model.
   */
  const rows = [
    { boutId: decisive.boutId, pick: decisive.winner, modelProbability: 0.8, marketProbability: 0.6 },
    { boutId: decisive.boutId + "-x", pick: decisive.loser, modelProbability: 0.8, marketProbability: 0.6 },
  ];
  byBout.set(decisive.boutId + "-x", decisive);
  const out = scorePreFightRows(rows, byBout);
  assert.equal(out.n, 2, "both rows joined to a real result");
  const [hit, miss] = out.graded;
  assert.equal(hit.hit, true);
  assert.equal(miss.hit, false);
  assert.ok(Math.abs(hit.model.probabilityOfActual - 0.8) < 1e-9, "a hit scores the pick's own probability");
  assert.ok(Math.abs(miss.model.probabilityOfActual - 0.2) < 1e-9, "a miss scores its complement");
  assert.ok(miss.model.logLoss > hit.model.logLoss, "being confidently wrong costs more than being confidently right");
});

test("a draw or no contest is VOIDED, never scored as a miss", () => {
  // The model answered "who wins" and the fight produced no winner, so neither side has anything to
  // be right or wrong about.
  const rows = [{ boutId: "k", pick: "A", modelProbability: 0.7, marketProbability: 0.6 }];
  const out = scorePreFightRows(rows, new Map([["k", { winner: null, loser: null }]]));
  assert.equal(out.n, 0);
  assert.equal(out.voided.length, 1);
  assert.match(out.voided[0].reason, /no winner/i);
});

test("LIVE · tonight's snapshot exists and both figures are on every row", () => {
  const dir = path.join(APP, "..", "data/internal/research/ufc/model-vs-market");
  if (!fs.existsSync(dir)) return;
  const snaps = fs.readdirSync(dir).filter((f) => /^snapshot-\d{12}\.json$/.test(f));
  if (!snaps.length) return;
  const snap = JSON.parse(fs.readFileSync(path.join(dir, snaps.sort().at(-1)), "utf8"));
  assert.equal(snap.public, false, "de-vigged paid odds never become public");
  assert.ok(snap.rows.length > 0);
  for (const r of snap.rows) {
    assert.ok(r.modelProbability > 0 && r.modelProbability < 1, `${r.pick}: model probability out of range`);
    assert.ok(r.marketProbability > 0 && r.marketProbability < 1, `${r.pick}: market probability out of range`);
    assert.ok(r.boutId.includes(":"), "every row carries a date-qualified bout key");
  }
  // Recorded BEFORE the card, which is the whole basis of the comparison.
  assert.ok(Date.parse(snap.capturedAt) < Date.parse(snap.event.startUtc), "the snapshot predates the card");
});
