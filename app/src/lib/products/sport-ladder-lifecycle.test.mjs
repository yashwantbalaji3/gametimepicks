/**
 * THE UFC AND EPL CARD LADDERS UNDER THE SHARED LIFECYCLE — Program 230 · F1, final migration.
 *
 * Run: npx tsx --test src/lib/products/sport-ladder-lifecycle.test.mjs
 *
 * TWO THINGS HAD TO BE TRUE BEFORE THESE COULD BE GOVERNED.
 *
 * 1. The inventory was checking the WRONG RECORD. It looked for `ufc/graded-picks.json` as evidence
 *    these products have a ledger — but that artifact is the model's fight-winner pick record, a
 *    calibration ledger belonging to a different product. The cards' own record is the Parlay Lab
 *    ledger, which carries wins, losses, stake and return per stream. The inventory was reporting
 *    "the UFC cards have a record" on the strength of something else's.
 *
 * 2. MOST DAYS HAVE NO EVENT, and that is a refusal rather than an outage. UFC runs on fight nights
 *    and EPL on matchweeks; typing a quiet Tuesday as INCIDENT would alarm several times a week
 *    forever, and a watchdog that cries wolf is switched off along with its true alarms.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveLifecycle } from "./daily-lifecycle-derive.mjs";
import { productWatchdog } from "./daily-state-machine.mjs";
import { PRODUCT_REGISTRY } from "./lifecycle-registry.mjs";

const DATE = "2026-09-05";
const mk = (id) => ({ product: id, date: DATE, policyVersion: `${id}@1` });
const cards = [{ slipId: "s1" }, { slipId: "s2" }];

/** The receipt writer's adapter: only THIS sport's cards out of the shared lab receipt. */
const labSettlement = (sport, receipt) => {
  const mine = (receipt.cards ?? []).filter((c) => c.sport === sport);
  if (!mine.length) return null;
  return {
    ref: `parlays/lab-settled/${DATE}.json@${receipt.settledAt}`,
    stamp: receipt.settledAt,
    results: mine.map((c) => c.result ?? "pending"),
    stepAtSettle: 0,
  };
};

test("both ladders own their OWN stream of the shared lab ledger", () => {
  const ufc = PRODUCT_REGISTRY.get("ufc-cards");
  const epl = PRODUCT_REGISTRY.get("epl-cards");
  assert.ok(ufc && epl);

  /* Same artifact — genuinely, the lab ledger holds five streams in one file. */
  assert.equal(ufc.ledger, epl.ledger);
  /* Different records inside it. This is the distinction the registry enforces. */
  assert.notEqual(ufc.ledgerStream, epl.ledgerStream);

  /* And NEITHER points at graded-picks.json, which belongs to the model-pick product. */
  for (const p of [ufc, epl]) assert.ok(!/graded-picks/.test(p.ledger), "not another product's record");
});

test("A DAY BETWEEN EVENTS IS NO_PLAY, and the watchdog stays quiet", () => {
  const lc = deriveLifecycle({
    ...mk("ufc-cards"),
    entry: { state: "NO_PLAY", reason: "no UFC event on 2026-09-01 — the ladder is published for 2026-09-05" },
  });
  assert.equal(lc.state, "NO_PLAY");
  assert.match(lc.evidence.reason, /the ladder is published for/, "the refusal names where the next card IS");
  assert.deepEqual(productWatchdog([lc], Date.parse("2026-09-01T23:00:00Z"), { products: ["ufc-cards"] }), []);
});

test("but a ladder that does not exist AT ALL is still an incident", () => {
  /* The distinction that matters: "between events" is a product decision; "the producer never ran
     and no forward card is published" is an operational fact. Both leave the page empty. */
  const lc = deriveLifecycle({
    ...mk("ufc-cards"),
    entry: { state: "NOT_RUN", reason: "no ufc ladder exists for 2026-09-05 and no forward card is published" },
  });
  assert.equal(lc.state, "INCIDENT");
  assert.equal(productWatchdog([lc], 0, { products: ["ufc-cards"] })[0].kind, "INCIDENT_OPEN");
});

test("A PUBLISHED CARD SETTLES FROM ITS OWN STREAM ONLY", () => {
  /*
   * The lab receipt holds every stream's cards in one file. Grading UFC on an EPL card's result is
   * exactly the cross-ledger contamination the ledger invariants forbid — and it would be invisible,
   * because both are paper cards in the same artifact.
   */
  const receipt = {
    settledAt: `${DATE}T23:30:00Z`,
    cards: [
      { sport: "epl", result: "win", slipId: "e1" },
      { sport: "ufc", result: "loss", slipId: "u1" },
    ],
  };
  const ufc = deriveLifecycle({
    ...mk("ufc-cards"), entry: { state: "ACTIVE", card: cards },
    lockAt: `${DATE}T15:00:00Z`, settlement: labSettlement("ufc", receipt),
  });
  const epl = deriveLifecycle({
    ...mk("epl-cards"), entry: { state: "ACTIVE", card: cards },
    lockAt: `${DATE}T11:00:00Z`, settlement: labSettlement("epl", receipt),
  });
  assert.equal(ufc.state, "SETTLED_LOSS", "UFC takes the UFC result");
  assert.equal(epl.state, "SETTLED_WIN", "EPL takes the EPL result — the two never cross");
});

test("REFUSAL · an unsettled card stays AWAITING_RESULT rather than assuming a loss", () => {
  /*
   * Grading uncertainty as a loss is how a settled record acquires losses nobody can point to a
   * result for.
   */
  const lc = deriveLifecycle({
    ...mk("epl-cards"), entry: { state: "ACTIVE", card: cards }, lockAt: `${DATE}T11:00:00Z`,
    settlement: labSettlement("epl", { settledAt: `${DATE}T23:30:00Z`, cards: [{ sport: "epl", result: "pending" }] }),
  });
  assert.equal(lc.state, "AWAITING_RESULT");
});

test("REFUSAL · a published card with no freeze stamp fails closed", () => {
  const lc = deriveLifecycle({ ...mk("ufc-cards"), entry: { state: "ACTIVE", card: cards }, lockAt: null });
  assert.equal(lc.state, "INCIDENT");
  assert.match(lc.evidence.incidentRef, /unearned:ACTIVE/);
});
