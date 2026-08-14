/**
 * Release A0 guards (Program 179): A FILE EXISTING IS NOT A PREDICTION.
 *
 * At 01:52 ET the live Simulate page showed all ten current NFL games as 19-18 — identical rounded
 * scorelines, win probabilities inside two percentage points of each other — and every card carried
 * the green SIMULATION READY badge. The artifacts were real and the badge was real; the IMPRESSION
 * was false. A reader saw ten game-specific model reads where the engine had one shared prior.
 *
 * This is the second time the same class of mistake has surfaced in two programs. P178 caught the
 * audit reading noise as differentiation; this catches the UI doing it. So the rule is written here
 * as a hard contract rather than a convention:
 *
 *   ARTIFACT_READY  a committed, deterministic, reproducible artifact exists.
 *   SIMULATION_READY  ...AND event-specific inputs measurably move its distribution.
 *
 * Only the second earns the green badge. LIMITED_INPUTS, SHARED_PRIOR_FALLBACK, a failed
 * significance gate or a failed sensitivity check renders BASELINE ONLY and is ineligible for
 * picks and products.
 *
 * The forbidden repair is as important as the required one: this must never be satisfied by
 * cosmetic score variety — jitter, team-name hashing, a seed change, or a market-implied score.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { nflSimulateEligibility } from "./simulate-eligibility.ts";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const pub = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/forecasts/latest.json"), "utf8"));
const eligibility = fs.readFileSync(path.join(APP, "src/lib/sports/nfl/simulate-eligibility.ts"), "utf8");
const lobby = fs.readFileSync(path.join(APP, "src/components/games/simulate-lobby.tsx"), "utf8");

const sharedPrior = (f) => (f.teamSignal?.state ?? "APPLIED") !== "APPLIED";

test("THE DEFECT IS REPRODUCED FROM THE ARTIFACTS — not argued about", () => {
  const scores = pub.forecasts.map((f) => `${f.forecastSummary.projectedScore.away}-${f.forecastSummary.projectedScore.home}`);
  const distinct = new Set(scores);
  const ps = pub.forecasts.map((f) => f.forecastSummary.winProbability.home);
  const spreadPp = (Math.max(...ps) - Math.min(...ps)) * 100;
  // If this ever stops being true the engine has genuinely improved and this test should be
  // rewritten with that evidence — not deleted because the numbers moved.
  if (distinct.size === 1 && pub.forecasts.length > 1) {
    assert.ok(spreadPp < 3, `all ${pub.forecasts.length} games render ${[...distinct][0]} within a ${spreadPp.toFixed(2)}pp win spread`);
  }
  assert.ok(pub.forecasts.every(sharedPrior), "every current forecast is a declared shared prior");
});

test("A SHARED-PRIOR FORECAST MAY NOT CARRY THE GREEN SIMULATION-READY BADGE", () => {
  const live = nflSimulateEligibility();
  for (const e of live.events) {
    const f = pub.forecasts.find((x) => x.providerEventId === e.providerEventId);
    if (f && sharedPrior(f)) {
      assert.equal(e.simulationReady, false,
        `${e.matchup}: a forecast whose event-specific term is switched off is ARTIFACT_READY, not SIMULATION_READY`);
      assert.equal(e.readiness, "BASELINE_ONLY");
      assert.ok(e.readinessReason && e.readinessReason.length > 40, `${e.matchup}: the state explains itself`);
    }
  }
});

test("the lobby renders readiness from the ARTIFACT, never from mere existence", () => {
  assert.match(eligibility, /readiness/, "the selector owns the readiness classification");
  assert.match(eligibility, /BASELINE_ONLY/);
  assert.match(eligibility, /SIMULATION_READY/);
  // simReady drives the green badge — it must be the classification, not "a file exists"
  assert.doesNotMatch(lobby, /simReady: true,\s*\n\s*signal/,
    "NFL rows must not hard-code simReady: true — that is the defect this release fixes");
  assert.match(lobby, /simReady: e\.simulationReady/);
  assert.match(lobby, /BASELINE ONLY|Baseline only/, "the honest label appears on the card");
});

test("COUNTS FOLLOW THE CLASSIFICATION — a baseline-only slate is not a ready slate", () => {
  const live = nflSimulateEligibility();
  const ready = live.events.filter((e) => e.simulationReady).length;
  assert.equal(live.readyCount, ready,
    "readyCount counts SIMULATION_READY events; it used to equal the event count by construction, which is what let a baseline-only slate report itself as fully ready");
  if (live.events.length > 0 && live.events.every((e) => !e.simulationReady)) {
    assert.equal(live.readyCount, 0, "ten baseline-only games are zero simulation-ready games");
  }
});

test("THE FORBIDDEN REPAIR · no cosmetic variety anywhere in the engine", () => {
  const gen = fs.readFileSync(path.join(APP, "scripts/nfl/build-nfl-public-forecasts.mjs"), "utf8");
  const code = gen.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const forbidden of [/jitter/i, /Math\.random/, /hash\(.*name/i, /marketTotal\s*\*/, /consensus\.\w+\s*\*/]) {
    assert.doesNotMatch(code, forbidden, `cosmetic or market-derived score variety is forbidden: ${forbidden}`);
  }
  // the significance gate from P178 is still the thing deciding, and is not bypassed
  assert.match(code, /EFFECTIVE_SLOPE = TEAM_SIGNAL_APPLIED \? base\.marginSlope : 0;/);
});

test("a baseline-only forecast is ineligible for picks and products", () => {
  const elig = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/product-eligibility.json"), "utf8"));
  assert.equal(elig.qualifyingEvents, 0);
  for (const p of elig.products) assert.equal(p.eligible, false);
});

test("PUBLIC COPY may not describe baseline-only output as a prediction engine", () => {
  const hub = fs.readFileSync(path.join(APP, "src/app/nfl/page.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const report = fs.readFileSync(path.join(APP, "src/app/nfl/game/[eventId]/page.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const src of [hub, report]) {
    for (const banned of [/\bpredicts?\b/i, /\bprediction engine\b/i, /\bforecasts? the winner\b/i]) {
      assert.doesNotMatch(src, banned, `baseline-only output may not be described with "${banned}"`);
    }
  }
  // and the limitation is stated where the numbers are, not only in a separate section
  assert.match(report, /BASELINE ONLY|baseline only/i, "the per-game report labels its own state");
});
