#!/usr/bin/env node
/**
 * ASK DEV HARNESS — the exported site plus a real `/api/ask/`, backed by the deterministic fake.
 *
 * WHY THIS EXISTS. `serve-export.mjs` serves static files, which is correct for every other route and
 * useless for Ask: the page renders and every question returns a network error, so browser QA would be
 * testing an empty shell. Vercel runs `api/*.mjs` as functions; locally nothing does.
 *
 * So this wraps the static server and dispatches `/api/ask/` to the REAL handler — the same
 * `api/ask.mjs` that ships — with `ASK_MODEL_PROVIDER=fake`. Browser QA therefore exercises the actual
 * request validation, rate limiter, executor, verifier and streaming protocol, deterministically, with
 * no key and no billed call.
 *
 *   node scripts/ask/dev-server.mjs [port] [dir]
 *
 * NOT A PRODUCTION SERVER. It is a QA harness; production serves `/api/ask/` as a Vercel function.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = Number(process.argv[2] ?? 4173);
const ROOT = path.resolve(process.argv[3] ?? path.join(APP, "out"));

/*
 * The harness configures ITSELF, never the operator's shell. `ASK_MODEL_PROVIDER=fake` and the asset
 * origin are set here so there is no way to start this against a real key by forgetting a flag — and
 * the fake is refused in production by `selectProvider`, so this configuration cannot escape.
 */
process.env.ASK_GAMETIME_ENABLED = "1";
process.env.ASK_MODEL_PROVIDER = "fake";
process.env.ASK_ASSET_ORIGIN = `http://127.0.0.1:${PORT}`;
delete process.env.ANTHROPIC_API_KEY;

const askHandler = (await import(path.join(APP, "api", "ask.mjs"))).default;

/** The two response helpers Vercel's Node runtime adds and the bare `http` module does not. */
function vercelish(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); return res; };
  res.flushHeaders ??= () => {};
  return res;
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2",
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname === "/api/ask/" || url.pathname === "/api/ask") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    // Shaped like the platform's own request/response so the handler under test is UNMODIFIED. A
    // harness that required the handler to change would be testing a different handler.
    req.body = Buffer.concat(chunks).toString("utf8");
    req.query = Object.fromEntries(url.searchParams);
    try {
      await askHandler(req, vercelish(res));
    } catch (e) {
      // The harness must never take the whole server down on a handler defect — that turns one bad
      // request into "the site is offline" and hides what actually happened.
      console.error("[ask-dev] handler threw:", e?.message);
      if (!res.headersSent) { res.statusCode = 500; res.end(JSON.stringify({ ok: false, code: "HARNESS_ERROR" })); }
    }
    return;
  }

  // The live gateway is not part of Ask's own QA; a supported-MLB / refused-NFL stub keeps the two
  // live cases exercisable without reaching a provider.
  if (url.pathname === "/api/live/" || url.pathname === "/api/live") {
    const sport = String(url.searchParams.get("sport") ?? "").toLowerCase();
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify(sport === "mlb"
      ? { schemaVersion: 1, sport: "mlb", fetchedAt: new Date().toISOString(), events: [{ eventId: "1", state: "LIVE", stateDetail: "Top 7th", away: { abbreviation: "NYM", score: 3 }, home: { abbreviation: "PHI", score: 2 } }] }
      : { schemaVersion: 1, unavailable: true, reason: "UNSUPPORTED_SPORT" }));
  }

  // `trailingSlash: true` — /ask/ resolves to ask/index.html, and an unknown path serves the 404 page.
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!path.resolve(file).startsWith(ROOT)) { res.statusCode = 403; return res.end("forbidden"); }
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!existsSync(file)) {
    const notFound = path.join(ROOT, "404.html");
    res.statusCode = 404;
    if (existsSync(notFound)) { res.setHeader("Content-Type", TYPES[".html"]); return createReadStream(notFound).pipe(res); }
    return res.end("not found");
  }
  res.setHeader("Content-Type", TYPES[path.extname(file)] ?? "application/octet-stream");
  createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`[ask-dev] serving ${ROOT} on http://127.0.0.1:${PORT} · /api/ask/ → fake provider`);
});
