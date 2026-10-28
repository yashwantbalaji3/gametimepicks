/**
 * AUTHENTICATION — individual passkey accounts: the founder (administrator) and collaborators an administrator invites.
 *
 *   Accounts        one row per person (auth_users) with ONE role: viewer < drafter < approver < publisher < admin
 *                   (orchestrator/policy.mjs). No self-registration: the founder's account comes from the setup
 *                   token; every other account only from an administrator's single-use, expiring invite.
 *                   Passkeys (Face ID / Touch ID / a security key, user verification REQUIRED) are the only
 *                   credential: phishing-resistant, nothing to store but a public key — no passwords at all.
 *   First passkey   needs the one-time SETUP TOKEN (its sha256 is a deployment secret; the token itself is shown to
 *                   the founder once at CP-H1 and never stored). After a passkey exists the setup token is dead.
 *   Invites         an administrator creates one (step-up) for a name and role; the link carries a 256-bit token,
 *                   only its sha256 is stored, it expires (72 h) and works once. Registering through it creates the
 *                   account and its first passkey in one transaction.
 *   More passkeys   need a fresh step-up from an existing passkey, or a recovery session.
 *   Login           WebAuthn assertion with user verification REQUIRED (Face ID / Touch ID), counter checked.
 *   Sessions        random 256-bit token in a __Host- cookie; only sha256(token) is stored. 12 h idle,
 *                   7 d absolute, revocable; "recovery" sessions may only register a new passkey.
 *   Step-up         every approval-class action carries its own WebAuthn assertion whose challenge was issued for
 *                   (this session, this action, sha256 of this exact payload) and is single-use for 5 minutes.
 *                   A stolen cookie therefore cannot approve, keep, resume, attest or change seats.
 *   Recovery codes  10 single-use codes, shown once at first registration, stored as scrypt hashes. Using one
 *                   revokes every session and opens a recovery session.
 *
 * Every event is returned as an audit record ({ event, detail }) for the caller to write to the ledger; no secret,
 * token, code or key material ever goes into those records.
 *
 * `webauthn` is injectable so the policy logic is unit-testable; production uses @simplewebauthn/server.
 */
import crypto from "node:crypto";
import * as simple from "@simplewebauthn/server";
import { canonicalJson, sha256 } from "../lib/util.mjs";

export const SESSION_IDLE_MS = 12 * 3600_000;
export const SESSION_ABSOLUTE_MS = 7 * 24 * 3600_000;
export const CHALLENGE_TTL_MS = 5 * 60_000;
export const RECOVERY_CODE_COUNT = 10;
/** Outstanding challenges kept per purpose; beyond this the oldest are evicted (never a lockout). */
export const MAX_OPEN_CHALLENGES = 200;
/**
 * Failed recovery attempts per client per rolling hour. There is deliberately no global cap: codes are 80-bit, so
 * guessing is hopeless anyway, and a global cap would let anyone rotating addresses lock the founder out.
 */
export const MAX_RECOVERY_FAILURES_PER_CLIENT_HOUR = 10;
export const RECOVERY_SESSION_MS = 15 * 60_000;
/** Actions that need a fresh passkey assertion bound to their exact payload. Pause and Stop deliberately don't. */
export const STEP_UP_ACTIONS = Object.freeze(["approve", "keep", "resume", "attest", "seat", "register-passkey", "publish-live", "publishing-policy", "manage-users", "connect-x"]);
export const ROLES = Object.freeze(["viewer", "drafter", "approver", "publisher", "admin"]);
export const INVITE_TTL_MS = 72 * 3600_000;

/** WebAuthn user handle: the founder keeps H0's; everyone else gets their own. */
const userHandle = (userId) => new TextEncoder().encode(userId === "founder" ? "gtp-founder" : `gtp-user-${userId}`);
const inviteUserId = (tokenHash) => `u-${tokenHash.slice(0, 16)}`;
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const fromB64u = (s) => new Uint8Array(Buffer.from(s, "base64url"));
const randomToken = () => crypto.randomBytes(32).toString("base64url");
const later = (iso, ms) => new Date(Date.parse(iso) + ms).toISOString();
const expired = (iso, now) => Date.parse(iso) <= Date.parse(now);

export function payloadDigest(payload) {
  return sha256(canonicalJson(payload ?? null));
}

function hashCode(code, salt = crypto.randomBytes(16).toString("hex")) {
  const h = crypto.scryptSync(String(code).replace(/[\s-]/g, "").toLowerCase(), salt, 32).toString("hex");
  return `${salt}$${h}`;
}
function codeMatches(code, stored) {
  const [salt, h] = stored.split("$");
  const candidate = hashCode(code, salt).split("$")[1];
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(h, "hex"));
}
const newRecoveryCode = () => crypto.randomBytes(10).toString("hex").replace(/(.{5})(?=.)/g, "$1-");

/**
 * @param {{ db: object, clock: () => string, rpID: string, rpName?: string, origin: string,
 *           setupTokenSha256?: string|null, webauthn?: object }} o
 */
export function createAuth({ db, clock, rpID, rpName = "GameTimePicks CEO Command Center", origin, setupTokenSha256 = null, webauthn = simple }) {
  const audit = (event, detail = null) => ({ event, detail });
  const setupHash = /^[0-9a-f]{64}$/i.test(String(setupTokenSha256 ?? "").trim()) ? String(setupTokenSha256).trim().toLowerCase() : null;
  const setupTokenOk = (token) => Boolean(setupHash && token) && crypto.timingSafeEqual(Buffer.from(sha256(String(token)), "hex"), Buffer.from(setupHash, "hex"));

  async function passkeys(userId = null) {
    const r = userId
      ? await db.query("SELECT credential_id, public_key, counter, transports, label, user_id FROM auth_passkeys WHERE user_id = $1 ORDER BY created_at", [userId])
      : await db.query("SELECT credential_id, public_key, counter, transports, label, user_id FROM auth_passkeys ORDER BY created_at");
    return r.rows.map((p) => ({ id: p.credential_id, publicKey: p.public_key, counter: Number(p.counter), transports: typeof p.transports === "string" ? JSON.parse(p.transports) : p.transports, label: p.label, userId: p.user_id ?? "founder" }));
  }
  async function userById(id) {
    const r = await db.query("SELECT id, display_name, role, status FROM auth_users WHERE id = $1", [id]);
    const u = r.rows[0];
    return u ? { id: u.id, displayName: u.display_name, role: u.role, status: u.status } : null;
  }
  async function inviteRow(token) {
    if (typeof token !== "string" || token.length < 30) return null;
    const r = await db.query("SELECT token_hash, role, display_name, expires_at, used_at, revoked_at FROM auth_invites WHERE token_hash = $1", [sha256(token)]);
    const i = r.rows[0];
    if (!i || i.used_at || i.revoked_at || expired(i.expires_at, clock())) return null;
    return i;
  }

  async function newChallenge(purpose, challenge, binding = null) {
    // The login options endpoint is reachable before sign-in. Expired challenges are deleted, and past the cap the
    // oldest are evicted — so spam can't fill the database, and can't lock the founder out either.
    const hourAgo = new Date(Date.parse(clock()) - 3600_000).toISOString();
    await db.query("DELETE FROM auth_challenges WHERE (purpose <> 'recovery-failure' AND expires_at <= $1) OR (purpose = 'recovery-failure' AND expires_at <= $2)", [clock(), hourAgo]);
    await db.query(
      "DELETE FROM auth_challenges WHERE id IN (SELECT id FROM auth_challenges WHERE purpose = $1 AND used_at IS NULL ORDER BY expires_at DESC OFFSET $2)",
      [purpose, MAX_OPEN_CHALLENGES - 1],
    );
    const id = randomToken();
    await db.query("INSERT INTO auth_challenges (id, purpose, challenge, binding, expires_at) VALUES ($1, $2, $3, $4, $5)", [id, purpose, challenge, binding, later(clock(), CHALLENGE_TTL_MS)]);
    return id;
  }

  /** Mark a challenge used exactly once; returns its row or null if unknown, expired, used or bound elsewhere. */
  async function consumeChallenge(id, purpose, binding = null) {
    const now = clock();
    const r = await db.query(
      "UPDATE auth_challenges SET used_at = $1 WHERE id = $2 AND purpose = $3 AND used_at IS NULL AND expires_at > $1 AND binding IS NOT DISTINCT FROM $4 RETURNING challenge",
      [now, id, purpose, binding],
    );
    return r.rows[0] ?? null;
  }

  async function createSession(scope = "full", credentialId = null, userId = "founder") {
    const token = randomToken();
    const now = clock();
    const ttl = scope === "recovery" ? RECOVERY_SESSION_MS : SESSION_ABSOLUTE_MS;
    await db.query("INSERT INTO auth_sessions (token_hash, created_at, last_seen_at, expires_at, scope, credential_id, user_id) VALUES ($1, $2, $2, $3, $4, $5, $6)", [sha256(token), now, later(now, ttl), scope, credentialId, userId]);
    return { token, scope, maxAgeSec: Math.floor(ttl / 1000) };
  }

  // ── status ─────────────────────────────────────────────────────────────────────────────────────────────────
  async function status(token) {
    const s = token ? await session(token) : null;
    return { authenticated: Boolean(s && s.scope === "full"), recovery: s?.scope === "recovery", hasPasskey: (await passkeys()).length > 0, ...(s?.scope === "full" ? { user: s.user } : {}) };
  }

  /**
   * Validate a session token: exists, not revoked, inside idle and absolute limits, and its user is active (a disabled
   * account's sessions stop working at once; its role is read fresh on every request). Touches last_seen.
   */
  async function session(token) {
    if (!token || typeof token !== "string") return null;
    const h = sha256(token);
    const r = await db.query("SELECT token_hash, created_at, last_seen_at, expires_at, scope, revoked_at, user_id FROM auth_sessions WHERE token_hash = $1", [h]);
    const s = r.rows[0];
    const now = clock();
    if (!s || s.revoked_at || expired(s.expires_at, now) || expired(later(s.last_seen_at, SESSION_IDLE_MS), now)) return null;
    const user = await userById(s.user_id ?? "founder");
    if (!user || user.status !== "active" || !ROLES.includes(user.role)) return null;
    await db.query("UPDATE auth_sessions SET last_seen_at = $1 WHERE token_hash = $2", [now, h]);
    return { hash: h, scope: s.scope, createdAt: s.created_at, user: { id: user.id, displayName: user.displayName, role: user.role } };
  }

  async function logout(token) {
    if (token) await db.query("UPDATE auth_sessions SET revoked_at = $1 WHERE token_hash = $2 AND revoked_at IS NULL", [clock(), sha256(token)]);
    return audit("logout");
  }

  /** End sessions: one user's, or everyone's (userId null). */
  async function revokeAll(reason, userId = null) {
    if (userId) await db.query("UPDATE auth_sessions SET revoked_at = $1 WHERE revoked_at IS NULL AND user_id = $2", [clock(), userId]);
    else await db.query("UPDATE auth_sessions SET revoked_at = $1 WHERE revoked_at IS NULL", [clock()]);
    return audit("sessions-revoked", `${userId ?? "all users"}: ${reason}`);
  }

  // ── registration ───────────────────────────────────────────────────────────────────────────────────────────
  /**
   * Who is registering, decided server-side: the founder's first passkey (setup token, only while no passkey exists),
   * an invited person (a valid invite token), or a signed-in user adding a passkey to their own account.
   */
  async function registrant({ setupToken, sessionToken, inviteToken }) {
    const any = await passkeys();
    if (!any.length) {
      if (!setupTokenOk(setupToken)) return { ok: false, code: "SETUP_TOKEN_REQUIRED", audit: audit("register-refused", "missing or wrong setup token") };
      return { ok: true, path: "setup", userId: "founder", name: "founder", displayName: "GameTimePicks founder", binding: "setup" };
    }
    if (inviteToken) {
      const inv = await inviteRow(inviteToken);
      if (!inv) return { ok: false, code: "INVITE_INVALID", audit: audit("register-refused", "invite unknown, used, revoked or expired") };
      const userId = inviteUserId(inv.token_hash);
      return { ok: true, path: "invite", userId, name: userId, displayName: inv.display_name, binding: `invite|${inv.token_hash}`, invite: inv };
    }
    const s = await session(sessionToken);
    if (!s) return { ok: false, code: "NOT_AUTHENTICATED", audit: audit("register-refused", "no session") };
    return { ok: true, path: "session", userId: s.user.id, name: s.user.id, displayName: s.user.displayName, binding: `user|${s.user.id}`, session: s };
  }

  async function registerOptions({ setupToken, sessionToken, inviteToken } = {}) {
    const who = await registrant({ setupToken, sessionToken, inviteToken });
    if (!who.ok) return who;
    const existing = await passkeys(who.userId);
    const options = await webauthn.generateRegistrationOptions({
      rpName, rpID, userName: who.name, userDisplayName: who.displayName, userID: userHandle(who.userId),
      attestationType: "none",
      excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports })),
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    });
    const challengeId = await newChallenge("register", options.challenge, who.binding);
    return { ok: true, options, challengeId, displayName: who.displayName };
  }

  async function registerVerify({ challengeId, response, label = "passkey", setupToken, sessionToken, inviteToken, stepUp }) {
    const who = await registrant({ setupToken, sessionToken, inviteToken });
    if (!who.ok) return who;
    const firstPasskey = who.path === "setup";
    if (who.path === "session" && who.session.scope === "full") {
      const su = await verifyStepUp({ sessionToken, action: "register-passkey", payload: { label }, stepUp });
      if (!su.ok) return su;
    }
    const row = await consumeChallenge(challengeId, "register", who.binding);
    if (!row) return { ok: false, code: "CHALLENGE_INVALID", audit: audit("register-refused", "challenge unknown, used or expired") };
    let v;
    try {
      v = await webauthn.verifyRegistrationResponse({ response, expectedChallenge: row.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
    } catch (err) {
      return { ok: false, code: "REGISTRATION_INVALID", audit: audit("register-refused", String(err.message ?? err).slice(0, 120)) };
    }
    if (!v.verified) return { ok: false, code: "REGISTRATION_INVALID", audit: audit("register-refused", "not verified") };
    const c = v.registrationInfo.credential;
    let recoveryCodes = null;
    // One transaction: the setup guard, the passkey and its recovery codes land together or not at all.
    const done = await db.transaction(async (tx) => {
      if (firstPasskey) {
        const guard = await tx.query("INSERT INTO auth_setup (id, used_at) VALUES (1, $1) ON CONFLICT (id) DO NOTHING RETURNING id", [clock()]);
        if (!guard.rows.length) return false;
        await tx.query("INSERT INTO auth_users (id, display_name, role, created_at, created_by) VALUES ('founder', 'Founder', 'admin', $1, 'setup-token') ON CONFLICT (id) DO NOTHING", [clock()]);
      }
      if (who.path === "invite") {
        // the invite is spent in the same transaction that creates the account: two racing registrations can't both win
        const used = await tx.query("UPDATE auth_invites SET used_at = $1, used_by = $2 WHERE token_hash = $3 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > $1 RETURNING role, display_name", [clock(), who.userId, who.invite.token_hash]);
        if (!used.rows.length) return false;
        await tx.query("INSERT INTO auth_users (id, display_name, role, created_at, created_by) VALUES ($1, $2, $3, $4, $5)", [who.userId, used.rows[0].display_name, used.rows[0].role, clock(), `invite ${who.invite.token_hash.slice(0, 8)}`]);
      }
      await tx.query("INSERT INTO auth_passkeys (credential_id, public_key, counter, transports, label, created_at, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [c.id, b64u(c.publicKey), c.counter ?? 0, JSON.stringify(c.transports ?? []), String(label).slice(0, 60), clock(), who.userId]);
      if (firstPasskey) {
        recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
        for (const code of recoveryCodes) await tx.query("INSERT INTO auth_recovery_codes (code_hash, created_at) VALUES ($1, $2)", [hashCode(code), clock()]);
      }
      return true;
    });
    if (!done) return { ok: false, code: who.path === "invite" ? "INVITE_INVALID" : "SETUP_TOKEN_REQUIRED", audit: audit("register-refused", who.path === "invite" ? "invite already used" : "setup already used") };
    // a new passkey after recovery (or as a backup) ends that user's older sessions
    if (who.path === "session") await revokeAll("new passkey registered", who.userId);
    const sess = await createSession("full", c.id, who.userId);
    const kind = firstPasskey ? "first passkey (founder)" : who.path === "invite" ? `account created from an invite (${who.invite.role})` : "additional passkey";
    return { ok: true, session: sess, recoveryCodes, audit: audit("passkey-registered", `${who.userId}: ${kind} "${String(label).slice(0, 60)}"`) };
  }

  // ── login ──────────────────────────────────────────────────────────────────────────────────────────────────
  async function assertionOptions(purpose, binding = null, userId = null) {
    const keys = await passkeys(userId);
    if (!keys.length) return { ok: false, code: "NO_PASSKEY" };
    const options = await webauthn.generateAuthenticationOptions({ rpID, allowCredentials: keys.map((p) => ({ id: p.id, transports: p.transports })), userVerification: "required" });
    const challengeId = await newChallenge(purpose, options.challenge, binding);
    return { ok: true, options, challengeId };
  }

  async function verifyAssertion({ challengeId, response, purpose, binding = null, userId = null }) {
    const row = await consumeChallenge(challengeId, purpose, binding);
    if (!row) return { ok: false, code: "CHALLENGE_INVALID" };
    // a step-up must be made with the session owner's own passkey
    const key = (await passkeys(userId)).find((p) => p.id === response?.id);
    if (!key) return { ok: false, code: "UNKNOWN_PASSKEY" };
    let v;
    try {
      v = await webauthn.verifyAuthenticationResponse({
        response, expectedChallenge: row.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
        credential: { id: key.id, publicKey: fromB64u(key.publicKey), counter: key.counter, transports: key.transports },
      });
    } catch (err) {
      return { ok: false, code: "ASSERTION_INVALID", detail: String(err.message ?? err).slice(0, 120) };
    }
    if (!v.verified) return { ok: false, code: "ASSERTION_INVALID" };
    await db.query("UPDATE auth_passkeys SET counter = $1, last_used_at = $2 WHERE credential_id = $3", [v.authenticationInfo.newCounter ?? key.counter, clock(), key.id]);
    return { ok: true, credentialId: key.id, userId: key.userId };
  }

  const loginOptions = () => assertionOptions("login");

  async function loginVerify({ challengeId, response }) {
    const r = await verifyAssertion({ challengeId, response, purpose: "login" });
    if (!r.ok) return { ...r, audit: audit("login-failed", r.code) };
    const user = await userById(r.userId);
    if (!user || user.status !== "active") return { ok: false, code: "ACCOUNT_DISABLED", audit: audit("login-failed", `${r.userId}: account disabled`) };
    const sess = await createSession("full", r.credentialId, user.id);
    return { ok: true, session: sess, user: { id: user.id, displayName: user.displayName, role: user.role }, audit: audit("login", `${user.id} (${user.role}) passkey`) };
  }

  // ── step-up ────────────────────────────────────────────────────────────────────────────────────────────────
  const stepUpBinding = (sessionHash, action, payload) => sha256(`${sessionHash}|${action}|${payloadDigest(payload)}`);

  async function stepUpOptions({ sessionToken, action, payload }) {
    if (!STEP_UP_ACTIONS.includes(action)) return { ok: false, code: "NO_STEP_UP_FOR_ACTION" };
    const s = await session(sessionToken);
    if (!s || s.scope !== "full") return { ok: false, code: "NOT_AUTHENTICATED" };
    return assertionOptions("stepup", stepUpBinding(s.hash, action, payload), s.user.id);
  }

  /** The assertion must answer a challenge issued for THIS session, THIS action and THIS exact payload. */
  async function verifyStepUp({ sessionToken, action, payload, stepUp }) {
    const s = await session(sessionToken);
    if (!s || s.scope !== "full") return { ok: false, code: "NOT_AUTHENTICATED", audit: audit("stepup-refused", "no session") };
    if (!stepUp?.challengeId || !stepUp?.response) return { ok: false, code: "STEP_UP_REQUIRED", audit: audit("stepup-refused", `${action}: no assertion`) };
    const r = await verifyAssertion({ challengeId: stepUp.challengeId, response: stepUp.response, purpose: "stepup", binding: stepUpBinding(s.hash, action, payload), userId: s.user.id });
    if (!r.ok) return { ok: false, code: r.code === "CHALLENGE_INVALID" ? "STEP_UP_MISMATCH" : r.code, audit: audit("stepup-refused", `${action}: ${r.code}`) };
    return { ok: true, audit: { ...audit("stepup", action), user: s.user.id } };
  }

  // ── recovery ───────────────────────────────────────────────────────────────────────────────────────────────
  /** @param {string} code  @param {string} [clientKey]  e.g. the caller's IP; only its hash is stored */
  async function recover(code, clientKey = "unknown") {
    const since = new Date(Date.parse(clock()) - 3600_000).toISOString();
    const client = sha256(`client|${clientKey}`);
    // Failures are stored as spent pseudo-challenges (expires_at = when it failed), so they live with the auth state.
    const fails = await db.query(
      "SELECT count(*)::int AS mine FROM auth_challenges WHERE purpose = 'recovery-failure' AND expires_at > $1 AND binding = $2",
      [since, client],
    );
    if (fails.rows[0].mine >= MAX_RECOVERY_FAILURES_PER_CLIENT_HOUR) {
      return { ok: false, code: "RATE_LIMITED", audit: null };
    }
    const rows = (await db.query("SELECT code_hash FROM auth_recovery_codes WHERE used_at IS NULL")).rows;
    const hit = rows.find((r) => codeMatches(code, r.code_hash));
    const used = hit && (await db.query("UPDATE auth_recovery_codes SET used_at = $1 WHERE code_hash = $2 AND used_at IS NULL RETURNING code_hash", [clock(), hit.code_hash])).rows.length;
    if (!used) {
      await db.query("INSERT INTO auth_challenges (id, purpose, challenge, binding, expires_at, used_at) VALUES ($1, 'recovery-failure', '-', $2, $3, $3)", [randomToken(), client, clock()]);
      return { ok: false, code: "RECOVERY_CODE_INVALID", audit: null };
    }
    await revokeAll("recovery code used", "founder");
    const sess = await createSession("recovery", null, "founder");
    return { ok: true, session: sess, remaining: rows.length - 1, audit: audit("recovery-used", `${rows.length - 1} code(s) left; all sessions revoked`) };
  }

  /** Sign out every device (no step-up: ending sessions is always safe). The caller's own session ends too. */
  async function logoutAll(token) {
    const s = await session(token);
    if (!s) return { ok: false, code: "NOT_AUTHENTICATED", audit: null };
    return { ok: true, audit: await revokeAll("signed out everywhere", s.user.id) };
  }

  // ── accounts (administrators only; the hosted route table also requires a manage-users step-up) ─────────────
  async function requireAdmin(sessionToken) {
    const s = await session(sessionToken);
    if (!s || s.scope !== "full") return { ok: false, code: "NOT_AUTHENTICATED" };
    if (s.user.role !== "admin") return { ok: false, code: "FORBIDDEN", detail: "administrators only" };
    return { ok: true, s };
  }
  const activeAdmins = async () => Number((await db.query("SELECT count(*)::int AS n FROM auth_users WHERE role = 'admin' AND status = 'active'")).rows[0].n);

  /** A single-use invite link token for one person and one role. Returned once; only its hash is stored. */
  async function createInvite({ sessionToken, role, displayName }) {
    const a = await requireAdmin(sessionToken);
    if (!a.ok) return a;
    if (!ROLES.includes(role)) return { ok: false, code: "INVALID_ROLE", detail: String(role) };
    const name = String(displayName ?? "").replace(/[^\p{L}\p{N} .'-]/gu, "").trim().slice(0, 60);
    if (!name) return { ok: false, code: "NAME_REQUIRED" };
    const token = b64u(crypto.randomBytes(32));
    const expiresAt = later(clock(), INVITE_TTL_MS);
    await db.query("INSERT INTO auth_invites (token_hash, role, display_name, created_by, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6)", [sha256(token), role, name, a.s.user.id, clock(), expiresAt]);
    return { ok: true, token, expiresAt, role, displayName: name, audit: audit("invite-created", `${a.s.user.id} invited "${name}" as ${role} (expires ${expiresAt})`) };
  }
  async function listAccounts({ sessionToken }) {
    const a = await requireAdmin(sessionToken);
    if (!a.ok) return a;
    const users = (await db.query("SELECT id, display_name, role, status, created_at, created_by FROM auth_users ORDER BY created_at")).rows;
    const invites = (await db.query("SELECT token_hash, role, display_name, created_by, created_at, expires_at, used_at, used_by, revoked_at FROM auth_invites ORDER BY created_at DESC LIMIT 50")).rows;
    return {
      ok: true,
      users: users.map((u) => ({ id: u.id, displayName: u.display_name, role: u.role, status: u.status, createdAt: u.created_at, createdBy: u.created_by })),
      invites: invites.map((i) => ({ inviteId: i.token_hash.slice(0, 16), role: i.role, displayName: i.display_name, createdBy: i.created_by, createdAt: i.created_at, expiresAt: i.expires_at, status: i.used_at ? `used by ${i.used_by}` : i.revoked_at ? "revoked" : expired(i.expires_at, clock()) ? "expired" : "open" })),
    };
  }
  /** Change a role or disable/enable an account. The last active administrator can't be demoted or disabled. */
  async function updateAccount({ sessionToken, userId, role, status }) {
    const a = await requireAdmin(sessionToken);
    if (!a.ok) return a;
    const u = await userById(userId);
    if (!u) return { ok: false, code: "UNKNOWN_USER" };
    if (role !== undefined && !ROLES.includes(role)) return { ok: false, code: "INVALID_ROLE" };
    if (status !== undefined && !["active", "disabled"].includes(status)) return { ok: false, code: "INVALID_STATUS" };
    const losesAdmin = u.role === "admin" && u.status === "active" && ((role !== undefined && role !== "admin") || status === "disabled");
    if (losesAdmin && (await activeAdmins()) <= 1) return { ok: false, code: "LAST_ADMIN", detail: "there must always be one active administrator" };
    await db.query("UPDATE auth_users SET role = COALESCE($2, role), status = COALESCE($3, status), updated_at = $4 WHERE id = $1", [userId, role ?? null, status ?? null, clock()]);
    if (status === "disabled") await revokeAll("account disabled", userId);
    return { ok: true, audit: audit("account-updated", `${a.s.user.id} set ${userId}: ${role ? `role ${role} ` : ""}${status ? `status ${status}` : ""}`.trim()) };
  }
  async function revokeInvite({ sessionToken, inviteId }) {
    const a = await requireAdmin(sessionToken);
    if (!a.ok) return a;
    const r = await db.query("UPDATE auth_invites SET revoked_at = $1 WHERE left(token_hash, 16) = $2 AND used_at IS NULL AND revoked_at IS NULL RETURNING token_hash", [clock(), String(inviteId ?? "")]);
    return r.rows.length ? { ok: true, audit: audit("invite-revoked", `${a.s.user.id} revoked invite ${inviteId}`) } : { ok: false, code: "UNKNOWN_INVITE" };
  }
  /** What an invite link shows before registering: the name and role, nothing else. */
  async function inviteInfo(inviteToken) {
    const inv = await inviteRow(inviteToken);
    return inv ? { ok: true, displayName: inv.display_name, role: inv.role, expiresAt: inv.expires_at } : { ok: false, code: "INVITE_INVALID" };
  }

  return { status, session, logout, logoutAll, registerOptions, registerVerify, loginOptions, loginVerify, stepUpOptions, verifyStepUp, recover, passkeys, createInvite, listAccounts, updateAccount, revokeInvite, inviteInfo };
}
