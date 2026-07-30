/**
 * UFC public-ready invariants — /ufc is the settled archive (the hub was retired: UFC is
 * SCAFFOLD_ONLY in the capability registry, so nothing predictive publishes) and the page never
 * fabricates: the record renders only from the OFFICIAL settlement, the internal pipeline
 * artifacts stay real (ESPN MMA schedule, model+market-grounded projections, model-only expanded
 * markets), and no banned copy ships. Source + artifact checks (run pre-build).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "public", "data", "ufc");
const read = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"));
const ufcPage = fs.readFileSync("src/app/ufc/page.tsx", "utf8");
const todayPage = fs.readFileSync("src/app/today/page.tsx", "utf8");

test("UFC schedule is a REAL ESPN MMA card, not fabricated", () => {
  const s = read("schedule-latest.json");
  assert.equal(s.source, "espn_mma", "schedule comes from the real ESPN MMA feed");
  assert.equal(s.isRealCard, true, "only real scheduled cards publish");
  assert.ok((s.eventName ?? "").length > 0 && (s.fightCount ?? 0) > 0, "real event name + fights");
  assert.ok(Array.isArray(s.fights) && s.fights.length === s.fightCount, "fights array matches count");
});

test("UFC projections are model+market grounded — never fabricated picks", () => {
  const p = read("projections-latest.json");
  if (!p.moneylineV1Ready || !(p.projections?.length)) return; // fail-closed: nothing to assert
  for (const proj of p.projections) {
    assert.equal(typeof proj.modelProbability, "number", `${proj.fighter}: real model probability`);
    assert.equal(typeof proj.marketImpliedProbability, "number", `${proj.fighter}: real market probability`);
    assert.equal(typeof proj.oddsPrice, "number", `${proj.fighter}: real sportsbook odds`);
    assert.ok(proj.modelProbability > 0 && proj.modelProbability < 1, "probability in (0,1)");
  }
});

test("/ufc renders ONLY the officially settled record; the compact /today hub carries no UFC lead block", () => {
  // 2026-07-30 cleanup: the hub (Projections / Suggested Cards / Markets tabs) was retired — UFC is
  // SCAFFOLD_ONLY, so the page's only content is the settled archive, gated on the official settlement.
  assert.ok(ufcPage.includes("results-settled-latest.json"), "/ufc reads the official settlement artifact");
  assert.ok(ufcPage.includes("UfcEventResultsRecap"), "/ufc renders the settled recap");
  assert.ok(!ufcPage.includes("projections-latest.json"), "/ufc no longer reads projections");
  assert.ok(!/featured slate · UFC/.test(todayPage), "no UFC lead block on the compact /today hub");
});

test("/ufc fabricates no markets: the only market figures are the officially graded moneylines", () => {
  // The hub's Markets / Expanded Projections tabs are retired with the rest of the predictive shape.
  for (const banned of ['label: "Markets"', 'label: "Expanded Projections"', "propMarketsAvailable", "Total rounds", "Method of victory", "Goes the distance"]) {
    assert.ok(!ufcPage.includes(banned), `archive page must not carry "${banned}"`);
  }
  // The graded record itself flows through the recap component, sourced from the settlement artifact.
  assert.ok(ufcPage.includes('settlement.status === "final"'), "record renders only behind the official-final gate");
});

// The honest-UFC-methodology guarantee lives in src/app/methodology/methodology-content.test.mjs
// (that cluster owns the surface): registry SCAFFOLD_ONLY + "market-implied only · no fight model".

test("expanded projections are MODEL-ONLY and never parlay-eligible (no fabricated odds)", () => {
  const e = read("expanded-projections-latest.json");
  assert.equal(e.marketScope, "model_only_expanded");
  assert.equal(e.parlayEligible, false, "the whole expanded set is not parlay-eligible");
  assert.ok(Array.isArray(e.projections) && e.projections.length > 0, "expanded projections exist");
  for (const f of e.projections) {
    if (!f.method) { assert.ok(f.note, "limited-data fight has an honest note"); continue; }
    // Expanded markets carry NO odds — must be model-only + not parlay eligible.
    for (const mk of [f.goesDistance, f.totalRounds, f.method]) {
      assert.equal(mk.marketState, "model-only", "expanded market is model-only");
      assert.equal(mk.parlayEligible, false, "expanded market is not parlay eligible");
    }
    // Method probabilities are real fractions that sum to ~1.
    const sum = f.method.koTkoProbability + f.method.submissionProbability + f.method.decisionProbability;
    assert.ok(Math.abs(sum - 1) < 0.02, `method distribution sums to ~1 (got ${sum})`);
    // The moneyline leg IS odds-backed (it has a real sportsbook price).
    assert.equal(f.moneyline.marketState, "odds-backed");
  }
});

test("UFC suggested cards span risk lanes and use only real moneyline legs (no model-only props)", () => {
  const c = read("suggested-parlays-latest.json");
  const labels = (c.cards ?? []).map((x) => x.riskLabel);
  assert.ok(labels.some((l) => /high.?risk/i.test(l)), "a high-risk card exists");
  assert.ok(labels.some((l) => /longshot/i.test(l)), "a longshot card exists");
  for (const card of c.cards ?? []) {
    for (const leg of card.legs ?? []) {
      assert.ok(leg.fighter && leg.boutId, "card leg is a real moneyline pick (fighter + bout)");
      // No expanded model-only market keys leak into priced cards.
      assert.ok(!("goesDistance" in leg) && !("method" in leg) && !("totalRounds" in leg), "no model-only props in cards");
    }
  }
  assert.equal(c.marketScope, "h2h_moneyline_only", "cards remain moneyline-only");
});

test("no banned promotional copy in /ufc or /today", () => {
  for (const [name, src] of [["/ufc", ufcPage], ["/today", todayPage]]) {
    const blob = src.toLowerCase();
    for (const w of ["guaranteed", "guarantee", "risk-free", "can't miss", "cant miss", "sure thing", "free money", "safest", " lock "]) {
      assert.ok(!blob.includes(w), `${name}: banned copy "${w}" must not appear`);
    }
  }
});
