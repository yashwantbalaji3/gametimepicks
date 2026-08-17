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
    assert.match(prose("src/components/parlays/risk-ladder-board.tsx"), /losing money on\s+paper/i, "the board leads with the negative record");
    assert.match(stream, /Every tier is negative/i, "the stream states it plainly");
  }
});
