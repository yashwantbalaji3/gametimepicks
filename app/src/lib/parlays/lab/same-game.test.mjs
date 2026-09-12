import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildSameGameSplit, sharesAGame } from "./same-game.mjs";

const leg = (game, o = {}) => ({ sport: "mlb", gameId: game, result: "win", oddsForSide: -110, ...o });
const card = (id, status, legs) => ({ slipId: id, status, legs });
const doc = (date, slips) => ({ date, slips });

/** n cards of `size` legs in one arm, `wins` of them winning. */
const arm = (date, prefix, size, count, wins, { shared }) =>
  Array.from({ length: count }, (_, i) =>
    card(`${prefix}${i}`, i < wins ? "win" : "loss",
      Array.from({ length: size }, (_, j) => leg(shared ? "g1" : `g${j}`, { result: i < wins ? "win" : "loss" }))));

test("the arm comes from the legs' own games, never from the card's flag", () => {
  /* The risk-band producer's `sameGame` means "every leg is from one game" and disagrees with
     "two legs share a game" on 532 of 2,700 cards. The gameIds are unambiguous; the flag is not. */
  const c = card("a", "loss", [leg("g1"), leg("g1", { result: "loss" }), leg("g2")]);
  c.sameGame = false;
  const r = buildSameGameSplit([doc("2026-09-20", [c])], { minPerArm: 1 });
  assert.equal(r.sizes[0].shared.cards, 1, "two legs share g1, so it is a shared-game card");
  assert.equal(r.sizes[0].apart.cards, 0);
  assert.equal(sharesAGame([leg("g1"), leg("g2")]), false);
});

test("a scratched leg leaves the card, and can leave it not sharing a game at all", () => {
  const c = card("a", "win", [leg("g1"), leg("g1", { result: "void" }), leg("g2")]);
  const r = buildSameGameSplit([doc("2026-09-20", [c])], { minPerArm: 1 });
  assert.equal(r.sizes[0].legs, 2, "the voided leg is not part of the size");
  assert.equal(r.sizes[0].apart.cards, 1, "and the surviving legs are from different games");
});

test("cards graded before the registration's floor are not scored", () => {
  const docs = [
    doc("2026-09-01", arm("2026-09-01", "old", 2, 10, 5, { shared: true })),
    doc("2026-09-20", arm("2026-09-20", "new", 2, 4, 2, { shared: true })),
  ];
  const r = buildSameGameSplit(docs, { since: "2026-09-13", minPerArm: 1 });
  assert.equal(r.cards, 4, "only the forward cards count");
  assert.equal(r.beforeSince, 10);
  assert.equal(buildSameGameSplit(docs, { since: null, minPerArm: 1 }).cards, 14, "null means everything, for describing the past");
});

test("the combined figure is stratified by size, so a size mix cannot masquerade as an effect", () => {
  /* SIMPSON'S PARADOX, built on purpose. Shared-game cards here do BETTER than apart cards at both
     sizes, but they are concentrated in the larger size where everything loses more — so pooling
     every card together would report shared-game cards as worse. The stratified figure must keep
     the sign the per-size comparisons actually have. */
  const docs = [doc("2026-09-20", [
    ...arm("d", "a2", 2, 200, 120, { shared: false }),   // apart, 2 legs: 60% win
    ...arm("d", "s2", 2, 100, 70, { shared: true }),     // shared, 2 legs: 70% win  (shared better)
    ...arm("d", "a5", 5, 100, 10, { shared: false }),    // apart, 5 legs: 10% win
    ...arm("d", "s5", 5, 300, 45, { shared: true }),     // shared, 5 legs: 15% win  (shared better)
  ])];
  const r = buildSameGameSplit(docs, { minPerArm: 100 });
  for (const s of r.sizes) assert.ok(s.hitRateGap > 0, `${s.legs} legs: shared did better within the size`);
  assert.ok(r.combined.hitRateGap > 0, "and the combined figure says so too");

  const pooledShared = (70 + 45) / 400;
  const pooledApart = (120 + 10) / 300;
  assert.ok(pooledShared < pooledApart, "while a pooled rate would have said the opposite");
});

test("a size where one arm is thin is not comparable, and disagreeing sizes are flagged", () => {
  const docs = [doc("2026-09-20", [
    ...arm("d", "a2", 2, 200, 120, { shared: false }),
    ...arm("d", "s2", 2, 5, 4, { shared: true }),
  ])];
  const r = buildSameGameSplit(docs, { minPerArm: 100 });
  assert.equal(r.sizes[0].comparable, false);
  assert.equal(r.sizes[0].flatReturnGap, null, "an incomparable size reports no gap rather than a tempting number");
  assert.equal(r.combined, null, "and contributes nothing to the combined figure");

  const mixed = [doc("2026-09-20", [
    ...arm("d", "a2", 2, 200, 40, { shared: false }),
    ...arm("d", "s2", 2, 200, 120, { shared: true }),   // shared much better at 2
    ...arm("d", "a5", 5, 200, 120, { shared: false }),
    ...arm("d", "s5", 5, 200, 40, { shared: true }),    // shared much worse at 5
  ])];
  assert.equal(buildSameGameSplit(mixed, { minPerArm: 100 }).combined.agree, false, "sizes that point opposite ways must say so");
});

test("the registration is frozen, scores forward only, and its scorer refuses the past", () => {
  const prereg = path.join(process.cwd(), "..", "data", "internal", "research", "parlays", "preregistration-same-game-v1.json");
  if (!fs.existsSync(prereg)) return;
  const p = JSON.parse(fs.readFileSync(prereg, "utf8"));
  assert.equal(p.public, false, "this is private research and changes nothing public");
  assert.equal(p.dataClass, "PRIVATE_RESEARCH");
  assert.ok(p.scoreCardsGradedFrom > "2026-09-11", "the corpus already looked at cannot score the question");
  assert.ok(p.bars.minCardsPerArmPerSize >= 100 && p.bars.minTotalCards >= 800, "the sample bars are stated in advance");
  assert.match(p.bars.REJECTED, /disagree/, "and a disagreement between sizes is a rejection, not an average");
  assert.match(p.ifRejected, /not retried with a softer bar/);

  const scorer = path.join(process.cwd(), "scripts", "parlays", "score-same-game.mjs");
  const src = fs.readFileSync(scorer, "utf8");
  assert.match(src, /NO VERDICT FOLLOWS/, "the --all mode must refuse to produce a verdict");
  assert.match(src, /scoreCardsGradedFrom/, "and the normal mode must read the floor from the registration");
});
