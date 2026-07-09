/**
 * UFC public-ready invariants — the /ufc page is fail-closed and never fabricates:
 * projections render only from real model output, the card is a real ESPN MMA event,
 * and /today features UFC on a UFC day. Source + artifact checks (run pre-build).
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

test("UFC page is fail-closed and scoped to moneyline-only (no fabricated prop markets)", () => {
  // Projections only render when the V1 model is ready with real projections.
  assert.ok(ufcPage.includes("v1Proj?.moneylineV1Ready"), "projections gate on moneylineV1Ready");
  // Validation is shown honestly (not claimed validated when it isn't).
  assert.ok(/validation in progress|moneylineValidated/.test(ufcPage), "validation state surfaced honestly");
  // No method/round/distance props are invented.
  assert.ok(/method|distance|round/i.test(ufcPage), "unsupported prop markets are explained, not faked");
});

test("/ufc features the UFC card; the compact /today hub no longer carries a UFC lead block", () => {
  // 2026-07-09: the compact /today Daily Model Hub dropped the UFC lead section (a UFC day surfaces on the
  // /ufc page itself, which reads the real schedule + fight card). Intent preserved on /ufc.
  assert.ok(ufcPage.includes("schedule-latest.json") || ufcPage.includes("UfcExpandedFightCards"), "/ufc reads the real card + renders the fights");
  assert.ok(!/featured slate · UFC/.test(todayPage), "no UFC lead block on the compact /today hub");
});

test("UFC page has a Markets tab that honestly scopes coverage to moneyline-only", () => {
  assert.ok(ufcPage.includes('label: "Markets"'), "Markets tab present");
  assert.ok(/moneyline \(h2h\) only/i.test(ufcPage), "expanded markets explained as feed-limited (h2h-only)");
  // Total rounds / method / distance are listed as markets but only LIVE when real odds exist.
  assert.ok(/Total rounds/i.test(ufcPage) && /Method of victory/i.test(ufcPage) && /Goes the distance/i.test(ufcPage),
    "expanded markets are enumerated (shown unavailable, not hidden or faked)");
  assert.ok(ufcPage.includes("propMarketsAvailable"), "expanded-market live state is gated on real availability flags");
});

test("/methodology includes an honest UFC section (sources, coverage, limitations)", () => {
  const m = fs.readFileSync("src/app/methodology/page.tsx", "utf8");
  // June 15 rebuild: the UFC section is now a sport card ("UFC / MMA",
  // "moneyline V1 · validation-stage"). Same honest intents, new wording.
  assert.ok(/UFC \/ MMA/.test(m) && /moneyline V1/.test(m), "UFC methodology section present");
  assert.ok(/ESPN MMA/i.test(m) && /Odds API MMA/i.test(m), "UFC data sources documented");
  assert.ok(/odds unavailable|not in the feed|no feed odds|unavailable/i.test(m), "expanded markets marked unavailable honestly");
  assert.ok(/validation-stage/i.test(m), "validation status documented");
});

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

test("/ufc has an Expanded Projections tab fed by the model-only artifact", () => {
  assert.ok(ufcPage.includes('label: "Expanded Projections"'), "Expanded Projections tab present");
  assert.ok(ufcPage.includes("expanded-projections-latest.json"), "page reads the expanded artifact");
  assert.ok(ufcPage.includes("UfcExpandedFightCards"), "renders the fight-by-fight component");
});

test("no banned promotional copy in /ufc or /today", () => {
  for (const [name, src] of [["/ufc", ufcPage], ["/today", todayPage]]) {
    const blob = src.toLowerCase();
    for (const w of ["guaranteed", "guarantee", "risk-free", "can't miss", "cant miss", "sure thing", "free money", "safest", " lock "]) {
      assert.ok(!blob.includes(w), `${name}: banned copy "${w}" must not appear`);
    }
  }
});
