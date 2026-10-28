/**
 * H0: the hosted web handler end to end at the HTTP level — headers, CSRF and origin checks, passkey gating,
 * step-up on approvals, jobs dispatched to a (stubbed) GitHub Actions API only after the ledger commits, and
 * Pause / Emergency stop cancelling those runs. WebAuthn is the stub verifier from auth.test.mjs; the real one runs
 * in hosted-e2e.test.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { pglite } from "../ledger/pg-adapters.mjs";
import { migrate } from "../ledger/sql-store.mjs";
import { dirObjectStore, sqlObjectStore } from "../ledger/object-store.mjs";
import { githubDispatcher } from "../jobs/dispatchers.mjs";
import { runWorkerJob } from "../worker/worker.mjs";
import { createHostedApp } from "../hosted/app.mjs";
import { sha256, stepClock } from "../lib/util.mjs";
import { tempDir, TEST_SLATE, RECAP_COMMAND } from "./helpers.mjs";

const ORIGIN = "https://team.example.test";
const SETUP = "hosted-test-setup-token";

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

/** A fake GitHub REST API: records calls, answers dispatch with a run id. */
function fakeGitHub() {
  const calls = [];
  let nextRun = 9000;
  const f = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method: init.method, body, auth: init.headers.Authorization });
    if (url.endsWith("/dispatches")) return new Response(JSON.stringify({ workflow_run_id: ++nextRun, run_url: "x", html_url: "y" }), { status: 200 });
    if (/\/runs\/\d+\/(force-)?cancel$/.test(url)) return new Response(null, { status: 202 });
    return new Response("{}", { status: 404 });
  };
  return { calls, fetch: f };
}

async function setup({ objectsKind = "sql" } = {}) {
  const db = await pglite();
  await migrate(db);
  const clock = stepClock("2026-10-27T15:00:00.000Z");
  const gh = fakeGitHub();
  const dispatcher = githubDispatcher({ token: "test-pat", owner: "founder", repo: "gtp-ops", workflow: "worker.yml", fetch: gh.fetch });
  const outDir = tempDir("gtp-cc-hosted-app-");
  const objects = objectsKind === "sql" ? sqlObjectStore({ db, clock }) : dirObjectStore(path.join(outDir, "objects"));
  const app = createHostedApp({ db, clock, origin: ORIGIN, rpID: "team.example.test", setupTokenSha256: sha256(SETUP), dispatcher, objects, outDir, slateDate: TEST_SLATE, webauthn: stubWebauthn, log: () => {} });
  let counter = 0;
  const jar = { cookie: null };
  async function call(method, pathname, body, { origin = ORIGIN, consoleHeader = true, cookie = jar.cookie } = {}) {
    const headers = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (origin) headers.origin = origin;
    if (consoleHeader) headers["x-cc-console"] = "1";
    if (cookie) headers.cookie = cookie;
    const res = await app.fetch(new Request(`${ORIGIN}${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
    const set = res.headers.get("set-cookie");
    if (set) jar.cookie = set.split(";")[0].endsWith("=") ? null : set.split(";")[0];
    const type = res.headers.get("content-type") ?? "";
    return { status: res.status, headers: res.headers, body: type.startsWith("application/json") ? await res.json() : Buffer.from(await res.arrayBuffer()), setCookie: set };
  }
  const sign = (opts) => ({ id: "cred-1", challenge: opts.challenge, counter: ++counter });
  async function register() {
    const o = await call("POST", "/api/auth/register/options", { setupToken: SETUP });
    return call("POST", "/api/auth/register/verify", { challengeId: o.body.challengeId, response: { id: "cred-1", challenge: o.body.options.challenge }, label: "iPhone", setupToken: SETUP });
  }
  /** POST an action with a step-up assertion bound to exactly this body. */
  async function withStepUp(pathname, body, action) {
    const o = await call("POST", "/api/auth/stepup/options", { action, payload: body });
    assert.equal(o.status, 200, JSON.stringify(o.body));
    return call("POST", pathname, { ...body, stepUp: { challengeId: o.body.challengeId, response: sign(o.body.options) } });
  }
  const work = (jobId, runId) => runWorkerJob({ db, clock, jobId, runId, runnerId: "github-actions", outDir: path.join(outDir, "worker"), objects, slateDate: TEST_SLATE });
  return { db, app, gh, call, register, withStepUp, work, jar };
}

test("security headers on every response; no cookie, no data", async () => {
  const h = await setup();
  const page = await h.call("GET", "/");
  assert.equal(page.status, 200);
  const csp = page.headers.get("content-security-policy");
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(page.headers.get("x-frame-options"), "DENY");
  assert.match(page.headers.get("strict-transport-security"), /max-age=31536000/);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.equal((await h.call("GET", "/api/state")).status, 401);
  assert.equal((await h.call("GET", "/media/anything.png")).status, 401);
  assert.equal((await h.call("POST", "/api/command", { text: "status" })).status, 401);
  const st = await h.call("GET", "/api/auth/status");
  assert.deepEqual(st.body, { hosted: true, authenticated: false, recovery: false, hasPasskey: false });
  assert.equal((await h.call("POST", "/api/reset", {})).status, 401, "no reset endpoint is reachable");
});

test("POSTs need the exact origin, the console header and a JSON body", async () => {
  const h = await setup();
  assert.equal((await h.call("POST", "/api/auth/login/options", {}, { origin: "https://evil.example" })).status, 403);
  assert.equal((await h.call("POST", "/api/auth/login/options", {}, { origin: null })).status, 403);
  assert.equal((await h.call("POST", "/api/auth/login/options", {}, { consoleHeader: false })).status, 403);
  const raw = await h.app.fetch(new Request(`${ORIGIN}/api/auth/login/options`, { method: "POST", headers: { origin: ORIGIN, "x-cc-console": "1", "content-type": "text/plain" }, body: "{}" }));
  assert.equal(raw.status, 415);
});

test("register with the setup token → __Host- session cookie → state; logout ends it", async () => {
  const h = await setup();
  const r = await h.register();
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.recoveryCodes.length, 10);
  assert.match(r.setCookie, /^__Host-gtp_cc=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=604800; Secure$/);
  const st = await h.call("GET", "/api/state");
  assert.equal(st.status, 200);
  assert.equal(st.body.hosted.runner, "github-actions");
  const audits = st.body.history.filter((x) => x.kind === "auth").map((x) => x.line);
  assert.ok(audits.some((l) => /passkey-registered/.test(l)), audits.join("\n"));
  assert.ok(!JSON.stringify(st.body).includes(h.jar.cookie.split("=")[1]), "the session token never appears in state");
  await h.call("POST", "/api/auth/logout", {});
  assert.equal(h.jar.cookie, null);
  assert.equal((await h.call("GET", "/api/state", undefined, { cookie: r.setCookie.split(";")[0] })).status, 401, "the old cookie is dead server-side too");
});

test("recap on the hosted path: dispatch after commit, worker on 'GitHub', media served, approve needs step-up", async () => {
  const h = await setup();
  await h.register();
  const c = await h.call("POST", "/api/command", { text: RECAP_COMMAND });
  assert.equal(c.status, 200);
  const dispatches = h.gh.calls.filter((x) => x.url.endsWith("/dispatches"));
  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].url, "https://api.github.com/repos/founder/gtp-ops/actions/workflows/worker.yml/dispatches");
  assert.deepEqual(Object.keys(dispatches[0].body.inputs), ["job_id"]);
  assert.equal(dispatches[0].body.return_run_details, true);
  assert.equal(dispatches[0].auth, "Bearer test-pat");
  const jobId = dispatches[0].body.inputs.job_id;

  let s = (await h.call("GET", "/api/state")).body;
  assert.ok(s.history.some((x) => x.kind === "job" && /drive dispatched on github-actions/.test(x.line)));

  const w = await h.work(jobId, "9001");
  assert.equal(w.ok, true, JSON.stringify(w));
  assert.ok(w.uploaded.some((k) => k.startsWith("media/")), "the rendered PNG was uploaded");
  s = (await h.call("GET", "/api/state")).body;
  const d = s.decisions[0];
  const media = s.commands[0].deliverables.find((x) => x.kind === "media")?.file ?? w.uploaded.find((k) => k.endsWith(".png")).slice(6);
  const img = await h.call("GET", `/media/${media}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("content-type"), "image/png");
  assert.equal(img.body.subarray(1, 4).toString(), "PNG");

  const approve = { decisionId: d.decisionId, verdict: "approve", captionId: "A", digest: d.options[0].digest };
  const bare = await h.call("POST", "/api/decide", approve);
  assert.equal(bare.status, 403);
  assert.equal(bare.body.code, "STEP_UP_REQUIRED");
  // a step-up for caption A cannot approve caption B
  const o = await h.call("POST", "/api/auth/stepup/options", { action: "approve", payload: approve });
  const swapped = await h.call("POST", "/api/decide", { ...approve, captionId: "B", digest: d.options[1].digest, stepUp: { challengeId: o.body.challengeId, response: { id: "cred-1", challenge: o.body.options.challenge, counter: 1000 } } });
  assert.equal(swapped.body.code, "STEP_UP_MISMATCH");
  const ok = await h.withStepUp("/api/decide", approve, "approve");
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.receipt.state, "PUBLISHED_MOCK");
  s = (await h.call("GET", "/api/state")).body;
  const decision = s.decisions[0].resolution;
  assert.match(decision.authentication, /passkey step-up/);
});

test("Pause needs no step-up and cancels the dispatched run; Resume needs one and re-dispatches; Stop force-cancels", async () => {
  const h = await setup();
  await h.register();
  await h.call("POST", "/api/command", { text: RECAP_COMMAND });
  const first = h.gh.calls.find((x) => x.url.endsWith("/dispatches"));

  const p = await h.call("POST", "/api/pause", { paused: true });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.deepEqual(p.body.cancelled.map((x) => x.ok), [true]);
  assert.ok(h.gh.calls.some((x) => x.url.endsWith("/runs/9001/cancel")), "the queued run was cancelled by its id");
  // the cancelled run never starts work, even if GitHub still launched it
  assert.equal((await h.work(first.body.inputs.job_id, "9001")).code, "JOB_ALREADY_DONE");

  const bare = await h.call("POST", "/api/pause", { paused: false });
  assert.equal(bare.body.code, "STEP_UP_REQUIRED");
  const resumed = await h.withStepUp("/api/pause", { paused: false }, "resume");
  assert.equal(resumed.status, 200);
  const dispatches = h.gh.calls.filter((x) => x.url.endsWith("/dispatches"));
  assert.equal(dispatches.length, 2, "Resume re-requested the cancelled recap drive");
  const second = dispatches[1].body.inputs.job_id;
  assert.notEqual(second, first.body.inputs.job_id);

  const stop = await h.call("POST", "/api/stop", {});
  assert.equal(stop.status, 200);
  assert.ok(h.gh.calls.some((x) => x.url.endsWith("/runs/9002/force-cancel")), "emergency stop force-cancels");
  const s = (await h.call("GET", "/api/state")).body;
  assert.equal(s.paused, true);
  assert.ok(s.history.some((x) => /EMERGENCY STOP/.test(x.line)));
});

test("racing approvals in two requests: one receipt", async () => {
  const h = await setup({ objectsKind: "dir" });
  await h.register();
  await h.call("POST", "/api/command", { text: RECAP_COMMAND });
  const jobId = h.gh.calls.find((x) => x.url.endsWith("/dispatches")).body.inputs.job_id;
  await h.work(jobId, "9001");
  const d = (await h.call("GET", "/api/state")).body.decisions[0];
  const a = { decisionId: d.decisionId, verdict: "approve", captionId: "A", digest: d.options[0].digest };
  const b = { decisionId: d.decisionId, verdict: "approve", captionId: "B", digest: d.options[1].digest };
  const [ra, rb] = await Promise.all([h.withStepUp("/api/decide", a, "approve"), h.withStepUp("/api/decide", b, "approve")]);
  assert.equal(ra.status, 200);
  assert.equal(rb.status, 200);
  const s = (await h.call("GET", "/api/state")).body;
  assert.equal(s.history.filter((x) => x.kind === "publish-receipt").length, 1);
  assert.equal([ra.body, rb.body].filter((x) => x.duplicate).length, 1, "the loser is the idempotent duplicate");
});

test("review fixes: no resume by typed command or non-boolean, objects served with fixed types, failed auth isn't ledgered", async () => {
  const h = await setup();
  await h.register();
  await h.call("POST", "/api/pause", { paused: true });
  const typed = await h.call("POST", "/api/command", { text: "resume" });
  assert.equal(typed.body.code, "USE_RESUME_CONTROL");
  for (const paused of [undefined, 0, "false", null]) {
    assert.equal((await h.call("POST", "/api/pause", { paused })).body.code, "INVALID_REQUEST", `paused=${JSON.stringify(paused)}`);
  }
  assert.equal((await h.call("GET", "/api/state")).body.paused, true, "still paused");

  // a stored object is served with the type of its prefix and a sandbox CSP, whatever its stored type says
  await h.db.query("INSERT INTO stored_objects (key, content_type, bytes, sha256, size, created_at) VALUES ('media/evil.png', 'text/html', $1, 'x', 5, 'now')", [Buffer.from("<b>x")]);
  const evil = await h.call("GET", "/media/evil.png");
  assert.equal(evil.headers.get("content-type"), "image/png");
  assert.equal(evil.headers.get("content-security-policy"), "sandbox; default-src 'none'");
  assert.equal(evil.headers.get("x-content-type-options"), "nosniff");

  // refused unauthenticated attempts leave nothing in the permanent ledger
  const before = (await h.db.query("SELECT count(*)::int AS n FROM ledger_entries")).rows[0].n;
  for (let i = 0; i < 5; i++) {
    await h.call("POST", "/api/auth/recover", { code: "nope" }, { cookie: null });
    await h.call("POST", "/api/auth/register/options", { setupToken: "nope" }, { cookie: null });
    const o = await h.call("POST", "/api/auth/login/options", {}, { cookie: null });
    await h.call("POST", "/api/auth/login/verify", { challengeId: o.body.challengeId, response: { id: "cred-1", challenge: "wrong", counter: 1 } }, { cookie: null });
  }
  assert.equal((await h.db.query("SELECT count(*)::int AS n FROM ledger_entries")).rows[0].n, before);
});

test("sign out everywhere ends every session", async () => {
  const h = await setup();
  const r = await h.register();
  const first = r.setCookie.split(";")[0];
  const out = await h.call("POST", "/api/auth/logout-all", {});
  assert.equal(out.status, 200);
  assert.equal((await h.call("GET", "/api/state", undefined, { cookie: first })).status, 401);
});
