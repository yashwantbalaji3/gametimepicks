/**
 * THE LIVE FEATURE VECTOR MUST CARRY EVERY FEATURE THE MODEL WAS FITTED ON.
 *
 * The card builder published thirteen bouts reading "NaN%". Training had grown the tale-of-the-tape
 * features; the card builder's own `featuresFor` had not, so `predBinary` multiplied a weight by
 * `undefined`. Nothing threw. NaN is a float: it survives the sigmoid, `toFixed` renders it, and
 * `JSON.stringify` writes it as null. The suite, the a11y matrix and the health check were all green
 * over a page of NaN — the arithmetic was wrong in a way that no arithmetic could detect.
 *
 * These tests assert the invariant directly, in both directions:
 *   1. the shared constructor returns a finite value for every declared tale-of-the-tape feature,
 *      whether the physicals are present, absent, or half-present;
 *   2. the PUBLISHED artifact carries a finite probability wherever it claims a winner.
 *
 * (2) is the one that would have failed. It reads the built card rather than re-deriving it, so it
 * checks the thing readers actually see.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tottFeat, TOTT_F, WIN_F, WIN_F_TOTT } from "../../../scripts/ufc/lib/fight-model.mjs";

const WHEN = Date.parse("2026-08-22T00:00:00Z");
const A = { name: "A", reachIn: 76, heightIn: 73, stance: "Orthodox", dateOfBirth: "1994-01-01" };
const B = { name: "B", reachIn: 74, heightIn: 72, stance: "Southpaw", dateOfBirth: "1990-06-15" };

test("tale-of-the-tape features are finite in every coverage state", () => {
  for (const [label, a, b] of [
    ["both known", A, B],
    ["red only", A, undefined],
    ["blue only", undefined, B],
    ["neither known", undefined, undefined],
    ["known but no reach", { ...A, reachIn: null }, B],
    ["known but no date of birth", { ...A, dateOfBirth: null }, B],
  ]) {
    const f = tottFeat(a, b, WHEN);
    for (const k of TOTT_F) {
      assert.ok(Number.isFinite(f[k]), `${label}: ${k} is ${f[k]}, not a finite number`);
    }
  }
});

test("an unknown corner reads as unknown, not as an even matchup", () => {
  // Zero-filling without the flag would assert the two fighters matched exactly — a false claim,
  // and a different one from "we do not know". The flag is what keeps them distinguishable.
  const unknown = tottFeat(A, undefined, WHEN);
  assert.equal(unknown.hasTott, 0);
  assert.equal(unknown.reachDiff, 0);

  const known = tottFeat(A, B, WHEN);
  assert.equal(known.hasTott, 1);
  assert.notEqual(known.reachDiff, 0, "a two-inch reach advantage must not read as zero");
});

test("the tale-of-the-tape features are additive to the baseline, not a replacement", () => {
  for (const k of WIN_F) assert.ok(WIN_F_TOTT.includes(k), `${k} was dropped from the winner head`);
  for (const k of TOTT_F) assert.ok(WIN_F_TOTT.includes(k), `${k} is declared but not fitted`);
});

test("the published card states no probability that is not a number", () => {
  const p = path.join(process.cwd(), "public", "data", "ufc", "card-latest.json");
  if (!fs.existsSync(p)) return; // no card built in this checkout — nothing published to check
  const card = JSON.parse(fs.readFileSync(p, "utf8"));
  if (card.state !== "SCHEDULED_CARD") return;

  for (const b of card.bouts ?? []) {
    const pred = b.prediction;
    if (!pred) continue;
    const bout = `${b.red?.name} vs ${b.blue?.name}`;

    if (pred.winner) {
      assert.ok(Number.isFinite(pred.winner.probability), `${bout}: winner probability is ${pred.winner.probability}`);
      assert.ok(pred.winner.probability >= 0.5 && pred.winner.probability <= 1,
        `${bout}: a named winner must carry at least an even read, got ${pred.winner.probability}`);
      for (const [n, v] of Object.entries(pred.winner.byFighter ?? {})) {
        assert.ok(Number.isFinite(v), `${bout}: ${n} carries ${v}`);
      }
    }
    for (const head of ["method", "rounds"]) {
      for (const [k, v] of Object.entries(pred[head]?.probabilities ?? {})) {
        assert.ok(Number.isFinite(v), `${bout}: ${head}.${k} is ${v}`);
      }
    }
  }
});

test("a card skipped for coverage is disclosed, not silently dropped", () => {
  const p = path.join(process.cwd(), "public", "data", "ufc", "card-latest.json");
  if (!fs.existsSync(p)) return;
  const card = JSON.parse(fs.readFileSync(p, "utf8"));
  if (card.state !== "SCHEDULED_CARD") return;

  // Whatever the builder skipped, it has to say what and why — otherwise the selection rule is a
  // hidden preference rather than a stated one.
  assert.ok(Array.isArray(card.skippedForCoverage), "skippedForCoverage must always be present");
  for (const s of card.skippedForCoverage) {
    assert.ok(s.name && s.dateUtc, "a skipped card must be identified");
    assert.ok(Number.isFinite(s.modellableBouts) && Number.isFinite(s.bouts), "with its real counts");
    assert.ok(s.modellableBouts < s.bouts, "a card is only skippable when we cannot read all of it");
    assert.ok(Date.parse(s.dateUtc) < Date.parse(card.event.startUtc),
      "only cards EARLIER than the one published can have been skipped in its favour");
  }
});
