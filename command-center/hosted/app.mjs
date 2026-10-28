/**
 * HOSTED COMMAND CENTER — the same orchestrator and console behind passkey login, as one stateless web handler.
 *
 *   fetch(Request) → Response     (Web-standard: a Vercel Function exports it; hosted/dev-server.mjs wraps it)
 *
 * Every request:
 *   1. sends strict security headers (CSP 'self' only, no framing, HSTS on https, no-store);
 *   2. POSTs must come from the configured origin, carry X-CC-Console: 1 and a JSON body (CSRF);
 *   3. everything except static files and /api/auth/* needs a full passkey session (__Host- cookie, HttpOnly,
 *      SameSite=Strict);
 *   4. approval-class actions (approve, keep, resume, attest, seat) also need a fresh WebAuthn step-up bound to
 *      this session + action + the exact request payload. Pause and Emergency stop never do: stopping must be
 *      instant and stopping is always safe;
 *   5. a fresh ledger session + orchestrator in "jobs" mode does the work and flushes once (a lost race on a claim
 *      is retried once against fresh state, where it becomes the idempotent duplicate);
 *   6. jobs it recorded are dispatched only after that flush commits, and their run ids are recorded;
 *      Pause/Stop cancel the runners of active jobs.
 *
 * Auth events go to the ledger as kind "auth" with no secrets. There is no reset and no preflight endpoint here:
 * the hosted ledger is permanent, and the preflight runs on the worker, where Claude Code runs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSqlStore } from "../ledger/sql-store.mjs";
import { createOrchestrator } from "../orchestrator/orchestrator.mjs";
import { createAuth } from "../auth/auth-service.mjs";
import { parseIntent } from "../orchestrator/intents.mjs";
import { CC_ROOT, REPO_ROOT } from "../lib/util.mjs";

const CONSOLE = path.join(CC_ROOT, "surfaces/console");
const STATIC = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/webauthn.js": ["webauthn.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"],
  "/sw.js": ["sw.js", "text/javascript; charset=utf-8"],
  "/icon-192.png": ["icon-192.png", "image/png"],
  "/icon-512.png": ["icon-512.png", "image/png"],
  "/apple-touch-icon.png": ["apple-touch-icon.png", "image/png"],
};
const MAX_BODY = 200_000;
/** Stored objects are served with a type fixed by their prefix, never the stored one, and sandboxed. */
const OBJECT_TYPES = { media: "image/png", runs: "text/plain; charset=utf-8", strategies: "text/markdown; charset=utf-8" };

/**
 * The caller's address for per-client limits: Vercel's own header first (set by its edge, not the client), IPv6
 * bucketed by /64 so one host can't mint unlimited addresses. Locally there is one client.
 */
export function clientKeyOf(request) {
  const raw = (request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!raw.includes(":")) return raw;
  const groups = raw.split("::")[0].split(":").filter(Boolean);
  return `${groups.slice(0, 4).join(":")}::/64`;
}

/** Which founder actions need a step-up, given the endpoint and its body. */
export function stepUpActionFor(pathname, body) {
  if (pathname === "/api/decide") return body.verdict === "approve" ? "approve" : body.verdict === "keep" ? "keep" : null;
  if (pathname === "/api/pause") return body.paused === false ? "resume" : null;
  if (pathname === "/api/command") return null; // a typed "resume" is refused in hosted mode (use the control)
  if (pathname === "/api/attest") return "attest";
  if (pathname === "/api/post") return body.action === "publish" ? "attest" : null; // the X link is the founder's attestation
  if (pathname === "/api/seat") return "seat";
  return null;
}

export function securityHeaders({ https }) {
  return {
    "Content-Security-Policy": [
      "default-src 'self'", "script-src 'self'", "style-src 'self'", "style-src-attr 'unsafe-inline'",
      "img-src 'self' data: blob:", "connect-src 'self'", "font-src 'self'", "manifest-src 'self'", "worker-src 'self'",
      "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'", "object-src 'none'",
    ].join("; "),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    ...(https ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
  };
}

/**
 * @param {{ db: object, clock: () => string, origin: string, rpID: string, setupTokenSha256: string|null,
 *           dispatcher: object, objects: object, outDir: string, env?: object, slateDate?: string,
 *           engineering?: object, webauthn?: object, logoFile?: string, log?: (msg: string) => void }} o
 */
export function createHostedApp({ db, clock, origin, rpID, setupTokenSha256, dispatcher, objects, outDir, env = {}, slateDate, engineering = {}, webauthn, logoFile = path.join(REPO_ROOT, "app/public/brand/gametime-picks-logo.png"), log = (m) => console.error(m) }) {
  const https = origin.startsWith("https://");
  const cookieName = https ? "__Host-gtp_cc" : "gtp_cc_dev";
  const sql = createSqlStore({ db, clock });
  const auth = createAuth({ db, clock, rpID, origin, setupTokenSha256, ...(webauthn ? { webauthn } : {}) });
  const headers = securityHeaders({ https });

  const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8", ...extra } });
  const bytes = (status, body, type) => new Response(body, { status, headers: { ...headers, "Content-Type": type } });
  const cookie = (token, maxAgeSec) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${https ? "; Secure" : ""}`;
  const clearCookie = () => `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${https ? "; Secure" : ""}`;

  function tokenOf(request) {
    const raw = request.headers.get("cookie") ?? "";
    for (const part of raw.split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k === cookieName) return v.join("=") || null;
    }
    return null;
  }

  /** Write auth audit records (no secrets) to the ledger. */
  async function audit(records) {
    const list = records.filter(Boolean);
    if (!list.length) return;
    const s = await sql.open();
    for (const r of list) s.append("auth", "auth", { event: r.event, detail: r.detail ?? null });
    await s.flush();
  }

  const make = (session) => createOrchestrator({ store: session, clock, env, outDir, slateDate, engineering, execution: "jobs", runnerId: "web", hosted: true });

  /** One stateless orchestrator turn: fresh session, work, one flush (retried once on a lost claim), then dispatch. */
  async function turn(fn) {
    for (let attempt = 0; ; attempt++) {
      const session = await sql.open();
      const o = make(session);
      const result = await fn(o);
      try {
        await session.flush();
      } catch (err) {
        if (err.code === "CLAIM_CONFLICT" && attempt === 0) continue;
        throw err;
      }
      await afterCommit(o.takeOutbox(), result);
      return result;
    }
  }

  async function afterCommit(outbox, result) {
    const cancels = result?.cancelJobs ?? [];
    if (!outbox.length && !cancels.length) return;
    const notes = [];
    for (const job of outbox) notes.push({ job, kind: "dispatch", r: await dispatcher.dispatch(job) });
    for (const job of cancels) notes.push({ job, kind: "cancel", r: await dispatcher.cancel(job, { force: result.emergency === true }) });
    const s = await sql.open();
    const o = make(s);
    for (const n of notes) {
      if (n.kind === "dispatch") o.jobDispatched(n.job, { runner: dispatcher.runner, runId: n.r.runId ?? null, ok: n.r.ok, detail: n.r.detail });
      else if (n.r.ok && n.job.runId) o.jobCancelled(n.job, result.emergency ? "Emergency stop" : "Paused by the founder");
    }
    await s.flush();
    if (result && cancels.length) result.cancelled = notes.filter((n) => n.kind === "cancel").map((n) => ({ jobId: n.job.jobId, ok: n.r.ok, detail: n.r.detail ?? null }));
  }

  async function readJson(request) {
    const type = request.headers.get("content-type") ?? "";
    if (!type.startsWith("application/json")) throw Object.assign(new Error("JSON body required"), { status: 415 });
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) throw Object.assign(new Error("body too large"), { status: 413 });
    const text = await request.text();
    if (text.length > MAX_BODY) throw Object.assign(new Error("body too large"), { status: 413 });
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw Object.assign(new Error("invalid JSON"), { status: 400 });
    }
  }

  function staticFile(pathname) {
    if (pathname === "/brand/logo.png") return fs.existsSync(logoFile) ? bytes(200, fs.readFileSync(logoFile), "image/png") : json(404, { error: "not found" });
    const hit = STATIC[pathname];
    if (!hit) return null;
    const file = path.join(CONSOLE, hit[0]);
    if (!fs.existsSync(file)) return json(404, { error: "not found" });
    return bytes(200, fs.readFileSync(file), hit[1]);
  }

  /**
   * Only successful auth events reach the permanent ledger. Refusals on unauthenticated routes are not written
   * anywhere permanent (anyone could call them in a loop); recovery failures are counted in the auth tables.
   */
  async function authRoute(pathname, body, token, clientKey) {
    const withCookie = async (r, okBody) => {
      if (r.ok) await audit([r.audit]);
      if (!r.ok) return json(r.code === "RATE_LIMITED" ? 429 : 401, { ok: false, code: r.code });
      return json(200, { ok: true, ...okBody }, { "Set-Cookie": cookie(r.session.token, r.session.maxAgeSec) });
    };
    switch (pathname) {
      case "/api/auth/register/options": {
        const r = await auth.registerOptions({ setupToken: body.setupToken, sessionToken: token });
        if (!r.ok) return json(401, { ok: false, code: r.code });
        return json(200, { ok: true, options: r.options, challengeId: r.challengeId });
      }
      case "/api/auth/register/verify": {
        const r = await auth.registerVerify({ challengeId: body.challengeId, response: body.response, label: body.label, setupToken: body.setupToken, sessionToken: token, stepUp: body.stepUp });
        return withCookie(r, { recoveryCodes: r.recoveryCodes ?? null });
      }
      case "/api/auth/login/options": {
        const r = await auth.loginOptions();
        return r.ok ? json(200, { ok: true, options: r.options, challengeId: r.challengeId }) : json(400, { ok: false, code: r.code });
      }
      case "/api/auth/login/verify":
        return withCookie(await auth.loginVerify({ challengeId: body.challengeId, response: body.response }), {});
      case "/api/auth/recover":
        return withCookie(await auth.recover(String(body.code ?? "").slice(0, 64), clientKey), { recovery: true });
      case "/api/auth/stepup/options": {
        const r = await auth.stepUpOptions({ sessionToken: token, action: body.action, payload: body.payload });
        return r.ok ? json(200, { ok: true, options: r.options, challengeId: r.challengeId }) : json(401, { ok: false, code: r.code });
      }
      case "/api/auth/logout": {
        if (await auth.session(token)) await audit([await auth.logout(token)]);
        return json(200, { ok: true }, { "Set-Cookie": clearCookie() });
      }
      case "/api/auth/logout-all": {
        const r = await auth.logoutAll(token);
        if (!r.ok) return json(401, { ok: false, code: r.code });
        await audit([r.audit]);
        return json(200, { ok: true }, { "Set-Cookie": clearCookie() });
      }
      default:
        return json(404, { error: "not found" });
    }
  }

  async function actionRoute(pathname, body, actor) {
    switch (pathname) {
      case "/api/command": {
        const text = String(body.text ?? "").slice(0, 4000);
        // Resuming must carry a passkey step-up; typed commands don't, so only the Resume control can do it here.
        if (parseIntent(text) === "resume") return { ok: false, code: "USE_RESUME_CONTROL", detail: "Resume with the Resume button (it asks for Face ID)." };
        return turn((o) => o.handleCommand(text, actor));
      }
      case "/api/decide": return turn((o) => o.decide({ decisionId: body.decisionId, verdict: body.verdict, captionId: body.captionId, digest: body.digest, note: body.note, sourcesConfirmed: body.sourcesConfirmed === true }, actor));
      case "/api/post": return turn((o) => o.recordPost({ decisionId: body.decisionId, action: body.action, url: body.url, publishedAt: body.publishedAt, scheduledFor: body.scheduledFor, metrics: body.metrics }, actor));
      case "/api/pause":
        if (typeof body.paused !== "boolean") return { ok: false, code: "INVALID_REQUEST", detail: "paused must be true or false" };
        return turn((o) => o.setPaused(body.paused, actor));
      case "/api/stop": return turn(async (o) => ({ ...o.emergencyStop(actor), emergency: true }));
      case "/api/attest": return turn((o) => o.attestBilling({ usageCredits: body.usageCredits, capUsd: body.capUsd }, actor));
      case "/api/seat": return turn((o) => o.setSeat(body.role, body.seat, actor));
      case "/api/provider-test": return turn((o) => o.testProviderConnection(String(body.integration ?? ""), actor));
      case "/api/manual": return turn((o) => o.submitManual(body.taskId, String(body.text ?? ""), actor));
      default: return null;
    }
  }

  async function handle(request) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (request.method === "GET") {
      const st = staticFile(pathname);
      if (st) return st;
    }
    const token = tokenOf(request);

    if (request.method === "GET" && pathname === "/api/auth/status") return json(200, { hosted: true, ...(await auth.status(token)) });

    if (request.method === "POST") {
      if (request.headers.get("origin") !== origin) return json(403, { error: "cross-origin request refused" });
      if (request.headers.get("x-cc-console") !== "1") return json(403, { error: "missing console header" });
      const body = await readJson(request);
      if (pathname.startsWith("/api/auth/")) {
        return authRoute(pathname, body, token, clientKeyOf(request));
      }

      const s = await auth.session(token);
      if (!s || s.scope !== "full") return json(401, { error: "sign in with your passkey" });
      const action = stepUpActionFor(pathname, body);
      let authentication = "passkey session";
      if (action) {
        const { stepUp, ...payload } = body;
        const v = await auth.verifyStepUp({ sessionToken: token, action, payload, stepUp });
        await audit([v.audit]);
        if (!v.ok) return json(403, { ok: false, code: v.code, detail: "this action needs Face ID / Touch ID confirmation for exactly this request" });
        authentication = "passkey step-up (WebAuthn, user verified, bound to this request)";
      }
      const actor = { role: "founder", id: "founder", surface: "hosted", authentication };
      const result = await actionRoute(pathname, body, actor);
      return result ? json(200, result) : json(404, { error: "not found" });
    }

    if (request.method !== "GET") return json(405, { error: "method" });
    const s = await auth.session(token);
    if (!s || s.scope !== "full") return json(401, { error: "sign in with your passkey" });
    if (pathname === "/api/state") {
      const session = await sql.open();
      return json(200, { ...make(session).state(), hosted: { runner: dispatcher.runner } });
    }
    const m = pathname.match(/^\/(media|runs|strategies)\/([A-Za-z0-9._-]{1,160})$/);
    if (m) {
      const obj = await objects.get(`${m[1]}/${m[2]}`);
      if (!obj) return json(404, { error: "not found" });
      return new Response(obj.body, {
        status: 200,
        headers: {
          ...headers, "Content-Type": OBJECT_TYPES[m[1]], "Content-Security-Policy": "sandbox; default-src 'none'",
          ...(m[1] === "runs" || m[1] === "strategies" ? { "Content-Disposition": "attachment" } : {}),
        },
      });
    }
    return json(404, { error: "not found" });
  }

  return {
    async fetch(request) {
      try {
        return await handle(request);
      } catch (err) {
        if (err.status) return json(err.status, { error: err.message });
        if (err.code === "RATE_LIMITED") return json(429, { error: err.message });
        log(`hosted app error: ${err.stack ?? err}`);
        return json(500, { error: "internal error (details in the server log)" });
      }
    },
    migrate: () => sql.migrate(),
  };
}

export const HOSTED_DIR = path.dirname(fileURLToPath(import.meta.url));
