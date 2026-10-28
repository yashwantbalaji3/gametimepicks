/**
 * X OAUTH 2.0 (authorization code + PKCE) — connects ONE X account (the GameTimePicks account) to the publisher.
 *
 * Endpoints and parameters are X's documented ones (docs.x.com, OAuth 2.0 user access token, checked 2026-10-28):
 *   authorize  https://x.com/i/oauth2/authorize   token  https://api.x.com/2/oauth2/token   revoke  https://api.x.com/2/oauth2/revoke
 * Callback URLs must be registered in the X Developer Console and match EXACTLY; for local development X asks for
 * the loopback IP, not "localhost":
 *   local   http://127.0.0.1:4190/oauth/x/callback          (surfaces/console/server.mjs)
 *   hosted  https://team.gametimepicks.yashwantbalaji.com/oauth/x/callback   (hosted/app.mjs)
 *
 * The flow is split so the callback — the one page X redirects a browser to — can stay narrow:
 *   start(binding)          a signed-in administrator asks to connect; state (256-bit) + PKCE verifier are stored
 *                           server-side, bound to that administrator's session, for 10 minutes. Only sha256(state) is a key.
 *   receive({state, code})  the callback: the state must exist, be unexpired and unused; the code is attached to it.
 *                           Nothing is exchanged here and nothing else of the Command Center is reachable.
 *   finish({state, binding}) the exchange: single-use (the state row is taken), the binding must be the session that
 *                           started it, and the PKCE verifier proves it is the same flow. Tokens go to the vault.
 * Locally (loopback-only console, one founder) receive + finish run back to back with the console binding.
 *
 * Scopes: tweet.read tweet.write users.read media.write offline.access (offline.access gives the refresh token).
 * Tokens are never logged, returned to a browser, or written to the ledger.
 */
import crypto from "node:crypto";
import { SECRET } from "./token-vault.mjs";
import { sha256 } from "../lib/util.mjs";

export const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
export const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
export const X_REVOKE_URL = "https://api.x.com/2/oauth2/revoke";
export const X_SCOPES = Object.freeze(["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"]);
export const CALLBACK_PATH = "/oauth/x/callback";
export const STATE_TTL_MS = 10 * 60_000;
/** Refresh this long before the access token's stated expiry. */
const REFRESH_EARLY_MS = 2 * 60_000;

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const later = (iso, ms) => new Date(Date.parse(iso) + ms).toISOString();

/** In-memory state store (the local console; tests). The hosted app uses createSqlStateStore. */
export function createMemoryStateStore() {
  const m = new Map();
  return {
    put: async (key, rec) => void m.set(key, { ...rec }),
    get: async (key) => (m.has(key) ? { ...m.get(key) } : null),
    attachCode: async (key, code, at) => {
      const r = m.get(key);
      if (!r || r.code) return false;
      r.code = code;
      r.receivedAt = at;
      return true;
    },
    take: async (key) => {
      const r = m.get(key) ?? null;
      m.delete(key);
      return r;
    },
  };
}

/** Hosted: table cc_oauth_states (migration 004). The code is attached once; take() deletes in one statement. */
export function createSqlStateStore(db) {
  const row = (r) => r && { verifier: r.verifier, binding: r.binding, redirectUri: r.redirect_uri, expiresAt: r.expires_at, code: r.code, receivedAt: r.received_at };
  return {
    put: (key, rec) => db.query("INSERT INTO cc_oauth_states (state_hash, verifier, binding, redirect_uri, expires_at) VALUES ($1, $2, $3, $4, $5)", [key, rec.verifier, rec.binding, rec.redirectUri, rec.expiresAt]),
    get: async (key) => row((await db.query("SELECT * FROM cc_oauth_states WHERE state_hash = $1", [key])).rows[0]),
    attachCode: async (key, code, at) => (await db.query("UPDATE cc_oauth_states SET code = $2, received_at = $3 WHERE state_hash = $1 AND code IS NULL RETURNING state_hash", [key, code, at])).rows.length === 1,
    take: async (key) => row((await db.query("DELETE FROM cc_oauth_states WHERE state_hash = $1 RETURNING *", [key])).rows[0]),
  };
}

/**
 * @param {{ vault: object, states: object, redirectUri: string, clock: () => string, fetch?: typeof fetch,
 *           clientId?: string|null }} o  clientId: GTP_CC_X_CLIENT_ID, else the vault's x-client-id
 */
export function createXOAuth({ vault, states, redirectUri, clock, fetch = globalThis.fetch, clientId = null }) {
  const client = async () => {
    const id = clientId || (await vault.get(SECRET.clientId));
    const secret = await vault.get(SECRET.clientSecret); // only a confidential ("Web App") X app has one
    return { id, secret };
  };
  /** X's token endpoint: public clients send client_id; confidential clients use HTTP Basic with the secret. */
  async function tokenRequest(params) {
    const { id, secret } = await client();
    if (!id) return { ok: false, code: "X_CLIENT_NOT_CONFIGURED", detail: "set the X app's Client ID first (docs/x-publisher-setup.md)" };
    const body = new URLSearchParams(secret ? params : { ...params, client_id: id });
    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    if (secret) headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString("base64")}`;
    let res;
    try {
      res = await fetch(X_TOKEN_URL, { method: "POST", headers, body: body.toString() });
    } catch (err) {
      return { ok: false, code: "X_TOKEN_NETWORK", detail: String(err.message ?? err).slice(0, 160) };
    }
    const j = await res.json().catch(() => ({}));
    // X's error body names the problem (e.g. invalid_request); it never contains our secret
    if (!res.ok || !j.access_token) return { ok: false, code: "X_TOKEN_REFUSED", detail: `${res.status} ${j.error ?? ""} ${String(j.error_description ?? "").slice(0, 160)}`.trim() };
    return { ok: true, tokens: j };
  }
  async function save(t, previous = null) {
    const rec = {
      access_token: t.access_token, refresh_token: t.refresh_token ?? previous?.refresh_token ?? null, token_type: t.token_type ?? "bearer",
      scope: t.scope ?? previous?.scope ?? "", expiresAt: later(clock(), Number(t.expires_in ?? 7200) * 1000), connectedAt: previous?.connectedAt ?? clock(), refreshedAt: clock(),
    };
    await vault.set(SECRET.tokens, JSON.stringify(rec));
    return rec;
  }
  const read = async () => {
    const raw = await vault.get(SECRET.tokens);
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  };

  return {
    redirectUri,
    async start({ binding }) {
      if (!binding) return { ok: false, code: "NOT_AUTHENTICATED", detail: "connecting X needs a signed-in administrator" };
      const { id } = await client();
      if (!id) return { ok: false, code: "X_CLIENT_NOT_CONFIGURED", detail: "set the X app's Client ID first (docs/x-publisher-setup.md)" };
      const state = b64u(crypto.randomBytes(32));
      const verifier = b64u(crypto.randomBytes(64));
      const challenge = b64u(crypto.createHash("sha256").update(verifier).digest());
      const expiresAt = later(clock(), STATE_TTL_MS);
      await states.put(sha256(state), { verifier, binding: sha256(String(binding)), redirectUri, expiresAt, code: null });
      const q = new URLSearchParams({ response_type: "code", client_id: id, redirect_uri: redirectUri, scope: X_SCOPES.join(" "), state, code_challenge: challenge, code_challenge_method: "S256" });
      return { ok: true, authorizeUrl: `${X_AUTHORIZE_URL}?${q.toString().replace(/\+/g, "%20")}`, expiresAt };
    },
    /** The callback. Validates the state and keeps the code for finish(); never exchanges, never needs a session. */
    async receive({ state, code, error }) {
      if (typeof state !== "string" || !/^[A-Za-z0-9_-]{20,100}$/.test(state)) return { ok: false, code: "STATE_INVALID" };
      const key = sha256(state);
      const rec = await states.get(key);
      if (!rec || Date.parse(rec.expiresAt) <= Date.parse(clock())) { await states.take(key); return { ok: false, code: "STATE_INVALID" }; }
      if (error) { await states.take(key); return { ok: false, code: "X_DENIED", detail: String(error).slice(0, 80) }; }
      if (typeof code !== "string" || !/^[A-Za-z0-9_.~-]{10,600}$/.test(code)) return { ok: false, code: "CODE_INVALID" };
      if (!(await states.attachCode(key, code, clock()))) return { ok: false, code: "STATE_USED" };
      return { ok: true };
    },
    /** Exchange the code — only for the session that started the flow, exactly once, with the PKCE verifier. */
    async finish({ state, binding }) {
      if (typeof state !== "string" || !binding) return { ok: false, code: "STATE_INVALID" };
      const rec = await states.take(sha256(state));
      if (!rec || !rec.code || Date.parse(rec.expiresAt) <= Date.parse(clock())) return { ok: false, code: "STATE_INVALID" };
      if (rec.binding !== sha256(String(binding))) return { ok: false, code: "BINDING_MISMATCH", detail: "the connection was started by a different session" };
      const r = await tokenRequest({ grant_type: "authorization_code", code: rec.code, redirect_uri: rec.redirectUri, code_verifier: rec.verifier });
      if (!r.ok) return r;
      const granted = String(r.tokens.scope ?? "").split(/\s+/);
      const missing = X_SCOPES.filter((s) => !granted.includes(s));
      const saved = await save(r.tokens);
      return { ok: true, scopes: granted, missingScopes: missing, expiresAt: saved.expiresAt };
    },
    /** A valid access token for a publish call, refreshing (and storing the rotated refresh token) when due. */
    async accessToken() {
      const t = await read();
      if (!t?.access_token) return { ok: false, code: "X_NOT_CONNECTED", detail: "connect the X account first" };
      if (Date.parse(t.expiresAt) - REFRESH_EARLY_MS > Date.parse(clock())) return { ok: true, token: t.access_token };
      if (!t.refresh_token) return { ok: false, code: "X_REAUTH_REQUIRED", detail: "the access token expired and there is no refresh token: reconnect X" };
      const r = await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh_token });
      if (!r.ok) return { ok: false, code: "X_REAUTH_REQUIRED", detail: `refresh refused (${r.detail ?? r.code}): reconnect X` };
      const saved = await save(r.tokens, t);
      return { ok: true, token: saved.access_token };
    },
    /** What the console may show: never a token. */
    async status() {
      const t = await read();
      const { id, secret } = await client();
      return {
        clientConfigured: Boolean(id), clientType: id ? (secret ? "confidential (client secret in vault)" : "public (PKCE, no secret)") : null,
        connected: Boolean(t?.access_token), scopes: t ? String(t.scope).split(/\s+/).filter(Boolean) : [], connectedAt: t?.connectedAt ?? null,
        accessTokenExpiresAt: t?.expiresAt ?? null, refreshable: Boolean(t?.refresh_token), redirectUri, vault: vault.kind,
      };
    },
    async disconnect() {
      const t = await read();
      const { id, secret } = await client();
      if (t?.refresh_token && id) {
        const body = new URLSearchParams(secret ? { token: t.refresh_token, token_type_hint: "refresh_token" } : { token: t.refresh_token, token_type_hint: "refresh_token", client_id: id });
        const headers = { "Content-Type": "application/x-www-form-urlencoded", ...(secret ? { Authorization: `Basic ${Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString("base64")}` } : {}) };
        await fetch(X_REVOKE_URL, { method: "POST", headers, body: body.toString() }).catch(() => null);
      }
      await vault.delete(SECRET.tokens);
      return { ok: true };
    },
  };
}
