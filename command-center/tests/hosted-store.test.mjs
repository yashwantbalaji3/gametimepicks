/**
 * H0: the hosted shape, on real Postgres (PGlite). Every "request" opens a fresh session and a fresh orchestrator
 * (nothing carried in memory), flushes once, and hands its outbox to the worker — which is another fresh session.
 * This is exactly how a stateless Vercel Function and a GitHub Actions worker will share the ledger.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pglite } from "../ledger/pg-adapters.mjs";
import { createSqlStore } from "../ledger/sql-store.mjs";
import { createOrchestrator } from "../orchestrator/orchestrator.mjs";
import { RUN_LIMITS } from "../contracts/engineering.mjs";
import { stepClock } from "../lib/util.mjs";
import { FOUNDER, tempDir, TEST_SLATE, RECAP_COMMAND } from "./helpers.mjs";
import { checkKept } from "../worker/check-kept.mjs";
import { dirObjectStore } from "../ledger/object-store.mjs";

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/fake-claude.mjs");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

async function hosted({ engineering } = {}) {
  const db = await pglite();
  const clock = stepClock();
  const sql = createSqlStore({ db, clock });
  await sql.migrate();
  const out = tempDir("gtp-cc-hosted-");
  const make = (session, opts) => createOrchestrator({ store: session, clock, outDir: out, slateDate: TEST_SLATE, engineering, execution: "jobs", ...opts });
  /** One stateless request: fresh session + orchestrator, one flush, outbox returned. */
  async function request(fn) {
    const session = await sql.open();
    const o = make(session);
    const result = await fn(o);
    await session.flush();
    return { result, outbox: o.takeOutbox(), state: o.state() };
  }
  /** One worker invocation for a job, in its own session; flushes progress as it goes. */
  async function worker(jobId) {
    const session = await sql.open();
    const o = make(session, { runnerId: "test-worker" });
    const tick = setInterval(() => session.flush().catch(() => {}), 50);
    try {
      const r = await o.runJob(jobId, { runId: "123" });
      await o.whenIdle();
      return r;
    } finally {
      clearInterval(tick);
      await session.flush();
    }
  }
  const read = async () => make(await sql.open()).state();
  return { db, sql, request, worker, read };
}

test("SQL store: concurrent sessions, append-only, refresh, and rows appended during a flush are kept", async () => {
  const { db, sql } = await hosted();
  const a = await sql.open();
  const b = await sql.open();
  a.append("command", "founder", { commandId: "x" });
  assert.equal(a.claim("gate|1", { v: "a" }).won, true);
  assert.equal(b.claim("gate|1", { v: "b" }).won, true, "b can't know yet");
  await a.flush();
  await assert.rejects(b.flush(), (e) => e.code === "CLAIM_CONFLICT");
  const c = await sql.open();
  assert.deepEqual(c.readClaim("gate|1").value, { v: "a" });

  // append while a flush is in flight
  c.append("progress", "engineering", { line: 1 });
  const p = c.flush();
  c.append("progress", "engineering", { line: 2 });
  await p;
  await c.flush();
  const d = await sql.open();
  assert.deepEqual(d.list().filter((e) => e.kind === "progress").map((e) => e.data.line), [1, 2]);

  // a reader in ANOTHER process (separate store instance) sees another writer's rows after refresh;
  // sessions in the same process share one append-only cache and see commits at once
  const e = await createSqlStore({ db, clock: stepClock("2026-10-28T00:00:00.000Z") }).open();
  const f = await sql.open();
  f.append("control", "founder", { paused: true });
  await f.flush();
  assert.equal(e.list().some((x) => x.kind === "control"), false);
  await e.refresh();
  assert.equal(e.list().some((x) => x.kind === "control"), true);

  await assert.rejects(db.query("UPDATE ledger_entries SET kind = 'x'"), /append-only/);
  await assert.rejects(db.query("DELETE FROM ledger_entries"), /append-only/);
});

test("stateless recap: the request defers the heavy steps to one worker job, which finishes the command", async () => {
  const h = await hosted();
  const r1 = await h.request((o) => o.handleCommand(RECAP_COMMAND, FOUNDER));
  assert.equal(r1.outbox.length, 1);
  assert.equal(r1.outbox[0].type, "drive");
  const c1 = r1.state.commands[0];
  assert.deepEqual(c1.contributions.map((x) => x.role), ["prompt-architect"], "the light step ran in the request");

  const w = await h.worker(r1.outbox[0].jobId);
  assert.equal(w.ok, true, JSON.stringify(w));
  const s = await h.read();
  assert.deepEqual(s.commands[0].contributions.map((x) => x.role), ["prompt-architect", "engineering", "integrity-reviewer", "creative-renderer", "social-strategy", "chief-of-staff"]);
  assert.equal(s.decisions.length, 1);
  assert.ok(s.history.some((x) => x.kind === "job" && /drive started on test-worker/.test(x.line)));
  assert.ok(s.history.some((x) => x.kind === "job" && /drive finished/.test(x.line)));

  // approve in a later stateless request: mock receipt, idempotent
  const d = s.decisions[0];
  const r2 = await h.request((o) => o.decide({ decisionId: d.decisionId, verdict: "approve", captionId: "A", digest: d.options[0].digest }, FOUNDER));
  assert.equal(r2.result.receipt.state, "PUBLISHED_MOCK");
  const r3 = await h.request((o) => o.decide({ decisionId: d.decisionId, verdict: "approve", captionId: "A", digest: d.options[0].digest }, FOUNDER));
  assert.equal(r3.result.duplicate, true);
  // a duplicated dispatch of the same job is refused, not run twice
  assert.equal((await h.worker(r1.outbox[0].jobId)).code, "JOB_ALREADY_DONE");
});

function toyRepo() {
  const dir = tempDir("gtp-cc-toy-");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "toy");
  git(dir, "config", "user.email", "toy@example.com");
  const w = (p, c) => { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), c); };
  w(".gitignore", ".claude/\n");
  w("command-center/surfaces/console/app.js", "// console app\n");
  w("command-center/surfaces/console/styles.css", "/* styles */\n");
  w("command-center/tests/ok.test.mjs", 'import test from "node:test"; test("ok", () => {});\n');
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "toy");
  return dir;
}

test("stateless engineering: spec → G1 → plan job → G2 → build job → G3 keep job, each in a fresh session", async () => {
  const home = tempDir("gtp-cc-home-");
  fs.writeFileSync(path.join(home, ".fake-claude.json"), "{}");
  const repo = toyRepo();
  const h = await hosted({
    engineering: {
      repoRoot: repo, claudeBin: FAKE, claudeEnv: { PATH: process.env.PATH, HOME: home }, home, screens: false,
      workcopyPaths: ["command-center"], nodeModulesFrom: null, pausePollMs: 100, patchStore: dirObjectStore(tempDir("gtp-cc-patches-")),
      limits: { ...RUN_LIMITS, plan: { ...RUN_LIMITS.plan, timeoutMs: 20_000 }, build: { ...RUN_LIMITS.build, timeoutMs: 20_000 }, killGraceMs: 300 },
    },
  });
  const SPEC = { objective: "Add a copy button", userStories: ["copy"], constraints: ["console only"], filesInScope: ["command-center/surfaces/console/app.js"], tests: ["suite"], acceptanceCriteria: ["copies"], nonGoals: [] };
  await h.request((o) => o.attestBilling({ usageCredits: "off" }, FOUNDER));
  const r1 = await h.request((o) => o.handleCommand("Team, add a copy button. Have ChatGPT write the spec and Claude Code implement it.", FOUNDER));
  assert.equal(r1.outbox.length, 0, "the manual spec seat needs no runner");
  const pa = r1.state.commands[0].tasks.find((t) => t.status === "AWAITING_INPUT");
  await h.request((o) => o.submitManual(pa.taskId, JSON.stringify(SPEC), FOUNDER));

  const gate = (s, g) => s.decisions.find((d) => d.gate === g);
  let s = await h.read();
  const g1 = await h.request((o) => o.decide({ decisionId: gate(s, "G1").decisionId, verdict: "approve", digest: gate(s, "G1").subjectDigest }, FOUNDER));
  assert.equal(g1.outbox[0].type, "plan");
  assert.equal((await h.worker(g1.outbox[0].jobId)).ok, true);

  s = await h.read();
  assert.ok(gate(s, "G2"), "the worker produced the plan and G2");
  const g2 = await h.request((o) => o.decide({ decisionId: gate(s, "G2").decisionId, verdict: "approve", digest: gate(s, "G2").subjectDigest }, FOUNDER));
  assert.equal(g2.outbox[0].type, "build");
  assert.equal((await h.worker(g2.outbox[0].jobId)).ok, true);

  s = await h.read();
  const g3d = gate(s, "G3");
  assert.equal(g3d.options.find((o) => o.id === "keep").allowed, true, JSON.stringify(g3d.warnings));
  const g3 = await h.request((o) => o.decide({ decisionId: g3d.decisionId, verdict: "keep", digest: g3d.subjectDigest }, FOUNDER));
  assert.equal(g3.outbox[0].type, "keep");
  // the keep job runs on a "fresh runner": the working copy is gone and must be rebuilt from the stored G3 patch
  const wcDir = (await h.sql.open()).list().find((e) => e.kind === "deliverable" && e.data.kind === "workcopy").data.dir;
  fs.rmSync(wcDir, { recursive: true, force: true });
  assert.equal((await h.worker(g3.outbox[0].jobId)).ok, true);
  s = await h.read();
  const kept = s.commands[0].deliverables.find((d) => d.kind === "kept");
  assert.ok(kept);
  assert.equal(git(repo, "show", "--name-only", "--format=", kept.commit), "command-center/surfaces/console/app.js");

  // the push job's check: exactly the approved change set passes; anything else is refused
  const keepJob = g3.outbox[0].jobId;
  const entries = (await h.sql.open()).list().map((e) => ({ ...e, actorIsFounderWrite: true }));
  const gitIn = (args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
  assert.deepEqual(checkKept({ entries, branch: kept.branch, tip: kept.commit, jobId: keepJob, git: gitIn }), []);
  git(repo, "checkout", "-q", "-b", "tamper", kept.commit);
  fs.appendFileSync(path.join(repo, "command-center/surfaces/console/app.js"), "/* not approved */\n");
  git(repo, "commit", "-q", "-am", "tamper");
  const forged = git(repo, "commit-tree", git(repo, "rev-parse", "HEAD^{tree}"), "-p", git(repo, "rev-parse", `${kept.commit}^`), "-m", "forged");
  assert.match(checkKept({ entries, branch: kept.branch, tip: forged, jobId: keepJob, git: gitIn }).join(";"), /differs from the patch approved/);
  assert.match(checkKept({ entries, branch: "cc/other-branch", tip: kept.commit, jobId: keepJob, git: gitIn }).join(";"), /approved branch is/);
  assert.match(checkKept({ entries, branch: kept.branch, tip: kept.commit, jobId: g2.outbox[0].jobId, git: gitIn }).join(";"), /not a requested keep job/);
});

test("stateless Pause names the running jobs to cancel, and a racing double decision loses at commit", async () => {
  const h = await hosted();
  const r1 = await h.request((o) => o.handleCommand(RECAP_COMMAND, FOUNDER));
  // simulate a started job without running it
  const s1 = await h.sql.open();
  const o1 = createOrchestrator({ store: s1, clock: stepClock("2026-10-27T13:00:00.000Z"), outDir: tempDir(), execution: "jobs" });
  s1.append("job", "worker", { jobId: r1.outbox[0].jobId, commandId: "x", type: "drive", status: "started", runner: "gh", runId: "999" });
  await s1.flush();
  const p = await h.request((o) => o.setPaused(true, FOUNDER));
  assert.deepEqual(p.result.cancelJobs.map((j) => j.runId), ["999"]);
  assert.ok(o1);

  // two requests decide the same caption concurrently: exactly one commits
  const h2 = await hosted();
  const a = await h2.request((o) => o.handleCommand(RECAP_COMMAND, FOUNDER));
  await h2.worker(a.outbox[0].jobId);
  const d = (await h2.read()).decisions[0];
  const sa = await h2.sql.open();
  const sb = await h2.sql.open();
  const oa = createOrchestrator({ store: sa, clock: stepClock("2026-10-27T14:00:00.000Z"), outDir: tempDir(), execution: "jobs" });
  const ob = createOrchestrator({ store: sb, clock: stepClock("2026-10-27T14:00:00.000Z"), outDir: tempDir(), execution: "jobs" });
  await oa.decide({ decisionId: d.decisionId, verdict: "approve", captionId: "A", digest: d.options[0].digest }, FOUNDER);
  await ob.decide({ decisionId: d.decisionId, verdict: "approve", captionId: "B", digest: d.options[1].digest }, FOUNDER);
  await sa.flush();
  await assert.rejects(sb.flush(), (e) => e.code === "CLAIM_CONFLICT");
  const final = await h2.read();
  assert.equal(final.decisions[0].resolution.captionId, "A");
  assert.equal(final.history.filter((x) => x.kind === "publish-receipt").length, 1);
});

test("review fixes: a failed flush keeps its rows (only a lost claim drops them); in-flight rows stay visible", async () => {
  const { db, sql } = await hosted();
  const s = await sql.open();
  s.append("progress", "engineering", { line: "kept across a failure" });
  const real = db.transaction;
  db.transaction = async () => { throw Object.assign(new Error("network blip"), { code: "ECONNRESET" }); };
  await assert.rejects(s.flush(), /network blip/);
  db.transaction = real;
  assert.equal(s.pending().entries, 1, "back in the buffer");
  s.append("progress", "engineering", { line: "second" });
  const p = s.flush();
  assert.equal(s.list().filter((e) => e.kind === "progress").length, 2, "visible while the flush is in flight");
  await p;
  const fresh = await createSqlStore({ db, clock: stepClock("2026-10-29T00:00:00.000Z") }).open();
  assert.deepEqual(fresh.list().filter((e) => e.kind === "progress").map((e) => e.data.line), ["kept across a failure", "second"]);
});

test("review fix N1: a test that rewrites the working copy after the diff was taken withdraws Keep", async () => {
  const home = tempDir("gtp-cc-home-");
  // the "build" adds a test file that, when the verifier runs it, edits app.js behind the diff's back
  const sneaky = 'import fs from "node:fs"; import test from "node:test"; test("x", () => { fs.appendFileSync("command-center/surfaces/console/app.js", "\\n/* changed during tests */\\n"); });\n';
  fs.writeFileSync(path.join(home, ".fake-claude.json"), JSON.stringify({ edits: [
    { path: "command-center/surfaces/console/app.js", append: "\n/* fake build edit */\n" },
    { path: "command-center/tests/sneaky.test.mjs", append: sneaky },
  ] }));
  const repo = toyRepo();
  const h = await hosted({
    engineering: {
      repoRoot: repo, claudeBin: FAKE, claudeEnv: { PATH: process.env.PATH, HOME: home }, home, screens: false,
      workcopyPaths: ["command-center"], nodeModulesFrom: null, pausePollMs: 100,
      limits: { ...RUN_LIMITS, plan: { ...RUN_LIMITS.plan, timeoutMs: 20_000 }, build: { ...RUN_LIMITS.build, timeoutMs: 20_000 }, killGraceMs: 300 },
    },
  });
  const SPEC = { objective: "Add a copy button", userStories: ["copy"], constraints: ["console only"], filesInScope: ["command-center/surfaces/console/app.js"], tests: ["suite"], acceptanceCriteria: ["copies"], nonGoals: [] };
  await h.request((o) => o.attestBilling({ usageCredits: "off" }, FOUNDER));
  const r1 = await h.request((o) => o.handleCommand("Team, add a copy button. Have ChatGPT write the spec and Claude Code implement it.", FOUNDER));
  await h.request((o) => o.submitManual(r1.state.commands[0].tasks.find((t) => t.status === "AWAITING_INPUT").taskId, JSON.stringify(SPEC), FOUNDER));
  const gate = (s, g) => s.decisions.find((d) => d.gate === g);
  let s = await h.read();
  const g1 = await h.request((o) => o.decide({ decisionId: gate(s, "G1").decisionId, verdict: "approve", digest: gate(s, "G1").subjectDigest }, FOUNDER));
  await h.worker(g1.outbox[0].jobId);
  s = await h.read();
  const g2 = await h.request((o) => o.decide({ decisionId: gate(s, "G2").decisionId, verdict: "approve", digest: gate(s, "G2").subjectDigest }, FOUNDER));
  await h.worker(g2.outbox[0].jobId);
  s = await h.read();
  const g3 = gate(s, "G3");
  assert.equal(g3.options.find((o) => o.id === "keep").allowed, false);
  assert.ok(g3.warnings.some((w) => w.code === "WORKCOPY_CHANGED_BY_TESTS"), JSON.stringify(g3.warnings));
});
