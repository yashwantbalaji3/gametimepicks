/**
 * Daily-product state guards (Program 140).
 *
 * The acceptance criteria these encode come straight from the defect: a fixture with a CURRENT MLB
 * slate and a 15-day-old Bank Builder artifact must never render "Live today", and a never-run
 * generator must never render as model discipline.
 *
 * Run: npx tsx --test src/lib/products/product-state.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  deriveProductState, productStateLabel, productStateExplanation,
  isCurrent, isLive, PRODUCT_STATES,
} from "./product-state.mjs";

const TODAY = "2026-08-05";

test("THE DEFECT · a current slate + a 15-day-old product artifact is NOT_RUN and never live", () => {
  // This is the exact production state on 2026-08-05: MLB board current, Bank Builder frozen 07-21.
  const s = deriveProductState({ productDate: TODAY, artifactDate: "2026-07-21", publishedCards: 0 });
  assert.equal(s, PRODUCT_STATES.NOT_RUN);
  assert.equal(isLive(s), false, "this is the bug: fifteen-day-old cards under a 'Live today' badge");
  assert.equal(isCurrent(s), false);

  const label = productStateLabel(s, { artifactDate: "2026-07-21", productDate: TODAY });
  assert.doesNotMatch(label, /live/i, "no variant of 'live' may appear");
  assert.match(label, /Not updated today/);
  assert.match(label, /15 days ago/, "the age must be stated, not hidden");
});

test("NOT_RUN is never described as a no-play — we do not know that, nothing ran", () => {
  const s = deriveProductState({ productDate: TODAY, artifactDate: "2026-07-21" });
  assert.doesNotMatch(productStateLabel(s, { artifactDate: "2026-07-21", productDate: TODAY }), /no qualified/i);
  assert.match(productStateExplanation(s), /operational gap, not a decision by the model/);
});

test("a REAL no-play — generator completed today, nothing qualified — is current but not live", () => {
  // The measured 2026-08-05 outcome: Bank Builder 0/2 legs, Moonshot 0/3, under unchanged policy.
  const s = deriveProductState({ productDate: TODAY, artifactDate: TODAY, publishedCards: 0 });
  assert.equal(s, PRODUCT_STATES.COMPLETED_NO_QUALIFIED_CARD);
  assert.equal(isCurrent(s), true, "it IS today's answer");
  assert.equal(isLive(s), false, "but nothing is running, so it is not live");
  assert.match(productStateLabel(s), /No qualified card today/);
  assert.match(productStateExplanation(s), /rather than forcing one/);
});

test("the two empty-page states are distinguishable — that distinction is the whole point", () => {
  const neverRan = deriveProductState({ productDate: TODAY, artifactDate: "2026-07-21" });
  const ranEmpty = deriveProductState({ productDate: TODAY, artifactDate: TODAY, publishedCards: 0 });
  assert.notEqual(neverRan, ranEmpty);
  assert.notEqual(
    productStateLabel(neverRan, { artifactDate: "2026-07-21", productDate: TODAY }),
    productStateLabel(ranEmpty),
    "an outage and model discipline rendered identically for fifteen days",
  );
});

test("a published card is live; once its events start it is awaiting settlement", () => {
  const published = deriveProductState({ productDate: TODAY, artifactDate: TODAY, publishedCards: 2 });
  assert.equal(published, PRODUCT_STATES.CARD_PUBLISHED);
  assert.equal(isLive(published), true);
  assert.equal(productStateLabel(published), "Live today");

  const started = deriveProductState({ productDate: TODAY, artifactDate: TODAY, publishedCards: 2, eventsStarted: true });
  assert.equal(started, PRODUCT_STATES.AWAITING_SETTLEMENT);

  const settled = deriveProductState({ productDate: TODAY, artifactDate: TODAY, publishedCards: 2, settled: true });
  assert.equal(settled, PRODUCT_STATES.SETTLED);
  assert.equal(isLive(settled), false, "a graded card is not running");
});

test("failure and missing-input states are distinct, and neither claims a no-play", () => {
  const failed = deriveProductState({ productDate: TODAY, artifactDate: TODAY, generatorFailed: true });
  assert.equal(failed, PRODUCT_STATES.GENERATION_FAILED);
  assert.equal(isLive(failed), false);

  const missing = deriveProductState({ productDate: TODAY, artifactDate: TODAY, inputsMissing: true });
  assert.equal(missing, PRODUCT_STATES.INPUTS_MISSING);

  const stale = deriveProductState({ productDate: TODAY, artifactDate: TODAY, inputsDate: "2026-08-01" });
  assert.equal(stale, PRODUCT_STATES.INPUTS_STALE);

  for (const s of [failed, missing, stale]) {
    assert.doesNotMatch(productStateLabel(s), /no qualified/i, "a failure is not a no-play");
    // Users get product language, not engineering vocabulary.
    assert.doesNotMatch(productStateLabel(s), /error|exception|stack|null|undefined/i);
  }
});

test("a FUTURE-dated artifact is not accepted as today's", () => {
  const s = deriveProductState({ productDate: TODAY, artifactDate: "2099-01-01", publishedCards: 5 });
  assert.equal(s, PRODUCT_STATES.NOT_RUN);
  assert.equal(isLive(s), false);
});

test("no state is communicated by colour alone — every label carries its meaning in words", () => {
  for (const state of Object.values(PRODUCT_STATES)) {
    const label = productStateLabel(state, { artifactDate: "2026-07-21", productDate: TODAY });
    assert.ok(label && label.length > 3, `${state} needs a label`);
    assert.doesNotMatch(label, /^(green|red|amber|grey)$/i);
    assert.ok(productStateExplanation(state).length > 20, `${state} needs an explanation`);
  }
});
