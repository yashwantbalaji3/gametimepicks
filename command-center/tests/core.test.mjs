/** Contracts, ledger concurrency, policy and seats — the rules that hold without any sports data. */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateTaskEnvelope, validateContribution, validateEngineeringBrief, REASON } from "../contracts/index.mjs";
import { createFileStore } from "../ledger/store.mjs";
import { checkDelegation, checkFounder, checkSeat, MAX_HOPS, MAX_TASKS_PER_COMMAND } from "../orchestrator/policy.mjs";
import { parseIntent } from "../orchestrator/intents.mjs";
import { resolveSeat } from "../providers/registry.mjs";
import { parseManualAnswer } from "../providers/manual.mjs";
import { stepClock, canonicalJson, digestOf } from "../lib/util.mjs";
import { tempDir } from "./helpers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("canonical JSON is key-order independent, so digests are stable", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  assert.equal(digestOf({ x: [1, 2] }), digestOf({ x: [1, 2] }));
  assert.notEqual(digestOf({ x: [1, 2] }), digestOf({ x: [2, 1] }));
});

test("contracts reject incomplete envelopes, contributions and briefs", () => {
  assert.equal(validateTaskEnvelope({}).ok, false);
  assert.equal(validateContribution({ taskId: "t", role: "nobody" }).ok, false);
  assert.equal(validateEngineeringBrief({ objective: "x", constraints: [], dependencies: [], tests: [], acceptanceCriteria: ["a"] }).ok, false);
  assert.equal(validateEngineeringBrief({ objective: "x", constraints: ["c"], dependencies: [], tests: [], acceptanceCriteria: ["a"] }).ok, true);
});

test("ledger is append-only and ordered", () => {
  const store = createFileStore({ dir: tempDir(), clock: stepClock() });
  store.append("command", "founder", { n: 1 });
  store.append("control", "founder", { paused: true });
  assert.deepEqual(store.list().map((e) => e.kind), ["command", "control"]);
  assert.throws(() => store.append("not-a-kind", "x", {}), /unknown ledger kind/);
});

test("idempotency claim: exactly one winner across 12 concurrent processes", async () => {
  const dir = tempDir();
  const script = `
    import { createFileStore } from ${JSON.stringify(path.join(here, "../ledger/store.mjs"))};
    const s = createFileStore({ dir: ${JSON.stringify(dir)}, clock: () => new Date().toISOString() });
    const r = s.claim("publish|x|acct|evt|kind|snap", { pid: process.pid });
    process.stdout.write(r.won ? "WON" : "LOST");`;
  const runs = await Promise.all(Array.from({ length: 12 }, () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script]);
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("close", () => resolve(out));
  })));
  assert.equal(runs.filter((r) => r === "WON").length, 1, runs.join(","));
  assert.equal(runs.filter((r) => r === "LOST").length, 11);
});

test("policy: hop limit, task cap and allowed delegations", () => {
  assert.equal(checkDelegation({ fromRole: "prompt-architect", toRole: "engineering", hop: 1, tasksSoFar: 1 }).ok, true);
  const loop = checkDelegation({ fromRole: "creative-renderer", toRole: "engineering", hop: MAX_HOPS, tasksSoFar: 4 });
  assert.equal(loop.code, REASON.LOOP_GUARD);
  assert.equal(checkDelegation({ fromRole: "prompt-architect", toRole: "engineering", hop: 1, tasksSoFar: MAX_TASKS_PER_COMMAND }).code, REASON.TASK_CAP);
  assert.equal(checkDelegation({ fromRole: "social-strategy", toRole: "prompt-architect", hop: 1, tasksSoFar: 1 }).code, REASON.DELEGATION_NOT_ALLOWED);
});

test("policy: founder-only actions are checked by identity", () => {
  assert.equal(checkFounder("approve", { role: "founder" }).ok, true);
  assert.equal(checkFounder("approve", { role: "agent" }).code, REASON.NOT_FOUNDER);
  assert.equal(checkFounder("pause", undefined).code, REASON.NOT_FOUNDER);
});

test("seats: paid seats are refused at a $0 budget and their stubs never run", async () => {
  assert.equal(checkSeat("fake").ok, true);
  assert.equal(checkSeat("manual:chatgpt").ok, true);
  assert.equal(checkSeat("api:openai").code, REASON.BUDGET_EXCEEDED);
  for (const seat of ["api:openai", "api:anthropic", "api:xai", "mcp:chatgpt"]) {
    const r = resolveSeat(seat);
    assert.equal(r.ok, false, seat);
    assert.equal(r.code, REASON.SEAT_NOT_ENABLED);
  }
  // Even with budget, the Phase 1 stub has no network code and refuses.
  const funded = resolveSeat("api:openai", { env: { GTP_CC_BUDGET_USD: "5" } });
  assert.equal(funded.ok, true);
  await assert.rejects(funded.runner.run({}), (e) => e.code === REASON.SEAT_NOT_ENABLED);
});

test("manual seat: pasted JSON is held to the same contract", () => {
  const good = parseManualAnswer('ok\n```json\n{"objective":"o","constraints":["c"],"dependencies":[],"tests":[],"acceptanceCriteria":["a"]}\n```', "engineering-brief");
  assert.equal(good.contractValid, true);
  const bad = parseManualAnswer('```json\n{"objective":"o"}\n```', "engineering-brief");
  assert.equal(bad.contractValid, false);
  assert.equal(parseManualAnswer("no json here", "engineering-brief").contractValid, false);
  assert.equal(parseManualAnswer('{"objective":"o","constraints":["c"],"dependencies":[],"tests":[],"acceptanceCriteria":["a"]}', "engineering-brief").contractValid, true, "bare JSON is accepted");
});

test("intents: control words and the recap command", () => {
  assert.equal(parseIntent("Pause publishing"), "pause");
  assert.equal(parseIntent("resume"), "resume");
  assert.equal(parseIntent("status"), "status");
  assert.equal(parseIntent("Team, prepare the NFL postgame recap for last night's games"), "nfl-recap");
  assert.equal(parseIntent("What should we build next?"), "general");
});
