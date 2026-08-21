/**
 * The EPL lane-status artifact — the product-state contract for this sport.
 *
 * Run: npx tsx --test src/lib/sports/epl/lane-status.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const ARTIFACT = path.join(APP, "public/data/admin/epl-lane.json");
const lane = fs.existsSync(ARTIFACT) ? JSON.parse(fs.readFileSync(ARTIFACT, "utf8")) : null;

test("the builder is wired into the scheduled workflow AND its commit allowlist", () => {
  const wf = fs.readFileSync(path.join(REPO, ".github/workflows/epl-matchweek.yml"), "utf8");
  assert.match(wf, /build-epl-lane-status\.mjs/, "the products stage wants SCHEDULED automation, not a script someone remembers to run");
  // Generated and never committed is the shape that produced a 62-hour freshness outage in this
  // repository: the job succeeds, the artifact is written, and the runner throws it away.
  assert.match(wf, /git add[^\n]*\\\n[^\n]*app\/public\/data\/admin\/epl-lane\.json/, "the artifact must be in the commit allowlist");
});

test("the artifact is INTERNAL_ADMIN and never reaches the public export", () => {
  if (!lane) return;
  assert.equal(lane.dataClass, "INTERNAL_ADMIN");
  // Declaring a lane's state is not a public claim, and this one's loudest fields are its blockers.
  const exported = path.join(APP, "out/data/admin/epl-lane.json");
  assert.equal(fs.existsSync(exported), false, "a built export must not carry the internal lane status");
});

test("ABSENT is UNKNOWN, never a confident zero", () => {
  if (!lane) return;
  // Every optional block either carries real values or says it could not be read. A green field
  // built from a missing source is the failure this contract exists to prevent.
  for (const [name, block] of Object.entries(lane.freshness ?? {})) {
    assert.ok(block.state === "READ" || block.state === "UNKNOWN", `${name}: unexpected state ${block.state}`);
    if (block.state === "UNKNOWN") assert.ok(block.detail?.length > 0, `${name}: UNKNOWN must say why`);
    else assert.ok(Number.isFinite(block.ageHours), `${name}: READ must carry an age`);
  }
});

test("the gate block agrees with the registry rather than restating it", () => {
  if (!lane) return;
  assert.equal(lane.gate.of, 12, "the sport gate has twelve stages");
  assert.ok(lane.gate.proven >= 0 && lane.gate.proven <= lane.gate.of);
  // Every remaining stage carries the proof it needs. A gap with no stated proof is a to-do, not a gate.
  for (const r of lane.gate.remaining) {
    assert.ok(r.requiredProof?.length > 0, `${r.stage} must state what would prove it`);
    assert.notEqual(r.status, "PROVEN", "a PROVEN stage is not remaining");
  }
  assert.equal(lane.gate.proven + lane.gate.remaining.length, lane.gate.of, "every stage is either proven or remaining");
});

test("every blocker says WHOSE move it is, and reality-gated ones are not disguised as work", () => {
  if (!lane) return;
  assert.ok(lane.blockers.length > 0, "a SCAFFOLDED sport has blockers; zero would mean the gate was not read");
  const STATES = new Set(["REALITY_GATED", "FOUNDER_ACTION", "ENGINEERING"]);
  for (const b of lane.blockers) {
    assert.ok(STATES.has(b.state), `${b.id}: unknown blocker state ${b.state}`);
    assert.ok(b.detail?.length > 0, `${b.id}: a blocker with no detail cannot be acted on`);
  }
  // The distinction that matters: calibration cannot be engineered forward — matches must be played.
  // Filing it as ENGINEERING would put it on a sprint board where it would sit failing forever.
  const cal = lane.blockers.find((b) => b.id === "calibration-sample");
  if (cal) assert.equal(cal.state, "REALITY_GATED");
});

test("declaring the lane state does NOT declare EPL a live product lane", () => {
  if (!lane) return;
  // The whole point of the honesty boundary. This artifact exists so the state is machine-readable;
  // whether EPL cards enter the record is money-adjacent and belongs to the founder.
  const decision = lane.blockers.find((b) => b.id === "product-lane-decision");
  assert.ok(decision, "the founder decision must be recorded as outstanding, not assumed away");
  assert.equal(decision.state, "FOUNDER_ACTION");
});

test("the cadence blocks are DERIVED — coverage and budget both resolve against real files", () => {
  if (!lane) return;
  const { lineupCoverage, budget } = lane.cadence;
  assert.ok(["EVERY_CLUSTER_SERVED", "GAP", "UNKNOWN"].includes(lineupCoverage.state));
  assert.ok(["WITHIN_CEILING", "BREACHES_CEILING", "UNKNOWN"].includes(budget.state));
  if (budget.state !== "UNKNOWN") {
    assert.ok(budget.projectedTotal <= budget.ceiling, `the committed cadence must be able to finish the season: ${budget.projectedTotal}/${budget.ceiling}`);
    assert.ok(Number.isFinite(budget.kickoffWindowHours), "the spend guard's window must be reported, not implied");
  }
});
