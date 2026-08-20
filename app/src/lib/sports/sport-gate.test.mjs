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
  // The receipted set grew P148→P151→P161→P171: schedule capture, the research corpus (data),
  // evaluated baselines + shared-harness replay (model), the settlement contract validated on all
  // 1,001 corpus finals, then Program 171's durable-id registry consumed by a real odds join
  // (identity), the receipt-gated authorized capture (markets), and the public price layer
  // (publication). Exactly these seven, nothing else.
  // P185 added `owner` and `qualification` — shared machinery built once on the factory spine and
  // inherited, not re-argued per sport. The set stays EXACT: this list is a ratchet, so a new stage
  // is a reviewed change here, never one that appears in the assessments unnoticed.
  assert.deepEqual(Object.keys(SPORT_ASSESSMENTS.nfl.stages).sort(),
    ["data", "identity", "markets", "model", "owner", "publication", "qualification", "schedule", "settlement"],
    "NFL evidence = the P148/P151/P161 four plus P171's identity + markets + publication, plus P185's owner + qualification");
  // identity and markets earned PROVEN on Program 171 receipts; everything else is honestly
  // PARTIAL — and publication CANNOT be PROVEN on a price table, because no model layer is public.
  assert.equal(SPORT_ASSESSMENTS.nfl.stages.identity.status, "PROVEN");
  assert.equal(SPORT_ASSESSMENTS.nfl.stages.markets.status, "PROVEN");
  assert.match(SPORT_ASSESSMENTS.nfl.stages.markets.evidence, /cumulative 12 of 3,000/, "the markets claim carries its actual credit spend");
  assert.equal(SPORT_ASSESSMENTS.nfl.stages.publication.status, "PARTIAL");
  assert.match(SPORT_ASSESSMENTS.nfl.stages.publication.evidence, /no MODEL layer is public/);
  // Everything outside this set stays PARTIAL. `owner` and `qualification` joined it on P185 —
  // both are verified against real artifacts rather than asserted: the owner guard requires the
  // workflow to exist, carry a cron and reach a human, and the qualification guard reads the shadow
  // module's own state literals. The blanket rule is intact; only the reviewed exceptions grew.
  const NFL_PROVEN = new Set(["identity", "markets", "owner", "qualification"]);
  for (const [name, st] of Object.entries(SPORT_ASSESSMENTS.nfl.stages)) {
    if (!NFL_PROVEN.has(name)) assert.equal(st.status, "PARTIAL", `${name} stays PARTIAL`);
    else assert.equal(st.status, "PROVEN", `${name} is one of the reviewed PROVEN stages`);
  }
  // The live window is PRESEASON: every P171 model receipt is regular-season evidence, and the
  // model stage must say so rather than let a preseason slate imply promotion.
  assert.match(SPORT_ASSESSMENTS.nfl.stages.model.evidence, /the live window is preseason/i);
  assert.equal(SPORT_ASSESSMENTS.nfl.inSeason, true, "the 2026 preseason window is live and captured daily");
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
