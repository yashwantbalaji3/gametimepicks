/**
 * Activation-tier ratchet (Program 198 · Release F).
 *
 * The tier is GENERATED from stage receipts — never typed — and this guard pins the current
 * generated answer so a regression (or an over-promotion) is a reviewed change, not a drift.
 * "Any public label above the generated tier is a P0 contradiction": the closure packets' C2
 * guard enforces the derivation live; this test pins WHAT it currently derives, with each tier's
 * receipt-backed rationale beside it.
 *
 * Run: npx tsx --test src/lib/launch/activation-tiers.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { derivePublicTier, SPORT_PUBLIC_ROUTES } from "./closure-packets.mjs";
import { SPORT_ASSESSMENTS } from "../sports/sport-assessments.mjs";

const tierOf = (sport) => derivePublicTier(SPORT_ASSESSMENTS[sport].stages, { claimedRoutes: [...SPORT_PUBLIC_ROUTES[sport]] });

test("the generated tiers, pinned with their rationale — a change here is a reviewed promotion or regression", () => {
  // MLB: all twelve stages proven; founder activation remains a separate switch.
  assert.equal(tierOf("mlb"), "LIVE_ELIGIBLE");
  // EPL: publication and model PROVEN, calibration honestly unproven at 3/30 — the definition
  // of a public beta: current forecasts and records with the sample limits explicit.
  assert.equal(tierOf("epl"), "PUBLIC_BETA_MODEL");
  // UFC: model PARTIAL (base-rate-proven only) with the cumulative loss visible — research lab,
  // not beta, and the record page says why.
  assert.equal(tierOf("ufc"), "RESEARCH_LAB");
  // NFL: model PARTIAL on regular-season-only evidence with the live window just opening.
  assert.equal(tierOf("nfl"), "RESEARCH_LAB");
  // NBA: claims no route of its own; private research cannot promote a public tier. Schedule
  // proven → SCHEDULE_ONLY, carried by the /sports directory's honest coverage line.
  assert.equal(tierOf("nba"), "SCHEDULE_ONLY");
});

test("no sport may claim a higher tier than its stages derive — the forbidden-claims list", () => {
  // These are the promotions the receipts do NOT support today. Each would need the named
  // receipt, and a page or label asserting one of them is the P0 the packets' C2 guard catches.
  assert.notEqual(tierOf("ufc"), "PUBLIC_BETA_MODEL", "needs the model stage PROVEN — a base-rate pass with a cumulative market loss is not that receipt");
  assert.notEqual(tierOf("nfl"), "PUBLIC_BETA_MODEL", "needs a regular-season model promoted under the frozen contract");
  assert.notEqual(tierOf("epl"), "LIVE_ELIGIBLE", "needs calibration at its preregistered denominator (3/30 today)");
  assert.notEqual(tierOf("nba"), "RESEARCH_LAB", "private research is not a public surface; the sport claims no route");
});
