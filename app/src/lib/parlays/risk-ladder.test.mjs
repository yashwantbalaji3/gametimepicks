/**
 * RISK LADDER — the stream is tracked, honest about being negative, and structurally separate from
 * money.
 *
 * The separation is the load-bearing property. This publishes a +2968 Longshot card on the MLB hub;
 * the only thing that makes that defensible is that its own record travels with it and that it can
 * never move the bankroll. Both are asserted here rather than left to review.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
/*
 * Source with its commentary stripped.
 *
 * The "must not touch portfolio.json" assertion below greps the builder for money filenames — and
 * the builder's own header comment names every one of them while explaining that it touches none.
 * A guard that forbids the word forbids the explanation too, which teaches the next author to
 * delete the documentation rather than the dependency. Scan the CODE.
 */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
/** Rendered prose: JSX splits sentences across tags and newlines, so collapse before matching. */
const prose = (rel) => read(rel).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
const DIR = path.join(APP, "public/data/parlays/risk-ladder");
const latest = JSON.parse(fs.readFileSync(path.join(DIR, "latest.json"), "utf8"));

const TIERS = ["low", "medium", "high", "longshot"];

test("the ladder publishes at most one card per tier, each from its own price band", () => {
  const seen = new Set();
  for (const c of latest.cards) {
    assert.ok(TIERS.includes(c.tier), `${c.tier} is a known tier`);
    assert.ok(!seen.has(c.tier), `one card per tier — ${c.tier} appeared twice`);
    seen.add(c.tier);
    // The card's price must actually sit in the band it is filed under; a card in the wrong bucket
    // is how a "Low risk" label ends up on a +450 ticket.
    const a = c.combinedAmerican;
    const band = { low: a >= -200 && a <= 100, medium: a > 100 && a <= 300, high: a > 300 && a <= 600, longshot: a > 600 }[c.tier];
    assert.ok(band, `${c.tier} card priced ${a} is outside its own band`);
  }
  // Every tier is either carded or explicitly skipped — a tier never just vanishes.
  const accounted = new Set([...latest.cards.map((c) => c.tier), ...latest.skipped.map((s) => s.tier)]);
  for (const t of TIERS) assert.ok(accounted.has(t), `${t} is either carded or has a stated reason`);
});

test("legs are DISJOINT across tiers — the ladder is not one bet wearing four labels", () => {
  /*
   * Measured before this rule existed: High and Longshot shared 2.33 legs on average (Jaccard 0.40)
   * and overlapped on 79% of 43 days, and outcome agreement beat independence in all six tier
   * pairs. A reader taking the whole ladder was making one concentrated bet, not four.
   */
  const seen = new Map();
  for (const c of latest.cards) {
    for (const l of c.legs) {
      const k = `${l.player}|${l.marketLabel}|${l.side}|${l.line}`;
      assert.ok(!seen.has(k), `${l.player} ${l.side} ${l.line} appears in both ${seen.get(k)} and ${c.tier}`);
      seen.set(k, c.tier);
    }
  }
});

test("no card ships past the leg cap — six-leg cards returned −76% over 62 of them", () => {
  for (const c of latest.cards) {
    assert.ok(c.legs.length <= 5, `${c.tier} card has ${c.legs.length} legs; the cap is 5`);
    assert.ok(c.legs.length >= 2, `${c.tier} card must be a real parlay`);
  }
  const src = code("scripts/parlays/build-risk-ladder.mjs");
  assert.match(src, /MAX_LEGS = 5/, "the cap is stated once, as a constant");
});

test("every card carries its own tier's record — a pick is never shown without its history", () => {
  for (const c of latest.cards) {
    assert.ok(c.tierRecord, `${c.tier} card carries a tier record`);
    assert.equal(typeof c.tierRecord.wins, "number");
    assert.equal(typeof c.tierRecord.losses, "number");
    assert.ok(c.tierRecord.wins + c.tierRecord.losses > 0, `${c.tier} record is non-empty`);
    // And the component must actually render it, not just receive it.
    const board = read("src/components/parlays/risk-ladder-board.tsx");
    assert.match(board, /tierRecord\.wins/, "the board renders the tier's wins");
    assert.match(board, /tierRecord\.roi/, "the board renders the tier's ROI");
  }
});

test("the record is re-derived from every graded day, never carried forward", () => {
  const src = code("scripts/parlays/build-risk-ladder.mjs");
  assert.match(src, /readdirSync\(GRADED\)/, "the record reads the whole graded directory");
  assert.doesNotMatch(src, /latest\.json"\), "utf8"\)\)\.record/, "the builder never seeds itself from its own last output");
  // Same failure the NFL experimental record hit: a cumulative file rebuilt from one day's view.
  const overall = latest.record.overall;
  const summed = TIERS.reduce((n, t) => n + latest.record.byTier[t].wins, 0);
  assert.equal(overall.wins, summed, "the overall record is the sum of its tiers");
});

test("ROI is published beside every hit rate — a hit rate alone is unreadable across price bands", () => {
  for (const t of TIERS) {
    const r = latest.record.byTier[t];
    if (!r.decisive) continue;
    assert.notEqual(r.roi, undefined, `${t} publishes ROI`);
    assert.equal(typeof r.roi, "number", `${t} ROI is a number`);
  }
  const stream = read("src/components/results/risk-ladder-stream.tsx");
  assert.match(stream, /Paper ROI/, "the results table has an ROI column");
  assert.match(stream, /cannot be read without the price/, "and says why hit rate alone is not enough");
});

test("a bettor tier's record belongs to the set that tier actually shows", () => {
  /*
   * A tier is a POLICY (these bands, this many cards a day), so its record is exactly computable by
   * replaying it. That is the whole basis for showing a per-tier hit rate: the number belongs to the
   * set shown. If the two ever came from different populations the figure would be decoration.
   */
  for (const t of latest.bettorTiers ?? []) {
    assert.ok(t.bands.length > 0, `${t.id} declares its bands`);
    assert.ok(t.cardsPerDay >= 1, `${t.id} declares its cards per day`);
    assert.equal(t.wins + t.losses, t.settledCards, `${t.id}: W+L must equal the sample it reports`);
    if (t.settledCards > 0) {
      // 1e-4, matching the artifact's stored precision — it rounds to four decimals, so an exact
      // comparison fails on the rounding rather than on any real disagreement.
      assert.ok(Math.abs(t.hitRate - t.wins / t.settledCards) < 1e-4, `${t.id}: the hit rate is that sample's`);
    }
  }
});

test("an UNDETERMINED return is never presented as a result", () => {
  /*
   * 1-2 cards a day over 48 graded days is 43-86 settled cards. At that size a hit rate is well
   * determined (±3-8pp) and an ROI is not (±15-39pp). Three tiers currently show a POSITIVE ROI and
   * none clears two standard errors, while the full pool in those same bands is clearly negative.
   * The bar is 2 SE, not 1 — my first pass used 1 and duly labelled t = 1.34 "determined".
   */
  for (const t of latest.bettorTiers ?? []) {
    if (t.roi == null || t.roiSe == null) continue;
    const clears = Math.abs(t.roi) > 2 * t.roiSe;
    assert.equal(t.roiDetermined, clears, `${t.id}: the flag must match the 2-SE test (t=${t.roiT})`);
  }
  const src = code("scripts/parlays/build-risk-ladder.mjs");
  assert.match(src, /Math\.abs\(mean\) > 2 \* roiSe/, "the threshold is two standard errors");

  /*
   * After the restart the entry leads with the LIVE record, which has settled nothing, so no tier
   * ROI is printed at all — the strongest possible form of "never presented as a result". The
   * assertion is therefore that the surface does not print a tier's return as a bare fact; the flag
   * itself stays pinned above so it cannot drift while unused.
   */
  const entry = read("src/components/parlays/parlay-lab-entry.tsx");
  assert.doesNotMatch(entry, /\{signed\(matched\.roi\)\}/, "a tier ROI is never rendered unguarded");
  assert.match(entry, /no settled cards yet/i, "an empty live record says so instead");
});

test("the stream is NEVER money — no bankroll, no settled product record", () => {
  assert.equal(latest.moneyClass, "PAPER_TRACKED_NOT_BANKROLL");

  // The builder writes only its own directory.
  const src = code("scripts/parlays/build-risk-ladder.mjs");
  for (const f of ["portfolio.json", "banked-ladders.json", "daily-portfolio", "bank-builder", "moonshot"]) {
    assert.ok(!src.includes(f), `the builder must not touch ${f}`);
  }

  // And the protected money is byte-identical, which is the only proof that matters.
  const md5 = (rel) => crypto.createHash("md5").update(fs.readFileSync(path.join(APP, rel))).digest("hex");
  assert.equal(md5("public/data/mr-dub/portfolio.json"), "affe6b21071f2b3be96bb2774eb347c3");
  assert.equal(md5("public/data/mr-dub/bank-builder-locks.json"), "cb80473f88f3cb5f67208fa568925295");
});

test("both surfaces state the separation in words a reader sees", () => {
  const board = read("src/components/parlays/risk-ladder-board.tsx");
  const stream = read("src/components/results/risk-ladder-stream.tsx");
  for (const [name, src] of [["board", board], ["stream", stream]]) {
    assert.match(src, /never part of the (settled product record|Bank Builder)/i,
      `the ${name} says this is not part of the settled record`);
  }
  // The honest headline: while every tier is negative, both surfaces must say so.
  const allNegative = TIERS.every((t) => (latest.record.byTier[t].roi ?? 0) < 0);
  if (allNegative) {
    /* The board used to lead with "every tier is losing money — 48 graded days, −9.4%". That was a
       claim about the PREVIOUS selection policy; after the 2026-08-17 restart the live ledger has
       settled nothing and cannot make it. The invariant this guard exists for is the SEPARATION
       from money, which is unchanged and must stay in words a reader sees — the prior policy's
       result is still shown, in the entry panel, labelled as prior. */
    assert.match(prose("src/components/parlays/risk-ladder-board.tsx"), /tracked\s+separately from every money product/i, "the board states the separation");
    /* The sentence lives in the ARTIFACT and is rendered from it, so it is asserted where it is
       written — and separately that the surface actually renders that field. Grepping the component
       for the words would pass only while someone had retyped them into the JSX. */
    const ledgerDoc = JSON.parse(read("public/data/parlays/lab-ledger.json"));
    assert.match(ledgerDoc.priorPolicy.note, /does not describe what the Lab publishes now/i, "the prior policy is labelled as prior");
    assert.match(read("src/components/parlays/parlay-lab-entry.tsx"), /ledger\.priorPolicy\.note/, "and the surface renders that label");
    assert.match(stream, /Every tier is negative/i, "the stream states it plainly");
  }
});
