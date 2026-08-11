/**
 * Sport-gate guards (Program 144 · Release H).
 *
 * The contract's one promise: a sport cannot be called live from anything less than a fully proven
 * pipeline. Every test is a way optimism could leak in — a missing stage defaulting to fine, an
 * archive counting as activity, a PARTIAL sneaking past the gate.
 *
 * Run: npx tsx --test src/lib/sports/sport-gate.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { GATE_STAGES, deriveSportMaturity, publicActivationEligible, remainingPath, SPORT_GATE_VERSION } from "./sport-gate.mjs";
import { SPORT_ASSESSMENTS } from "./sport-assessments.mjs";

const allProven = () => Object.fromEntries(GATE_STAGES.map((s) => [s.id, { status: "PROVEN", evidence: "x" }]));

test("UNPROVEN is the default — an empty assessment is NOT_STARTED, never fine", () => {
  assert.equal(deriveSportMaturity({}, { historicalArchive: false }), "NOT_STARTED");
  assert.equal(publicActivationEligible({}), false);
});

test("every stage PROVEN ⇒ LIVE_ELIGIBLE — and one PARTIAL anywhere breaks it", () => {
  assert.equal(deriveSportMaturity(allProven()), "LIVE_ELIGIBLE");
  for (const s of GATE_STAGES) {
    const st = allProven();
    st[s.id] = { status: "PARTIAL" };
    assert.notEqual(deriveSportMaturity(st), "LIVE_ELIGIBLE", `${s.id} PARTIAL must block live eligibility`);
    assert.equal(publicActivationEligible(st), false);
  }
});

test("off-season: only in-season-only gaps ⇒ SEASONAL_READY; a core gap still blocks", () => {
  const st = allProven();
  st.products = { status: "UNPROVEN" };
  st.publication = { status: "UNPROVEN" };
  st.monitoring = { status: "UNPROVEN" };
  assert.equal(deriveSportMaturity(st, { inSeason: false }), "SEASONAL_READY");
  // The same gaps IN season are just gaps.
  assert.equal(deriveSportMaturity(st, { inSeason: true }), "SCAFFOLDED");
  // An off-season sport missing its MODEL is not seasonal-ready — that gap has no season excuse.
  st.model = { status: "UNPROVEN" };
  assert.notEqual(deriveSportMaturity(st, { inSeason: false }), "SEASONAL_READY");
});

test("an archive alone is HISTORICAL_ONLY — history is not activity (the Program 139 rule)", () => {
  assert.equal(deriveSportMaturity({}, { historicalArchive: true }), "HISTORICAL_ONLY");
});

test("an invalid status throws rather than passing as optimism", () => {
  assert.throws(() => deriveSportMaturity({ model: { status: "PROBABLY_FINE" } }), /invalid status/);
});

test("remainingPath lists gaps in dependency order with their proof requirements", () => {
  const st = allProven();
  st.calibration = { status: "UNPROVEN" };
  st.settlement = { status: "BLOCKED_EXTERNAL", blocker: "no official source contracted" };
  const path = remainingPath(st);
  assert.deepEqual(path.map((p) => p.stage), ["calibration", "settlement"]);
  assert.match(path[0].requiredProof, /preregistered backtest/);
  assert.equal(path[1].blocker, "no official source contracted");
});

test("THE COMMITTED ASSESSMENTS · maturity derives to the honest current picture", () => {
  const m = Object.fromEntries(
    Object.entries(SPORT_ASSESSMENTS).map(([k, v]) => [k, deriveSportMaturity(v.stages, v)]),
  );
  assert.equal(m.mlb, "LIVE_ELIGIBLE", "MLB is the one end-to-end pipeline");
  // Release B (Program 148) gave NFL its first real artifact — the contract-satisfying schedule
  // adapter + honest /sports destination — so NOT_STARTED would now be FALSE modesty, which is as
  // dishonest as overclaiming. SCAFFOLDED, with the schedule stage as the only evidence-bearer.
  assert.equal(m.nfl, "SCAFFOLDED", "PARTIAL stages exist; the gate must say exactly that much");
  // The receipted set grew P148→P151→P161: schedule capture, then the research corpus (data) and
  // evaluated baselines + shared-harness replay (model), then the settlement contract validated on
  // all 1,001 corpus finals with its deployed results capture. Exactly these four, nothing else.
  assert.deepEqual(Object.keys(SPORT_ASSESSMENTS.nfl.stages).sort(), ["data", "model", "schedule", "settlement"],
    "NFL evidence = schedule + data + model + settlement, each with its P148/P151/P161 receipt");
  for (const st of Object.values(SPORT_ASSESSMENTS.nfl.stages)) assert.equal(st.status, "PARTIAL");
  assert.equal(m.nba, "SCAFFOLDED");
  assert.equal(m.epl, "SCAFFOLDED");
  assert.equal(m.ufc, "SCAFFOLDED", "internal maturity — the PUBLIC display state stays HISTORICAL_ONLY via simulation-hub");
  // And nobody but MLB may even request public activation.
  for (const [k, v] of Object.entries(SPORT_ASSESSMENTS)) {
    assert.equal(publicActivationEligible(v.stages, v), k === "mlb", `${k} activation eligibility`);
  }
});

test("every non-UNPROVEN stage in the committed assessments carries a receipt", () => {
  for (const [sport, a] of Object.entries(SPORT_ASSESSMENTS)) {
    for (const [stage, s] of Object.entries(a.stages)) {
      if (s.status === "PROVEN" || s.status === "PARTIAL") {
        assert.ok(s.evidence && s.evidence.length > 20, `${sport}.${stage}: a ${s.status} claim needs a real receipt`);
      }
      if (s.status === "BLOCKED_EXTERNAL") {
        assert.ok(s.blocker, `${sport}.${stage}: BLOCKED_EXTERNAL must name its blocker`);
      }
    }
  }
});

test("the gate is versioned and the stage list covers the full pipeline", () => {
  assert.equal(SPORT_GATE_VERSION, 1);
  assert.equal(GATE_STAGES.length, 12);
  for (const s of GATE_STAGES) assert.ok(s.proof.length > 20, `${s.id} needs a concrete proof requirement`);
});
