/**
 * H0 auth policy, on PGlite, with a stub WebAuthn verifier (the real one is exercised end to end in
 * hosted-e2e.test.mjs with a Chromium virtual authenticator). The stub accepts a "response" only if it answers the
 * exact challenge, from the expected origin, with a counter that moved forward — the properties the policy relies on.
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { pglite } from "../ledger/pg-adapters.mjs";
import { migrate } from "../ledger/sql-store.mjs";
import { createAuth, SESSION_IDLE_MS } from "../auth/auth-service.mjs";
import { sha256 } from "../lib/util.mjs";

const ORIGIN = "https://team.example.test";
const SETUP = "setup-token-for-tests";

const stubWebauthn = {
  async generateRegistrationOptions(o) { return { challenge: crypto.randomBytes(16).toString("base64url"), rp: { id: o.rpID }, exclude: o.excludeCredentials }; },
  async generateAuthenticationOptions(o) { return { challenge: crypto.randomBytes(16).toString("base64url"), rpId: o.rpID, allow: o.allowCredentials }; },
  async verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin }) {
    if (response.challenge !== expectedChallenge || response.origin !== expectedOrigin) throw new Error("mismatch");
    return { verified: true, registrationInfo: { credential: { id: response.id, publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ["internal"] } } };
  },
  async verifyAuthenticationResponse({ response, expectedChallenge, expectedOrigin, credential }) {
    if (response.challenge !== expectedChallenge || response.origin !== expectedOrigin) throw new Error("mismatch");
    if (response.counter <= credential.counter) throw new Error("counter did not advance");
    return { verified: true, authenticationInfo: { newCounter: response.counter } };
  },
};

async function setup() {
  const db = await pglite();
  await migrate(db);
  let now = Date.parse("2026-10-27T12:00:00.000Z");
  const clock = () => new Date(now).toISOString();
  const advance = (ms) => { now += ms; };
  const auth = createAuth({ db, clock, rpID: "team.example.test", origin: ORIGIN, setupTokenSha256: sha256(SETUP), webauthn: stubWebauthn });
  let counter = 0;
  const device = {
    id: "cred-1",
    register: (opts, origin = ORIGIN) => ({ id: device.id, challenge: opts.challenge, origin }),
    sign: (opts, origin = ORIGIN) => ({ id: device.id, challenge: opts.challenge, origin, counter: ++counter }),
  };
  return { db, auth, advance, device };
}

async function registered() {
  const s = await setup();
  const o = await s.auth.registerOptions({ setupToken: SETUP });
  const r = await s.auth.registerVerify({ challengeId: o.challengeId, response: s.device.register(o.options), label: "iPhone", setupToken: SETUP });
  assert.equal(r.ok, true, JSON.stringify(r));
  return { ...s, token: r.session.token, recoveryCodes: r.recoveryCodes };
}

test("first passkey needs the setup token; afterwards the setup token is dead", async () => {
  const s = await setup();
  assert.equal((await s.auth.registerOptions({})).code, "SETUP_TOKEN_REQUIRED");
  assert.equal((await s.auth.registerOptions({ setupToken: "wrong" })).code, "SETUP_TOKEN_REQUIRED");
  const o = await s.auth.registerOptions({ setupToken: SETUP });
  const r = await s.auth.registerVerify({ challengeId: o.challengeId, response: s.device.register(o.options), setupToken: SETUP });
  assert.equal(r.ok, true);
  assert.equal(r.recoveryCodes.length, 10);
  assert.equal((await s.auth.status(r.session.token)).authenticated, true);
  // the token never lands in the database, only its hash
  const rows = (await s.db.query("SELECT token_hash FROM auth_sessions")).rows;
  assert.deepEqual(rows.map((x) => x.token_hash), [sha256(r.session.token)]);
  // with a passkey present the setup token alone opens nothing
  assert.equal((await s.auth.registerOptions({ setupToken: SETUP })).code, "NOT_AUTHENTICATED");
});

test("a challenge is single-use, origin-bound and expires", async () => {
  const s = await registered();
  const o = await s.auth.loginOptions();
  assert.equal((await s.auth.loginVerify({ challengeId: o.challengeId, response: s.device.sign(o.options, "https://evil.example") })).code, "ASSERTION_INVALID");
  // the failed attempt consumed it
  assert.equal((await s.auth.loginVerify({ challengeId: o.challengeId, response: s.device.sign(o.options) })).code, "CHALLENGE_INVALID");
  const o2 = await s.auth.loginOptions();
  s.advance(6 * 60_000);
  assert.equal((await s.auth.loginVerify({ challengeId: o2.challengeId, response: s.device.sign(o2.options) })).code, "CHALLENGE_INVALID");
  const o3 = await s.auth.loginOptions();
  const ok = await s.auth.loginVerify({ challengeId: o3.challengeId, response: s.device.sign(o3.options) });
  assert.equal(ok.ok, true);
});

test("sessions expire when idle and at the absolute limit, and logout revokes", async () => {
  const s = await registered();
  s.advance(SESSION_IDLE_MS - 60_000);
  assert.ok(await s.auth.session(s.token), "still inside idle window");
  s.advance(SESSION_IDLE_MS - 60_000);
  assert.ok(await s.auth.session(s.token), "touching it extended the idle window");
  s.advance(SESSION_IDLE_MS + 1);
  assert.equal(await s.auth.session(s.token), null, "idle expired");

  const o = await s.auth.loginOptions();
  const t = (await s.auth.loginVerify({ challengeId: o.challengeId, response: s.device.sign(o.options) })).session.token;
  for (let i = 0; i < 15; i++) { s.advance(11 * 3600_000); assert.ok(await s.auth.session(t), `kept alive at ${11 * (i + 1)} h`); }
  s.advance(4 * 3600_000); // 169 h: well inside the idle window, past the 168 h absolute limit
  assert.equal(await s.auth.session(t), null, "absolute 7-day limit");

  const o2 = await s.auth.loginOptions();
  const t2 = (await s.auth.loginVerify({ challengeId: o2.challengeId, response: s.device.sign(o2.options) })).session.token;
  await s.auth.logout(t2);
  assert.equal(await s.auth.session(t2), null);
});

test("step-up is bound to the session, the action and the exact payload, and is single-use", async () => {
  const s = await registered();
  const payload = { decisionId: "d1", verdict: "approve", digest: "abc" };
  const o = await s.auth.stepUpOptions({ sessionToken: s.token, action: "approve", payload });
  assert.equal(o.ok, true);
  const stepUp = { challengeId: o.challengeId, response: s.device.sign(o.options) };

  assert.equal((await s.auth.verifyStepUp({ sessionToken: s.token, action: "approve", payload: { ...payload, digest: "other" }, stepUp })).code, "STEP_UP_MISMATCH", "different payload");
  const o2 = await s.auth.stepUpOptions({ sessionToken: s.token, action: "approve", payload });
  const su2 = { challengeId: o2.challengeId, response: s.device.sign(o2.options) };
  assert.equal((await s.auth.verifyStepUp({ sessionToken: s.token, action: "keep", payload, stepUp: su2 })).code, "STEP_UP_MISMATCH", "different action");

  // another session (a stolen cookie elsewhere) cannot use this session's challenge
  const lo = await s.auth.loginOptions();
  const other = (await s.auth.loginVerify({ challengeId: lo.challengeId, response: s.device.sign(lo.options) })).session.token;
  const o3 = await s.auth.stepUpOptions({ sessionToken: s.token, action: "approve", payload });
  const su3 = { challengeId: o3.challengeId, response: s.device.sign(o3.options) };
  assert.equal((await s.auth.verifyStepUp({ sessionToken: other, action: "approve", payload, stepUp: su3 })).code, "STEP_UP_MISMATCH");

  const o4 = await s.auth.stepUpOptions({ sessionToken: s.token, action: "approve", payload });
  const su4 = { challengeId: o4.challengeId, response: s.device.sign(o4.options) };
  assert.equal((await s.auth.verifyStepUp({ sessionToken: s.token, action: "approve", payload, stepUp: su4 })).ok, true);
  assert.equal((await s.auth.verifyStepUp({ sessionToken: s.token, action: "approve", payload, stepUp: su4 })).code, "STEP_UP_MISMATCH", "replay");
  assert.equal((await s.auth.verifyStepUp({ sessionToken: s.token, action: "approve", payload })).code, "STEP_UP_REQUIRED");
  assert.equal((await s.auth.stepUpOptions({ sessionToken: s.token, action: "pause", payload: {} })).code, "NO_STEP_UP_FOR_ACTION", "pause never needs step-up");
});

test("a recovery code works once, revokes every session, and only allows registering a new passkey", async () => {
  const s = await registered();
  assert.equal((await s.auth.recover("nope")).code, "RECOVERY_CODE_INVALID");
  const code = s.recoveryCodes[3];
  const r = await s.auth.recover(code.toUpperCase());
  assert.equal(r.ok, true);
  assert.equal(r.remaining, 9);
  assert.equal(await s.auth.session(s.token), null, "old session revoked");
  const st = await s.auth.status(r.session.token);
  assert.equal(st.authenticated, false, "a recovery session is not a full session");
  assert.equal(st.recovery, true);
  assert.equal((await s.auth.stepUpOptions({ sessionToken: r.session.token, action: "approve", payload: {} })).code, "NOT_AUTHENTICATED");
  assert.equal((await s.auth.recover(code)).code, "RECOVERY_CODE_INVALID", "single use");

  // register a replacement passkey with the recovery session (no step-up possible: the old device is lost)
  s.device.id = "cred-2";
  const o = await s.auth.registerOptions({ sessionToken: r.session.token });
  const reg = await s.auth.registerVerify({ challengeId: o.challengeId, response: s.device.register(o.options), label: "new phone", sessionToken: r.session.token });
  assert.equal(reg.ok, true);
  assert.equal(reg.recoveryCodes, null);
  assert.equal(await s.auth.session(r.session.token), null, "the recovery session ends with the new passkey");
  assert.equal((await s.auth.status(reg.session.token)).authenticated, true);
});

test("adding a backup passkey from a full session needs a step-up", async () => {
  const s = await registered();
  const o = await s.auth.registerOptions({ sessionToken: s.token });
  s.device.id = "cred-backup";
  const resp = s.device.register(o.options);
  assert.equal((await s.auth.registerVerify({ challengeId: o.challengeId, response: resp, label: "Mac", sessionToken: s.token })).code, "STEP_UP_REQUIRED");
  s.device.id = "cred-1";
  const su = await s.auth.stepUpOptions({ sessionToken: s.token, action: "register-passkey", payload: { label: "Mac" } });
  const stepUp = { challengeId: su.challengeId, response: s.device.sign(su.options) };
  s.device.id = "cred-backup";
  const r = await s.auth.registerVerify({ challengeId: o.challengeId, response: resp, label: "Mac", sessionToken: s.token, stepUp });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal((await s.auth.passkeys()).length, 2);
});

test("audit records never carry secrets", async () => {
  const s = await setup();
  const o = await s.auth.registerOptions({ setupToken: SETUP });
  const r = await s.auth.registerVerify({ challengeId: o.challengeId, response: s.device.register(o.options), setupToken: SETUP });
  const text = JSON.stringify(r.audit);
  assert.ok(!text.includes(r.session.token));
  assert.ok(!text.includes(SETUP));
  for (const c of r.recoveryCodes) assert.ok(!text.includes(c));
});

test("review fixes: challenge spam evicts instead of locking out; recovery limits are per client; a code can't be used twice", async () => {
  const s = await registered();
  for (let i = 0; i < 250; i++) await s.auth.loginOptions();
  const n = (await s.db.query("SELECT count(*)::int AS n FROM auth_challenges WHERE purpose = 'login'")).rows[0].n;
  assert.ok(n <= 200, `bounded (${n})`);
  const o = await s.auth.loginOptions();
  assert.equal((await s.auth.loginVerify({ challengeId: o.challengeId, response: s.device.sign(o.options) })).ok, true, "the founder still signs in");

  for (let i = 0; i < 10; i++) await s.auth.recover("bad", "attacker-ip");
  assert.equal((await s.auth.recover("bad", "attacker-ip")).code, "RATE_LIMITED");
  const code = s.recoveryCodes[0];
  const [a, b] = await Promise.all([s.auth.recover(code, "founder-ip"), s.auth.recover(code, "founder-ip")]);
  assert.equal([a, b].filter((x) => x.ok).length, 1, "one code, one session");
});

test("review fixes: a malformed setup hash fails closed instead of crashing; recovery sessions last 15 minutes", async () => {
  const db = await pglite();
  await migrate(db);
  const clock = () => "2026-10-27T12:00:00.000Z";
  const upper = createAuth({ db, clock, rpID: "x", origin: ORIGIN, setupTokenSha256: ` ${sha256(SETUP).toUpperCase()}\n`, webauthn: stubWebauthn });
  assert.equal((await upper.registerOptions({ setupToken: SETUP })).ok, true, "case and whitespace are normalised");
  const junk = createAuth({ db, clock, rpID: "x", origin: ORIGIN, setupTokenSha256: "not-a-hash", webauthn: stubWebauthn });
  assert.equal((await junk.registerOptions({ setupToken: SETUP })).code, "SETUP_TOKEN_REQUIRED");

  const s = await registered();
  const r = await s.auth.recover(s.recoveryCodes[1], "me");
  assert.equal(r.session.maxAgeSec, 900);
  s.advance(16 * 60_000);
  assert.equal(await s.auth.session(r.session.token), null);
});

test("the founder can replace recovery codes with a fresh step-up: old unused codes die, passkeys and sessions stay", async () => {
  const s = await registered();
  const spent = s.recoveryCodes[0];
  const used = await s.auth.recover(spent); // one old code already used: stays used
  assert.equal(used.ok, true);
  const o = await s.auth.registerOptions({ sessionToken: used.session.token });
  s.device.id = "cred-2";
  const reg = await s.auth.registerVerify({ challengeId: o.challengeId, response: s.device.register(o.options), label: "iPhone", sessionToken: used.session.token });
  const token = reg.session.token;
  const other = (await s.auth.loginVerify(await (async () => { const lo = await s.auth.loginOptions(); return { challengeId: lo.challengeId, response: s.device.sign(lo.options) }; })())).session.token;

  assert.equal((await s.auth.rotateRecoveryCodes({ sessionToken: token })).code, "STEP_UP_REQUIRED", "a stolen cookie can't mint codes");
  assert.equal((await s.auth.rotateRecoveryCodes({ sessionToken: "nope" })).code, "NOT_AUTHENTICATED");
  const wrong = await s.auth.stepUpOptions({ sessionToken: token, action: "approve", payload: {} });
  assert.equal((await s.auth.rotateRecoveryCodes({ sessionToken: token, stepUp: { challengeId: wrong.challengeId, response: s.device.sign(wrong.options) } })).code, "STEP_UP_MISMATCH", "an approval step-up can't be reused");

  const su = await s.auth.stepUpOptions({ sessionToken: token, action: "recovery-codes", payload: {} });
  const r = await s.auth.rotateRecoveryCodes({ sessionToken: token, stepUp: { challengeId: su.challengeId, response: s.device.sign(su.options) } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.recoveryCodes.length, 10);
  assert.equal(new Set(r.recoveryCodes).size, 10);
  assert.ok(r.recoveryCodes.every((c) => !s.recoveryCodes.includes(c)));
  assert.match(r.audit.detail, /10 new codes; 9 unused old code\(s\) stopped working/);
  assert.ok(!JSON.stringify(r.audit).includes(r.recoveryCodes[0]), "the audit record never carries a code");
  assert.equal((await s.auth.passkeys()).length, 2, "passkeys kept");
  assert.ok(await s.auth.session(token), "this session kept");
  assert.ok(await s.auth.session(other), "other sessions kept");
  const stored = (await s.db.query("SELECT code_hash FROM auth_recovery_codes WHERE used_at IS NULL")).rows;
  assert.equal(stored.length, 10);
  assert.ok(stored.every((x) => !r.recoveryCodes.some((c) => x.code_hash.includes(c))), "stored as hashes only");

  for (const old of s.recoveryCodes.slice(1)) assert.equal((await s.auth.recover(old)).code, "RECOVERY_CODE_INVALID", "old codes stopped working");
  const fresh = await s.auth.recover(r.recoveryCodes[4]);
  assert.equal(fresh.ok, true, "a new code works");
  assert.equal(fresh.remaining, 9);
});

test("only the founder account replaces recovery codes", async () => {
  const s = await registered();
  await s.db.query("INSERT INTO auth_users (id, display_name, role, created_at) VALUES ('u2', 'Second admin', 'admin', '2026-10-27T12:00:00.000Z')");
  await s.db.query("UPDATE auth_sessions SET user_id = 'u2' WHERE token_hash = $1", [sha256(s.token)]);
  assert.equal((await s.auth.rotateRecoveryCodes({ sessionToken: s.token })).code, "FORBIDDEN");
});
