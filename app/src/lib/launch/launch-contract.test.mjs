/**
 * Launch-contract proofs (Program 135).
 *
 * The property that matters most: a strong engineering score must NEVER be able to produce a
 * public-go recommendation. Everything else here defends the vocabularies and the derivation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDepartments, buildSports, buildLaunchGates, recommendation, headlines,
  HEALTH, PROOF, OWNER, TASK_STATUS, RECOMMENDATION,
} from "./launch-contract.mjs";

test("departments derive from the existing scorecard — no competing source", () => {
  const src = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "launch-contract.mjs"), "utf8");
  assert.match(src, /from "\.\.\/scorecard\/scorecard\.mjs"/, "must reuse the scorecard calculator");
  assert.match(src, /from "\.\.\/scorecard\/company-checklist\.mjs"/, "must reuse the company checklist");
  // No hand-written percentage may appear as a department completion.
  assert.doesNotMatch(src, /completionPct:\s*\d/, "completion must be computed, never literal");
});

test("every department reports closed-vocabulary values", () => {
  const d = buildDepartments();
  assert.equal(d.length, 16, "all 16 departments present");
  for (const x of d) {
    assert.ok(HEALTH.includes(x.health), `${x.name}: bad health ${x.health}`);
    assert.ok(PROOF.includes(x.proof), `${x.name}: bad proof ${x.proof}`);
    assert.ok(typeof x.completionPct === "number");
    for (const t of x.tasks) {
      assert.ok(OWNER.includes(t.owner_type), `bad owner ${t.owner_type}`);
      assert.ok(TASK_STATUS.includes(t.status), `bad status ${t.status}`);
      assert.match(t.priority, /^P[0-3]$/);
      assert.ok(t.acceptance_evidence && t.acceptance_evidence.length > 3, "every task needs evidence");
    }
  }
});

test("THE CORE PROPERTY · a perfect engineering score cannot yield PUBLIC_GO", () => {
  const gates = buildLaunchGates();
  const rec = recommendation(gates);
  assert.ok(RECOMMENDATION.includes(rec));
  assert.notEqual(rec, "PUBLIC_GO", "founder-owned legal/measurement gates are open");

  // Prove it is the GATES doing the work: an all-PASS gate set is the only route to PUBLIC_GO.
  const allPass = gates.map((g) => ({ ...g, status: "PASS" }));
  assert.equal(recommendation(allPass), "PUBLIC_GO");
  // …and a single FAIL on business/legal drops it out of any public-go state.
  const oneFail = allPass.map((g) => (g.id === "business-legal" ? { ...g, status: "FAIL" } : g));
  assert.notEqual(recommendation(oneFail), "PUBLIC_GO");
  assert.notEqual(recommendation(oneFail), "CONDITIONAL_PUBLIC_GO");
});

test("four headlines stay SEPARATE and business is not hidden by platform", () => {
  const h = headlines();
  for (const k of ["platformEngineering", "liveProductReadiness", "businessGtm", "overallCompany"]) {
    assert.ok(typeof h[k].pct === "number", `${k} must be numeric`);
    assert.ok(h[k].basis.length > 8, `${k} must state its basis`);
  }
  assert.ok(h.platformEngineering.pct > h.businessGtm.pct + 20,
    "the platform/business gap is the whole point of separate headlines");
  assert.ok(h.liveProductReadiness.pct < h.platformEngineering.pct,
    "live readiness must not inherit the engineering score");
});

test("archived sports never render archived completion as live readiness", () => {
  const s = buildSports();
  for (const x of s.filter((y) => y.launchState === "ARCHIVED")) {
    assert.equal(x.liveReadiness, "N_A_ARCHIVED", `${x.name}: archived must be N/A for live readiness`);
  }
  const mlb = s.find((x) => x.name === "MLB");
  assert.ok(mlb && mlb.launchState.startsWith("LIVE"), "MLB must reflect a live state");
});

test("launch gates name an owner and a blocker wherever they are not passing", () => {
  for (const g of buildLaunchGates()) {
    assert.ok(["ENGINEERING", "FOUNDER", "EXTERNAL"].includes(g.owner), `${g.id}: bad owner`);
    if (g.status !== "PASS") assert.ok(g.blocker, `${g.id}: a non-passing gate must name its blocker`);
    assert.ok(g.evidence && g.evidence.length > 10, `${g.id}: needs evidence`);
  }
});

test("the dashboard route is internal-only and pruned from the public export", () => {
  const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const page = fs.readFileSync(path.join(APP, "src/app/launch/page.tsx"), "utf8");
  assert.match(page, /guardInternalRoute\(\)/, "must call the internal-route guard");
  const prune = fs.readFileSync(path.join(APP, "scripts/prune-internal-routes.mjs"), "utf8");
  assert.match(prune, /INTERNAL_ROUTES = \[[^\]]*"launch"/, "launch must be in the prune list");
});
