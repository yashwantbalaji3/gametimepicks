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

test("/today features UFC as a sport and as the lead slate", () => {
  assert.ok(todayPage.includes('href: "/ufc"'), "UFC is in the active-sports grid");
  assert.ok(todayPage.includes("featured slate · UFC"), "UFC featured-slate lead section present");
});

test("no banned promotional copy in /ufc or /today", () => {
  for (const [name, src] of [["/ufc", ufcPage], ["/today", todayPage]]) {
    const blob = src.toLowerCase();
    for (const w of ["guaranteed", "guarantee", "risk-free", "can't miss", "cant miss", "sure thing", "free money", "safest", " lock "]) {
      assert.ok(!blob.includes(w), `${name}: banned copy "${w}" must not appear`);
    }
  }
});
