/**
 * P0: the private hosted Command Center with individual accounts. Invite-only (no self-registration), one role per
 * person enforced server-side on every route, step-up only with your own passkey, no privilege escalation, session
 * expiry and disabled accounts, the narrow X OAuth callback (state + PKCE + the starting administrator's session),
 * and the cron endpoint's secret. WebAuthn is a stub verifier (as in hosted-app.test.mjs); the real one runs in
 * hosted-e2e.test.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { pglite } from "../ledger/pg-adapters.mjs";
import { migrate } from "../ledger/sql-store.mjs";
import { sqlObjectStore } from "../ledger/object-store.mjs";
import { createHostedApp, routePermission } from "../hosted/app.mjs";
import { createSqlVault, SECRET } from "../publishers/token-vault.mjs";
import { createXOAuth, createSqlStateStore, X_TOKEN_URL, X_SCOPES } from "../publishers/x-oauth.mjs";
import { can } from "../orchestrator/policy.mjs";
import { sha256 } from "../lib/util.mjs";
import { tempDir, TEST_SLATE } from "./helpers.mjs";

const ORIGIN = "https://team.example.test";
const SETUP = "accounts-test-setup-token";
const CRON = "cron-secret-0123456789abcdef";

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

async function setup() {
  const db = await pglite();
  await migrate(db);
  let now = "2026-10-28T15:00:00.000Z";
  const clock = () => now;
  const xCalls = [];
  const xFetch = async (url, init) => {
    xCalls.push({ url, init });
    if (url === X_TOKEN_URL) return new Response(JSON.stringify({ token_type: "bearer", access_token: "AT-secret-value", refresh_token: "RT-secret-value", expires_in: 7200, scope: X_SCOPES.join(" ") }), { status: 200 });
    return new Response("{}", { status: 404 });
  };
  const vault = createSqlVault({ db, key: crypto.randomBytes(32).toString("base64"), clock });
  await vault.set(SECRET.clientId, "client-abc");
  const oauth = createXOAuth({ vault, states: createSqlStateStore(db), redirectUri: `${ORIGIN}/oauth/x/callback`, clock, fetch: xFetch });
  const dispatched = [];
  const dispatcher = { runner: "test", dispatch: async (job) => (dispatched.push(job), { ok: true, runId: null }), cancel: async () => ({ ok: true }) };
  const app = createHostedApp({
    db, clock, origin: ORIGIN, rpID: "team.example.test", setupTokenSha256: sha256(SETUP), dispatcher, objects: sqlObjectStore({ db, clock }),
    outDir: tempDir("gtp-cc-accounts-"), slateDate: TEST_SLATE, webauthn: stubWebauthn, log: () => {}, oauth, cronSecret: CRON, publishDispatcher: dispatcher,
  });
  const counters = new Map();
  /** One person in a browser: their cookie and their own passkey id. */
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
      return { status: res.status, body: type.startsWith("application/json") ? await res.json() : await res.text(), headers: res.headers };
    }
    const sign = (opts, id = credId) => { counters.set(id, (counters.get(id) ?? 0) + 1); return { id, challenge: opts.challenge, counter: counters.get(id) }; };
    async function register(extra) {
      const o = await call("POST", "/api/auth/register/options", extra);
      if (o.status !== 200) return o;
      return call("POST", "/api/auth/register/verify", { challengeId: o.body.challengeId, response: { id: credId, challenge: o.body.options.challenge }, label: "phone", ...extra });
    }
    async function login() {
      const o = await call("POST", "/api/auth/login/options", {});
      return call("POST", "/api/auth/login/verify", { challengeId: o.body.challengeId, response: sign(o.body.options) });
    }
    async function stepped(pathname, body, action, asCred = credId) {
      const o = await call("POST", "/api/auth/stepup/options", { action, payload: body });
      if (o.status !== 200) return o;
      return call("POST", pathname, { ...body, stepUp: { challengeId: o.body.challengeId, response: sign(o.body.options, asCred) } });
    }
    return { jar, call, register, login, stepped, credId };
  }
  const founder = person("cred-founder");
  assert.equal((await founder.register({ setupToken: SETUP })).status, 200);
  async function invite(role, name, cred) {
    const r = await founder.stepped("/api/users/invite", { role, displayName: name }, "manage-users");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const token = r.body.link.split("#invite=")[1];
    const p = person(cred);
    const reg = await p.register({ inviteToken: token });
    assert.equal(reg.status, 200, JSON.stringify(reg.body));
    return { ...p, token };
  }
  return { db, app, founder, person, invite, setNow: (v) => { now = v; }, xCalls, dispatched, vault };
}

test("permission model: every role holds exactly its own and the lower permissions; unknown routes need administer", () => {
  const roles = ["viewer", "drafter", "approver", "publisher", "admin"];
  const perms = ["view", "draft", "approve", "publish", "administer"];
  for (const [i, r] of roles.entries()) for (const [j, p] of perms.entries()) assert.equal(can(r, p), j <= i, `${r} ${p}`);
  assert.equal(can("intruder", "view"), false);
  assert.equal(can(undefined, "view"), false);
  assert.equal(routePermission("/api/reset"), "administer");
  assert.equal(routePermission("/api/publishing", { action: "made-up" }), "administer");
  assert.equal(routePermission("/api/pause", { paused: true }), "approve");
  assert.equal(routePermission("/api/pause", { paused: false }), "publish");
});

test("invite-only: no self-registration, single-use invites, the invite's role and nothing more", async () => {
  const h = await setup();
  const stranger = h.person("cred-stranger");
  assert.equal((await stranger.register({})).status, 401, "no session, no invite: refused");
  assert.equal((await stranger.register({ setupToken: SETUP })).status, 401, "the setup token is dead once a passkey exists");
  assert.equal((await stranger.register({ inviteToken: "x".repeat(43) })).status, 401, "a made-up invite");
  assert.equal((await stranger.call("POST", "/api/auth/invite/info", { inviteToken: "x".repeat(43) })).status, 404);

  assert.equal((await h.founder.call("POST", "/api/users/invite", { role: "viewer", displayName: "Viv" })).status, 403, "an invite needs a step-up");
  const viv = await h.invite("viewer", "Viv", "cred-viv");
  const again = h.person("cred-copycat");
  assert.equal((await again.register({ inviteToken: viv.token })).body.code, "INVITE_INVALID", "an invite works once");

  const st = await viv.call("GET", "/api/state");
  assert.equal(st.status, 200);
  assert.deepEqual(st.body.me, { id: st.body.me.id, displayName: "Viv", role: "viewer" });
  for (const [path, body] of [["/api/command", { text: "Team, status" }], ["/api/decide", { decisionId: "x", verdict: "reject" }], ["/api/pause", { paused: true }], ["/api/publishing", { action: "pause" }], ["/api/users/list", {}], ["/api/seat", { role: "x", seat: "fake" }]]) {
    const r = await viv.call("POST", path, body);
    assert.equal(r.status, 403, `viewer ${path}`);
  }
  // an invite for an unknown role, or without a name, is refused
  assert.equal((await h.founder.stepped("/api/users/invite", { role: "owner", displayName: "X" }, "manage-users")).body.code, "INVALID_ROLE");
  // an expired invite
  const r = await h.founder.stepped("/api/users/invite", { role: "drafter", displayName: "Late" }, "manage-users");
  h.setNow("2026-10-31T16:00:00.000Z");
  assert.equal((await h.person("cred-late").register({ inviteToken: r.body.link.split("#invite=")[1] })).body.code, "INVITE_INVALID", "expired after 72 h");
});

test("no privilege escalation: roles are enforced server-side, step-up only with your own passkey, last admin kept", async () => {
  const h = await setup();
  const ann = await h.invite("approver", "Ann", "cred-ann");
  assert.equal((await ann.call("POST", "/api/pause", { paused: true })).status, 200, "an approver can pause");
  assert.equal((await ann.stepped("/api/pause", { paused: false }, "resume")).status, 403, "but not resume (publish)");
  assert.equal((await ann.stepped("/api/publishing", { action: "policy", mode: "live", capUsd: 5, authorization: "x" }, "publishing-policy")).status, 403);
  assert.equal((await ann.stepped("/api/users/update", { userId: (await ann.call("GET", "/api/state")).body.me.id, role: "admin" }, "manage-users")).status, 403, "can't promote herself");
  assert.equal((await ann.call("POST", "/api/users/list", {})).status, 403);
  // a step-up made with someone else's credential id is refused
  const forged = await ann.stepped("/api/design", { template: "t", assetManifest: "a" }, "approve", "cred-founder");
  assert.equal(forged.status, 403);
  // a cookie is not enough for an approval-class action
  assert.equal((await ann.call("POST", "/api/design", { template: "t", assetManifest: "a" })).status, 403);

  const annId = (await ann.call("GET", "/api/state")).body.me.id;
  assert.equal((await h.founder.stepped("/api/users/update", { userId: annId, role: "publisher" }, "manage-users")).status, 200);
  assert.equal((await ann.stepped("/api/pause", { paused: false }, "resume")).status, 200, "the new role applies to her existing session");
  assert.equal((await h.founder.stepped("/api/users/update", { userId: "founder", role: "viewer" }, "manage-users")).body.code, "LAST_ADMIN");
  assert.equal((await h.founder.stepped("/api/users/update", { userId: "founder", status: "disabled" }, "manage-users")).body.code, "LAST_ADMIN");

  // disabling ends her sessions at once, and she can't sign back in
  const dis = await h.founder.stepped("/api/users/update", { userId: annId, status: "disabled" }, "manage-users");
  assert.equal(dis.status, 200);
  assert.deepEqual(dis.body.withdrawnJobs, [], "her queued publishing jobs (none here) are withdrawn with the account");
  assert.equal((await ann.call("GET", "/api/state")).status, 401);
  assert.equal((await ann.login()).body.code, "ACCOUNT_DISABLED");
  // the audit trail names who did what, without secrets
  const audit = (await h.founder.call("GET", "/api/state")).body.history.filter((x) => x.kind === "auth").map((x) => x.line).join("\n");
  assert.match(audit, /invite-created|account-updated/);
  assert.doesNotMatch(audit, /#invite=|cred-/);
});

test("sessions expire: 12 h idle and 7 days absolute; nothing internal is readable without one", async () => {
  const h = await setup();
  const anon = h.person("cred-anon");
  for (const p of ["/api/state", "/media/x.png", "/runs/x.jsonl"]) assert.equal((await anon.call("GET", p)).status, 401, p);
  assert.equal((await anon.call("POST", "/api/decide", {})).status, 401);
  assert.equal((await anon.call("POST", "/api/publishing", { action: "live-test" })).status, 401);
  assert.equal((await h.founder.call("GET", "/api/state")).status, 200);
  h.setNow("2026-10-29T03:30:00.000Z"); // 12.5 h idle
  assert.equal((await h.founder.call("GET", "/api/state")).status, 401);
  assert.equal((await h.founder.login()).status, 200);
  // active every 11 hours (never 12 h idle) for a week: still signed in at 165 h, out at 7 days + 1 minute
  const t0 = Date.parse("2026-10-29T03:30:00.000Z");
  for (let hrs = 11; hrs <= 165; hrs += 11) {
    h.setNow(new Date(t0 + hrs * 3600_000).toISOString());
    assert.equal((await h.founder.call("GET", "/api/state")).status, 200, `active at ${hrs} h`);
  }
  h.setNow(new Date(t0 + 7 * 24 * 3600_000 + 60_000).toISOString()); // 3 h after the last request: not idle
  assert.equal((await h.founder.call("GET", "/api/state")).status, 401, "absolute expiry even when active");
});

test("X OAuth callback: narrow, unauthenticated only for state validation; the exchange needs the starting admin's session", async () => {
  const h = await setup();
  const viv = await h.invite("viewer", "Viv", "cred-viv");
  const ada = await h.invite("admin", "Ada", "cred-ada");
  assert.equal((await viv.call("POST", "/api/publishing", { action: "x-connect" })).status, 403);
  assert.equal((await h.founder.call("POST", "/api/publishing", { action: "x-connect" })).status, 403, "connecting X needs a step-up");
  const start = await h.founder.stepped("/api/publishing", { action: "x-connect" }, "connect-x");
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const url = new URL(start.body.authorizeUrl);
  assert.equal(url.searchParams.get("redirect_uri"), `${ORIGIN}/oauth/x/callback`);
  const state = url.searchParams.get("state");
  const anon = h.person("cred-anon");

  assert.equal((await anon.call("GET", `/oauth/x/callback?state=${"z".repeat(43)}&code=abcdefghijkl`)).status, 400, "unknown state");
  const cb = await anon.call("GET", `/oauth/x/callback?state=${state}&code=good-code-123456`);
  assert.equal(cb.status, 200);
  assert.match(cb.body, /http-equiv="refresh" content="0;url=\/oauth\/x\/finish\?state=/);
  assert.doesNotMatch(cb.body, /good-code/, "the code is never echoed");
  assert.equal((await anon.call("GET", `/oauth/x/callback?state=${state}&code=other-code-123456`)).status, 400, "a second code is refused");
  assert.equal((await anon.call("GET", `/oauth/x/finish?state=${state}`)).status, 401, "no session: nothing");
  assert.equal((await viv.call("GET", `/oauth/x/finish?state=${state}`)).status, 403, "not an administrator");
  assert.equal(h.xCalls.length, 0, "no exchange yet");
  const other = await ada.call("GET", `/oauth/x/finish?state=${state}`);
  assert.equal(other.status, 400, "another administrator's session can't finish it");
  assert.match(other.body, /BINDING_MISMATCH/);
  // that attempt consumed the state: start again, finish in the right session
  const s2 = await h.founder.stepped("/api/publishing", { action: "x-connect" }, "connect-x");
  const st2 = new URL(s2.body.authorizeUrl).searchParams.get("state");
  await anon.call("GET", `/oauth/x/callback?state=${st2}&code=good-code-654321`);
  const done = await h.founder.call("GET", `/oauth/x/finish?state=${st2}`);
  assert.equal(done.status, 200, done.body);
  assert.equal(h.xCalls.length, 1);
  assert.equal((await h.founder.call("GET", `/oauth/x/finish?state=${st2}`)).status, 400, "single use");
  const rows = await h.db.query("SELECT ciphertext FROM cc_secrets WHERE name = $1", [SECRET.tokens]);
  assert.doesNotMatch(rows.rows[0].ciphertext, /AT-secret|RT-secret/, "tokens are encrypted at rest");
  const pub = (await h.founder.call("GET", "/api/state")).body.publishing;
  assert.equal(pub.x.connected, true);
  assert.doesNotMatch(JSON.stringify(pub), /AT-secret|RT-secret/, "never sent to the browser");
});

test("cron: secret required; dispatches the publisher only when a job is due", async () => {
  const h = await setup();
  const anon = h.person("x");
  assert.equal((await anon.call("GET", "/api/cron/publish")).status, 404);
  assert.equal((await anon.call("GET", "/api/cron/publish", undefined, { headers: { authorization: "Bearer wrong" } })).status, 404);
  const r = await anon.call("GET", "/api/cron/publish", undefined, { headers: { authorization: `Bearer ${CRON}` } });
  assert.equal(r.status, 200);
  assert.equal(r.body.due, 0);
  assert.equal(h.dispatched.length, 0);
});
