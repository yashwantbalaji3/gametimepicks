/**
 * Regression guard for the nightly-settle health-gate abort of 2026-08-18/19:
 *   money:openExposure=Σ-active: daily openExposure 250 ≠ Σ active-lane exposure 0
 *
 * Cause: the player-prop settler summed EVERY lane's exposure while the generator summed only ACTIVE
 * lanes. Four `awaiting` lanes (100+100+25+25) therefore published $250 at risk on a day where no card
 * was ever placed, which failed the money invariant and understated availableBankroll by $250.
 *
 * The first case below is the exact artifact shape that aborted the job — it returns 250 under the old
 * unfiltered reduce and 0 under the shared definition, so this test fails against the bug it describes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { sumActiveExposure, activeLanes } from "./exposure.ts";
import { checkMoneyIntegrity } from "../money-integrity.ts";

/** The four lanes exactly as daily-portfolio.json carried them when the job aborted. */
const AWAITING_SLATE = [
  { id: "bank-builder-lane-a-step-1", product: "bank-builder", status: "awaiting", exposure: 100 },
  { id: "bank-builder-lane-b-step-1", product: "bank-builder", status: "awaiting", exposure: 100 },
  { id: "moonshot-lane-a-2026-08-18", product: "moonshot", status: "awaiting", exposure: 25 },
  { id: "moonshot-lane-b-2026-08-18", product: "moonshot", status: "awaiting", exposure: 25 },
];

test("awaiting lanes place NO open exposure (the 250-vs-0 abort)", () => {
  // Unfiltered — what the settler used to do, reproduced here so the regression is explicit.
  const unfiltered = AWAITING_SLATE.reduce((n, l) => n + l.exposure, 0);
  assert.equal(unfiltered, 250, "fixture must reproduce the old $250 sum, or it guards nothing");
  assert.equal(sumActiveExposure(AWAITING_SLATE), 0, "an awaiting lane has no placed card and no risk");
});

test("only active lanes carry exposure; settled lanes release it", () => {
  const lanes = [
    { product: "bank-builder", status: "active", exposure: 100 },
    { product: "bank-builder", status: "candidate", exposure: 100 },
    { product: "moonshot", status: "won", exposure: 0 },
    { product: "moonshot", status: "lost", exposure: 0 },
    { product: "moonshot", status: "active", exposure: 25 },
  ];
  assert.equal(sumActiveExposure(lanes), 125);
  assert.equal(activeLanes(lanes).length, 2);
  assert.equal(sumActiveExposure(lanes, (l) => l.product === "bank-builder"), 100);
  assert.equal(sumActiveExposure(lanes, (l) => l.product === "moonshot"), 25);
});

test("empty / missing lane lists are 0, never NaN", () => {
  for (const v of [null, undefined, []]) assert.equal(sumActiveExposure(v), 0);
  assert.equal(sumActiveExposure([{ status: "active" }]), 0, "a lane with no exposure field is 0, not NaN");
});

test("the money invariant accepts the settler's output for the aborting slate", () => {
  // Minimal canonical docs consistent with themselves, so the only thing under test is exposure.
  const portfolio = {
    startingBankroll: 100, crownBankroll: 20465.4, currentBankroll: 19065.4,
    drawdown: 1400, settledProfit: 18965.4, roi: 189.654,
    record: { wins: 19, losses: 14, voids: 0, pending: 0 }, openExposure: 0,
  };
  const banked = { crownTotal: 20465.4, ladders: [{ id: "L1", final: 20465.4, official: true }] };
  const daily = {
    activeBankroll: 19065.4, crownBankroll: 20465.4,
    openExposure: sumActiveExposure(AWAITING_SLATE),   // what the fixed settler writes
    lanes: AWAITING_SLATE,
  };
  const crits = checkMoneyIntegrity({ portfolio, banked, daily }).filter((v) => v.severity === "critical");
  assert.deepEqual(crits.map((v) => v.rule), [], `expected no critical violations, got: ${JSON.stringify(crits)}`);

  // And the old value is still rejected — proving the invariant is what caught this, and still would.
  const stillBad = checkMoneyIntegrity({ portfolio, banked, daily: { ...daily, openExposure: 250 } });
  assert.ok(
    stillBad.some((v) => v.rule === "openExposure=Σ-active" && v.severity === "critical"),
    "the invariant must still reject openExposure 250 against zero active lanes",
  );
});
