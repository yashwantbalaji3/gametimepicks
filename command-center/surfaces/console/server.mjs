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
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { CC_ROOT, REPO_ROOT, wallClock } from "../../lib/util.mjs";
import { createFileStore } from "../../ledger/store.mjs";
import { createOrchestrator } from "../../orchestrator/orchestrator.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.GTP_CC_PORT ?? 4190);
const OUT = path.resolve(process.env.GTP_CC_OUT_DIR ?? path.join(CC_ROOT, "out/console"));
const STATIC = path.dirname(new URL(import.meta.url).pathname);
const LOGO = path.join(REPO_ROOT, "app/public/brand/gametime-picks-logo.png");
const FOUNDER = Object.freeze({ role: "founder", id: "founder", surface: "console", authentication: "loopback-console (demo-grade)" });
const STEP_DELAY_MS = Number(process.env.GTP_CC_STEP_DELAY_MS ?? 650);

let orchestrator = boot();

function boot() {
  fs.mkdirSync(OUT, { recursive: true });
  const store = createFileStore({ dir: path.join(OUT, "ledger"), clock: wallClock });
  return createOrchestrator({ store, clock: wallClock, env: process.env, outDir: OUT, stepDelayMs: STEP_DELAY_MS, slateDate: process.env.GTP_CC_SLATE_DATE || undefined });
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png" };

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
      if (url.pathname === "/app.js" || url.pathname === "/styles.css") return sendFile(res, path.join(STATIC, url.pathname.slice(1)));
      if (url.pathname === "/brand/logo.png") return sendFile(res, LOGO);
      if (url.pathname === "/api/state") return send(res, 200, orchestrator.state());
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
    if (url.pathname === "/api/pause") return send(res, 200, orchestrator.setPaused(Boolean(body.paused), FOUNDER));
    if (url.pathname === "/api/seat") return send(res, 200, orchestrator.setSeat(body.role, body.seat, FOUNDER));
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

server.listen(PORT, HOST, () => {
  console.log(`GameTimePicks CEO console (Phase 1, dry run) on http://${HOST}:${PORT}`);
});
