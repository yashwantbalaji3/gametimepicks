/**
 * NBA standing guards — the things that must NOT change because an adapter now exists.
 *
 * Building the adapter is the exact moment NBA is most likely to be promoted by accident: the
 * plumbing works, the identity resolves at scale, the settlement whitelist covers every family, and
 * all of that is easy to mistake for readiness. It is not. Gates G2/G3/G4 are graded on LIVE
 * preseason evidence that does not exist yet, and the standing risk named in the readiness doc is
 * `sports-coverage.ts` still carrying NBA `level: "full"` for the legacy parlay gate.
 *
 * So these assertions are deliberately about absence.
 *
 * Run: npx tsx --test src/lib/nba/nba-guards.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  canEnterPredictionProducts,
  canShowLiveProjections,
  capabilityOf,
  capabilityState,
  resultsMode,
  FULL_MODEL_SPORTS,
} from "../sport-capability-registry.ts";
import { MODELED_SPORT_KEYS, getSportCapabilities } from "../sport-capabilities.ts";
import { SPORTS_COVERAGE } from "../sports-coverage.ts";
import { NBA_MARKET_CONFIG } from "../markets/sport-config.ts";
import { NBA_ADAPTER } from "./nba-adapter.ts";
import { NBA_CONTRACT_FLAGS } from "./identity-contract.ts";

const SRC = path.resolve(process.cwd(), "src");

test("NBA stays HISTORICAL_ONLY in the capability registry", () => {
  assert.equal(capabilityState("nba"), "HISTORICAL_ONLY");
  assert.equal(canEnterPredictionProducts("nba"), false);
  assert.equal(canShowLiveProjections("nba"), false);
  // The settled archive is real and stays published — that is what HISTORICAL_ONLY means.
  assert.equal(resultsMode("nba"), "archive");
  assert.ok(!FULL_MODEL_SPORTS.includes("nba"));
  assert.ok(capabilityOf("nba").evidence.length > 0, "a state without evidence is an opinion");
});

test("the legacy sports-coverage parlay gate cannot reactivate NBA", () => {
  const nba = SPORTS_COVERAGE.find((s) => s.key === "nba");
  // The field is still "full" — it feeds the legacy MODELED_SPORT_KEYS gate and untangling it needs
  // the mixed-sport parlay rule decided first. What must hold is that the registry narrows it.
  assert.equal(nba.level, "full", "if this changed, re-check the gate below rather than deleting it");
  assert.ok(
    !MODELED_SPORT_KEYS.includes("nba"),
    "NBA re-entered the legacy modeled-sport gate — official parlays would accept NBA legs",
  );

  const caps = getSportCapabilities("nba");
  assert.equal(caps.hasProjections, false);
  assert.equal(caps.hasSuggestedParlays, false);
  assert.equal(caps.hasBuildYourOwn, false);
  // Grading follows resultsMode, so a HISTORICAL_ONLY sport keeps its settled archive on /results.
  assert.equal(caps.hasGrading, true);
});

test("no NBA player-prop model is declared anywhere in the market config", () => {
  assert.equal(NBA_MARKET_CONFIG.model.kind, "NONE");
  assert.equal(NBA_MARKET_CONFIG.playerFamilies.size, 0);
  assert.ok(NBA_MARKET_CONFIG.model.evidence.length > 0);
});

test("the adapter does not claim FULL_MODEL", () => {
  assert.equal(NBA_ADAPTER.readiness, "HISTORICAL_ONLY");
  assert.notEqual(NBA_ADAPTER.readiness, "FULL_MODEL");
  assert.ok(NBA_ADAPTER.readinessEvidence.includes("0 boards are research-eligible"));
});

test("the NBA contracts stay non-public and non-product", () => {
  assert.deepEqual(NBA_CONTRACT_FLAGS, {
    public: false,
    approvedForProduction: false,
    productEligible: false,
  });
});

test("NBA lib files publish no probability, lean, or pick", () => {
  // A source scan rather than a behavioural one: the risk is a NEW file quietly adding a projection
  // field, which no existing test would exercise.
  const dir = path.join(SRC, "lib/nba");
  const banned = /\b(modelProbability|simulationProbability|edgePct|publishedPick|suggestedPick)\b/;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".ts")) continue;
    const source = fs.readFileSync(path.join(dir, file), "utf-8");
    const offending = source
      .split("\n")
      .filter((line) => banned.test(line) && !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//"));
    assert.deepEqual(offending, [], `${file} declares model output for a no-model sport`);
  }
});
