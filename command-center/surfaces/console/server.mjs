/**
 * CEO CONSOLE — the Phase 1 surface: a local web page over the orchestrator.
 *
 *   node command-center/surfaces/console/server.mjs        → http://127.0.0.1:4190
 *
 * Loopback only. It refuses to bind anything but 127.0.0.1, rejects requests whose Host header is not the
 * loopback address (a DNS-rebinding guard), and requires a custom header on every POST so another site in the
 * browser cannot drive it. That makes it fit for a local demo and nothing more: anything on this machine can call
 * it, which is why its approvals are labelled demo-grade and can only reach the mock publisher
 * (docs/approval-security.md).
 *
 * The ledger and rendered media live under command-center/out/console/ (git-ignored; GTP_CC_OUT_DIR overrides it
 * for tests). "Reset demo" deletes only that directory.
 *
 * X Publisher V1 (orchestrator/publish-flow.mjs): dry run by default. The X tokens live in the macOS Keychain.
 * Because anything on this Mac can call the console, the two live actions — authorizing live publishing and a live
 * test post — also need a click in a native macOS dialog (not agent-proof against screen control, but no script can
 * answer it through the API). The X OAuth callback is http://127.0.0.1:4190/oauth/x/callback.
 * A scheduler tick runs every 30 s (GTP_CC_SCHEDULER=off disables it): due publishing jobs, and the daily queue
 * preparation when the founder turned it on (once per Eastern day, only while this Mac is the active publisher host).
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CC_ROOT, REPO_ROOT, wallClock } from "../../lib/util.mjs";
import { createFileStore } from "../../ledger/store.mjs";
import { createOrchestrator } from "../../orchestrator/orchestrator.mjs";
import { spawnSync, execFile } from "node:child_process";
import { createKeychainVault, createMemoryVault } from "../../publishers/token-vault.mjs";
import { createXOAuth, createMemoryStateStore, CALLBACK_PATH } from "../../publishers/x-oauth.mjs";

const HOST = "127.0.0.1";
const DEFAULT_IMPORT_ROOT = path.join(os.homedir(), "gtp-private/graphics");
const PORT = Number(process.env.GTP_CC_PORT ?? 4190);
const OUT = path.resolve(process.env.GTP_CC_OUT_DIR ?? path.join(CC_ROOT, "out/console"));
const STATIC = path.dirname(new URL(import.meta.url).pathname);
const LOGO = path.join(REPO_ROOT, "app/public/brand/gametime-picks-logo.png");
const FOUNDER = Object.freeze({ role: "founder", id: "founder", surface: "console", authentication: "loopback-console (demo-grade)" });
const STEP_DELAY_MS = Number(process.env.GTP_CC_STEP_DELAY_MS ?? 650);


// ── X connection (tokens in the Keychain; GTP_CC_X_VAULT=memory for throwaway runs) ─────────────────────────────
const vault = process.env.GTP_CC_X_VAULT === "memory" || process.platform !== "darwin" ? createMemoryVault() : createKeychainVault();
const oauth = createXOAuth({ vault, states: createMemoryStateStore(), redirectUri: `http://${HOST}:${PORT}${CALLBACK_PATH}`, clock: wallClock, clientId: process.env.GTP_CC_X_CLIENT_ID || null });
const LOCAL_BINDING = "local-console";

/** Fetch the public repo's latest published data before a publish (free; GitHub). A pinned GTP_CC_DATA_REF is used as is. */
async function refreshData() {
  if (process.env.GTP_CC_DATA_REF) return { ok: true, detail: `pinned data ${process.env.GTP_CC_DATA_REF}` };
  const r = spawnSync("git", ["fetch", "-q", "origin", "main"], { cwd: REPO_ROOT, timeout: 60_000, encoding: "utf8" });
  return r.status === 0 ? { ok: true, detail: `fetched origin/main at ${wallClock()}` } : { ok: false, detail: `git fetch failed (${r.status ?? r.signal})` };
}

/**
 * A native macOS dialog the founder must click for a live or account action. Anything but the action button is a no.
 * Asynchronous: the console and the scheduler keep running while it is open.
 */
function confirmOnMac(message, button = "Publish live") {
  if (process.platform !== "darwin") return Promise.resolve(false);
  // AppleScript: quotes and backslashes neutralised; line breaks joined with `return` (no raw newline in a literal)
  const text = String(message).replace(/["\\]/g, "'").slice(0, 900).split("\n").join('" & return & "');
  const script = `display dialog "${text}" with title "GameTimePicks Command Center" buttons {"Cancel", "${button}"} default button "Cancel" cancel button "Cancel" with icon caution giving up after 120`;
  return new Promise((resolve) => {
    execFile("osascript", ["-e", script], { encoding: "utf8", timeout: 130_000 }, (err, stdout) => {
      resolve(!err && stdout.includes(`button returned:${button}`) && !/gave up:true/.test(stdout));
    });
  });
}

function boot() {
  fs.mkdirSync(OUT, { recursive: true });
  const store = createFileStore({ dir: path.join(OUT, "ledger"), clock: wallClock });
  return createOrchestrator({ store, clock: wallClock, env: process.env, outDir: OUT, stepDelayMs: STEP_DELAY_MS, slateDate: process.env.GTP_CC_SLATE_DATE || undefined, publishing: { oauth, refreshData } });
}

let orchestrator = boot();

/** POST /api/publishing — every publishing control; the flow enforces the gates. */
async function publishingAction(body) {
  const p = orchestrator.publishing;
  switch (body.action) {
    case "pause": return p.setPaused(true, FOUNDER);
    case "resume": return p.setPaused(false, FOUNDER);
    case "schedule": return p.schedule({ decisionId: body.decisionId, at: body.at ?? null }, FOUNDER);
    case "cancel": return p.cancel({ jobId: body.jobId }, FOUNDER);
    case "dry-run-now": return p.publishNow({ decisionId: body.decisionId, live: false }, FOUNDER);
    case "live-test": {
      // the dialog describes the post from the ledger, never from the request
      const rec = orchestrator.state().posts.find((x) => x.decisionId === body.decisionId);
      if (!rec) return { ok: false, code: "UNKNOWN_POST", detail: String(body.decisionId) };
      const caption = rec.options.find((o) => o.captionId === rec.resolution?.captionId)?.text ?? "(no approved caption)";
      if (!(await confirmOnMac(`Publish ONE real post to X now? It spends X API credits.\n\n${rec.package.title}\n\n${caption}`))) return { ok: false, code: "NOT_CONFIRMED_ON_MAC", detail: "the macOS confirmation was not given" };
      return p.publishNow({ decisionId: body.decisionId, live: true }, { ...FOUNDER, authentication: "loopback console + macOS dialog confirmation" });
    }
    case "policy": {
      if (body.mode === "test-only" && !(await confirmOnMac(`Allow founder-triggered live TEST posts to X, capped at $${Number(body.capUsd)} per month? Scheduled publishing stays a dry run.`, "Allow live tests"))) return { ok: false, code: "NOT_CONFIRMED_ON_MAC", detail: "the macOS confirmation was not given" };
      if (body.mode === "live" && !(await confirmOnMac(`Turn on SCHEDULED live publishing to X, capped at $${Number(body.capUsd)} per month?`))) return { ok: false, code: "NOT_CONFIRMED_ON_MAC", detail: "the macOS confirmation was not given" };
      return p.setPolicy({ mode: body.mode, capUsd: body.capUsd, authorization: body.authorization }, { ...FOUNDER, authentication: body.mode === "live" ? "loopback console + macOS dialog confirmation" : FOUNDER.authentication });
    }
    case "publisher-host": {
      if (!(await confirmOnMac(`Hand live X publishing from this Mac to the ${String(body.to)} publisher? This Mac stops sending live immediately.`, "Hand off"))) return { ok: false, code: "NOT_CONFIRMED_ON_MAC", detail: "the macOS confirmation was not given" };
      return p.setPublisherHost({ to: body.to, confirmation: body.confirmation }, { ...FOUNDER, authentication: "loopback console + macOS dialog confirmation" });
    }
    case "queue-prep": {
      // turning it ON (or moving its time) lets the scheduler start queue builds: a macOS click, like the other
      // policy changes that let something run without you; turning it off is always safe
      if (body.enabled === true && !(await confirmOnMac(`Prepare the content queue automatically every day at ${String(body.timeEt ?? "").replace(/[^0-9:]/g, "").slice(0, 5) || "the saved time"} ET on this Mac (while it is the active publisher)? Nothing is approved or posted automatically.`, "Turn on"))) return { ok: false, code: "NOT_CONFIRMED_ON_MAC", detail: "the macOS confirmation was not given" };
      return p.setQueuePrep({ enabled: body.enabled, timeEt: body.timeEt }, { ...FOUNDER, authentication: body.enabled === true ? "loopback console + macOS dialog confirmation" : FOUNDER.authentication });
    }
    case "reconcile": return p.reconcile({ jobId: body.jobId, url: body.url ?? null, notPosted: body.notPosted === true, lookup: body.lookup === true }, FOUNDER);
    case "ack": return p.acknowledge({ alertId: body.alertId }, FOUNDER);
    case "run-due": return p.runDue();
    case "x-connect":
      if (!(await confirmOnMac("Connect an X account to the Command Center? Sign in as the GameTimePicks account on the next page.", "Connect"))) return { ok: false, code: "NOT_CONFIRMED_ON_MAC", detail: "the macOS confirmation was not given" };
      return oauth.start({ binding: LOCAL_BINDING });
    case "x-disconnect":
      if (!(await confirmOnMac("Disconnect the X account from the Command Center? Scheduled posts stop until it is reconnected.", "Disconnect"))) return { ok: false, code: "NOT_CONFIRMED_ON_MAC", detail: "the macOS confirmation was not given" };
      return oauth.disconnect();
    default: return { ok: false, code: "UNKNOWN_ACTION", detail: String(body.action) };
  }
}

const page = (title, line) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui;background:#050706;color:#f7f7f2;padding:40px"><h1 style="font-size:20px">${title}</h1><p>${line}</p><p><a style="color:#39ff88" href="/">Back to the Command Center</a></p>`;

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const STATIC_FILES = new Set(["app.js", "webauthn.js", "styles.css", "manifest.webmanifest", "sw.js", "icon-192.png", "icon-512.png", "apple-touch-icon.png"]);

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function sendFile(res, file) {
  if (!fs.existsSync(file)) return send(res, 404, { error: "not found" });
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] ?? "application/octet-stream");
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 200_000) throw new Error("body too large");
  }
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  const hostOk = [`${HOST}:${PORT}`, `localhost:${PORT}`].includes(req.headers.host);
  if (!hostOk) return send(res, 403, { error: "loopback only" });
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "GET") {
      if (url.pathname === "/") return sendFile(res, path.join(STATIC, "index.html"));
      if (STATIC_FILES.has(url.pathname.slice(1))) return sendFile(res, path.join(STATIC, url.pathname.slice(1)));
      if (url.pathname === "/brand/logo.png") return sendFile(res, LOGO);
      if (url.pathname === "/api/state") return send(res, 200, { ...orchestrator.state(), publishing: await orchestrator.publishing.state() });
      if (url.pathname === CALLBACK_PATH) {
        // X's redirect. Only validates state + attaches the code, then exchanges it for this console (PKCE). The page
        // never echoes anything from the URL.
        const got = await oauth.receive({ state: url.searchParams.get("state"), code: url.searchParams.get("code"), error: url.searchParams.get("error") });
        const done = got.ok ? await oauth.finish({ state: url.searchParams.get("state"), binding: LOCAL_BINDING }) : got;
        const html = done.ok
          ? page("X account connected", `Scopes granted: ${done.scopes.map((x) => x.replace(/[^a-z.]/g, "")).join(", ")}${done.missingScopes.length ? `. Missing: ${done.missingScopes.join(", ")} — reconnect and allow them.` : "."}`)
          : page("X connection not completed", `Reason: ${String(done.code).replace(/[^A-Z_]/g, "")}. Start again from the Command Center.`);
        return send(res, done.ok ? 200 : 400, html, "text/html; charset=utf-8");
      }
      if (url.pathname.startsWith("/runs/")) {
        const name = path.basename(decodeURIComponent(url.pathname.slice(6)));
        if (!name.endsWith(".jsonl")) return send(res, 404, { error: "not found" });
        const file = path.join(OUT, "runs", name);
        return fs.existsSync(file) ? send(res, 200, fs.readFileSync(file), "text/plain; charset=utf-8") : send(res, 404, { error: "not found" });
      }
      if (url.pathname.startsWith("/strategies/")) {
        const name = path.basename(decodeURIComponent(url.pathname.slice(12)));
        if (!name.endsWith(".md")) return send(res, 404, { error: "not found" });
        const file = path.join(OUT, "strategies", name);
        return fs.existsSync(file) ? send(res, 200, fs.readFileSync(file), "text/markdown; charset=utf-8") : send(res, 404, { error: "not found" });
      }
      if (url.pathname.startsWith("/media/")) {
        const name = path.basename(decodeURIComponent(url.pathname.slice(7)));
        return sendFile(res, path.join(OUT, "media", name));
      }
      return send(res, 404, { error: "not found" });
    }
    if (req.method !== "POST") return send(res, 405, { error: "method" });
    if (req.headers["x-cc-console"] !== "1") return send(res, 403, { error: "missing console header" });
    const body = await readBody(req);
    if (url.pathname === "/api/command") {
      // Fire and forget: the page polls /api/state and watches the team work.
      orchestrator.handleCommand(String(body.text ?? ""), FOUNDER).catch((e) => console.error("command failed:", e));
      return send(res, 202, { accepted: true });
    }
    if (url.pathname === "/api/decide") return send(res, 200, await orchestrator.decide(body, FOUNDER));
    if (url.pathname === "/api/caption") return send(res, 200, orchestrator.editCaption({ decisionId: body.decisionId, basedOn: body.basedOn, text: body.text }, FOUNDER));
    if (url.pathname === "/api/pause") return send(res, 200, orchestrator.setPaused(Boolean(body.paused), FOUNDER));
    if (url.pathname === "/api/stop") return send(res, 200, orchestrator.emergencyStop(FOUNDER));
    if (url.pathname === "/api/attest") return send(res, 200, orchestrator.attestBilling({ usageCredits: body.usageCredits, capUsd: body.capUsd }, FOUNDER));
    if (url.pathname === "/api/preflight") {
      const r = orchestrator.runPreflight();
      return send(res, 200, { ok: r.ok, code: r.code ?? null, detail: r.detail ?? null, evidence: r.evidence });
    }
    if (url.pathname === "/api/post") return send(res, 200, orchestrator.recordPost(body, FOUNDER));
    // Launch Readiness packages into founder review (nothing is approved or scheduled); the proposed content calendar
    if (url.pathname === "/api/import/packages") return send(res, 200, orchestrator.importPackages({ root: body.root }, FOUNDER));
    if (url.pathname === "/api/market-rights") return send(res, 200, orchestrator.recordMarketAuthorization(body, FOUNDER));
    if (url.pathname === "/api/content-plan") return send(res, 200, orchestrator.approveContentPlan({ digest: body.digest }, FOUNDER));
    if (url.pathname === "/api/publishing") return send(res, 200, await publishingAction(body));
    if (url.pathname === "/api/design") return send(res, 200, orchestrator.approveDesign(body, FOUNDER));
    if (url.pathname === "/api/seat") return send(res, 200, orchestrator.setSeat(body.role, body.seat, FOUNDER));
    if (url.pathname === "/api/provider-test") return send(res, 200, await orchestrator.testProviderConnection(String(body.integration ?? ""), FOUNDER));
    if (url.pathname === "/api/manual") {
      orchestrator.submitManual(body.taskId, String(body.text ?? ""), FOUNDER).catch((e) => console.error("manual failed:", e));
      return send(res, 202, { accepted: true });
    }
    if (url.pathname === "/api/reset") {
      fs.rmSync(OUT, { recursive: true, force: true });
      orchestrator = boot();
      return send(res, 200, { reset: true });
    }
    return send(res, 404, { error: "not found" });
  } catch (err) {
    return send(res, 500, { error: String(err.message ?? err) });
  }
});

if (process.env.GTP_CC_SCHEDULER !== "off") {
  // New Launch Readiness packages come into founder review by themselves, once the folder has been quiet for a minute.
  // This only proposes posts: nothing is approved or scheduled. GTP_CC_AUTO_IMPORT=off turns it off.
  let importSeen = 0;
  setInterval(() => {
    if (process.env.GTP_CC_AUTO_IMPORT === "off") return;
    try {
      const dir = path.join(path.resolve(process.env.GTP_CC_IMPORT_ROOT ?? DEFAULT_IMPORT_ROOT), "packages");
      if (!fs.existsSync(dir)) return;
      const newest = Math.max(0, ...fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => fs.statSync(path.join(dir, f)).mtimeMs));
      if (newest <= importSeen || Date.now() - newest < 60_000) return;
      importSeen = newest;
      const r = orchestrator.importPackages({}, { ...FOUNDER, id: "import-watcher", authentication: "automatic: proposes posts only" });
      if (r.ok && Object.keys(r.counts).some((k) => k !== "duplicate")) console.log("packages imported:", JSON.stringify(r.counts));
    } catch (e) { console.error("package import failed:", e.message); }
  }, 60_000);
  setInterval(() => {
    orchestrator.publishing.runDue().catch((e) => console.error("publishing tick failed:", e.message));
    // daily queue preparation: a no-op unless the founder turned it on and this Mac is the active publisher host
    orchestrator.publishing.prepDue().catch((e) => console.error("queue preparation tick failed:", e.message));
  }, 30_000).unref();
}

server.listen(PORT, HOST, () => {
  console.log(`GameTimePicks CEO console (Phase 1, dry run) on http://${HOST}:${PORT}`);
});
