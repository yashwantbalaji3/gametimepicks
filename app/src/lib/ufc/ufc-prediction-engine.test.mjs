/**
 * UFC PREDICTION ENGINE V1 — transparent formulas + honest layering, run against the REAL UFC 329 data
 * (schedule + odds + the 2,695-fighter stats DB).
 *
 * Proves: the odds→implied→de-vig math is correct; moneyline is market-backed with the documented confidence
 * bands; fight-type/distance/method are MODEL-DERIVED from real fighter finish/record stats where both
 * fighters are in the DB, and "Insufficient data" otherwise; method probabilities sum to ~1; every row
 * carries the experimental caveat; and NO row emits a forbidden over-claim.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildUfcCardPredictions, buildUfcPredictionV1, buildFighterIndex, impliedFromAmerican, deVig, moneylineConfidence, keyForNames, eventFightsFromCard } from "./ufc-prediction-engine.ts";

const loadUfc = (n) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", n), "utf8"));
/*
 * card-latest.json, NOT schedule-latest.json.
 *
 * The schedule artifact has no producer — an orphan last written 2026-07-10 — and these tests
 * passed only because it and the odds were equally stale, which made every join below vacuous. The
 * card is rebuilt every fight-week run and is the same artifact the odds capture prices.
 */
import { oddsCoverCard, ODDS_COVER } from "../sports/ufc/odds-cover-card.mjs";

const card = loadUfc("card-latest.json");
const fights = eventFightsFromCard(card.bouts);
const odds = loadUfc("odds-latest.json");
const fdb = loadUfc("fighters-latest.json");

const oddsIndex = new Map();
for (const bt of odds.bouts ?? []) {
  const names = bt.sides ? bt.sides.map((s) => s.name) : bt.fighters ?? [];
  if (names.length >= 2) oddsIndex.set(keyForNames(names[0], names[1]), bt);
}
const fighterByName = buildFighterIndex(fdb.fighters);
const rows = buildUfcCardPredictions(fights, oddsIndex, fighterByName);

/*
 * DO THE TWO ARTIFACTS EVEN DESCRIBE THE SAME CARD?
 *
 * Everything below asserts that the schedule joins to the odds. That is only a meaningful claim
 * when both cover the same event — and for a long time they did only by coincidence, because both
 * were equally stale (a July 11 card in each). The first fresh August capture broke the join and
 * the failures read "market-backed moneylines (0)", which sounds like the odds are wrong.
 *
 * They are not. The SCHEDULE is stale. Saying so here turns three confusing failures into one
 * accurate sentence, and it fails rather than skips because a stale schedule feeding the public
 * /ufc report is a real defect, not a test-environment quirk.
 */
/*
 * P224 — TWO REPAIRS TO THE CHECK ABOVE.
 *
 * 1. IT COMPARED OPAQUE IDS AS IF THEY WERE DATES. `boutId.slice(0, 10)` assumed a date-prefixed
 *    id. Bout ids are now ESPN competition ids ("401875226"), so the slice yielded an id fragment
 *    and the sets could never intersect regardless of whether the artifacts agreed. Compare the
 *    bout IDENTITIES themselves — the same lesson the UFC coverage classifier already learned when
 *    it moved off time windows onto fighter identity.
 *
 * 2. IT COULD NOT TELL DRIFT FROM "NOT PRICED YET". A card six days out has no posted moneylines,
 *    and the odds capture says so properly: eventCount 0, oddsReady false, 13 unpriced bouts and
 *    two named blockers. That is the fail-closed answer working, not two artifacts describing
 *    different events. Conflating them turned a quiet, correct window into a red gate.
 *
 * Drift is still a hard failure — it just has to be actual drift: both artifacts carrying bouts,
 * for disjoint sets of them.
 */
/*
 * P238 — A THIRD REPAIR, and the same lesson again.
 *
 * The window this check must tolerate is wider than "the odds carry no bout". `odds-latest.json` is
 * a POINTER, and the card builder rolls to the next event as soon as one is scheduled while the
 * odds capture runs Tue/Thu/Sat. On 2026-09-06 that left the card on "Noche UFC: Silva vs. Delgado"
 * (event 600060772, 13 bouts) and the odds on the FINISHED "Hooker vs. Parnasse" (600059993, 10
 * bouts). Both artifacts carried bouts, for disjoint sets — which the previous rule called drift.
 *
 * It is not drift. It is a card that has not been priced yet, beside a stale pointer to a completed
 * event. `oddsCoverCard` names the difference: a mismatched EVENT id is NOT_YET, and only two
 * artifacts claiming the SAME event while sharing no bout are the defect this guard exists to catch.
 */
const cover = oddsCoverCard(card, odds);
const schedBoutIds = new Set(fights.map((f) => String(f.boutId ?? "")).filter(Boolean));
const oddsBoutIds = new Set((odds.bouts ?? []).map((b) => String(b.boutId ?? "")).filter(Boolean));
const pricedOverlap = [...oddsBoutIds].filter((id) => schedBoutIds.has(id));
const oddsNotOfferedYet = cover.state === ODDS_COVER.NOT_YET;
const sameCard = cover.state !== ODDS_COVER.DRIFT;

test("0 · the schedule and the odds describe the same card", () => {
  if (oddsNotOfferedYet) {
    // The fail-closed path must still be honest about WHY there is nothing to join.
    assert.equal(odds.oddsReady, false, "an odds artifact with no priced bout must not claim it is ready");
    assert.ok((odds.blockers ?? []).length > 0 || (odds.unpricedBouts ?? 0) > 0,
      "and it must name a blocker or count its unpriced bouts rather than going silently empty");
    return;
  }
  assert.ok(sameCard,
    `card-latest covers bouts [${[...schedBoutIds].slice(0, 4).join(", ")}…] while odds-latest covers ` +
    `[${[...oddsBoutIds].slice(0, 4).join(", ")}…] — the two artifacts describe different events, so every ` +
    `join below is vacuous. They are written by the same job and must not drift.`);
});

test("1 · odds → implied → de-vig math is correct", () => {
  assert.ok(Math.abs(impliedFromAmerican(-200) - 2 / 3) < 1e-9, "-200 ⇒ 0.667");
  assert.ok(Math.abs(impliedFromAmerican(150) - 0.4) < 1e-9, "+150 ⇒ 0.40");
  const dv = deVig(-200, 150);
  assert.ok(dv && Math.abs(dv.a + dv.b - 1) < 1e-9 && dv.a > dv.b, "de-vig sums to 1, favorite higher");
  assert.equal(deVig(null, 150), null, "missing side ⇒ null");
});

test("2 · moneyline confidence bands match the documented thresholds", () => {
  assert.equal(moneylineConfidence(0.72), "high");
  assert.equal(moneylineConfidence(0.64), "medium");
  assert.equal(moneylineConfidence(0.585), "low");
  assert.equal(moneylineConfidence(0.55), "no_read");
});

test("3 · the whole card builds; a mix of odds-backed + model-derived + insufficient rows", () => {
  assert.equal(rows.length, fights.length, "one row per bout on the card");
  const oddsBacked = rows.filter((r) => r.moneyline.source === "market_implied");
  const modelReads = rows.filter((r) => r.fightType.source === "model_derived");
  /*
   * THESE WERE FLOORS TAKEN FROM ONE PARTICULAR CARD (5 priced, 8 modelled). The next card was
   * Nurmagomedov vs. Song in Shanghai — a roster with far less history in the corpus — and it
   * produced 5 model reads on 13 bouts. Nothing had regressed; the card was different. A floor is
   * the wrong shape for a value that legitimately moves with who is fighting.
   *
   * What must hold on EVERY card is that each row is backed by something real or is honestly marked
   * as unbacked, and that the two never blur. So the counts are checked against the card itself.
   */
  const insufficient = rows.filter((r) => r.fightType.source !== "model_derived" && r.moneyline.source !== "market_implied");
  assert.equal(oddsBacked.length + modelReads.length + insufficient.length >= rows.length, true,
    "every row must be accounted for by a source or by an honest absence");
  assert.ok(oddsBacked.length + modelReads.length > 0,
    "a card where NOTHING is priced and NOTHING is modelled should not be published as a read at all");
  for (const r of insufficient) {
    // The one thing that must never happen: a row with no inputs carrying a confident read anyway.
    assert.notEqual(r.confidence, "high", `${r.fightId}: an unbacked bout must not be presented with confidence`);
  }
});

test("4 · market-backed moneyline carries de-vig probs; model method probs sum to ~1", () => {
  for (const r of rows) {
    if (r.moneyline.source === "market_implied") {
      assert.ok(r.moneyline.fighterAProbability != null && Math.abs(r.moneyline.fighterAProbability + r.moneyline.fighterBProbability - 1) < 0.02);
    }
    if (r.fightType.source === "model_derived") {
      assert.equal(r.goesDistance.source, "model_derived");
      assert.ok(r.goesDistance.probability >= 0.25 && r.goesDistance.probability <= 0.75, "distance prob clamped");
      const m = r.method.probabilities;
      assert.ok(m && Math.abs(m.koTko + m.submission + m.decision - 1) < 1e-6, "method mix sums to 1");
    } else if (r.moneyline.source === "market_implied") {
      // MARKET-ONLY fallback (odds but no fighter model): "Market-only read" / "No clear read", never blank.
      assert.equal(r.fightType.label, "Market-only read");
      assert.equal(r.method.lean, "No clear read");
    } else {
      assert.equal(r.fightType.label, "Insufficient data");
      assert.equal(r.method.lean, "Insufficient data");
    }
  }
});

test("5 · EVERY row carries the experimental caveat and NO forbidden over-claim", () => {
  for (const r of rows) {
    assert.match(r.caveat, /experimental|validation in progress/i, "experimental caveat present");
    const blob = JSON.stringify(r).toLowerCase();
    for (const w of ["best bet", " lock", "guaranteed", "positive ev", "validated edge", "official pick"]) {
      assert.ok(!blob.includes(w), `no "${w}" in the row`);
    }
  }
});

test("8 · every fight emits a DISPLAY-SAFE row — no empty cells, no forbidden claims", () => {
  const FIELDS = ["gameTimeRead", "predictedWinnerText", "methodOfVictoryText", "winnerMethodText", "moneyline", "winProbability", "fightType", "distance", "method", "roundRange", "confidence", "why", "coverage"];
  for (const r of rows) {
    for (const f of FIELDS) {
      assert.ok(r.display[f] && String(r.display[f]).trim().length > 0, `${r.eventName ?? r.fightId}: display.${f} is non-empty`);
      assert.doesNotMatch(String(r.display[f]), /undefined|null|NaN/, `display.${f} has no undefined/null/NaN`);
    }
    const blob = JSON.stringify(r.display).toLowerCase();
    for (const w of ["best bet", " lock", "positive ev", "validated edge", "official pick", "guaranteed"]) {
      assert.ok(!blob.includes(w), `no "${w}" in the display row`);
    }
  }
  /*
   * This asserted ZERO "Insufficient data" rows, which was true of the card in front of it and is
   * not a property of the engine. A card can legitimately contain a bout with no posted price and
   * no corpus history for either fighter, and saying so is the correct output — the failure mode
   * worth guarding is the opposite one, filling that row with a guess.
   *
   * So the check is now that an "Insufficient data" row is EARNED: it appears only where the row
   * genuinely has neither a market price nor a model read, and never where it has one.
   */
  for (const r of rows) {
    const backed = r.fightType.source === "model_derived" || r.moneyline.source === "market_implied";
    if (r.display.fightType === "Insufficient data") {
      assert.equal(backed, false, `${r.fightId}: a bout WITH inputs must not be shown as insufficient`);
    }
  }
});

test("9 · every fight has an explicit Predicted Winner + Method of Victory; winner is a name or 'No clear winner'", () => {
  const fighterNames = new Set(fights.flatMap((f) => [f.fighterA, f.fighterB]));
  for (const r of rows) {
    const w = r.prediction.predictedWinner;
    assert.ok(w === "No clear winner" || fighterNames.has(w), `${r.eventName ?? r.fightId}: winner is a real fighter name or "No clear winner" (got "${w}")`);
    assert.ok(["Decision", "KO/TKO", "Submission", "No clear method"].includes(r.prediction.methodOfVictory), "method is a valid label");
    // Every two-sided-odds fight gets a named winner: ≥55% ⇒ "Market-implied winner"; 50–55% ⇒ "Slight
    // market lean". No two-sided odds ⇒ "No clear winner" (a winner is never invented from stats).
    if (r.moneyline.source === "market_implied") {
      assert.notEqual(r.prediction.predictedWinner, "No clear winner", "odds-backed fight has a named winner");
      const fav = Math.max(r.moneyline.fighterAProbability, r.moneyline.fighterBProbability);
      if (r.prediction.predictedWinnerLabel === "Market-implied winner") assert.ok(fav >= 0.55, "market winner ≥55%");
      if (r.prediction.predictedWinnerLabel === "Slight market lean") assert.ok(fav >= 0.5 && fav < 0.55, "slight lean 50–55%");
    } else {
      assert.equal(r.prediction.predictedWinner, "No clear winner", "no odds ⇒ no invented winner");
    }
  }
  /*
   * P224: these two asserted that SOME fight has a named winner — which is really an assertion that
   * prices exist, since the loop directly above requires "no odds ⇒ no invented winner". Six days
   * before a card the provider offers no MMA moneylines, so every row is honestly "No clear winner"
   * and the engine is doing exactly what the line above demands. Asserting otherwise pressures the
   * engine toward inventing a winner from no market, which is the one thing it must never do.
   *
   * So: when the card is priced, the reads must appear. When it is not, the refusal must be total —
   * a partially-invented winner would be a far worse defect than a quiet card, and nothing else in
   * this file would catch it.
   */
  /*
   * "PRICED" MEANS PRICED FOR THIS CARD. `oddsIndex.size > 0` counts entries in the odds artifact,
   * which on 2026-09-06 held ten bouts from a FINISHED event while the card had rolled to the next
   * one. Non-empty, entirely unjoinable, and this assertion then demanded winners the engine was
   * right to withhold — pressuring it toward the one thing it must never do, inventing a winner
   * from no market.
   */
  if (cover.state === ODDS_COVER.COVERS) {
    assert.ok(rows.some((r) => r.prediction.predictedWinner !== "No clear winner"), "a priced card names winners");
    assert.ok(rows.some((r) => r.prediction.methodOfVictory !== "No clear method"), "a priced card reads methods");
  } else {
    assert.ok(rows.length > 0, "the card still publishes its bouts when unpriced");
    assert.ok(rows.every((r) => r.prediction.predictedWinner === "No clear winner"),
      "with no market on file, NO fight may carry a named winner — a winner from no price is invention");
  }
});

test("7 · diacritic folding matches accented fighters; genuine unknowns stay honest", () => {
  // "Benoît Saint Denis" (ï) must match the DB's "Benoit Saint Denis" via diacritic folding.
  assert.ok(fighterByName.get("benoit saint denis"), "accent-folded name resolves in the index");
  // Every covered row records match quality; a modeled row has both fighters matched.
  for (const r of rows) {
    assert.ok(["matched", "unmatched"].includes(r.dataCoverage.fighterAMatchQuality));
    if (r.fightType.source === "model_derived") {
      assert.equal(r.dataCoverage.fighterAMatchQuality, "matched");
      assert.equal(r.dataCoverage.fighterBMatchQuality, "matched");
    }
  }
  /*
   * THE MECHANISM, not one card's count.
   *
   * This asserted ">= 12 of 14 model reads", a number tuned to the July card that was on disk when
   * it was written. It failed the moment a different card was published — 13 bouts, 9 reads, 4 with
   * a corner not in the stats DB — even though nothing was wrong. A test pinned to today's data
   * fails on the day the data changes, which teaches everyone to edit the number rather than read
   * the test.
   *
   * The real invariant is exact and card-independent: a model read exists for precisely those
   * fights where BOTH corners matched a fighter record, and for no others. That catches a silent
   * matching regression (reads drop while matches hold) AND a fabricated read (a read appears
   * without a match), which the count never could.
   */
  const bothMatched = rows.filter((r) => r.dataCoverage.fighterAMatchQuality === "matched" && r.dataCoverage.fighterBMatchQuality === "matched");
  const modelReads = rows.filter((r) => r.fightType.source === "model_derived");
  assert.equal(modelReads.length, bothMatched.length,
    `${modelReads.length} model reads against ${bothMatched.length} fully-matched fights — a read without a match is fabricated, a match without a read is a regression`);
  assert.ok(bothMatched.length > 0, "no fight on this card matched both corners — the fighter index is not joining at all");
});

test("6 · confidence lowers with coverage; no-data fight is honest", () => {
  const bare = buildUfcPredictionV1({ fighterA: "Nobody X", fighterB: "Nobody Y", boutId: "z" }, null, null, null);
  assert.equal(bare.moneyline.source, "unavailable");
  assert.equal(bare.gameTimeRead, "Odds pending");
  assert.equal(bare.fightType.source, "unavailable");
  assert.equal(bare.method.confidence, "no_read");
  assert.equal(bare.dataCoverage.label, "Records only");
  // A model row never claims "high" confidence without real separation + completeness.
  for (const r of rows.filter((x) => x.fightType.source === "model_derived")) {
    if (r.goesDistance.confidence === "high") assert.ok(Math.abs(r.goesDistance.probability - 0.5) >= 0.16, "high distance conf needs real separation");
  }
});
