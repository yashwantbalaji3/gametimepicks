/**
 * State-machine guards (P209 · Release B): every allowed transition drives, every impossible jump
 * refuses, terminals must be earned, and the readiness→script mapping can never promote a
 * non-ready event to a COMPLETE report.
 *
 * Run: npx tsx --test src/lib/simulate/state-machine.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PHASES, TRANSITIONS, PHASE_COPY, createContext, advance, scriptForReadiness } from "./state-machine.mjs";

const ctx = () => createContext({ sport: "mlb", eventId: "mlb:1", productDate: "2026-08-25", readiness: "SIMULATION_READY", href: "/games/mlb/x" });

test("every phase has copy and a transition row; the graph is closed over PHASES", () => {
  for (const p of PHASES) {
    assert.ok(p in PHASE_COPY, `${p} has copy`);
    assert.ok(p in TRANSITIONS, `${p} has a transition row`);
    for (const n of TRANSITIONS[p]) assert.ok(PHASES.includes(n), `${p} → ${n} targets a known phase`);
  }
});

test("the happy path drives to COMPLETE with an artifact identity", () => {
  let c = ctx();
  c = advance(c, "LOADING_INPUTS");
  c = advance(c, "VALIDATING");
  c = advance(c, "PREPARING");
  c = advance(c, "SUMMARIZING");
  c = advance(c, "COMPLETE", { artifactId: "sim:mlb:1:v3" });
  assert.equal(c.phase, "COMPLETE");
  assert.equal(c.artifactId, "sim:mlb:1:v3");
});

test("impossible jumps throw — including CHECKING_EVENT straight to COMPLETE", () => {
  assert.throws(() => advance(ctx(), "COMPLETE", { artifactId: "x" }), /illegal transition/);
  assert.throws(() => advance(ctx(), "SUMMARIZING"), /illegal transition/);
  let c = advance(ctx(), "LOADING_INPUTS");
  assert.throws(() => advance(c, "COMPLETE", { artifactId: "x" }), /illegal transition/);
  const done = ["LOADING_INPUTS", "VALIDATING", "PREPARING", "SUMMARIZING"].reduce((acc, p) => advance(acc, p), ctx());
  const complete = advance(done, "COMPLETE", { artifactId: "a" });
  assert.throws(() => advance(complete, "CHECKING_EVENT"), /illegal transition/, "terminals are terminal");
});

test("COMPLETE without an artifact id fails closed to FAILED, never presents", () => {
  const done = ["LOADING_INPUTS", "VALIDATING", "PREPARING", "SUMMARIZING"].reduce((acc, p) => advance(acc, p), ctx());
  const c = advance(done, "COMPLETE");
  assert.equal(c.phase, "FAILED");
  assert.match(c.reason, /identity missing/i);
});

test("REFUSED/FAILED without a reason fail closed with a stated reason", () => {
  const c = advance(ctx(), "REFUSED");
  assert.equal(c.phase, "FAILED");
  assert.match(c.reason, /without a stated reason/i);
  const f = advance(ctx(), "REFUSED", { reason: "no artifact for this event" });
  assert.equal(f.phase, "REFUSED");
});

test("readiness scripts: ready states may COMPLETE; every non-ready state ends REFUSED with a reason", () => {
  for (const r of ["SIMULATION_READY", "MODEL_ONLY_NO_MARKET", "BASELINE_ONLY", "SETTLED"]) {
    assert.equal(scriptForReadiness(r).terminal, "COMPLETE", r);
  }
  for (const r of ["ARTIFACT_READY", "NO_PLAY", "SCHEDULE_ONLY", "SOURCE_STALE", "GARBAGE"]) {
    const s = scriptForReadiness(r);
    assert.equal(s.terminal, "REFUSED", r);
    assert.ok(s.reason, `${r} refusal carries a reason`);
  }
});

test("the copy never claims live trial-running — precomputed vocabulary only", () => {
  const all = Object.values(PHASE_COPY).join(" ");
  assert.doesNotMatch(all, /running \d|new trials|re-?running|10,000 runs now/i);
  assert.match(PHASE_COPY.PREPARING, /verified/i, "the preparing copy names the precomputed truth");
});

test("progress starts indeterminate — units are never invented", () => {
  assert.deepEqual(ctx().progress, { kind: "indeterminate" });
});
