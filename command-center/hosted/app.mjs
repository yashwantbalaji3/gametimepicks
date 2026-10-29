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
 * P0 (2026-10-28): individual accounts with roles. Every route needs a permission (routePermission; anything not
 * listed needs "administer" — fail closed); the orchestrator checks the same permission again. The actor on every
 * ledger record is the signed-in person. Accounts are created only from an administrator's invite.
 * X OAuth: GET /oauth/x/callback is the ONE unauthenticated non-auth route. It only validates the state and keeps
 * the code; the browser is then sent (same-site, so the SameSite=Strict cookie comes along) to /oauth/x/finish,
 * which needs an administrator's session — the same session that started the connection — to exchange the code.
 * Scheduled publishing: /api/cron/publish (Vercel Cron every 10 min in game windows, Bearer CRON_SECRET) dispatches the publisher job
 * (cc-publisher.yml) when a job is due within 10 minutes; the web app itself never sends anything to X.
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
import crypto from "node:crypto";
import { CC_ROOT, REPO_ROOT, sha256, shortId } from "../lib/util.mjs";
import { can } from "../orchestrator/policy.mjs";
import { CALLBACK_PATH } from "../publishers/x-oauth.mjs";

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

/** Publishing controls → the permission each needs. Pausing is open to approvers (stopping is always safe). */
const PUBLISHING_PERMISSION = Object.freeze({
  pause: "approve", ack: "approve",
  resume: "publish", schedule: "publish", cancel: "publish", "dry-run-now": "publish", "live-test": "publish", reconcile: "publish",
  policy: "administer", "x-connect": "administer", "x-disconnect": "administer", "publisher-host": "administer", "queue-prep": "administer",
});
/** The permission a request needs. Unknown paths and actions need "administer" (fail closed). */
export function routePermission(pathname, body = {}) {
  if (pathname === "/api/state") return "view";
  if (pathname === "/api/command" || pathname === "/api/manual" || pathname === "/api/caption") return "draft";
  if (pathname === "/api/decide" || pathname === "/api/design" || pathname === "/api/stop") return "approve";
  if (pathname === "/api/pause") return body.paused === false ? "publish" : "approve";
  if (pathname === "/api/post") return "publish";
  if (pathname === "/api/publishing") return PUBLISHING_PERMISSION[body.action] ?? "administer";
  return "administer";
}

/** Which actions need a step-up, given the endpoint and its body. */
export function stepUpActionFor(pathname, body) {
  if (pathname === "/api/decide") return body.verdict === "approve" ? "approve" : body.verdict === "keep" ? "keep" : null;
  if (pathname === "/api/pause") return body.paused === false ? "resume" : null;
  if (pathname === "/api/command") return null; // a typed "resume" is refused in hosted mode (use the control)
  if (pathname === "/api/attest") return "attest";
  if (pathname === "/api/post") return body.action === "publish" ? "attest" : null; // the X link is the founder's attestation
  if (pathname === "/api/design") return "approve";
  if (pathname === "/api/seat") return "seat";
  if (pathname === "/api/publishing") {
    if (body.action === "live-test") return "publish-live";
    if (body.action === "policy") return body.mode === "dry-run" ? null : "publishing-policy";
    if (body.action === "x-connect") return "connect-x";
    if (body.action === "publisher-host") return "publishing-policy";
    if (body.action === "queue-prep") return "publishing-policy"; // on or off, a fresh passkey
    if (body.action === "resume") return "resume";
    return null;
  }
  if (pathname === "/api/users/invite" || pathname === "/api/users/update") return "manage-users";
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
export function createHostedApp({ db, clock, origin, rpID, setupTokenSha256, dispatcher, objects, outDir, env = {}, slateDate, engineering = {}, webauthn, logoFile = path.join(REPO_ROOT, "app/public/brand/gametime-picks-logo.png"), log = (m) => console.error(m), oauth = null, cronSecret = null, publishDispatcher = null }) {
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
    for (const r of list) s.append("auth", "auth", { event: r.event, detail: r.detail ?? null, ...(r.user ? { user: r.user } : {}) });
    await s.flush();
  }

  // The web app never publishes: its gate would refuse (no fresh data here); the publisher job runs the gate.
  const publishing = { oauth, refreshData: async () => ({ ok: false, detail: "the web app does not publish: the publisher job does" }) };
  const make = (session) => createOrchestrator({ store: session, clock, env, outDir, slateDate, engineering, execution: "jobs", runnerId: "web", hosted: true, publishing });
  const kickPublisher = async () => (publishDispatcher ? publishDispatcher.dispatch({ jobId: shortId("job", { publish: clock(), r: crypto.randomBytes(6).toString("hex") }) }) : { ok: false, detail: "no publisher dispatcher configured" });

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
        const r = await auth.registerOptions({ setupToken: body.setupToken, sessionToken: token, inviteToken: body.inviteToken });
        if (!r.ok) return json(401, { ok: false, code: r.code });
        return json(200, { ok: true, options: r.options, challengeId: r.challengeId });
      }
      case "/api/auth/invite/info": {
        const r = await auth.inviteInfo(String(body.inviteToken ?? "").slice(0, 100));
        return r.ok ? json(200, r) : json(404, { ok: false, code: r.code });
      }
      case "/api/auth/register/verify": {
        const r = await auth.registerVerify({ challengeId: body.challengeId, response: body.response, label: body.label, setupToken: body.setupToken, sessionToken: token, inviteToken: body.inviteToken, stepUp: body.stepUp });
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
      case "/api/auth/recovery-codes": {
        // the new codes go to this signed-in session only (no-store, never logged; the audit record has counts only)
        const r = await auth.rotateRecoveryCodes({ sessionToken: token, stepUp: body.stepUp });
        if (!r.ok) return json(r.code === "FORBIDDEN" ? 403 : 401, { ok: false, code: r.code });
        await audit([r.audit]);
        return json(200, { ok: true, recoveryCodes: r.recoveryCodes });
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

  async function actionRoute(pathname, body, actor, sess) {
    switch (pathname) {
      case "/api/command": {
        const text = String(body.text ?? "").slice(0, 4000);
        // Resuming must carry a passkey step-up; typed commands don't, so only the Resume control can do it here.
        if (parseIntent(text) === "resume") return { ok: false, code: "USE_RESUME_CONTROL", detail: "Resume with the Resume button (it asks for Face ID)." };
        return turn((o) => o.handleCommand(text, actor));
      }
      case "/api/decide": return turn((o) => o.decide({ decisionId: body.decisionId, verdict: body.verdict, captionId: body.captionId, digest: body.digest, note: body.note, sourcesConfirmed: body.sourcesConfirmed === true, availabilityConfirmed: body.availabilityConfirmed === true }, actor));
      case "/api/caption": return turn((o) => o.editCaption({ decisionId: body.decisionId, basedOn: body.basedOn, text: body.text }, actor));
      case "/api/design": return turn((o) => o.approveDesign({ template: body.template, assetManifest: body.assetManifest }, actor));
      case "/api/post": return turn((o) => o.recordPost({ decisionId: body.decisionId, action: body.action, url: body.url, publishedAt: body.publishedAt, scheduledFor: body.scheduledFor, metrics: body.metrics }, actor));
      case "/api/pause":
        if (typeof body.paused !== "boolean") return { ok: false, code: "INVALID_REQUEST", detail: "paused must be true or false" };
        return turn((o) => o.setPaused(body.paused, actor));
      case "/api/stop": return turn(async (o) => ({ ...o.emergencyStop(actor), emergency: true }));
      case "/api/attest": return turn((o) => o.attestBilling({ usageCredits: body.usageCredits, capUsd: body.capUsd }, actor));
      case "/api/seat": return turn((o) => o.setSeat(body.role, body.seat, actor));
      case "/api/provider-test": return turn((o) => o.testProviderConnection(String(body.integration ?? ""), actor));
      case "/api/manual": return turn((o) => o.submitManual(body.taskId, String(body.text ?? ""), actor));
      case "/api/publishing": return publishingRoute(body, actor, sess);
      default: return null;
    }
  }

  /** Publishing controls. Sending happens only in the publisher job; here they are recorded (and the job kicked). */
  async function publishingRoute(body, actor, sess) {
    switch (body.action) {
      case "pause": return turn((o) => o.publishing.setPaused(true, actor));
      case "resume": return turn((o) => o.publishing.setPaused(false, actor));
      case "schedule": return turn((o) => o.publishing.schedule({ decisionId: body.decisionId, at: body.at ?? null }, actor));
      case "cancel": return turn((o) => o.publishing.cancel({ jobId: body.jobId }, actor));
      case "ack": return turn((o) => o.publishing.acknowledge({ alertId: body.alertId }, actor));
      case "policy": return turn((o) => o.publishing.setPolicy({ mode: body.mode, capUsd: body.capUsd, authorization: body.authorization }, actor));
      case "publisher-host": return turn((o) => o.publishing.setPublisherHost({ to: body.to, confirmation: body.confirmation }, actor));
      case "queue-prep": return turn((o) => o.publishing.setQueuePrep({ enabled: body.enabled, timeEt: body.timeEt }, actor));
      case "reconcile": return turn((o) => o.publishing.reconcile({ jobId: body.jobId, url: body.url ?? null, notPosted: body.notPosted === true, lookup: body.lookup === true }, actor));
      case "dry-run-now":
      case "live-test": {
        const r = await turn((o) => o.publishing.queueNow({ decisionId: body.decisionId, live: body.action === "live-test" }, actor));
        if (!r.ok) return r;
        const d = await kickPublisher();
        return { ...r, state: "QUEUED", detail: d.ok ? "queued: the publisher job runs it through the full gate within a few minutes" : `queued, but the publisher job could not be started (${d.detail}); the next cron tick will` };
      }
      case "x-connect":
        if (!oauth) return { ok: false, code: "X_NOT_CONFIGURED", detail: "the X connection is not configured on this deployment" };
        return oauth.start({ binding: sess.hash });
      case "x-disconnect":
        if (!oauth) return { ok: false, code: "X_NOT_CONFIGURED" };
        await audit([{ event: "x-disconnected", detail: actor.id }]);
        return oauth.disconnect();
      default: return { ok: false, code: "UNKNOWN_ACTION", detail: String(body.action) };
    }
  }

  /** Accounts (administrators; invites and changes also need a manage-users step-up). */
  async function usersRoute(pathname, body, token) {
    if (pathname === "/api/users/list") return auth.listAccounts({ sessionToken: token });
    if (pathname === "/api/users/invite") {
      const r = await auth.createInvite({ sessionToken: token, role: body.role, displayName: body.displayName });
      if (!r.ok) return r;
      await audit([r.audit]);
      // the link is shown to the administrator once; the token is never stored or logged
      return { ok: true, link: `${origin}/#invite=${r.token}`, expiresAt: r.expiresAt, role: r.role, displayName: r.displayName };
    }
    if (pathname === "/api/users/update") {
      const r = await auth.updateAccount({ sessionToken: token, userId: body.userId, role: body.role, status: body.status });
      if (!r.ok) return r;
      await audit([r.audit]);
      // losing the right to publish withdraws that person's queued publishing jobs (e.g. a live test) at once
      if (body.status === "disabled" || (body.role !== undefined && !can(body.role, "publish"))) {
        const withdrawn = await turn((o) => o.publishing.cancelQueuedBy(String(body.userId), `account ${body.status === "disabled" ? "disabled" : `now ${body.role}`}`, { id: "admin" }));
        return { ok: true, withdrawnJobs: withdrawn };
      }
      return { ok: true };
    }
    if (pathname === "/api/users/revoke-invite") {
      const r = await auth.revokeInvite({ sessionToken: token, inviteId: body.inviteId });
      if (r.ok) await audit([r.audit]);
      return r.ok ? { ok: true } : r;
    }
    return null;
  }

  const html = (status, title, line, extraHead = "") => new Response(`<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer">${extraHead}<title>${title}</title><body style="font:16px system-ui;padding:40px"><h1 style="font-size:20px">${title}</h1><p>${line}</p><p><a href="/">Back to the Command Center</a></p>`, { status, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });

  /**
   * Vercel Cron (every 10 min, 10 AM–2 AM ET) → dispatch the publisher job when something is due within 10 minutes,
   * at most once per 10-minute window. The job waits for each exact due time.
   * Also daily queue preparation: when the founder turned it on and this is the active publisher host, the first tick
   * at or after the set time prepares today's queue once (claim queue-prep|<ET date>); its build jobs are dispatched
   * after the ledger commits, like any command's. On the inactive host this does nothing and records nothing.
   */
  async function cron(request) {
    const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
    if (!cronSecret || given.length !== cronSecret.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(cronSecret))) return json(404, { error: "not found" });
    let queuePrep;
    try {
      const p = await turn((o) => o.publishing.prepDue());
      queuePrep = p.ran ? { ran: true, ok: p.ok, date: p.date, commandId: p.commandId, code: p.code } : { ran: false, skipped: p.skipped };
    } catch (err) {
      log(`queue preparation failed: ${err.stack ?? err}`);
      queuePrep = { ran: false, error: "queue preparation failed (details in the server log)" };
    }
    const session = await sql.open();
    const o = make(session);
    const due = o.publishing.dueSoon(10 * 60_000);
    if (!due.length) return json(200, { ok: true, due: 0, queuePrep });
    const bucket = new Date(Math.floor(Date.parse(clock()) / 600_000) * 600_000).toISOString();
    const c = session.claim(`publisher-dispatch|${bucket}`, { due: due.map((j) => j.jobId) });
    if (!c.won) return json(200, { ok: true, due: due.length, dispatched: false, note: "already dispatched in this 10-minute window", queuePrep });
    await session.flush();
    const d = await kickPublisher();
    return json(200, { ok: true, due: due.length, dispatched: d.ok, detail: d.detail ?? null, queuePrep });
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
    if (request.method === "GET" && pathname === "/api/cron/publish") return cron(request);
    if (request.method === "GET" && pathname === CALLBACK_PATH) {
      // The only unauthenticated non-auth route: validate state + keep the code; nothing else is reachable from here.
      if (!oauth) return json(404, { error: "not found" });
      const state = url.searchParams.get("state");
      const r = await oauth.receive({ state, code: url.searchParams.get("code"), error: url.searchParams.get("error") });
      if (!r.ok) return html(400, "X connection not completed", `Reason: ${String(r.code).replace(/[^A-Z_]/g, "")}. Start again from the Command Center.`);
      // a same-site navigation, so the SameSite=Strict session cookie is sent to /oauth/x/finish
      const next = `/oauth/x/finish?state=${encodeURIComponent(state)}`;
      return html(200, "Finishing the X connection…", `<a href="${next}">Continue</a>`, `<meta http-equiv="refresh" content="0;url=${next}">`);
    }

    if (request.method === "POST") {
      if (request.headers.get("origin") !== origin) return json(403, { error: "cross-origin request refused" });
      if (request.headers.get("x-cc-console") !== "1") return json(403, { error: "missing console header" });
      const body = await readJson(request);
      if (pathname.startsWith("/api/auth/")) {
        return authRoute(pathname, body, token, clientKeyOf(request));
      }

      const s = await auth.session(token);
      if (!s || s.scope !== "full") return json(401, { error: "sign in with your passkey" });
      const isUsers = pathname.startsWith("/api/users/");
      const permission = isUsers ? "administer" : routePermission(pathname, body);
      if (!can(s.user.role, permission)) return json(403, { ok: false, code: "FORBIDDEN", detail: `needs the ${permission} permission (your role: ${s.user.role})` });
      const action = stepUpActionFor(pathname, body);
      let authentication = "passkey session";
      if (action) {
        const { stepUp, ...payload } = body;
        const v = await auth.verifyStepUp({ sessionToken: token, action, payload, stepUp });
        await audit([v.audit]);
        if (!v.ok) return json(403, { ok: false, code: v.code, detail: "this action needs Face ID / Touch ID confirmation for exactly this request" });
        authentication = "passkey step-up (WebAuthn, user verified, bound to this request)";
      }
      if (isUsers) {
        const r = await usersRoute(pathname, body, token);
        return r ? json(r.ok ? 200 : 400, r) : json(404, { error: "not found" });
      }
      // the founder keeps the "founder" actor role only while an active administrator; everyone acts as themselves
      const actor = { role: s.user.id === "founder" && s.user.role === "admin" ? "founder" : s.user.role, id: s.user.id, displayName: s.user.displayName, surface: "hosted", authentication };
      const result = await actionRoute(pathname, body, actor, s);
      return result ? json(200, result) : json(404, { error: "not found" });
    }

    if (request.method !== "GET") return json(405, { error: "method" });
    const s = await auth.session(token);
    if (!s || s.scope !== "full") return json(401, { error: "sign in with your passkey" });
    if (pathname === "/api/state") {
      const session = await sql.open();
      const o = make(session);
      return json(200, { ...o.state(), publishing: await o.publishing.state(), me: s.user, hosted: { runner: dispatcher.runner } });
    }
    if (pathname === "/oauth/x/finish") {
      if (!oauth) return json(404, { error: "not found" });
      if (!can(s.user.role, "administer")) return html(403, "X connection not completed", "Only an administrator can connect the X account.");
      const r = await oauth.finish({ state: url.searchParams.get("state"), binding: s.hash });
      if (!r.ok) return html(400, "X connection not completed", `Reason: ${String(r.code).replace(/[^A-Z_]/g, "")}. Start again from the Command Center.`);
      await audit([{ event: "x-connected", detail: `${s.user.id}: scopes ${r.scopes.join(" ")}${r.missingScopes.length ? `; missing ${r.missingScopes.join(" ")}` : ""}` }]);
      return html(200, "X account connected", r.missingScopes.length ? `Missing permissions: ${r.missingScopes.join(", ")} — reconnect and allow them.` : "All permissions granted. Publishing stays in dry run until you authorize live publishing.");
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
