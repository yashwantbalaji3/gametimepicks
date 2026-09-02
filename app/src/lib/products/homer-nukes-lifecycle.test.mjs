/**
 * HOMER NUKES UNDER THE SHARED LIFECYCLE — Program 230 · F1, the first CALIBRATION product.
 *
 * Run: npx tsx --test src/lib/products/homer-nukes-lifecycle.test.mjs
 *
 * Every product already in the machine runs a money ledger: a card wins or loses and a bankroll
 * moves. Homer Nukes does not. Its record holds `gradedPicks`, `predicted`, `actual` and `brier` and
 * carries no stake at all, because a board of ~25% probabilities is SUPPOSED to miss most of them —
 * five picks with one homer is a well-calibrated day, not a loss.
 *
 * Migrating it by choosing SETTLED_WIN or SETTLED_LOSS would have minted a verdict the product never
 * computes, and that fabricated verdict would then be summable with Bank Builder's and Moonshot's
 * records. SETTLED_RECORDED exists so the honest answer is sayable.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveLifecycle } from "./daily-lifecycle-derive.mjs";
import { LIFECYCLE_TRANSITIONS } from "./daily-state-machine.mjs";
import { PRODUCT_REGISTRY, LEDGER_KINDS } from "./lifecycle-registry.mjs";

const DATE = "2026-09-01";
const base = { product: "homer-nukes", date: DATE, policyVersion: "homer-nukes@1" };
const board = [{ playerId: 1, player: "A" }, { playerId: 2, player: "B" }];
const settlement = (over = {}) => ({
  ref: `homer-nukes/settled-${DATE}.json@${DATE}T05:00:00Z`,
  stamp: `${DATE}T05:00:00Z`, results: ["recorded"], graded: 5, stepAtSettle: 0, ...over,
});

test("it is registered as a CALIBRATION ledger, and does not share a record", () => {
  const p = PRODUCT_REGISTRY.get("homer-nukes");
  assert.ok(p);
  assert.equal(p.ledgerKind, "calibration");
  assert.ok(LEDGER_KINDS.includes(p.ledgerKind));

  const others = PRODUCT_REGISTRY.ids.filter((id) => id !== "homer-nukes");
  assert.ok(!others.map((id) => PRODUCT_REGISTRY.get(id).ledger).includes(p.ledger));
  /* And every money product is still money — adding a kind must not have reclassified anything. */
  for (const id of ["bank-builder", "moonshot", "end-zone-vault"]) {
    assert.equal(PRODUCT_REGISTRY.get(id).ledgerKind, "money");
  }
});

test("A GRADED DAY IS RECORDED, NOT WON OR LOST", () => {
  const lc = deriveLifecycle({
    ...base,
    entry: { state: "ACTIVE", card: board },
    lockAt: `${DATE}T17:50:51.000Z`,
    settlement: settlement(),
  });
  assert.equal(lc.state, "SETTLED_RECORDED");
  assert.equal(lc.evidence.graded, 5, "the settled day names how many picks were graded");
  assert.match(lc.evidence.settlementRef, /homer-nukes\/settled-/);
});

test("SETTLED_RECORDED PROGRESSES NOWHERE — there is no bankroll to advance", () => {
  /*
   * The money states lead to ADVANCED, RESTARTED or STOPPED. A calibration board has nothing to
   * advance; the next product day re-enters EVALUATING through the daily rollover, which is a new
   * receipt rather than a transition edge.
   */
  assert.deepEqual(LIFECYCLE_TRANSITIONS.SETTLED_RECORDED, ["EVALUATING"]);
  for (const forbidden of ["ADVANCED", "RESTARTED", "STOPPED"]) {
    assert.ok(!LIFECYCLE_TRANSITIONS.SETTLED_RECORDED.includes(forbidden));
  }
});

test("REFUSAL · a partially graded day stays AWAITING_RESULT", () => {
  /* Recording a Brier over a half-settled board publishes a number that will move. */
  const lc = deriveLifecycle({
    ...base,
    entry: { state: "ACTIVE", card: board },
    lockAt: `${DATE}T17:50:51.000Z`,
    settlement: settlement({ results: ["pending"] }),
  });
  assert.equal(lc.state, "AWAITING_RESULT");
  assert.equal(lc.evidence.settlementRef, undefined, "no settlement is claimed for an ungraded day");
});

test("REFUSAL · a settled day that names no graded count fails closed", () => {
  /* SETTLED_RECORDED requires `graded`: a settled state with no grading evidence is as unearned as
     an ACTIVE with no freeze stamp. */
  const lc = deriveLifecycle({
    ...base,
    entry: { state: "ACTIVE", card: board },
    lockAt: `${DATE}T17:50:51.000Z`,
    settlement: settlement({ graded: null }),
  });
  assert.equal(lc.state, "INCIDENT");
  assert.match(lc.evidence.incidentRef, /unearned:SETTLED_RECORDED.*graded/);
});

test("THE FREEZE STAMP IS ITS OWN — never another product's activation time", () => {
  /*
   * The receipt writer passed one `lockAt` — the daily-portfolio's stamp — to every product in the
   * loop, so Homer Nukes reached ACTIVE on Bank Builder's activation time. A freeze boundary
   * borrowed from another product is not a freeze boundary, and ACTIVE is precisely the state that
   * must not be reachable without one.
   */
  const noStamp = deriveLifecycle({ ...base, entry: { state: "ACTIVE", card: board }, lockAt: null });
  assert.equal(noStamp.state, "INCIDENT");
  assert.match(noStamp.evidence.incidentRef, /unearned:ACTIVE/);

  const own = deriveLifecycle({ ...base, entry: { state: "ACTIVE", card: board }, lockAt: `${DATE}T17:50:51.000Z` });
  assert.equal(own.state, "ACTIVE");
  assert.equal(own.evidence.lockAt, `${DATE}T17:50:51.000Z`);
});

test("an empty board is a REFUSAL with a reason, not an outage", () => {
  const lc = deriveLifecycle({
    ...base,
    entry: { state: "NO_PLAY", reason: "the board was built and no candidate cleared the model's threshold" },
  });
  assert.equal(lc.state, "NO_PLAY");
  assert.match(lc.evidence.reason, /no candidate cleared/);
});
