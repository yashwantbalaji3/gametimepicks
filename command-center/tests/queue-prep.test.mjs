/**
 * Daily queue preparation: a founder setting (append-only `queue-prep`, off when absent) that lets the ACTIVE publisher
 * host prepare today's content queue once per Eastern day at or after the set time, through the founder's own command,
 * as the scheduler (system) actor. Off by default; one build per ET day however many ticks; the inactive host does
 * nothing and records nothing; pause holds it; DST days; failure → alert, no retry; the system actor can do nothing
 * else; hosted: administrator + passkey step-up, and the cron runs it only on the active host.
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createFileStore } from "../ledger/store.mjs";
import { createPublishFlow, etParts, etInstant } from "../orchestrator/publish-flow.mjs";
import { createOrchestrator } from "../orchestrator/orchestrator.mjs";
import { checkFounder, FOUNDER_ACTIONS, SCHEDULER_ACTOR, DAILY_QUEUE_COMMAND } from "../orchestrator/policy.mjs";
import { gitDataSource } from "../recap/multisport-facts.mjs";
import { pglite } from "../ledger/pg-adapters.mjs";
import { migrate, createSqlStore } from "../ledger/sql-store.mjs";
import { sqlObjectStore } from "../ledger/object-store.mjs";
import { createHostedApp, routePermission, stepUpActionFor } from "../hosted/app.mjs";
import { CC_ROOT, REPO_ROOT, sha256 } from "../lib/util.mjs";
import { FOUNDER, tempDir, TEST_SLATE } from "./helpers.mjs";
import { QUEUE_PINNED, QUEUE_NOW, hasPinned, seedApprovedCalendar } from "./queue-fixtures.mjs";

/** A publish flow over a file ledger with a stub queue builder that records every call. */
function harness({ host = "local", dir = tempDir("gtp-cc-qprep-"), result = (n) => ({ ok: true, commandId: `cmd-${n}` }) } = {}) {
  let now = "2026-10-29T12:00:00.000Z";
  let globalPause = false;
  const clock = () => now;
  const store = createFileStore({ dir: path.join(dir, "ledger"), clock });
  const calls = [];
  const flow = createPublishFlow({
    store, clock, posts: () => [], recheck: () => null, designApproved: () => true, isPaused: () => globalPause, mediaDir: dir,
    refreshData: async () => ({ ok: false }), publisherHost: host,
    prepareQueue: async (text, actor) => { calls.push({ text, actor, at: now }); return result(calls.length); },
  });
  return { dir, store, flow, calls, set: (iso) => { now = iso; }, pauseAll: (v) => { globalPause = v; } };
}
const kinds = (store) => store.list().map((e) => e.kind);

test("ET helpers: Eastern date/time across both DST changes", () => {
  assert.deepEqual(etParts("2026-10-30T01:00:00.000Z"), { date: "2026-10-29", time: "21:00" }, "the Eastern date, not the UTC one");
  assert.deepEqual(etParts("2026-11-01T05:30:00.000Z"), { date: "2026-11-01", time: "01:30" }, "first 01:30 (EDT)");
  assert.deepEqual(etParts("2026-11-01T06:30:00.000Z"), { date: "2026-11-01", time: "01:30" }, "second 01:30 (EST)");
  assert.equal(etInstant("2026-10-31", "09:00"), "2026-10-31T13:00:00.000Z", "EDT");
  assert.equal(etInstant("2026-11-02", "09:00"), "2026-11-02T14:00:00.000Z", "EST");
  assert.equal(etInstant("2026-11-01", "01:30"), "2026-11-01T05:30:00.000Z", "the earlier of the two 01:30s");
  assert.equal(etInstant("2026-03-08", "09:00"), "2026-03-08T13:00:00.000Z", "spring forward: EDT from 03:00");
  assert.equal(etInstant("2026-03-07", "09:00"), "2026-03-07T14:00:00.000Z");
});

test("off by default: no record means off — ticks do nothing and record nothing", async () => {
  const h = harness();
  const before = h.store.list().length;
  for (const t of ["2026-10-29T12:00:00.000Z", "2026-10-29T23:00:00.000Z", "2026-10-30T03:59:00.000Z"]) {
    h.set(t);
    assert.equal((await h.flow.prepDue()).skipped, "off");
  }
  assert.equal(h.calls.length, 0);
  assert.equal(h.store.list().length, before, "nothing recorded");
  assert.deepEqual((await h.flow.state()).queuePrep, { enabled: false, timeEt: null, activeHere: true, lastRun: null, next: null });
});

test("enabled on the active host after the time: exactly one build per ET day, however many ticks", async () => {
  const h = harness();
  h.set("2026-10-29T12:00:00.000Z"); // 08:00 EDT
  assert.ok(h.flow.setQueuePrep({ enabled: true, timeEt: "09:30" }, FOUNDER).ok);
  // before the time: nothing
  for (let i = 0; i < 5; i++) assert.equal((await h.flow.prepDue()).skipped, "not yet");
  assert.equal((await h.flow.state()).queuePrep.next, "2026-10-29T13:30:00.000Z");
  h.set("2026-10-29T13:29:59.000Z");
  assert.equal((await h.flow.prepDue()).skipped, "not yet", "one second early");
  assert.equal(h.calls.length, 0);
  // at/after the time: one build, then nothing for the rest of the Eastern day (incl. after UTC midnight)
  for (const t of ["2026-10-29T13:30:00.000Z", "2026-10-29T13:30:30.000Z", "2026-10-29T18:00:00.000Z", "2026-10-30T03:59:00.000Z"]) {
    h.set(t);
    await Promise.all([h.flow.prepDue(), h.flow.prepDue(), h.flow.prepDue()]);
  }
  assert.equal(h.calls.length, 1, "one build on 10-29");
  assert.equal(h.calls[0].text, DAILY_QUEUE_COMMAND);
  assert.deepEqual(h.calls[0].actor, SCHEDULER_ACTOR, "recorded as the scheduler, not the founder");
  assert.equal(h.store.readClaim("queue-prep|2026-10-29").value.host, "local");
  const s = (await h.flow.state()).queuePrep;
  assert.deepEqual(s.lastRun, { date: "2026-10-29", at: s.lastRun.at, commandId: "cmd-1", ok: true });
  assert.equal(s.next, "2026-10-30T13:30:00.000Z", "next: tomorrow at the time");
  assert.equal(kinds(h.store).filter((k) => k === "queue-prep-run").length, 1);
  // the next Eastern day: one more
  h.set("2026-10-30T13:31:00.000Z");
  await h.flow.prepDue(); await h.flow.prepDue();
  assert.equal(h.calls.length, 2);
  // a second process on the same ledger (the claim is create-only on disk): no third build
  const other = createPublishFlow({ store: createFileStore({ dir: path.join(h.dir, "ledger"), clock: () => "2026-10-30T14:00:00.000Z" }), clock: () => "2026-10-30T14:00:00.000Z", posts: () => [], recheck: () => null, designApproved: () => true, isPaused: () => false, mediaDir: h.dir, refreshData: async () => ({ ok: false }), prepareQueue: async () => { throw new Error("must not run"); } });
  assert.equal((await other.prepDue()).skipped, "already prepared today");
  // turned off: nothing on the next day
  assert.ok(h.flow.setQueuePrep({ enabled: false }, FOUNDER).ok);
  h.set("2026-10-31T15:00:00.000Z");
  assert.equal((await h.flow.prepDue()).skipped, "off");
  assert.equal(h.calls.length, 2);
  assert.equal((await h.flow.state()).queuePrep.timeEt, "09:30", "turning it off keeps the time");
});

test("only the active publisher host prepares; the inactive host does nothing and records nothing", async () => {
  // the hosted copy, with no publisher-host record: the Mac is active
  const hosted = harness({ host: "hosted" });
  hosted.set("2026-10-29T12:00:00.000Z");
  assert.ok(hosted.flow.setQueuePrep({ enabled: true, timeEt: "09:00" }, FOUNDER).ok);
  const before = hosted.store.list().length;
  hosted.set("2026-10-29T14:00:00.000Z");
  for (let i = 0; i < 10; i++) assert.match((await hosted.flow.prepDue()).skipped, /local publisher/);
  assert.equal(hosted.calls.length, 0);
  assert.equal(hosted.store.list().length, before, "no record");
  assert.equal(hosted.store.readClaim("queue-prep|2026-10-29"), null, "no claim");
  const s = (await hosted.flow.state()).queuePrep;
  assert.equal(s.activeHere, false);
  assert.equal(s.next, null);

  // after a hand-off to hosted, the Mac stops and the hosted copy prepares
  const mac = harness();
  mac.set("2026-10-29T12:00:00.000Z");
  assert.ok(mac.flow.setQueuePrep({ enabled: true, timeEt: "09:00" }, FOUNDER).ok);
  mac.store.append("publisher-host", "founder", { host: "hosted", from: "local", generation: 1, by: "founder" });
  hosted.store.append("publisher-host", "founder", { host: "hosted", from: "local", generation: 1, by: "founder" });
  const macBefore = mac.store.list().length;
  mac.set("2026-10-29T14:00:00.000Z");
  await mac.flow.prepDue();
  assert.equal(mac.calls.length, 0);
  assert.equal(mac.store.list().length, macBefore);
  assert.equal((await hosted.flow.prepDue()).ok, true);
  assert.equal(hosted.calls.length, 1);
});

test("paused (Pause Publishing or the global Pause) → nothing; after resume the same day it runs once", async () => {
  const h = harness();
  h.set("2026-10-29T12:00:00.000Z");
  assert.ok(h.flow.setQueuePrep({ enabled: true, timeEt: "09:00" }, FOUNDER).ok);
  assert.ok(h.flow.setPaused(true, FOUNDER).ok);
  h.set("2026-10-29T14:00:00.000Z");
  const before = h.store.list().length;
  assert.equal((await h.flow.prepDue()).skipped, "paused");
  assert.ok(h.flow.setPaused(false, FOUNDER).ok);
  h.pauseAll(true);
  assert.equal((await h.flow.prepDue()).skipped, "paused");
  assert.equal(h.calls.length, 0);
  assert.equal(h.store.list().length, before + 1, "only the resume record");
  h.pauseAll(false);
  await h.flow.prepDue(); await h.flow.prepDue();
  assert.equal(h.calls.length, 1);
});

test("DST: the fall-back night's repeated 01:30 builds once; spring-forward and the day before use the Eastern clock", async () => {
  const h = harness();
  h.set("2026-10-31T12:00:00.000Z");
  assert.ok(h.flow.setQueuePrep({ enabled: true, timeEt: "01:30" }, FOUNDER).ok);
  h.set("2026-11-01T05:29:00.000Z"); // 01:29 EDT
  assert.equal((await h.flow.prepDue()).skipped, "not yet");
  h.set("2026-11-01T05:30:00.000Z"); // first 01:30 (EDT)
  assert.equal((await h.flow.prepDue()).date, "2026-11-01");
  h.set("2026-11-01T06:30:00.000Z"); // the second 01:30 (EST)
  assert.equal((await h.flow.prepDue()).skipped, "already prepared today");
  assert.equal(h.calls.length, 1);
  assert.equal((await h.flow.state()).queuePrep.next, "2026-11-02T06:30:00.000Z", "tomorrow 01:30 EST");

  const s = harness();
  s.set("2026-03-07T12:00:00.000Z");
  assert.ok(s.flow.setQueuePrep({ enabled: true, timeEt: "09:00" }, FOUNDER).ok);
  s.set("2026-03-07T13:59:00.000Z"); // 08:59 EST
  assert.equal((await s.flow.prepDue()).skipped, "not yet");
  s.set("2026-03-07T14:00:00.000Z"); // 09:00 EST
  assert.equal((await s.flow.prepDue()).date, "2026-03-07");
  s.set("2026-03-08T12:59:00.000Z"); // 08:59 EDT on the spring-forward day
  assert.equal((await s.flow.prepDue()).skipped, "not yet");
  assert.equal((await s.flow.state()).queuePrep.next, "2026-03-08T13:00:00.000Z");
  s.set("2026-03-08T13:00:00.000Z"); // 09:00 EDT
  assert.equal((await s.flow.prepDue()).date, "2026-03-08");
  assert.equal(s.calls.length, 2);

  // a time inside the skipped hour still runs that day, at the first tick after the jump
  const g = harness();
  g.set("2026-03-08T06:00:00.000Z"); // 01:00 EST
  assert.ok(g.flow.setQueuePrep({ enabled: true, timeEt: "02:30" }, FOUNDER).ok);
  g.set("2026-03-08T06:59:00.000Z"); // 01:59 EST
  assert.equal((await g.flow.prepDue()).skipped, "not yet");
  g.set("2026-03-08T07:00:30.000Z"); // 03:00 EDT
  assert.equal((await g.flow.prepDue()).date, "2026-03-08");
});

test("a failed or refused build: an alert, recorded as failed, never retried the same day", async () => {
  for (const result of [() => ({ ok: false, code: "NO_DATA", detail: "no data source" }), () => { throw new Error("boom"); }]) {
    const h = harness({ result });
    h.set("2026-10-29T12:00:00.000Z");
    assert.ok(h.flow.setQueuePrep({ enabled: true, timeEt: "09:00" }, FOUNDER).ok);
    h.set("2026-10-29T14:00:00.000Z");
    const r = await h.flow.prepDue();
    assert.equal(r.ok, false);
    for (let i = 0; i < 5; i++) assert.equal((await h.flow.prepDue()).skipped, "already prepared today");
    assert.equal(h.calls.length, 1, "no retry loop");
    const st = await h.flow.state();
    assert.equal(st.queuePrep.lastRun.ok, false);
    const a = st.alerts.find((x) => x.code === "QUEUE_PREP_FAILED");
    assert.ok(a, "an alert the console shows");
    assert.equal(a.source, "queue-prep");
    assert.match(a.detail, /type "Team, prepare today's content queue"/);
    assert.ok(h.flow.acknowledge({ alertId: a.alertId }, FOUNDER).ok, "acknowledged like any alert");
    assert.ok(!(await h.flow.state()).alerts.some((x) => x.code === "QUEUE_PREP_FAILED"));
  }
});

test("the setting: administrators only, validated, append-only", async () => {
  const h = harness();
  for (const actor of [{ role: "publisher", id: "p" }, { role: "approver", id: "a" }, { role: "viewer", id: "v" }, { role: "agent", id: "social-strategy" }, SCHEDULER_ACTOR, null]) {
    assert.equal(h.flow.setQueuePrep({ enabled: true, timeEt: "09:00" }, actor).code, "NOT_FOUNDER", JSON.stringify(actor));
  }
  assert.equal(h.flow.setQueuePrep({ enabled: true }, FOUNDER).code, "INVALID_TIME", "no time on record yet");
  for (const timeEt of ["9:00", "24:00", "09:60", "0900", "09:00 PM", 900]) assert.equal(h.flow.setQueuePrep({ enabled: true, timeEt }, FOUNDER).code, "INVALID_TIME", String(timeEt));
  assert.equal(h.flow.setQueuePrep({ enabled: "yes", timeEt: "09:00" }, FOUNDER).code, "INVALID_REQUEST");
  assert.equal(h.store.list().filter((e) => e.kind === "queue-prep").length, 0, "nothing recorded by a refused change");
  assert.ok(h.flow.setQueuePrep({ enabled: true, timeEt: "09:00" }, { role: "admin", id: "ops-admin" }).ok, "an administrator");
  assert.ok(h.flow.setQueuePrep({ enabled: true, timeEt: "10:15" }, FOUNDER).ok);
  const recs = h.store.list().filter((e) => e.kind === "queue-prep");
  assert.deepEqual(recs.map((e) => [e.data.enabled, e.data.timeEt, e.data.by]), [[true, "09:00", "ops-admin"], [true, "10:15", "founder"]]);
  assert.equal((await h.flow.state()).queuePrep.timeEt, "10:15");
});

test("the system actor may issue exactly the daily-queue command and nothing else", async () => {
  for (const a of [...FOUNDER_ACTIONS, "status", "anything", "draft"]) assert.equal(checkFounder(a, SCHEDULER_ACTOR).ok, false, a);
  assert.equal(checkFounder("prepare-daily-queue", SCHEDULER_ACTOR).ok, true);
  assert.equal(checkFounder("prepare-daily-queue", { role: "system", id: "someone-else" }).ok, true, "by role, so any system actor is held to the same single action");

  const dir = tempDir("gtp-cc-qprep-sys-");
  const clock = () => QUEUE_NOW;
  const store = createFileStore({ dir: path.join(dir, "ledger"), clock });
  const o = createOrchestrator({ store, clock, outDir: dir, slateDate: TEST_SLATE, queueRender: false, queueTemplate: "v1" });
  const before = store.list().length;
  for (const text of ["status", "pause publishing", "resume", "Team, prepare tomorrow's content queue", "Team, prepare the content queue for 2026-11-01", "team, prepare today's content queue", `${DAILY_QUEUE_COMMAND} and publish it`, "Team, prepare GameTimePicks' NFL postgame recap content for last night's games."]) {
    const r = await o.handleCommand(text, SCHEDULER_ACTOR);
    assert.equal(r.ok, false, text);
    assert.equal(r.code, "NOT_FOUNDER", text);
  }
  assert.equal(o.setPaused(true, SCHEDULER_ACTOR).ok, false);
  assert.equal(o.emergencyStop(SCHEDULER_ACTOR).ok, false);
  assert.equal(o.setSeat("social-strategy", "fake", SCHEDULER_ACTOR).ok, false);
  assert.equal((await o.decide({ decisionId: "x", verdict: "approve" }, SCHEDULER_ACTOR)).ok, false);
  assert.equal(o.editCaption({ decisionId: "x", basedOn: "A", text: "t" }, SCHEDULER_ACTOR).ok, false);
  assert.equal(o.approveDesign({ template: "t", assetManifest: "m" }, SCHEDULER_ACTOR).ok, false);
  assert.equal(o.recordPost({ decisionId: "x", action: "publish" }, SCHEDULER_ACTOR).ok, false);
  assert.equal((await o.submitManual("t", "x", SCHEDULER_ACTOR)).ok, false);
  const p = o.publishing;
  assert.equal(p.setPaused(false, SCHEDULER_ACTOR).ok, false);
  assert.equal((await p.setPolicy({ mode: "dry-run" }, SCHEDULER_ACTOR)).ok, false);
  assert.equal(p.setQueuePrep({ enabled: true, timeEt: "09:00" }, SCHEDULER_ACTOR).ok, false);
  assert.equal(p.setPublisherHost({ to: "hosted", confirmation: "x" }, SCHEDULER_ACTOR).ok, false);
  assert.equal(p.schedule({ decisionId: "x" }, SCHEDULER_ACTOR).ok, false);
  assert.equal((await p.publishNow({ decisionId: "x", live: true }, SCHEDULER_ACTOR)).ok, false);
  assert.equal(p.queueNow({ decisionId: "x" }, SCHEDULER_ACTOR).ok, false);
  assert.equal(p.cancel({ jobId: "x" }, SCHEDULER_ACTOR).ok, false);
  assert.equal((await p.reconcile({ jobId: "x", notPosted: true }, SCHEDULER_ACTOR)).ok, false);
  assert.equal(p.acknowledge({ alertId: "x" }, SCHEDULER_ACTOR).ok, false);
  assert.equal(store.list().length, before, "every refusal recorded nothing");
});

test("end to end on pinned data: the scheduler builds the real queue once; a build that refuses raises an alert", { skip: hasPinned ? false : "pinned data commit missing" }, async () => {
  // QUEUE_NOW = 2026-10-28 09:30 EDT
  const dir = tempDir("gtp-cc-qprep-e2e-");
  const clock = () => QUEUE_NOW;
  const store = createFileStore({ dir: path.join(dir, "ledger"), clock });
  seedApprovedCalendar(store);
  const o = createOrchestrator({ store, clock, outDir: dir, queueRender: false, queueTemplate: "v1", calendarDataSource: gitDataSource(REPO_ROOT, QUEUE_PINNED) });
  assert.ok(o.publishing.setQueuePrep({ enabled: true, timeEt: "09:00" }, FOUNDER).ok);
  const r = await o.publishing.prepDue();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.date, "2026-10-28");
  const cmd = store.list().find((e) => e.kind === "command");
  assert.equal(cmd.actor, "scheduler");
  assert.equal(cmd.data.intent, "daily-queue");
  assert.equal(cmd.data.surface, "scheduler");
  assert.ok(o.state().posts.length > 0, "the queue was built");
  assert.equal(o.state().posts.filter((p) => p.resolution).length, 0, "nothing approved");
  assert.equal((await o.publishing.prepDue()).skipped, "already prepared today");
  const again = await o.handleCommand(DAILY_QUEUE_COMMAND, FOUNDER);
  assert.equal(again.duplicate, true, "the founder's same command on the same data is the same queue");
  const st = await o.publishing.state();
  assert.equal(st.queuePrep.lastRun.ok, true);
  assert.equal(st.queuePrep.lastRun.commandId, r.commandId);

  // no approved calendar: the build refuses → alert, no retry
  const dir2 = tempDir("gtp-cc-qprep-e2e2-");
  const store2 = createFileStore({ dir: path.join(dir2, "ledger"), clock });
  const o2 = createOrchestrator({ store: store2, clock, outDir: dir2, queueRender: false, queueTemplate: "v1", calendarDataSource: gitDataSource(REPO_ROOT, QUEUE_PINNED) });
  assert.ok(o2.publishing.setQueuePrep({ enabled: true, timeEt: "09:00" }, FOUNDER).ok);
  const f = await o2.publishing.prepDue();
  assert.equal(f.ok, false);
  assert.equal(f.code, "NO_APPROVED_CALENDAR");
  const st2 = await o2.publishing.state();
  assert.ok(st2.alerts.some((a) => a.code === "QUEUE_PREP_FAILED" && /NO_APPROVED_CALENDAR/.test(a.detail)));
  assert.equal(st2.queuePrep.lastRun.ok, false);
  assert.equal((await o2.publishing.prepDue()).skipped, "already prepared today");
  assert.equal(store2.list().filter((e) => e.kind === "command").length, 1);
});

// ── hosted ──────────────────────────────────────────────────────────────────────────────────────────────────────
const ORIGIN = "https://team.example.test";
const SETUP = "qprep-test-setup-token";
const CRON = "cron-secret-qprep-0123456789";
const stubWebauthn = {
  async generateRegistrationOptions() { return { challenge: crypto.randomBytes(16).toString("base64url") }; },
  async generateAuthenticationOptions() { return { challenge: crypto.randomBytes(16).toString("base64url") }; },
  async verifyRegistrationResponse({ response, expectedChallenge }) {
    if (response.challenge !== expectedChallenge) throw new Error("mismatch");
    return { verified: true, registrationInfo: { credential: { id: response.id, publicKey: new Uint8Array([1]), counter: 0, transports: [] } } };
  },
  async verifyAuthenticationResponse({ response, expectedChallenge, credential }) {
    if (response.challenge !== expectedChallenge || response.counter <= credential.counter) throw new Error("mismatch");
    return { verified: true, authenticationInfo: { newCounter: response.counter } };
  },
};

async function hostedSetup() {
  const db = await pglite();
  await migrate(db);
  let now = "2026-10-28T12:00:00.000Z"; // 08:00 EDT
  const clock = () => now;
  const dispatched = [];
  const published = [];
  const dispatcher = { runner: "test", dispatch: async (job) => (dispatched.push(job), { ok: true, runId: null }), cancel: async () => ({ ok: true }) };
  const publishDispatcher = { runner: "test", dispatch: async (job) => (published.push(job), { ok: true }), cancel: async () => ({ ok: true }) };
  const app = createHostedApp({
    db, clock, origin: ORIGIN, rpID: "team.example.test", setupTokenSha256: sha256(SETUP), dispatcher, objects: sqlObjectStore({ db, clock }),
    outDir: tempDir("gtp-cc-qprep-hosted-"), slateDate: TEST_SLATE, webauthn: stubWebauthn, log: () => {}, cronSecret: CRON, publishDispatcher,
  });
  const counters = new Map();
  function person(credId) {
    const jar = { cookie: null };
    async function call(method, pathname, body, { headers: extra = {} } = {}) {
      const headers = { ...extra };
      if (body !== undefined) headers["content-type"] = "application/json";
      if (method === "POST") { headers.origin = ORIGIN; headers["x-cc-console"] = "1"; }
      if (jar.cookie) headers.cookie = jar.cookie;
      const res = await app.fetch(new Request(`${ORIGIN}${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
      const set = res.headers.get("set-cookie");
      if (set) jar.cookie = set.split(";")[0].endsWith("=") ? null : set.split(";")[0];
      const type = res.headers.get("content-type") ?? "";
      return { status: res.status, body: type.startsWith("application/json") ? await res.json() : await res.text() };
    }
    const sign = (opts) => { counters.set(credId, (counters.get(credId) ?? 0) + 1); return { id: credId, challenge: opts.challenge, counter: counters.get(credId) }; };
    async function register(extra) {
      const o = await call("POST", "/api/auth/register/options", extra);
      return call("POST", "/api/auth/register/verify", { challengeId: o.body.challengeId, response: { id: credId, challenge: o.body.options.challenge }, label: "phone", ...extra });
    }
    async function stepped(pathname, body, action) {
      const o = await call("POST", "/api/auth/stepup/options", { action, payload: body });
      if (o.status !== 200) return o;
      return call("POST", pathname, { ...body, stepUp: { challengeId: o.body.challengeId, response: sign(o.body.options) } });
    }
    return { call, register, stepped };
  }
  const founder = person("cred-founder");
  assert.equal((await founder.register({ setupToken: SETUP })).status, 200);
  async function invite(role, cred) {
    const r = await founder.stepped("/api/users/invite", { role, displayName: role }, "manage-users");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const p = person(cred);
    assert.equal((await p.register({ inviteToken: r.body.link.split("#invite=")[1] })).status, 200);
    return p;
  }
  const cron = () => person("anon").call("GET", "/api/cron/publish", undefined, { headers: { authorization: `Bearer ${CRON}` } });
  const ledger = async () => (await createSqlStore({ db, clock }).open()).list();
  const handOffToHosted = async () => {
    const s = await createSqlStore({ db, clock }).open();
    s.append("publisher-host", "founder", { host: "hosted", from: "local", generation: 1, by: "founder" });
    await s.flush();
  };
  return { app, db, founder, invite, cron, ledger, handOffToHosted, dispatched, published, set: (iso) => { now = iso; } };
}

test("hosted: the setting needs an administrator and a passkey step-up; the console mirror agrees", async () => {
  assert.equal(routePermission("/api/publishing", { action: "queue-prep" }), "administer");
  for (const enabled of [true, false]) assert.equal(stepUpActionFor("/api/publishing", { action: "queue-prep", enabled, timeEt: "09:00" }), "publishing-policy");
  const src = fs.readFileSync(path.join(CC_ROOT, "surfaces/console/webauthn.js"), "utf8");
  const window = {};
  vm.runInNewContext(src, { window, navigator: {}, fetch: () => { throw new Error("no network"); }, atob, btoa, Uint8Array, TextEncoder, TextDecoder });
  for (const body of [{ action: "queue-prep", enabled: true, timeEt: "09:00" }, { action: "queue-prep", enabled: false }]) assert.equal(window.GTPAuth.stepUpActionFor("/api/publishing", body), stepUpActionFor("/api/publishing", body));

  const h = await hostedSetup();
  const body = { action: "queue-prep", enabled: true, timeEt: "09:00" };
  const bare = await h.founder.call("POST", "/api/publishing", body);
  assert.equal(bare.status, 403, "no step-up, no change");
  for (const role of ["publisher", "approver"]) {
    const p = await h.invite(role, `cred-${role}`);
    const r = await p.stepped("/api/publishing", body, "publishing-policy");
    assert.equal(r.status, 403, `${role}: ${JSON.stringify(r.body)}`);
  }
  assert.ok(!(await h.ledger()).some((e) => e.kind === "queue-prep"), "nothing recorded by a refused request");
  const ok = await h.founder.stepped("/api/publishing", body, "publishing-policy");
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.ok, true);
  assert.equal(ok.body.activeHere, false, "hosted is not the active publisher yet");
  const rec = (await h.ledger()).filter((e) => e.kind === "queue-prep");
  assert.equal(rec.length, 1);
  assert.equal(rec[0].data.by, "founder");
  assert.match(rec[0].data.authentication, /step-up/);
  const st = await h.founder.call("GET", "/api/state");
  assert.deepEqual(st.body.publishing.queuePrep, { enabled: true, timeEt: "09:00", activeHere: false, lastRun: null, next: null });
});

test("hosted cron: inactive host prepares nothing and records nothing; once active, one build per ET day", async () => {
  const h = await hostedSetup();
  assert.equal((await h.founder.stepped("/api/publishing", { action: "queue-prep", enabled: true, timeEt: "09:00" }, "publishing-policy")).status, 200);
  h.set("2026-10-28T14:00:00.000Z"); // 10:00 EDT
  const before = (await h.ledger()).length;
  for (let i = 0; i < 3; i++) {
    const r = await h.cron();
    assert.equal(r.status, 200);
    assert.equal(r.body.queuePrep.ran, false);
    assert.match(r.body.queuePrep.skipped, /local publisher/);
  }
  assert.equal((await h.ledger()).length, before, "the inactive host records nothing");
  assert.equal(h.dispatched.length, 0);

  await h.handOffToHosted();
  const first = await h.cron();
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.queuePrep.ran, true, JSON.stringify(first.body));
  assert.equal(first.body.queuePrep.date, "2026-10-28");
  assert.deepEqual(h.dispatched.map((j) => j.type), ["team"], "the build runs as a worker job, dispatched after the ledger commits");
  for (const t of ["2026-10-28T14:10:00.000Z", "2026-10-28T20:00:00.000Z", "2026-10-29T03:50:00.000Z"]) {
    h.set(t);
    const r = await h.cron();
    assert.equal(r.body.queuePrep.ran, false);
  }
  const all = await h.ledger();
  assert.equal(all.filter((e) => e.kind === "queue-prep-run").length, 1);
  assert.equal(h.dispatched.length, 1, "no second build dispatched");
  const cmds = all.filter((e) => e.kind === "command");
  assert.equal(cmds.length, 1);
  assert.equal(cmds[0].actor, "scheduler");
  assert.equal(cmds[0].data.intent, "daily-queue");
  // the next Eastern day, before then after the time
  h.set("2026-10-29T12:50:00.000Z");
  assert.equal((await h.cron()).body.queuePrep.skipped, "not yet");
  h.set("2026-10-29T13:00:00.000Z");
  assert.equal((await h.cron()).body.queuePrep.ran, true);
  assert.equal((await h.ledger()).filter((e) => e.kind === "queue-prep-run").length, 2);
});
